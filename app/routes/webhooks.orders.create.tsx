import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop, topic } = await authenticate.webhook(request);

  console.log(`[ConsentGuard] Received ${topic} webhook for ${shop}`);

  if (!payload) {
    return new Response("No payload", { status: 200 });
  }

  const order = payload as any;
  const orderId = order.admin_graphql_api_id || String(order.id);
  const orderName = order.name || `#${order.order_number}`;

  let consentPayloadStr: string | null = null;

  // 1. Check note_attributes for consent payload (fallback path)
  const noteAttributes = order.note_attributes || [];
  const consentAttr = noteAttributes.find(
    (attr: any) =>
      attr.name === "consentPayload" || attr.name === "_consentguard_payload"
  );
  if (consentAttr?.value) {
    consentPayloadStr = consentAttr.value;
  }

  // 2. Read consent metafield from the order via Admin API
  if (!consentPayloadStr) {
    try {
      // Get a session to make Admin API calls
      const session = await prisma.session.findFirst({
        where: { shop, isOnline: false },
      });

      if (session?.accessToken) {
        const gqlResponse = await fetch(
          `https://${shop}/admin/api/2026-04/graphql.json`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Access-Token": session.accessToken,
            },
            body: JSON.stringify({
              query: `query getOrderMetafield($id: ID!) {
                order(id: $id) {
                  metafield(namespace: "$app", key: "consentPayload") {
                    value
                  }
                }
              }`,
              variables: { id: orderId },
            }),
          }
        );

        const gqlData = await gqlResponse.json();
        const metafieldValue = gqlData?.data?.order?.metafield?.value;
        if (metafieldValue) {
          consentPayloadStr = metafieldValue;
        }
      }
    } catch (e) {
      console.error(`[ConsentGuard] Error fetching order metafield:`, e);
    }
  }

  if (!consentPayloadStr) {
    console.log(
      `[ConsentGuard] No consent payload found for order ${orderName}`
    );
    return new Response("OK", { status: 200 });
  }

  try {
    const consentPayload = JSON.parse(consentPayloadStr);

    if (consentPayload.version !== 1) {
      console.warn(
        `[ConsentGuard] Unknown consent payload version: ${consentPayload.version}`
      );
      return new Response("OK", { status: 200 });
    }

    const blocks = consentPayload.blocks || [];
    const locale = consentPayload.locale || "en";
    const acceptedAt = consentPayload.acceptedAt
      ? new Date(consentPayload.acceptedAt)
      : new Date();

    for (const block of blocks) {
      // Skip duplicates using unique constraint
      const existing = await prisma.consentEvent.findFirst({
        where: {
          shop,
          orderId,
          blockId: block.id,
        },
      });

      if (existing) continue;

      // Verify block exists (may have been deleted)
      const blockExists = await prisma.consentBlock.findFirst({
        where: { id: block.id },
      });

      await prisma.consentEvent.create({
        data: {
          shop,
          blockId: blockExists ? block.id : null,
          orderId,
          orderName,
          locale,
          consented: block.consented ?? true,
          consentTextSnapshot: block.textSnapshot || block.title || "",
          consentPayloadJson: JSON.stringify(block),
          consentedAt: acceptedAt,
        },
      });
    }

    console.log(
      `[ConsentGuard] Created ${blocks.length} consent events for order ${orderName}`
    );
  } catch (e) {
    console.error(`[ConsentGuard] Error processing consent payload:`, e);
    // Don't fail the webhook
  }

  return new Response("OK", { status: 200 });
};

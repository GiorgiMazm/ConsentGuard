import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

/**
 * GDPR Mandatory Webhook: customers/redact
 * When a customer requests data deletion, Shopify sends this webhook.
 * We must delete any personal data associated with the customer.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop, topic } = await authenticate.webhook(request);

  console.log(`[ConsentGuard] Received ${topic} webhook for ${shop}`);

  if (!payload) {
    return new Response("OK", { status: 200 });
  }

  const data = payload as any;
  const ordersToRedact: string[] = (data.orders_to_redact || []).map(
    (o: any) => String(o)
  );

  if (ordersToRedact.length > 0) {
    // Delete consent events associated with the customer's orders
    try {
      await prisma.consentEvent.deleteMany({
        where: {
          shop,
          orderId: { in: ordersToRedact },
        },
      });
      console.log(
        `[ConsentGuard] Redacted consent data for ${ordersToRedact.length} orders for ${shop}`
      );
    } catch (e) {
      console.error(`[ConsentGuard] Error redacting customer data:`, e);
    }
  }

  return new Response("OK", { status: 200 });
};

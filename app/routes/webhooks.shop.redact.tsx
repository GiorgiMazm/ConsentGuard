import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

/**
 * GDPR Mandatory Webhook: shop/redact
 * Sent 48 hours after a store uninstalls the app.
 * We must delete ALL shop data.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop, topic } = await authenticate.webhook(request);

  console.log(`[ConsentGuard] Received ${topic} webhook for ${shop}`);

  // Delete all data for this shop (may already be gone from app/uninstalled)
  try {
    await prisma.consentEvent.deleteMany({ where: { shop } });
    await prisma.consentBlock.deleteMany({ where: { shop } });
    await prisma.shopSettings.deleteMany({ where: { shop } });
    await prisma.session.deleteMany({ where: { shop } });

    console.log(`[ConsentGuard] Fully redacted all data for ${shop}`);
  } catch (e) {
    console.error(`[ConsentGuard] Error during shop redact:`, e);
  }

  return new Response("OK", { status: 200 });
};

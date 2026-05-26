import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`[ConsentGuard] Received ${topic} webhook for ${shop}`);

  // Always clean up app data for this shop, regardless of session state.
  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  try {
    await db.consentEvent.deleteMany({ where: { shop } });
    await db.consentBlock.deleteMany({ where: { shop } });
    await db.shopSettings.deleteMany({ where: { shop } });
    await db.session.deleteMany({ where: { shop } });

    console.log(`[ConsentGuard] Cleaned up data for ${shop}`);
  } catch (e) {
    console.error(`[ConsentGuard] Error cleaning up data for ${shop}:`, e);
  }

  return new Response();
};

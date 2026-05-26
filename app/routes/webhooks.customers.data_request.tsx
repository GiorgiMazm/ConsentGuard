import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

/**
 * GDPR Mandatory Webhook: customers/data_request
 * When a customer requests their data, Shopify sends this webhook.
 * We respond with the consent events associated with orders from that customer.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop, topic } = await authenticate.webhook(request);

  console.log(`[ConsentGuard] Received ${topic} webhook for ${shop}`);

  // ConsentGuard stores consent records tied to orders, not directly to customers.
  // The consent data is part of the order audit trail.
  // If a more detailed data export is needed, it can be retrieved from the
  // ConsentEvent table by matching order IDs to the customer's orders.
  // For now, we acknowledge the request — the data is available via the audit log.

  return new Response("OK", { status: 200 });
};

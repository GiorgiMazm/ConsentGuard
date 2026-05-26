import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { updateShopSettings } from "../lib/shop-settings.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop, topic } = await authenticate.webhook(request);

  console.log(`[ConsentGuard] Received ${topic} webhook for ${shop}`);

  if (!payload) {
    return new Response("OK", { status: 200 });
  }

  const subscription = payload as any;
  const status = subscription.status;

  if (status === "ACTIVE") {
    // Determine plan from subscription name
    const name = (subscription.name || "").toLowerCase();
    let plan: "FREE" | "PRO" | "BUSINESS" = "FREE";

    if (name.includes("business")) {
      plan = "BUSINESS";
    } else if (name.includes("pro")) {
      plan = "PRO";
    }

    const retentionDays =
      plan === "BUSINESS" ? 365 : plan === "PRO" ? 90 : 30;

    await updateShopSettings(shop, { plan, retentionDays });

    console.log(`[ConsentGuard] Updated ${shop} to ${plan} plan`);
  } else if (
    status === "CANCELLED" ||
    status === "EXPIRED" ||
    status === "DECLINED"
  ) {
    await updateShopSettings(shop, { plan: "FREE", retentionDays: 30 });
    console.log(`[ConsentGuard] Downgraded ${shop} to FREE plan`);
  }

  return new Response("OK", { status: 200 });
};

import { useState, useEffect } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useSubmit, useActionData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getShopSettings, updateShopSettings } from "../lib/shop-settings.server";
import type { Plan } from "../lib/plans";
import { getPlanLimits } from "../lib/plans";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const settings = await getShopSettings(session.shop);
  const plan = settings.plan as Plan;
  const limits = getPlanLimits(plan);

  return {
    settings,
    plan,
    maxRetention: limits.retentionDays,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const defaultLocale = (formData.get("defaultLocale") as string) || "en";
  const rawRetention = parseInt(
    (formData.get("retentionDays") as string) || "30"
  );

  // Clamp retention to plan max
  const settings = await getShopSettings(session.shop);
  const plan = settings.plan as Plan;
  const limits = getPlanLimits(plan);
  const retentionDays = Math.min(Math.max(1, rawRetention || 30), limits.retentionDays);

  await updateShopSettings(session.shop, { defaultLocale, retentionDays });

  return { ok: true };
};

export default function Settings() {
  const { settings, plan, maxRetention } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const actionData = useActionData<typeof action>();
  const shopify = useAppBridge();

  useEffect(() => {
    if ((actionData as any)?.ok) {
      shopify.toast.show("Settings saved");
    }
  }, [actionData, shopify]);

  const [defaultLocale, setDefaultLocale] = useState(settings.defaultLocale);
  const [retentionDays, setRetentionDays] = useState(
    String(settings.retentionDays)
  );

  const handleSave = () => {
    const formData = new FormData();
    formData.set("defaultLocale", defaultLocale);
    formData.set("retentionDays", retentionDays);
    submit(formData, { method: "post" });
  };

  return (
    <s-page heading="Settings" backAction={{ url: "/app" }}>
      <s-button slot="primary-action" variant="primary" onClick={handleSave}>
        Save
      </s-button>

      <s-section heading="General">
        <s-stack direction="block" gap="base">
          <s-text-field
            label="Default locale"
            name="defaultLocale"
            value={defaultLocale}
            onInput={(e: any) => setDefaultLocale(e.target.value)}
          />
          <s-number-field
            label="Audit log retention (days)"
            name="retentionDays"
            value={retentionDays}
            min={1}
            max={maxRetention}
            onInput={(e: any) => setRetentionDays(e.target.value)}
          />
          <s-paragraph>
            Your plan allows up to {maxRetention} days of audit log retention.
          </s-paragraph>
        </s-stack>
      </s-section>

      <s-section heading="Plan">
        <s-stack direction="inline" gap="base">
          <s-badge tone="info">
            {plan === "FREE" ? "Free" : plan === "PRO" ? "Pro" : "Business"}
          </s-badge>
          <s-link href="/app/billing">Change plan</s-link>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

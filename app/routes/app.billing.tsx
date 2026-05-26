import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useEffect } from "react";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getShopSettings, updateShopSettings } from "../lib/shop-settings.server";
import type { Plan } from "../lib/plans";
import { PLAN_DETAILS, getPlanLimits } from "../lib/plans";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const settings = await getShopSettings(session.shop);
  return { plan: settings.plan as Plan };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const selectedPlan = formData.get("plan") as string;

  // Validate plan input
  if (!selectedPlan || !["FREE", "PRO", "BUSINESS"].includes(selectedPlan)) {
    return { error: "Invalid plan selected" };
  }

  const typedPlan = selectedPlan as Plan;

  if (typedPlan === "FREE") {
    // Cancel any existing subscription
    try {
      const currentSubResponse = await admin.graphql(
        `#graphql
        query {
          currentAppInstallation {
            activeSubscriptions {
              id
              name
              status
            }
          }
        }`
      );
      const currentSubJson = await currentSubResponse.json();
      const activeSubs =
        currentSubJson.data?.currentAppInstallation?.activeSubscriptions || [];

      for (const sub of activeSubs) {
        await admin.graphql(
          `#graphql
          mutation cancelSubscription($id: ID!) {
            appSubscriptionCancel(id: $id) {
              appSubscription { id }
              userErrors { field message }
            }
          }`,
          { variables: { id: sub.id } }
        );
      }
    } catch (e) {
      console.error("[ConsentGuard] Error cancelling subscription:", e);
    }

    await updateShopSettings(session.shop, {
      plan: "FREE",
      retentionDays: 30,
    });
    return { ok: true, plan: "FREE" };
  }

  // Create a Shopify billing subscription
  const planInfo = PLAN_DETAILS[typedPlan];
  const isTest = process.env.NODE_ENV !== "production";

  const response = await admin.graphql(
    `#graphql
    mutation createSubscription($name: String!, $amount: Decimal!, $returnUrl: URL!, $trialDays: Int, $test: Boolean) {
      appSubscriptionCreate(
        name: $name
        returnUrl: $returnUrl
        test: $test
        trialDays: $trialDays
        lineItems: [
          {
            plan: {
              appRecurringPricingDetails: {
                price: { amount: $amount, currencyCode: USD }
              }
            }
          }
        ]
      ) {
        appSubscription {
          id
        }
        confirmationUrl
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        name: `ConsentGuard ${planInfo.name}`,
        amount: planInfo.price,
        returnUrl: `${process.env.SHOPIFY_APP_URL}/app/billing?plan=${typedPlan}`,
        trialDays: 7,
        test: isTest,
      },
    }
  );

  const responseJson = await response.json();
  const { confirmationUrl, userErrors } =
    responseJson.data?.appSubscriptionCreate || {};

  if (userErrors?.length) {
    return { error: userErrors[0].message };
  }

  if (confirmationUrl) {
    // Redirect to Shopify's billing confirmation page
    throw redirect(confirmationUrl);
  }

  return { error: "Failed to create subscription" };
};

const plans: Array<{
  key: Plan;
  name: string;
  price: string;
  features: string[];
}> = [
  {
    key: "FREE",
    name: "Free",
    price: "$0/mo",
    features: [
      "1 consent block",
      "Always-on display",
      "30-day audit log",
      "No export",
    ],
  },
  {
    key: "PRO",
    name: "Pro",
    price: "$9/mo",
    features: [
      "Unlimited blocks",
      "Product tag/type rules",
      "Date range scheduling",
      "Multi-language text",
      "90-day audit log",
      "CSV export",
      "7-day free trial",
    ],
  },
  {
    key: "BUSINESS",
    name: "Business",
    price: "$19/mo",
    features: [
      "Everything in Pro",
      "1-year audit log",
      "Priority support",
      "Advanced rules (as released)",
      "7-day free trial",
    ],
  },
];

export default function Billing() {
  const { plan: currentPlan } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const shopify = useAppBridge();

  useEffect(() => {
    if ((actionData as any)?.error) {
      shopify.toast.show((actionData as any).error, { isError: true });
    }
    if ((actionData as any)?.ok) {
      shopify.toast.show("Plan updated successfully");
    }
  }, [actionData, shopify]);

  const handleSelect = (plan: Plan) => {
    if (plan === currentPlan) return;
    const formData = new FormData();
    formData.set("plan", plan);
    submit(formData, { method: "post" });
  };

  return (
    <s-page heading="Billing" backAction={{ url: "/app" }}>
      <s-section>
        <s-stack direction="inline" gap="base">
          <s-text>Current plan:</s-text>
          <s-badge tone="info">
            {currentPlan === "FREE"
              ? "Free"
              : currentPlan === "PRO"
                ? "Pro"
                : "Business"}
          </s-badge>
        </s-stack>
      </s-section>

      <s-section heading="Plans">
        <s-grid gridTemplateColumns="1fr 1fr 1fr" gap="base">
          {plans.map((p) => (
            <s-box
              key={p.key}
              padding="base"
              borderWidth="base"
              borderRadius="base"
              background={p.key === currentPlan ? "subdued" : undefined}
            >
              <s-stack direction="block" gap="base">
                <s-heading>{p.name}</s-heading>
                <s-text type="strong">{p.price}</s-text>
                <s-unordered-list>
                  {p.features.map((f, i) => (
                    <s-list-item key={i}>{f}</s-list-item>
                  ))}
                </s-unordered-list>
                {p.key === currentPlan ? (
                  <s-badge tone="success">Current plan</s-badge>
                ) : (
                  <s-button
                    variant={p.key === "PRO" ? "primary" : "secondary"}
                    onClick={() => handleSelect(p.key)}
                    {...(navigation.state !== "idle"
                      ? { loading: true }
                      : {})}
                  >
                    {p.key === "FREE" ? "Downgrade" : "Upgrade"}
                  </s-button>
                )}
              </s-stack>
            </s-box>
          ))}
        </s-grid>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

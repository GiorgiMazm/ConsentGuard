import { useEffect } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { getShopSettings } from "../lib/shop-settings.server";
import type { Plan } from "../lib/plans";
import { getPlanLimits, canCreateBlock } from "../lib/plans";
import { syncCheckoutMetafield } from "../lib/sync-checkout-metafield.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [settings, blocks] = await Promise.all([
    getShopSettings(shop),
    prisma.consentBlock.findMany({
      where: { shop },
      include: { rules: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  const activeCount = blocks.filter((b) => b.active).length;
  const plan = settings.plan as Plan;
  const limits = getPlanLimits(plan);

  return {
    blocks,
    plan,
    activeCount,
    canCreate: canCreateBlock(plan, activeCount),
    maxBlocks: limits.maxBlocks,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "toggle") {
    const id = formData.get("id") as string;
    const active = formData.get("active") === "true";

    if (active) {
      const settings = await getShopSettings(shop);
      const activeCount = await prisma.consentBlock.count({
        where: { shop, active: true },
      });
      if (!canCreateBlock(settings.plan as Plan, activeCount)) {
        return { error: "Upgrade to activate more blocks" };
      }
    }

    // Scope to shop to prevent cross-shop mutation
    const block = await prisma.consentBlock.findFirst({ where: { id, shop } });
    if (!block) return { error: "Block not found" };
    await prisma.consentBlock.update({
      where: { id },
      data: { active },
    });
    await syncCheckoutMetafield(shop, admin);
    return { ok: true };
  }

  if (intent === "delete") {
    const id = formData.get("id") as string;
    const block = await prisma.consentBlock.findFirst({ where: { id, shop } });
    if (!block) return { error: "Block not found" };
    await prisma.consentBlock.delete({ where: { id } });
    await syncCheckoutMetafield(shop, admin);
    return { ok: true };
  }

  return null;
};

function getRuleSummary(rules: Array<{ type: string; valueJson: string }>) {
  if (!rules.length) return "Always shown";
  const parts: string[] = [];
  for (const rule of rules) {
    try {
      if (rule.type === "PRODUCT_TAG") {
        const vals = JSON.parse(rule.valueJson) as string[];
        parts.push(`Tag: ${vals.join(", ")}`);
      } else if (rule.type === "PRODUCT_TYPE") {
        const vals = JSON.parse(rule.valueJson) as string[];
        parts.push(`Type: ${vals.join(", ")}`);
      } else if (rule.type === "DATE_RANGE") {
        const val = JSON.parse(rule.valueJson) as { start: string; end: string };
        parts.push(`Date: ${val.start} - ${val.end}`);
      }
    } catch {
      parts.push(`${rule.type}: (invalid)`);
    }
  }
  return parts.join(" + ") || "Always shown";
}

export default function Dashboard() {
  const { blocks, plan, activeCount, canCreate, maxBlocks } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  useEffect(() => {
    if ((fetcher.data as any)?.error) {
      shopify.toast.show((fetcher.data as any).error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  const planLabel =
    plan === "FREE" ? "Free" : plan === "PRO" ? "Pro" : "Business";

  if (!blocks.length) {
    return (
      <s-page heading="ConsentGuard">
        <s-section>
          <s-box padding="loose-200">
            <s-stack direction="block" gap="base" alignItems="center">
              <s-heading>Create your first checkout consent block</s-heading>
              <s-paragraph>
                Add a required checkbox, banner, or acknowledgment to your
                checkout. Show it only when it applies — by product tag, product
                type, or date range.
              </s-paragraph>
              <s-button
                variant="primary"
                onClick={() => navigate("/app/blocks/new")}
              >
                Create block
              </s-button>
            </s-stack>
          </s-box>
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading="ConsentGuard">
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={() => navigate("/app/blocks/new")}
        {...(!canCreate ? { disabled: true } : {})}
      >
        Create block
      </s-button>

      <s-section>
        <s-stack direction="inline" gap="base">
          <s-badge tone="info">{planLabel} plan</s-badge>
          <s-text>
            {activeCount}/{maxBlocks === Infinity ? "Unlimited" : maxBlocks}{" "}
            active blocks
          </s-text>
        </s-stack>
      </s-section>

      <s-section heading="Consent Blocks">
        <s-table variant="auto">
          <s-table-header-row>
            <s-table-header listSlot="primary">Title</s-table-header>
            <s-table-header>Type</s-table-header>
            <s-table-header>Status</s-table-header>
            <s-table-header>Rules</s-table-header>
            <s-table-header>Actions</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {blocks.map((block: any) => (
              <s-table-row key={block.id}>
                <s-table-cell>
                  <s-link href={`/app/blocks/${block.id}`}>
                    {block.title}
                  </s-link>
                </s-table-cell>
                <s-table-cell>
                  <s-badge>
                    {block.type.charAt(0) + block.type.slice(1).toLowerCase()}
                  </s-badge>
                </s-table-cell>
                <s-table-cell>
                  <s-badge tone={block.active ? "success" : "base"}>
                    {block.active ? "Active" : "Inactive"}
                  </s-badge>
                  {block.required && (
                    <s-badge tone="warning">Required</s-badge>
                  )}
                </s-table-cell>
                <s-table-cell>
                  <s-text>{getRuleSummary(block.rules)}</s-text>
                </s-table-cell>
                <s-table-cell>
                  <s-stack direction="inline" gap="tight">
                    <s-button
                      variant="tertiary"
                      onClick={() => navigate(`/app/blocks/${block.id}`)}
                    >
                      Edit
                    </s-button>
                    <fetcher.Form method="post">
                      <input type="hidden" name="intent" value="toggle" />
                      <input type="hidden" name="id" value={block.id} />
                      <input
                        type="hidden"
                        name="active"
                        value={block.active ? "false" : "true"}
                      />
                      <s-button variant="tertiary" type="submit">
                        {block.active ? "Deactivate" : "Activate"}
                      </s-button>
                    </fetcher.Form>
                    <fetcher.Form method="post">
                      <input type="hidden" name="intent" value="delete" />
                      <input type="hidden" name="id" value={block.id} />
                      <s-button variant="tertiary" tone="critical" type="submit">
                        Delete
                      </s-button>
                    </fetcher.Form>
                  </s-stack>
                </s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

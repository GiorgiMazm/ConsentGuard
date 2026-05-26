import { useState, useEffect } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useNavigate, useSubmit, useActionData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { getShopSettings } from "../lib/shop-settings.server";
import type { Plan } from "../lib/plans";
import { canCreateBlock, getPlanLimits } from "../lib/plans";
import { syncCheckoutMetafield } from "../lib/sync-checkout-metafield.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const settings = await getShopSettings(shop);
  const plan = settings.plan as Plan;
  const limits = getPlanLimits(plan);
  const activeCount = await prisma.consentBlock.count({
    where: { shop, active: true },
  });

  return { plan, limits, canCreate: canCreateBlock(plan, activeCount) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();

  const settings = await getShopSettings(shop);
  const plan = settings.plan as Plan;
  const active = formData.get("active") === "true";

  if (active) {
    const activeCount = await prisma.consentBlock.count({
      where: { shop, active: true },
    });
    if (!canCreateBlock(plan, activeCount)) {
      return { error: "Upgrade your plan to create more active blocks." };
    }
  }

  const title = (formData.get("title") as string) || "";
  const bodyHtml = (formData.get("bodyHtml") as string) || "";
  const type = (formData.get("type") as string) || "CHECKBOX";
  const required = formData.get("required") === "true";

  // Sanitize HTML — strip tags to prevent XSS
  const sanitizedBodyHtml = bodyHtml.replace(/<[^>]*>/g, "");

  if (!title.trim()) return { error: "Title is required." };
  if (!sanitizedBodyHtml.trim()) return { error: "Buyer-facing text is required." };
  if (sanitizedBodyHtml.length > 500) return { error: "Text must be under 500 characters." };

  // Date validation
  const dateStart = (formData.get("dateStart") as string) || "";
  const dateEnd = (formData.get("dateEnd") as string) || "";
  if (dateStart && dateEnd && new Date(dateStart) >= new Date(dateEnd)) {
    return { error: "Start date must be before end date." };
  }

  const maxOrder = await prisma.consentBlock.findFirst({
    where: { shop },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const block = await prisma.consentBlock.create({
    data: {
      shop,
      title,
      bodyHtml: sanitizedBodyHtml,
      type,
      required,
      active,
      sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
    },
  });

  // Create rules
  const limits = getPlanLimits(plan);
  if (limits.rules) {
    const productTags = (formData.get("productTags") as string) || "";
    const productTypes = (formData.get("productTypes") as string) || "";

    const rulesToCreate: Array<{
      blockId: string;
      type: string;
      valueJson: string;
    }> = [];

    if (productTags.trim()) {
      rulesToCreate.push({
        blockId: block.id,
        type: "PRODUCT_TAG",
        valueJson: JSON.stringify(
          productTags.split(",").map((t) => t.trim()).filter(Boolean)
        ),
      });
    }

    if (productTypes.trim()) {
      rulesToCreate.push({
        blockId: block.id,
        type: "PRODUCT_TYPE",
        valueJson: JSON.stringify(
          productTypes.split(",").map((t) => t.trim()).filter(Boolean)
        ),
      });
    }

    if (dateStart && dateEnd) {
      rulesToCreate.push({
        blockId: block.id,
        type: "DATE_RANGE",
        valueJson: JSON.stringify({ start: dateStart, end: dateEnd }),
      });
    }

    if (rulesToCreate.length) {
      await prisma.displayRule.createMany({ data: rulesToCreate });
    }
  }

  // Create translations
  if (limits.translations) {
    const translationsRaw = (formData.get("translations") as string) || "";
    if (translationsRaw) {
      try {
        const translations = JSON.parse(translationsRaw) as Array<{
          locale: string;
          bodyHtml: string;
        }>;
        for (const t of translations) {
          if (t.locale && t.bodyHtml) {
            await prisma.consentTranslation.create({
              data: { blockId: block.id, locale: t.locale, bodyHtml: t.bodyHtml },
            });
          }
        }
      } catch {}
    }
  }

  // Sync metafield for checkout extension
  await syncCheckoutMetafield(shop, admin);

  return { ok: true, blockId: block.id };
};

export default function NewBlock() {
  const { plan, limits, canCreate } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const submit = useSubmit();
  const actionData = useActionData<typeof action>();
  const shopify = useAppBridge();

  useEffect(() => {
    if ((actionData as any)?.ok) {
      shopify.toast.show("Block created");
      navigate("/app");
    }
    if ((actionData as any)?.error) {
      shopify.toast.show((actionData as any).error, { isError: true });
    }
  }, [actionData, shopify, navigate]);

  const [title, setTitle] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [type, setType] = useState("CHECKBOX");
  const [required, setRequired] = useState(true);
  const [active, setActive] = useState(true);
  const [productTags, setProductTags] = useState("");
  const [productTypes, setProductTypes] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [translations, setTranslations] = useState<
    Array<{ locale: string; bodyHtml: string }>
  >([]);

  const handleSave = () => {
    const formData = new FormData();
    formData.set("title", title);
    formData.set("bodyHtml", bodyHtml);
    formData.set("type", type);
    formData.set("required", required ? "true" : "false");
    formData.set("active", active ? "true" : "false");
    formData.set("productTags", productTags);
    formData.set("productTypes", productTypes);
    formData.set("dateStart", dateStart);
    formData.set("dateEnd", dateEnd);
    if (translations.length) {
      formData.set("translations", JSON.stringify(translations));
    }
    submit(formData, { method: "post" });
  };

  const isPaid = plan !== "FREE";

  return (
    <s-page
      heading="Create Consent Block"
      backAction={{ url: "/app" }}
    >
      <s-button slot="primary-action" variant="primary" onClick={handleSave}>
        Save
      </s-button>

      <s-section heading="Block Details">
        <s-stack direction="block" gap="base">
          <s-text-field
            label="Internal title"
            name="title"
            value={title}
            required
            onInput={(e: any) => setTitle(e.target.value)}
          />
          <s-text-area
            label="Buyer-facing text"
            name="bodyHtml"
            value={bodyHtml}
            rows={4}
            maxLength={500}
            required
            onInput={(e: any) => setBodyHtml(e.target.value)}
          />
          <s-select
            label="Block type"
            name="type"
            value={type}
            onChange={(e: any) => setType(e.target.value)}
          >
            <s-option value="CHECKBOX">Checkbox</s-option>
            <s-option value="BANNER">Banner</s-option>
            <s-option value="ACKNOWLEDGMENT">Acknowledgment</s-option>
          </s-select>
          <s-switch
            label="Required (blocks checkout until accepted)"
            checked={required}
            onChange={(e: any) => setRequired(e.target.checked)}
          />
          <s-switch
            label="Active"
            checked={active}
            onChange={(e: any) => setActive(e.target.checked)}
          />
        </s-stack>
      </s-section>

      <s-section heading="Display Rules">
        {!isPaid && (
          <s-banner tone="info">
            Upgrade to Pro to use product and date rules.
          </s-banner>
        )}
        <s-stack direction="block" gap="base">
          <s-text-field
            label="Product tags (comma-separated)"
            name="productTags"
            value={productTags}
            onInput={(e: any) => setProductTags(e.target.value)}
            {...(!isPaid ? { disabled: true } : {})}
          />
          <s-text-field
            label="Product types (comma-separated)"
            name="productTypes"
            value={productTypes}
            onInput={(e: any) => setProductTypes(e.target.value)}
            {...(!isPaid ? { disabled: true } : {})}
          />
          <s-stack direction="inline" gap="base">
            <s-date-field
              label="Start date"
              name="dateStart"
              value={dateStart}
              onInput={(e: any) => setDateStart(e.target.value)}
              {...(!isPaid ? { disabled: true } : {})}
            />
            <s-date-field
              label="End date"
              name="dateEnd"
              value={dateEnd}
              onInput={(e: any) => setDateEnd(e.target.value)}
              {...(!isPaid ? { disabled: true } : {})}
            />
          </s-stack>
        </s-stack>
      </s-section>

      {isPaid && (
        <s-section heading="Translations">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              Add translated buyer-facing text for specific locales. If no
              translation matches the checkout language, the default text is
              used.
            </s-paragraph>
            {translations.map((t, i) => (
              <s-stack key={i} direction="inline" gap="base">
                <s-text-field
                  label="Locale (e.g. fr, de, es)"
                  value={t.locale}
                  onInput={(e: any) => {
                    const updated = [...translations];
                    updated[i] = { ...updated[i], locale: e.target.value };
                    setTranslations(updated);
                  }}
                />
                <s-text-area
                  label="Translated text"
                  value={t.bodyHtml}
                  rows={2}
                  maxLength={500}
                  onInput={(e: any) => {
                    const updated = [...translations];
                    updated[i] = { ...updated[i], bodyHtml: e.target.value };
                    setTranslations(updated);
                  }}
                />
                <s-button
                  variant="tertiary"
                  tone="critical"
                  onClick={() => {
                    setTranslations(translations.filter((_, j) => j !== i));
                  }}
                >
                  Remove
                </s-button>
              </s-stack>
            ))}
            <s-button
              variant="secondary"
              onClick={() =>
                setTranslations([...translations, { locale: "", bodyHtml: "" }])
              }
            >
              Add translation
            </s-button>
          </s-stack>
        </s-section>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

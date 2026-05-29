import "@shopify/ui-extensions/preact";
import { useExtensionEditor, useAppMetafields } from "@shopify/ui-extensions/checkout/preact";
import { render } from "preact";
import { useState, useEffect, useMemo } from "preact/hooks";

interface ConsentBlock {
  id: string;
  title: string;
  type: "CHECKBOX" | "BANNER" | "ACKNOWLEDGMENT";
  required: boolean;
  bodyHtml: string;
  translations: Array<{ locale: string; bodyHtml: string }>;
  rules: Array<{ type: string; values: string[] }>;
}

export default function extension() {
  render(<Extension />, document.body);
}

function Extension() {
  const appMetafields = useAppMetafields({
    namespace: "$app",
    key: "checkout_blocks",
  });
  const locale =
    shopify.localization?.language?.value?.isoCode?.toLowerCase() ?? "en";
  const settings = shopify.settings.value;
  const heading = settings?.heading as string | undefined;
  const editor = useExtensionEditor();

  // Parse blocks from the app metafield
  const blocks = useMemo<ConsentBlock[]>(() => {
    const mf = appMetafields?.[0];
    if (!mf?.metafield?.value) return [];
    try {
      return JSON.parse(String(mf.metafield.value));
    } catch {
      return [];
    }
  }, [appMetafields]);

  // For now, show all blocks (display rule filtering requires metafield-based
  // product data which is not available on the Product type in checkout extensions).
  const visibleBlocks = blocks;

  // Track consent state for each block
  const [consents, setConsents] = useState<Record<string, boolean>>({});

  // Block checkout if any required block is not consented
  useEffect(() => {
    const requiredBlocks = visibleBlocks.filter((b) => b.required);

    if (requiredBlocks.length > 0) {
      let teardown: (() => void) | undefined = undefined;
      shopify.buyerJourney
        .intercept(({ canBlockProgress }) => {
          if (canBlockProgress) {
            const missing = requiredBlocks.filter((b) => !consents[b.id]);
            if (missing.length > 0) {
              return {
                behavior: "block" as const,
                reason: "Consent required",
                errors: missing.map((b) => ({
                  message: `Please accept: ${b.title}`,
                })),
              };
            }
          }
          return { behavior: "allow" as const };
        })
        .then((unsub) => {
          teardown = unsub;
        });
      return () => teardown?.();
    }
  }, [visibleBlocks, consents]);

  if (visibleBlocks.length === 0) {
    if (editor) {
      return (
        <s-banner tone="warning" heading="ConsentGuard has no active blocks">
          <s-text>
            Create and activate a consent block in the app, then reopen the
            checkout editor.
          </s-text>
        </s-banner>
      );
    }

    return null;
  }

  function getLocalizedBody(block: ConsentBlock): string {
    if (locale !== "en") {
      const translation = block.translations.find(
        (t) => t.locale.toLowerCase() === locale
      );
      if (translation) return translation.bodyHtml;
    }
    return block.bodyHtml;
  }

  function handleCheckboxChange(blockId: string, checked: boolean) {
    setConsents((prev) => ({ ...prev, [blockId]: checked }));

    // Store consent data as cart metafield for the order webhook
    shopify.applyMetafieldChange({
      type: "updateCartMetafield",
      metafield: {
        namespace: "$app:consent",
        key: `block_${blockId}`,
        value: checked ? "true" : "false",
        type: "single_line_text_field",
      },
    });
  }

  return (
    <s-stack direction="block" gap="base">
      {heading && <s-heading>{heading}</s-heading>}
      {visibleBlocks.map((block) => {
        const body = getLocalizedBody(block);

        if (block.type === "BANNER") {
          return (
            <s-banner key={block.id} tone="info" heading={block.title}>
              <s-text>{body}</s-text>
            </s-banner>
          );
        }

        if (block.type === "ACKNOWLEDGMENT") {
          return (
            <s-box key={block.id} padding="base">
              <s-stack direction="block" gap="none">
                <s-heading>{block.title}</s-heading>
                <s-text>{body}</s-text>
                <s-checkbox
                  label="I acknowledge and agree"
                  checked={consents[block.id] ?? false}
                  onChange={() =>
                    handleCheckboxChange(
                      block.id,
                      !consents[block.id]
                    )
                  }
                />
              </s-stack>
            </s-box>
          );
        }

        // Default: CHECKBOX
        return (
          <s-box key={block.id} padding="base">
            <s-stack direction="block" gap="none">
              <s-checkbox
                label={block.title}
                checked={consents[block.id] ?? false}
                onChange={() =>
                  handleCheckboxChange(block.id, !consents[block.id])
                }
              />
              {body && <s-text>{body}</s-text>}
            </s-stack>
          </s-box>
        );
      })}
    </s-stack>
  );
}

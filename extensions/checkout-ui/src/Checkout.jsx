import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import {
  useBuyerJourneyIntercept,
  useExtensionCapability,
} from '@shopify/ui-extensions/checkout/preact';

const CONSENT_METAFIELD_NAMESPACE = '$app';
const CONSENT_METAFIELD_KEY = 'consentPayload';

export default function extension() {
  render(<Extension />, document.body);
}

function Extension() {
  const [blocks, setBlocks] = useState([]);
  const [checkedMap, setCheckedMap] = useState({});
  const [loading, setLoading] = useState(true);
  const blockProgressGranted = useExtensionCapability('block_progress');
  const pendingWrite = useRef(null);

  // Fetch block config from app backend
  useEffect(() => {
    async function fetchConfig() {
      try {
        const token = await shopify.sessionToken.get();
        const shop = shopify.shop?.myshopifyDomain;
        if (!shop) {
          setLoading(false);
          return;
        }

        const appUrl = shopify.settings?.value?.app_url;
        if (!appUrl) {
          setLoading(false);
          return;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1500);

        const response = await fetch(
          `${appUrl}/api/checkout/blocks?shop=${encodeURIComponent(shop)}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          }
        );
        clearTimeout(timeout);

        if (!response.ok) {
          setLoading(false);
          return;
        }

        const data = await response.json();
        const activeBlocks = evaluateBlocks(data.blocks || []);
        setBlocks(activeBlocks);

        const initial = {};
        activeBlocks.forEach((b) => {
          initial[b.id] = false;
        });
        setCheckedMap(initial);
      } catch (e) {
        // On failure, render nothing — don't block checkout
        console.error('ConsentGuard: config fetch failed', e);
      } finally {
        setLoading(false);
      }
    }

    fetchConfig();
  }, []);

  // Evaluate display rules against cart data
  function evaluateBlocks(allBlocks) {
    const cartLines = shopify.cartLines?.current || [];
    const now = new Date();

    return allBlocks.filter((block) => {
      if (!block.rules || block.rules.length === 0) return true;

      const rulesByType = {};
      block.rules.forEach((r) => {
        if (!rulesByType[r.type]) rulesByType[r.type] = [];
        rulesByType[r.type].push(r);
      });

      for (const [ruleType, rules] of Object.entries(rulesByType)) {
        let groupPasses = false;

        for (const rule of rules) {
          if (ruleType === 'PRODUCT_TYPE') {
            const values = rule.values || [];
            const match = cartLines.some((line) => {
              const productType = line.merchandise?.product?.productType || '';
              return values.some(
                (v) => v.toLowerCase() === productType.toLowerCase()
              );
            });
            if (match) groupPasses = true;
          } else if (ruleType === 'PRODUCT_TAG') {
            // Product tags are not directly available in checkout extensions.
            // Tag-based rules pass through — the backend pre-filters where possible.
            groupPasses = true;
          } else if (ruleType === 'DATE_RANGE') {
            const vals = rule.values || {};
            const start = vals.start ? new Date(vals.start) : null;
            const end = vals.end ? new Date(vals.end + 'T23:59:59') : null;
            if ((!start || now >= start) && (!end || now <= end)) {
              groupPasses = true;
            }
          } else if (ruleType === 'ALWAYS') {
            groupPasses = true;
          }
        }

        if (!groupPasses) return false;
      }

      return true;
    });
  }

  // Get localized body text
  function getBodyHtml(block) {
    const locale = shopify.localization?.language?.isoCode?.toLowerCase();
    if (locale && block.translations) {
      const match = block.translations.find(
        (t) => t.locale.toLowerCase() === locale
      );
      if (match) return match.bodyHtml;
    }
    return block.bodyHtml;
  }

  // Build consent payload
  function buildPayload(currentCheckedMap) {
    return {
      version: 1,
      acceptedAt: new Date().toISOString(),
      locale: shopify.localization?.language?.isoCode?.toLowerCase() || 'en',
      blocks: blocks.map((b) => ({
        id: b.id,
        title: b.title || b.bodyHtml.substring(0, 100),
        required: b.required,
        consented: !!currentCheckedMap[b.id],
        textSnapshot: getBodyHtml(b),
      })),
    };
  }

  // Persist consent state — serialized to prevent race conditions
  const persistConsent = useCallback(
    async (newCheckedMap) => {
      const payload = buildPayload(newCheckedMap);
      const payloadStr = JSON.stringify(payload);

      // Cancel any pending write
      if (pendingWrite.current) {
        clearTimeout(pendingWrite.current);
      }

      // Debounce writes by 300ms to prevent rapid-fire from toggle spam
      pendingWrite.current = setTimeout(async () => {
        const canSetMetafields =
          shopify.instructions?.current?.metafields?.canSetCartMetafields;

        if (canSetMetafields) {
          try {
            await shopify.applyMetafieldChange({
              type: 'updateCartMetafield',
              metafield: {
                namespace: CONSENT_METAFIELD_NAMESPACE,
                key: CONSENT_METAFIELD_KEY,
                value: payloadStr,
                type: 'json',
              },
            });
            return; // Success — no fallback needed
          } catch (e) {
            console.error('ConsentGuard: metafield write failed, trying fallback', e);
          }
        }

        // Fallback: write to note attributes
        try {
          await shopify.applyNoteAttributeChange({
            type: 'updateNoteAttribute',
            key: '_consentguard_payload',
            value: payloadStr,
          });
        } catch (e2) {
          console.error('ConsentGuard: note attribute fallback also failed', e2);
        }
      }, 300);
    },
    [blocks]
  );

  // Handle checkbox toggle
  const handleCheck = useCallback(
    (blockId, isChecked) => {
      setCheckedMap((prev) => {
        const newMap = { ...prev, [blockId]: isChecked };
        persistConsent(newMap);
        return newMap;
      });
    },
    [persistConsent]
  );

  // Block progress if required checkboxes are unchecked
  useBuyerJourneyIntercept(({ canBlockProgress }) => {
    if (!canBlockProgress || !blockProgressGranted) {
      return { behavior: 'allow' };
    }

    const uncheckedRequired = blocks.filter(
      (b) => b.required && b.type !== 'BANNER' && !checkedMap[b.id]
    );

    if (uncheckedRequired.length > 0) {
      return {
        behavior: 'block',
        reason: 'Required consent not accepted',
        errors: [
          {
            message:
              'Please accept all required consent checkboxes before completing your purchase.',
          },
        ],
      };
    }

    return { behavior: 'allow' };
  });

  // Don't render anything on failure or while loading
  if (loading || blocks.length === 0) {
    return null;
  }

  return (
    <s-stack direction="block" gap="base">
      {blocks.map((block) => {
        const bodyText = getBodyHtml(block);

        if (block.type === 'BANNER') {
          return (
            <s-banner key={block.id} tone="info">
              {bodyText}
            </s-banner>
          );
        }

        if (block.type === 'ACKNOWLEDGMENT') {
          return (
            <s-stack key={block.id} direction="block" gap="base">
              <s-text>{bodyText}</s-text>
              <s-checkbox
                label="I acknowledge and accept"
                checked={!!checkedMap[block.id]}
                onChange={() => handleCheck(block.id, !checkedMap[block.id])}
              />
            </s-stack>
          );
        }

        // CHECKBOX type (default)
        return (
          <s-checkbox
            key={block.id}
            label={bodyText}
            checked={!!checkedMap[block.id]}
            onChange={() => handleCheck(block.id, !checkedMap[block.id])}
          />
        );
      })}
    </s-stack>
  );
}

import prisma from "../db.server";

/**
 * Syncs all active consent blocks for a shop to a shop metafield.
 * The checkout extension reads this metafield directly — no network call needed.
 */
export async function syncCheckoutMetafield(shop: string, admin: any) {
  const blocks = await prisma.consentBlock.findMany({
    where: { shop, active: true },
    include: { rules: true, translations: true },
    orderBy: { sortOrder: "asc" },
  });

  const payload = blocks.map((block) => ({
    id: block.id,
    title: block.title,
    type: block.type,
    required: block.required,
    bodyHtml: block.bodyHtml,
    translations: block.translations.map((t) => ({
      locale: t.locale,
      bodyHtml: t.bodyHtml,
    })),
    rules: block.rules.map((r) => {
      try {
        return { type: r.type, values: JSON.parse(r.valueJson) };
      } catch {
        return { type: r.type, values: [] };
      }
    }),
  }));

  const metafieldValue = JSON.stringify(payload);

  const response = await admin.graphql(
    `mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        metafields: [
          {
            namespace: "$app",
            key: "checkout_blocks",
            type: "json",
            value: metafieldValue,
            ownerId: await getShopGid(admin),
          },
        ],
      },
    }
  );

  const result = await response.json();
  if (result.data?.metafieldsSet?.userErrors?.length > 0) {
    console.error("Metafield sync errors:", result.data.metafieldsSet.userErrors);
    throw new Error("Failed to sync checkout consent blocks.");
  }
}

async function getShopGid(admin: any): Promise<string> {
  const response = await admin.graphql(`{ shop { id } }`);
  const result = await response.json();
  return result.data.shop.id;
}

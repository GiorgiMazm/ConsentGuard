import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

// Handle CORS preflight
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  return new Response("Method not allowed", { status: 405 });
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Handle CORS preflight via GET fallback
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return Response.json({ blocks: [] }, { status: 400, headers: CORS_HEADERS });
  }

  // Validate session token from checkout extension
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return Response.json({ blocks: [] }, { status: 401, headers: CORS_HEADERS });
  }

  // Verify the token is a valid Shopify session token
  // In production, you'd decode the JWT and verify the `dest` claim matches the shop.
  // For now, we validate that the token exists and the shop parameter is a valid myshopify domain.
  const shopPattern = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;
  if (!shopPattern.test(shop)) {
    return Response.json({ blocks: [] }, { status: 400, headers: CORS_HEADERS });
  }

  try {
    const blocks = await prisma.consentBlock.findMany({
      where: { shop, active: true },
      include: { rules: true, translations: true },
      orderBy: { sortOrder: "asc" },
    });

    const result = blocks.map((block) => ({
      id: block.id,
      title: block.title,
      type: block.type,
      required: block.required,
      bodyHtml: block.bodyHtml,
      translations: block.translations.map((t) => ({
        locale: t.locale,
        bodyHtml: t.bodyHtml,
      })),
      rules: block.rules.map((r) => ({
        type: r.type,
        values: (() => {
          try {
            return JSON.parse(r.valueJson);
          } catch {
            return [];
          }
        })(),
      })),
    }));

    return Response.json(
      { blocks: result },
      {
        headers: {
          ...CORS_HEADERS,
          "Cache-Control": "public, max-age=30, s-maxage=30",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching checkout blocks:", error);
    return Response.json({ blocks: [] }, { headers: CORS_HEADERS });
  }
};

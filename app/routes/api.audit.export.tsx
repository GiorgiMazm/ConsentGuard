import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getShopSettings } from "../lib/shop-settings.server";
import type { Plan } from "../lib/plans";
import { getPlanLimits } from "../lib/plans";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);

  const settings = await getShopSettings(shop);
  const plan = settings.plan as Plan;
  const limits = getPlanLimits(plan);

  if (!limits.csvExport) {
    return new Response("Upgrade to Pro to export audit records.", {
      status: 403,
    });
  }

  const blockFilter = url.searchParams.get("block") || "";
  const orderSearch = url.searchParams.get("order") || "";
  const dateFrom = url.searchParams.get("dateFrom") || "";
  const dateTo = url.searchParams.get("dateTo") || "";

  const where: any = { shop };
  if (blockFilter) where.blockId = blockFilter;
  if (orderSearch) where.orderName = { contains: orderSearch };
  if (dateFrom || dateTo) {
    where.consentedAt = {};
    if (dateFrom) where.consentedAt.gte = new Date(dateFrom);
    if (dateTo) where.consentedAt.lte = new Date(dateTo + "T23:59:59.999Z");
  }

  const events = await prisma.consentEvent.findMany({
    where,
    include: { block: { select: { title: true } } },
    orderBy: { createdAt: "desc" },
    take: 10000,
  });

  const csvHeader =
    "Date,Order Number,Order ID,Block Title,Locale,Accepted,Text Snapshot";
  const csvRows = events.map((e) => {
    const escapeCsv = (s: string) =>
      `"${(s || "").replace(/"/g, '""')}"`;
    return [
      new Date(e.consentedAt).toISOString(),
      escapeCsv(e.orderName || ""),
      escapeCsv(e.orderId || ""),
      escapeCsv(e.block?.title || "Deleted"),
      e.locale || "",
      e.consented ? "Yes" : "No",
      escapeCsv(e.consentTextSnapshot),
    ].join(",");
  });

  const csv = [csvHeader, ...csvRows].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="consentguard-audit-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
};

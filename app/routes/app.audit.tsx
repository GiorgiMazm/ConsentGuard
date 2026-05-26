import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useSearchParams, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { getShopSettings } from "../lib/shop-settings.server";
import type { Plan } from "../lib/plans";
import { getPlanLimits } from "../lib/plans";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);

  const page = parseInt(url.searchParams.get("page") || "1");
  const pageSize = 20;
  const blockFilter = url.searchParams.get("block") || "";
  const orderSearch = url.searchParams.get("order") || "";
  const dateFrom = url.searchParams.get("dateFrom") || "";
  const dateTo = url.searchParams.get("dateTo") || "";

  const settings = await getShopSettings(shop);
  const plan = settings.plan as Plan;
  const limits = getPlanLimits(plan);

  const where: any = { shop };

  if (blockFilter) where.blockId = blockFilter;
  if (orderSearch) where.orderName = { contains: orderSearch };
  if (dateFrom || dateTo) {
    where.consentedAt = {};
    if (dateFrom) where.consentedAt.gte = new Date(dateFrom);
    if (dateTo) where.consentedAt.lte = new Date(dateTo + "T23:59:59.999Z");
  }

  const [events, total, blocks] = await Promise.all([
    prisma.consentEvent.findMany({
      where,
      include: { block: { select: { title: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.consentEvent.count({ where }),
    prisma.consentBlock.findMany({
      where: { shop },
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    }),
  ]);

  return {
    events,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    blocks,
    canExport: limits.csvExport,
    plan,
  };
};

export default function AuditLog() {
  const { events, total, page, totalPages, blocks, canExport, plan } =
    useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const blockFilter = searchParams.get("block") || "";
  const orderSearch = searchParams.get("order") || "";
  const dateFrom = searchParams.get("dateFrom") || "";
  const dateTo = searchParams.get("dateTo") || "";

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page");
    setSearchParams(params);
  };

  const handleExport = () => {
    if (!canExport) return;
    const params = new URLSearchParams(searchParams);
    window.open(`/api/audit/export?${params.toString()}`, "_blank");
  };

  return (
    <s-page heading="Audit Log" backAction={{ url: "/app" }}>
      {canExport && (
        <s-button slot="primary-action" onClick={handleExport}>
          Export CSV
        </s-button>
      )}

      <s-section>
        <s-stack direction="inline" gap="base">
          <s-text-field
            label="Order #"
            name="order"
            value={orderSearch}
            onInput={(e: any) => updateFilter("order", e.target.value)}
          />
          <s-select
            label="Block"
            name="block"
            value={blockFilter}
            onChange={(e: any) => updateFilter("block", e.target.value)}
          >
            <s-option value="">All blocks</s-option>
            {blocks.map((b: any) => (
              <s-option key={b.id} value={b.id}>
                {b.title}
              </s-option>
            ))}
          </s-select>
          <s-date-field
            label="From"
            name="dateFrom"
            value={dateFrom}
            onInput={(e: any) => updateFilter("dateFrom", e.target.value)}
          />
          <s-date-field
            label="To"
            name="dateTo"
            value={dateTo}
            onInput={(e: any) => updateFilter("dateTo", e.target.value)}
          />
        </s-stack>
      </s-section>

      {!canExport && (
        <s-section>
          <s-banner tone="info">
            Upgrade to Pro to export audit records as CSV.
            <s-button
              variant="tertiary"
              onClick={() => navigate("/app/billing")}
            >
              View plans
            </s-button>
          </s-banner>
        </s-section>
      )}

      <s-section>
        <s-text>{total} consent records found</s-text>
        <s-table variant="auto">
          <s-table-header-row>
            <s-table-header listSlot="primary">Date</s-table-header>
            <s-table-header>Order</s-table-header>
            <s-table-header>Block</s-table-header>
            <s-table-header>Locale</s-table-header>
            <s-table-header>Accepted</s-table-header>
            <s-table-header>Text Snapshot</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {events.map((event: any) => (
              <s-table-row key={event.id}>
                <s-table-cell>
                  {new Date(event.consentedAt).toLocaleString()}
                </s-table-cell>
                <s-table-cell>{event.orderName || "-"}</s-table-cell>
                <s-table-cell>{event.block?.title || "Deleted"}</s-table-cell>
                <s-table-cell>{event.locale || "-"}</s-table-cell>
                <s-table-cell>
                  <s-badge tone={event.consented ? "success" : "warning"}>
                    {event.consented ? "Yes" : "No"}
                  </s-badge>
                </s-table-cell>
                <s-table-cell>
                  <s-text>
                    {event.consentTextSnapshot.length > 80
                      ? event.consentTextSnapshot.substring(0, 80) + "..."
                      : event.consentTextSnapshot}
                  </s-text>
                </s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>

        {totalPages > 1 && (
          <s-stack direction="inline" gap="base">
            <s-button
              variant="tertiary"
              {...(page <= 1 ? { disabled: true } : {})}
              onClick={() => {
                const params = new URLSearchParams(searchParams);
                params.set("page", String(page - 1));
                setSearchParams(params);
              }}
            >
              Previous
            </s-button>
            <s-text>
              Page {page} of {totalPages}
            </s-text>
            <s-button
              variant="tertiary"
              {...(page >= totalPages ? { disabled: true } : {})}
              onClick={() => {
                const params = new URLSearchParams(searchParams);
                params.set("page", String(page + 1));
                setSearchParams(params);
              }}
            >
              Next
            </s-button>
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

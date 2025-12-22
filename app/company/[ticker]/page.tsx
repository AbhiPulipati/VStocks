import { prisma } from "@/lib/prisma";
import { syncCompany } from "@/lib/fmp/company";
import CompanyDescription from "@/components/company/ExpandableCompanyDescription";
import SymbolOverviewWidget from "@/components/tradingview/PriceChartWidget";
import { fetchQuote } from "@/lib/fmp/quote";
import { ArrowTrendingUpIcon, ArrowTrendingDownIcon } from "@heroicons/react/24/solid";

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker: rawTicker } = await params;
  const ticker = String(rawTicker ?? "").trim().toUpperCase();

  if (!ticker) {
    return (
      <div className="px-8 py-8">
        <h1 className="text-2xl font-bold text-black">Company not found</h1>
        <p className="text-gray-600 mt-2">Missing ticker symbol.</p>
      </div>
    );
  }

  let company = await prisma.company.findUnique({ where: { ticker } });
  if (!company) company = await syncCompany(ticker);
  const quote = await fetchQuote(company.ticker);


  return (
    <div className="px-1">
      {/* Header Row (match ClearStocks positioning) */}
      <div className="flex items-start justify-between gap-6">
        <div className="flex items-center gap-4">
        <h1 className="text-[2.75rem] font-bold text-black tracking-tight">
            {company.name}{" "}
            <span className="inline-flex items-center gap-7">
              <span className="font-bold text-black">
                ({company.ticker})
              </span>
              {company.logoUrl ? (
                <img
                  src={company.logoUrl}
                  alt={`${company.name} logo`}
                  className="w-12 h-12 rounded"
                />
              ) : null}
            </span>
          </h1>
        </div>

        {/* Top-right slot (you said you’ll add later) */}
        <div className="min-w-[220px] flex justify-end">
  {quote ? (
    <QuoteHeader
      price={quote.price}
      change={quote.change}
      changePercent={quote.changePercent}
    />
  ) : (
    <div className="text-sm text-gray-500">Price unavailable</div>
  )}
</div>

      </div>

      {/* Main grid: Overview + Key Metrics */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Company Overview Card */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
          <h2 className="text-2xl font-bold text-black">Company Overview</h2>

          {company.description ? (
            <CompanyDescription description={company.description} sentences={2} />
          ) : (
            <p className="mt-4 text-gray-500">No company description available.</p>
          )}

          <div className="mt-4 space-y-1 text-gray-900">
            <div>
              <span className="font-semibold">Industry:</span>{" "}
              <span className="text-gray-700">{company.industry ?? "N/A"}</span>
            </div>

            <div>
              <span className="font-semibold">Website:</span>{" "}
              {company.website ? (
                <a
                  href={company.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  {company.website}
                </a>
              ) : (
                <span className="text-gray-700">N/A</span>
              )}
            </div>

            <div>
              <span className="font-semibold">CEO:</span>{" "}
              <span className="text-gray-700">{company.ceo ?? "N/A"}</span>
            </div>

            <div>
              <span className="font-semibold">IPO Date:</span>{" "}
              <span className="text-gray-700">{company.ipoDate ?? "N/A"}</span>
            </div>

            <div>
              <span className="font-semibold">Exchange:</span>{" "}
              <span className="text-gray-700">{company.exchange ?? "N/A"}</span>
            </div>
          </div>
        </div>

        {/* Key Metrics Card (UI only for now) */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
          <h2 className="text-2xl font-bold text-black">Key Metrics</h2>

          <div className="mt-6 grid grid-cols-2 gap-4">
            <MetricTile value="—" label="Market Cap" />
            <MetricTile value="—" label="Net Profit Margin" />
            <MetricTile value="—" label="Revenue (TTM)" />
            <MetricTile value="—" label="P/E Ratio" />
          </div>
        </div>

        
      </div>
      {/* TradingView - Symbol Overview (test) */}
<div className="mt-5 rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
  <SymbolOverviewWidget
    title="Price Trend"
    symbol={toTradingViewSymbol(company.ticker, company.exchange)}
    height={300}
  />
</div>
    </div>
  );
}

function MetricTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 text-center">
      <div className="text-1xl font-extrabold text-black">{value}</div>
      <div className="mt-0.5 text-sm text-gray-600">{label}</div>
    </div>
  );
}

function toTradingViewSymbol(ticker: string, exchange?: string | null) {
  const ex = (exchange ?? "").toUpperCase();
  const tvExchange =
    ex.includes("NASDAQ") ? "NASDAQ" :
    ex.includes("NYSE") ? "NYSE" :
    ex.includes("AMEX") ? "AMEX" :
    "NASDAQ";

  return `${tvExchange}:${ticker}`;
}

function fmtMoney(n: number) {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtSignedMoney(n: number) {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${fmtMoney(n)}`;
}

function fmtSignedPct(n: number) {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function QuoteHeader({
  price,
  change,
  changePercent,
}: {
  price: number;
  change: number;
  changePercent: number;
}) {
  const positive = change >= 0;
  const color = positive ? "text-green-600" : "text-red-600";
  const Icon = positive ? ArrowTrendingUpIcon : ArrowTrendingDownIcon;

  return (
    <div className="flex items-center gap-3">
      {/* Arrow */}
      <Icon className={`h-10 w-10 ${color}`} />

      {/* Price + Change */}
      <div className="flex flex-col leading-tight">
        {/* Price */}
        <div className="text-3xl font-extrabold text-black">
          {fmtMoney(price)}
        </div>

        {/* Change */}
        <div className={`mt-0.5 text-base font-bold ${color}`}>
          {fmtSignedMoney(change)} ({fmtSignedPct(changePercent)})
        </div>
      </div>
    </div>
  );
}


// app/company/[ticker]/report/page.tsx
import { prisma } from "@/lib/prisma";
import { syncCompany } from "@/lib/fmp/company";
import { fetchQuote } from "@/lib/fmp/quote";
import { PeriodType, StatementType } from "@prisma/client";
import ReportClient from "@/components/report/ReportClient";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker: rawTicker } = await params;
  const ticker = String(rawTicker ?? "").trim().toUpperCase();

  // ── 1. Company ──────────────────────────────────────────────────────────────
  let company = await prisma.company.findUnique({ where: { ticker } });
  if (!company) company = await syncCompany(ticker);

  // ── 2. Quote ─────────────────────────────────────────────────────────────────
  const quote = await fetchQuote(ticker).catch(() => null);

  // ── 3. Latest income statement ───────────────────────────────────────────────
  const latestIncome = await prisma.companyFinancial.findFirst({
    where: {
      ticker,
      statementType: StatementType.income,
      periodType: PeriodType.annual,
      quarter: 0,
    },
    orderBy: { fiscalYear: "desc" },
  });

  const ip = (latestIncome?.payload ?? {}) as Record<string, any>;

  const toNum = (v: any): number | null => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const revenue = toNum(ip.totalRevenue ?? ip.revenue ?? ip.total_revenue);
  const netIncome = toNum(
    ip.netIncome ?? ip.netIncomeFromContinuingOperations ?? ip.net_income
  );
  const netProfitMargin =
    revenue && netIncome != null && revenue !== 0 ? netIncome / revenue : null;

  // ── 4. Ratios (Finnhub) ──────────────────────────────────────────────────────
  // Fetch via internal API (same as RatiosSection does)
  let ratioMetrics: Record<string, number> = {};
  try {
    const ratioRes = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/analysis/ratios?ticker=${ticker}`,
      { cache: "no-store" }
    );
    const ratioJson = await ratioRes.json().catch(() => ({}));
    if (ratioJson?.ok) ratioMetrics = ratioJson.metrics ?? {};
  } catch {
    // non-fatal — report will just show N/A for ratios
  }

  // ── 5. Valuation (DCF) ───────────────────────────────────────────────────────
  let fairValue: number | null = null;
  let upsidePct: number | null = null;
  let verdict: string | null = null;
  try {
    const valRes = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/analysis/valuation?ticker=${ticker}`,
      { cache: "no-store" }
    );
    const valJson = await valRes.json().catch(() => ({}));
    if (valJson?.ok) {
      fairValue = valJson.valuation?.fairValuePerShare ?? null;
      upsidePct = valJson.valuation?.upsidePct ?? null;
      verdict = valJson.valuation?.verdict ?? null;
    }
  } catch {
    // non-fatal
  }

  // ── 6. Analyst ratings ───────────────────────────────────────────────────────
  let analystScore: number | null = null;
  let analystDominant: string | null = null;
  let strongBuy = 0, buy = 0, hold = 0, sell = 0, strongSell = 0;
  try {
    const arRes = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/analysis/analyst-ratings?ticker=${ticker}`,
      { cache: "no-store" }
    );
    const arJson = await arRes.json().catch(() => ({}));
    if (arJson?.ok) {
      analystScore = arJson.latest?.score ?? null;
      analystDominant = arJson.latest?.dominant?.bucket ?? null;
      strongBuy = arJson.latest?.counts?.strongBuy ?? 0;
      buy = arJson.latest?.counts?.buy ?? 0;
      hold = arJson.latest?.counts?.hold ?? 0;
      sell = arJson.latest?.counts?.sell ?? 0;
      strongSell = arJson.latest?.counts?.strongSell ?? 0;
    }
  } catch {
    // non-fatal
  }

  // ── 7. Derived P/E ───────────────────────────────────────────────────────────
  const peDerived =
    quote?.marketCap != null && netIncome != null && netIncome > 0
      ? quote.marketCap / netIncome
      : null;

  const pe = quote?.pe ?? peDerived;

  // ── Build companyData for the client ─────────────────────────────────────────
  const companyData = {
    name: company.name,
    sector: company.sector,
    industry: company.industry,
    description: company.description,
    exchange: company.exchange,
    ceo: company.ceo,
    ipoDate: company.ipoDate,
    price: quote?.price ?? null,
    change: quote?.change ?? null,
    changePercent: quote?.changePercent ?? null,
    marketCap: quote?.marketCap ?? null,
    revenue,
    netIncome,
    netProfitMargin,
    pe: pe ?? null,
    fairValue,
    upsidePct,
    verdict,
    // Ratio metrics from Finnhub (pick best available)
    revenueGrowth:
      ratioMetrics["revenueGrowthTTMYoy"] ??
      ratioMetrics["revenueGrowthQuarterlyYoy"] ??
      null,
    operatingMargin:
      ratioMetrics["operatingMarginTTM"] ??
      ratioMetrics["operatingMarginAnnual"] ??
      null,
    grossMargin:
      ratioMetrics["grossMarginTTM"] ??
      ratioMetrics["grossMarginAnnual"] ??
      null,
    roe:
      ratioMetrics["roeTTM"] ??
      ratioMetrics["roeRfy"] ??
      null,
    currentRatio:
      ratioMetrics["currentRatioTTM"] ??
      ratioMetrics["currentRatioAnnual"] ??
      null,
    debtToEquity:
      ratioMetrics["totalDebt/totalEquityTTM"] ??
      ratioMetrics["totalDebt/totalEquityAnnual"] ??
      null,
    analystScore,
    analystDominant,
    strongBuy,
    buy,
    hold,
    sell,
    strongSell,
  };

  return (
    <div className="p-4">
      <ReportClient ticker={ticker} companyData={companyData} />
    </div>
  );
}

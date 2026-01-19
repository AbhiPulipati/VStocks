import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { StatementType, PeriodType } from "@/lib/generated/prisma/client";
import { fetchQuote } from "@/lib/fmp/quote";
import { fetchProfileLite } from "@/lib/fmp/profile";
import { runDcf, type DcfAssumptions } from "@/lib/analysis/dcf";
import { fetchAlphaVantagePrice } from "@/lib/alphavantage/quote";

type IncomeRow = {
  fiscalYear: number;
  payload: any;
};

type CashFlowRow = {
  fiscalYear: number;
  payload: any; // { source: "finnhub_cf", items: [{ concept, label, value }] }
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function safeNum(v: any): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function avg(nums: number[]) {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function median(nums: number[]) {
  if (!nums.length) return null;
  const a = nums.slice().sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 === 0 ? (a[mid - 1] + a[mid]) / 2 : a[mid];
}

function extractCapexFromFinnhubItems(items: any[]): number | null {
  if (!Array.isArray(items) || items.length === 0) return null;

  // 1) Known standardized concepts
  const concepts = [
    "us-gaap_PaymentsToAcquirePropertyPlantAndEquipment",
    "us-gaap_PaymentsToAcquirePropertyPlantAndEquipmentAndIntangibleAssets",
    "us-gaap_PaymentsToAcquireProductiveAssets",
    "us-gaap_PaymentsToAcquirePropertyPlantAndEquipmentNet",
    "ifrs-full_PurchaseOfPropertyPlantAndEquipment",
  ];

  for (const c of concepts) {
    const f = items.find((it) => it?.concept === c);
    const v = safeNum(f?.value);
    if (v != null) return Math.abs(v); // ✅ normalize to positive outflow
  }

  // 2) Company-specific extension tags (like nvda_*)
  // Must look like CAPEX and NOT look like financing/lease related.
  const conceptHit = items.find((it) => {
    const concept = String(it?.concept ?? "").toLowerCase();

    const looksLikeCapex =
      concept.includes("purchaseofproperty") ||
      concept.includes("purchasesofproperty") ||
      concept.includes("paymentsforproperty") ||
      concept.includes("paymentstoacquireproperty") ||
      concept.includes("capitalexpend") ||
      concept.includes("capex");

    const isFinancingRelated =
      concept.includes("financed") ||
      concept.includes("financing") ||
      concept.includes("lease") ||
      concept.includes("rightofuse") ||
      concept.includes("debt");

    return looksLikeCapex && !isFinancingRelated;
  });

  const vConcept = safeNum(conceptHit?.value);
  if (vConcept != null) return Math.abs(vConcept); // ✅ normalize

  // 3) Label fallback (last resort)
  const labelHit = items.find((it) => {
    const label = String(it?.label ?? "").toLowerCase();

    const looksLikeCapexLabel =
      label.includes("capital expend") ||
      (label.includes("purchase") && label.includes("property") && label.includes("equipment")) ||
      (label.includes("purchases") && label.includes("property") && label.includes("equipment")) ||
      (label.includes("payments") && label.includes("property") && label.includes("equipment"));

    const isFinancingLabel =
      label.includes("financing") ||
      label.includes("lease") ||
      label.includes("debt");

    return looksLikeCapexLabel && !isFinancingLabel;
  });

  const vLabel = safeNum(labelHit?.value);
  return vLabel != null ? Math.abs(vLabel) : null; // ✅ normalize
}

function extractCfoFromFinnhubItems(items: any[]): number | null {
  if (!Array.isArray(items) || items.length === 0) return null;

  // Broad set of common tags
  const concepts = [
    "us-gaap_NetCashProvidedByUsedInOperatingActivities",
    "us-gaap_NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
    "ifrs-full_NetCashFlowsFromUsedInOperatingActivities",
    "ifrs-full_CashFlowsFromUsedInOperatingActivities",
  ];

  for (const c of concepts) {
    const f = items.find((it) => it?.concept === c);
    const v = safeNum(f?.value);
    if (v != null) return v;
  }

  // Extension tags sometimes include "OperatingActivities" or similar
  const conceptHit = items.find((it) => {
    const concept = String(it?.concept ?? "").toLowerCase();
    // avoid investing/financing buckets if present
    const looksLikeCfo =
      concept.includes("operatingactivit") ||
      concept.includes("cashprovidedbyusedinoperating") ||
      concept.includes("netcashprovidedbyusedinoperating");
    const badBucket =
      concept.includes("invest") || concept.includes("financ");
    return looksLikeCfo && !badBucket;
  });

  const vConcept = safeNum(conceptHit?.value);
  if (vConcept != null) return vConcept;

  // Label fallback (last resort)
  const labelHit = items.find((it) => {
    const label = String(it?.label ?? "").toLowerCase();
    return (
      label.includes("net cash") &&
      label.includes("operating") &&
      label.includes("activities")
    );
  });

  return safeNum(labelHit?.value);
}

function extractFreeCashFlowFromFinnhubItems(items: any[]): number | null {
  if (!Array.isArray(items) || items.length === 0) return null;

  const concepts = [
    "us-gaap_FreeCashFlow",
    "us-gaap_FreeCashFlowContinuingOperations",
  ];

  for (const c of concepts) {
    const f = items.find((it) => it?.concept === c);
    const v = safeNum(f?.value);
    if (v != null) return v;
  }

  // Extension tags sometimes include "FreeCashFlow"
  const conceptHit = items.find((it) =>
    String(it?.concept ?? "").toLowerCase().includes("freecashflow")
  );
  const vConcept = safeNum(conceptHit?.value);
  if (vConcept != null) return vConcept;

  // Label fallback (last resort)
  const labelHit = items.find((it) =>
    String(it?.label ?? "").toLowerCase().includes("free cash flow")
  );
  return safeNum(labelHit?.value);
}

function extractNetDebt(balance: any): number | null {
  if (!balance) return null;

  // Cash candidates (different sources name this differently)
  const cash =
    safeNum(balance.cashAndShortTermInvestments) ??
    safeNum(balance.cashAndShortTermInvestmentsAtCarryingValue) ??
    safeNum(balance.cashAndCashEquivalentsAtCarryingValue) ??
    safeNum(balance.cashAndCashEquivalents) ??
    safeNum(balance.cash) ??
    0;

  // Debt candidates
  const debt =
    safeNum(balance.totalDebt) ??
    safeNum(balance.shortLongTermDebtTotal) ??
    ((safeNum(balance.shortTermDebt) ?? 0) + (safeNum(balance.longTermDebt) ?? 0));

  if (debt == null) return null;

  return debt - cash; // net debt (positive = more debt than cash)
}

async function getBaseFinancialSeries(ticker: string) {
  const incomeRows = (await prisma.companyFinancial.findMany({
    where: {
      ticker,
      statementType: StatementType.income,
      periodType: PeriodType.annual,
      quarter: 0,
    },
    select: { fiscalYear: true, payload: true },
    orderBy: { fiscalYear: "desc" },
    take: 6,
  })) as IncomeRow[];

  const cfRows = (await prisma.companyFinancial.findMany({
    where: {
      ticker,
      statementType: StatementType.cash_flow,
      periodType: PeriodType.annual,
      quarter: 0,
    },
    select: { fiscalYear: true, payload: true },
    orderBy: { fiscalYear: "desc" },
    take: 6,
  })) as CashFlowRow[];

    const bsRows = await prisma.companyFinancial.findMany({
    where: {
      ticker,
      statementType: StatementType.balance_sheet,
      periodType: PeriodType.annual,
      quarter: 0,
    },
    select: { fiscalYear: true, payload: true },
    orderBy: { fiscalYear: "desc" },
    take: 2,
  });

  return { incomeRows, cfRows, bsRows };
}

function buildDefaultAssumptions(args: {
  revenues: { year: number; revenue: number }[];
  opMargins: number[];
  taxRates: number[];
  fcfConversions: number[];
}): DcfAssumptions {
  // Revenue growth default: 5y CAGR-ish from revenue series
  const rev = args.revenues.slice().sort((a, b) => a.year - b.year);
  let growthPct = 8;

  if (rev.length >= 2) {
    const first = rev[0].revenue;
    const last = rev[rev.length - 1].revenue;
    const years = rev.length - 1;
    if (first > 0 && last > 0 && years > 0) {
      const cagr = Math.pow(last / first, 1 / years) - 1;
      if (Number.isFinite(cagr)) growthPct = clamp(cagr * 100, -10, 25);
    }
  }

    const opm = avg(args.opMargins) ?? 15;
  const tax = avg(args.taxRates) ?? 18;
  const conv = median(args.fcfConversions) ?? 70;


  return {
    horizonYears: 5,
    revenueGrowthPct: clamp(growthPct, -10, 25),
    operatingMarginPct: clamp(opm, -5, 60),
    taxRatePct: clamp(tax, 5, 35),
    fcfConversionPct: clamp(conv, 25, 125),
    discountRatePct: 10,
    terminalGrowthPct: 2.5,
  };
}

function verdictFromUpside(upsidePct: number) {
  if (upsidePct > 15) return "Undervalued";
  if (upsidePct < -15) return "Overvalued";
  return "Fair";
}

async function computeValuation(ticker: string, overrides?: Partial<DcfAssumptions>) {
  const { incomeRows, cfRows, bsRows } = await getBaseFinancialSeries(ticker);

  if (!incomeRows.length) throw new Error("Missing income statement data in DB");
  if (!cfRows.length) throw new Error("Missing cash flow data in DB");

  // Build year-aligned series (annual only)
  const byYearIncome = new Map<number, any>();
  for (const r of incomeRows) byYearIncome.set(r.fiscalYear, r.payload ?? {});

  const byYearCfItems = new Map<number, any[]>();
  for (const r of cfRows) byYearCfItems.set(r.fiscalYear, r.payload?.items ?? []);

  // Choose base year = most recent year where revenue, opInc, CFO, CapEx exist
  const yearsDesc = Array.from(
    new Set([...byYearIncome.keys(), ...byYearCfItems.keys()])
  ).sort((a, b) => b - a);

  let baseYear: number | null = null;
  let baseRevenue: number | null = null;
  let baseOpIncome: number | null = null;

  // Collect historical stats for defaults
  const revenuesForGrowth: { year: number; revenue: number }[] = [];
  const opMargins: number[] = [];
  const taxRates: number[] = [];
  const fcfConversions: number[] = [];

  for (const y of yearsDesc) {
    const inc = byYearIncome.get(y);
    const items = byYearCfItems.get(y) ?? [];

    const revenue = safeNum(inc?.totalRevenue);
    const opInc = safeNum(inc?.operatingIncome);

    if (revenue != null) revenuesForGrowth.push({ year: y, revenue });

    if (revenue != null && opInc != null && revenue !== 0) {
      opMargins.push((opInc / revenue) * 100);
    }

    const ibt = safeNum(inc?.incomeBeforeTax);
    const taxExp = safeNum(inc?.incomeTaxExpense);
    if (ibt != null && taxExp != null && ibt !== 0) {
      const tr = (taxExp / ibt) * 100;
      if (Number.isFinite(tr)) taxRates.push(tr);
    }

    const cfo = extractCfoFromFinnhubItems(items);
    const capex = extractCapexFromFinnhubItems(items);
    const fcfDirect = extractFreeCashFlowFromFinnhubItems(items);

    // FCF conversion relative to NOPAT
    if (revenue != null && opInc != null) {
    const fcf =
        cfo != null && capex != null ? cfo - capex : fcfDirect;

    if (fcf != null) {
        const ibt = safeNum(inc?.incomeBeforeTax);
        const taxExp = safeNum(inc?.incomeTaxExpense);

        const localTax =
        ibt != null && taxExp != null && ibt !== 0
            ? clamp(taxExp / ibt, 0.05, 0.35)
            : null;

        if (localTax != null) {
        const nopat = opInc * (1 - localTax);
        if (nopat !== 0) {
            const conv = (fcf / nopat) * 100;
            if (Number.isFinite(conv)) fcfConversions.push(conv);
        }
        }
    }
    }
  }

  // Find base year (most recent with required fields)
  for (const y of yearsDesc) {
    const inc = byYearIncome.get(y);
    const items = byYearCfItems.get(y) ?? [];

    const revenue = safeNum(inc?.totalRevenue);
    const opInc = safeNum(inc?.operatingIncome);
    const cfo = extractCfoFromFinnhubItems(items);
    const capex = extractCapexFromFinnhubItems(items);
    const fcfDirect = extractFreeCashFlowFromFinnhubItems(items);

    const hasCfoCapex = cfo != null && capex != null;
    const hasFcf = fcfDirect != null;

    if (revenue != null && opInc != null && (hasCfoCapex || hasFcf)) {
    baseYear = y;
    baseRevenue = revenue;
    baseOpIncome = opInc;
    break;
    }
  }

  if (baseYear == null || baseRevenue == null || baseOpIncome == null) {
    throw new Error("Could not find a complete base year (needs revenue, op income, CFO, capex)");
  }

  // Build a small historical series for charting (last 5 years, ascending)
// Uses FCF = CFO - CapEx when available, else falls back to direct FCF.
const historical: Array<{
  year: number;
  revenue: number;
  operatingIncome: number;
  fcf: number;
}> = [];

for (const y of yearsDesc) {
  const inc = byYearIncome.get(y);
  const items = byYearCfItems.get(y) ?? [];

  const revenue = safeNum(inc?.totalRevenue);
  const operatingIncome = safeNum(inc?.operatingIncome);

  const cfo = extractCfoFromFinnhubItems(items);
  const capex = extractCapexFromFinnhubItems(items);
  const fcfDirect = extractFreeCashFlowFromFinnhubItems(items);
  const fcf = cfo != null && capex != null ? cfo - capex : fcfDirect;

  if (
    revenue != null &&
    operatingIncome != null &&
    fcf != null &&
    Number.isFinite(revenue) &&
    Number.isFinite(operatingIncome) &&
    Number.isFinite(fcf)
  ) {
    historical.push({ year: y, revenue, operatingIncome, fcf });
  }

  if (historical.length >= 5) break;
}

historical.sort((a, b) => a.year - b.year);

  const baseOperatingMarginPct =
    baseRevenue !== 0 ? (baseOpIncome / baseRevenue) * 100 : 0;

  const defaultAssumptions = buildDefaultAssumptions({
    revenues: revenuesForGrowth,
    opMargins,
    taxRates,
    fcfConversions,
  });

  const assumptions: DcfAssumptions = {
    ...defaultAssumptions,
    ...(overrides ?? {}),
  };

 // Live market data
const [quote, profile] = await Promise.all([
  fetchQuote(ticker),
  fetchProfileLite(ticker),
]);

let price = quote?.price ?? null;

// ✅ Fallback: AlphaVantage GLOBAL_QUOTE
if (price == null) {
  const av = await fetchAlphaVantagePrice(ticker);
  price = av?.price ?? null;
}

if (price == null) {
  throw new Error("Missing live price (FMP + AlphaVantage failed)");
}

// ✅ DEFINE shares BEFORE using it
let shares: number | null =
  profile?.sharesOutstanding != null ? profile.sharesOutstanding : null;

// ✅ Last-resort fallback: infer shares from market cap if available
if (shares == null && profile?.marketCap != null && price > 0) {
  shares = profile.marketCap / price;
}

if (shares == null) {
  throw new Error(
    "Missing shares outstanding (profile + shares-float + marketCap/price all unavailable)"
  );
}

  // ✅ Suggested discount rate using CAPM (used as default if user didn't override)
  const riskFreeRate = 4.25; // %
  const equityRiskPremium = 5.0; // %

  const beta = profile?.beta ?? null;

  const capmDiscount =
    beta != null ? riskFreeRate + beta * equityRiskPremium : 10;

  // If user didn't override discountRatePct, use CAPM suggestion
  if (overrides?.discountRatePct == null) {
    assumptions.discountRatePct = clamp(capmDiscount, 6, 18);
  }

    const latestBalance = bsRows?.[0]?.payload ?? null;
  const netDebt = extractNetDebt(latestBalance); // positive = net debt, negative = net cash

  // Run DCF
    const dcf = runDcf({
    baseYear,
    baseRevenue,
    baseOperatingMarginPct,
    baseTaxRatePct: clamp(avg(taxRates) ?? assumptions.taxRatePct, 5, 35),
    baseFcfConversionPct: clamp(
      median(fcfConversions) ?? assumptions.fcfConversionPct,
      25,
      125
    ),
    sharesOutstanding: shares,
    netDebt: netDebt ?? 0,
    assumptions,
  });

  console.log("[DCF DEBUG]", {
  ticker,
  price,
  shares,
  baseYear,
  baseRevenue,
  baseOperatingMarginPct,
  taxBase: clamp(avg(taxRates) ?? assumptions.taxRatePct, 5, 35),
  convBase: clamp(median(fcfConversions) ?? assumptions.fcfConversionPct, 25, 125),
  assumptions,
  netDebt,
  ev: dcf.enterpriseValue,
  // if you added equityValue in dcf.ts:
  // eq: dcf.equityValue,
  fair: dcf.fairValuePerShare,
  lastFCF: dcf.projections?.[dcf.projections.length - 1]?.fcf,
  pvExp: dcf.pvOfExplicitPeriod,
  pvTerm: dcf.pvOfTerminalValue,
});

  const upsidePct = ((dcf.fairValuePerShare - price) / price) * 100;
  const verdict = verdictFromUpside(upsidePct);

  return {
    ticker,
    market: {
      price,
      sharesOutstanding: shares,
      beta: profile?.beta ?? null,
      marketCap: profile?.marketCap ?? null,
    },
    valuation: {
      fairValuePerShare: dcf.fairValuePerShare,
      upsidePct,
      verdict,
      enterpriseValue: dcf.enterpriseValue,
      pvOfExplicitPeriod: dcf.pvOfExplicitPeriod,
      pvOfTerminalValue: dcf.pvOfTerminalValue,
      terminalValue: dcf.terminalValue,
      assumptions: dcf.assumptions,
      base: dcf.base,
      historical,
      projections: dcf.projections,
    },
  };
}

export async function GET(req: NextRequest) {
  try {
    const tickerParam = req.nextUrl.searchParams.get("ticker");
    const ticker = tickerParam?.trim().toUpperCase();

    if (!ticker) {
      return NextResponse.json({ error: "Missing ticker" }, { status: 400 });
    }

    const data = await computeValuation(ticker);
    return NextResponse.json({ ok: true, ...data });
  } catch (err: any) {
    console.error("API /api/analysis/valuation error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const tickerParam = req.nextUrl.searchParams.get("ticker");
    const ticker = tickerParam?.trim().toUpperCase();

    if (!ticker) {
      return NextResponse.json({ error: "Missing ticker" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const overrides = (body?.assumptions ?? {}) as Partial<DcfAssumptions>;

    const data = await computeValuation(ticker, overrides);
    return NextResponse.json({ ok: true, ...data });
  } catch (err: any) {
    console.error("API /api/analysis/valuation POST error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Server error" },
      { status: 500 }
    );
  }
}

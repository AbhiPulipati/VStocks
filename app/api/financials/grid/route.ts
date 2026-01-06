// app/api/financials/grid/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function fetchAlphaVantageBalanceSheetTotals(ticker: string) {
  const key = process.env.ALPHAVANTAGE_API_KEY;
  if (!key) return null;

  const url = `https://www.alphavantage.co/query?function=BALANCE_SHEET&symbol=${encodeURIComponent(
    ticker
  )}&apikey=${key}`;

  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) return null;

  // AlphaVantage uses annualReports[]
  const reports: any[] = Array.isArray(data.annualReports) ? data.annualReports : [];
  if (!reports.length) return null;

  // Take most recent 5 (AlphaVantage usually returns newest first, but we'll sort by date to be safe)
  const sorted = reports
    .filter((r) => r?.fiscalDateEnding)
    .sort((a, b) => String(b.fiscalDateEnding).localeCompare(String(a.fiscalDateEnding)))
    .slice(0, 5);

  const rows = sorted.map((r) => {
    const fiscalDateEnding = String(r.fiscalDateEnding); // "YYYY-MM-DD"
    const fiscalYear = Number(fiscalDateEnding.slice(0, 4));

    const toNum = (x: any) => {
      const n = Number(x);
      return Number.isFinite(n) ? n : null;
    };

    const totalAssets = toNum(r.totalAssets);
    const totalCurrentAssets = toNum(r.totalCurrentAssets);
    const totalLiabilities = toNum(r.totalLiabilities);
    const totalCurrentLiabilities = toNum(r.totalCurrentLiabilities);

    // AV usually provides totalShareholderEquity (sometimes named totalShareholderEquity / totalShareholdersEquity)
    const totalEquity =
      toNum(r.totalShareholderEquity) ?? toNum(r.totalShareholdersEquity) ??
      (totalAssets != null && totalLiabilities != null ? totalAssets - totalLiabilities : null);

    const totalNonCurrentAssets =
      totalAssets != null && totalCurrentAssets != null ? totalAssets - totalCurrentAssets : null;

    const totalNonCurrentLiabilities =
      totalLiabilities != null && totalCurrentLiabilities != null
        ? totalLiabilities - totalCurrentLiabilities
        : null;

    const totalLiabilitiesAndEquity =
      totalAssets != null ? totalAssets : (totalLiabilities != null && totalEquity != null ? totalLiabilities + totalEquity : null);

    return {
      fiscalYear,
      quarter: 0,
      fiscalDateEnding,
      reportedCurrency: null,
      // Keep a lightweight payload — UI will render totals from this.
      payload: {
        source: "alphavantage_totals",
        totals: {
          assets_total: totalAssets,
          assets_current: totalCurrentAssets,
          assets_noncurrent: totalNonCurrentAssets,
          liab_total: totalLiabilities,
          liab_current: totalCurrentLiabilities,
          liab_noncurrent: totalNonCurrentLiabilities,
          equity_total: totalEquity,
          liab_eq_total: totalLiabilitiesAndEquity,
        },
      },
    };
  });

  return rows;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const ticker = (searchParams.get("ticker") ?? "").trim().toUpperCase();
    const statementType = (searchParams.get("statementType") ?? "").trim(); // income | balance_sheet | cash_flow
    const periodType = (searchParams.get("periodType") ?? "").trim(); // annual | quarterly
    const fiscalYearRaw = searchParams.get("fiscalYear");

    if (!ticker || !statementType || !periodType) {
      return NextResponse.json({ error: "Missing query params" }, { status: 400 });
    }

    if (periodType === "quarterly" && !fiscalYearRaw) {
      return NextResponse.json({ error: "Missing fiscalYear for quarterly" }, { status: 400 });
    }

    const fiscalYear = fiscalYearRaw ? Number(fiscalYearRaw) : null;
    if (fiscalYearRaw && !Number.isFinite(fiscalYear)) {
      return NextResponse.json({ error: "Invalid fiscalYear" }, { status: 400 });
    }

    const baseWhere: any = { ticker, statementType, periodType };

    // Annual: quarter=0, take 5 most recent by fiscalDateEnding desc
    if (periodType === "annual") {
  const rows = await prisma.companyFinancial.findMany({
    where: { ...baseWhere, quarter: 0 },
    select: {
      fiscalYear: true,
      quarter: true,
      fiscalDateEnding: true,
      reportedCurrency: true,
      payload: true,
    },
    orderBy: [{ fiscalDateEnding: "desc" }],
    take: 5,
  });

  // ✅ Finnhub not available / not stored — fallback to AlphaVantage totals (BALANCE SHEET ONLY)
  if (!rows.length && statementType === "balance_sheet") {
    const avRows = await fetchAlphaVantageBalanceSheetTotals(ticker);

    if (avRows?.length) {
      return NextResponse.json({
        ok: true,
        rows: avRows,
        dropdownAvailable: false,
        notice:
          "Finnhub has no as-reported balance sheet for this company. Showing AlphaVantage totals only — dropdown breakdown is unavailable.",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    rows,
    dropdownAvailable: true,
  });
}

    // Quarterly: require fiscalYear, return up to 4 quarters for that year
    // Quarterly: require fiscalYear, return quarters for that year
const allowedQuarters =
  statementType === "balance_sheet" ? [1, 2, 3] : [1, 2, 3, 4];

const rows = await prisma.companyFinancial.findMany({
  where: {
    ...baseWhere,
    fiscalYear: fiscalYear!,
    quarter: { in: allowedQuarters },
  },
  select: {
    fiscalYear: true,
    quarter: true,
    fiscalDateEnding: true,
    reportedCurrency: true,
    payload: true,
  },
  // newest quarter first (Q3 -> Q1 for finnhub; Q4 -> Q1 for others)
  orderBy: [{ quarter: "desc" }],
  take: allowedQuarters.length,
});

    return NextResponse.json({ ok: true, rows });
  } catch (err: any) {
    console.error("GET /api/financials/grid error:", err);
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}
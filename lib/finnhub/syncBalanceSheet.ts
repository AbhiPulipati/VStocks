// lib/finnhub/syncBalanceSheet.ts
import { prisma } from "@/lib/prisma";
import { PeriodType, StatementType } from "@/lib/generated/prisma/client";
import {
  fetchFinnhubFinancialsReported,
  pickBalanceSheetItemsInOrder,
  type FinnhubFinancialsReportedRow,
} from "@/lib/finnhub/financialsReported";

function parseDateMaybe(s?: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

function takeMostRecentAnnual(rows: FinnhubFinancialsReportedRow[], limit = 5) {
  return rows
    .filter((r) => r.quarter === 0)
    .sort((a, b) => {
      const ad = parseDateMaybe(a.endDate) ?? parseDateMaybe(a.filedDate);
      const bd = parseDateMaybe(b.endDate) ?? parseDateMaybe(b.filedDate);
      return (bd?.getTime() ?? 0) - (ad?.getTime() ?? 0);
    })
    .slice(0, limit);
}

function takeQuarterliesForYears(rows: FinnhubFinancialsReportedRow[], years: Set<number>) {
  // Finnhub "as-reported" typically provides quarter 1..3 (10-Q). Keep them as-is.
  return rows
    .filter((r) => r.quarter > 0 && years.has(r.year))
    .sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.quarter - a.quarter;
    });
}

async function ensureCompanyExists(ticker: string) {
  await prisma.company.upsert({
    where: { ticker },
    update: {},
    create: { ticker, name: ticker },
  });
}

export async function bootstrapBalanceSheetForTickerFinnhub(tickerRaw: string) {
  const ticker = tickerRaw.trim().toUpperCase();
  if (!ticker) throw new Error("Missing ticker");

  await ensureCompanyExists(ticker);

  // 1) Fetch annual first (default annual) to get cik + latest 5 years
const annualResp = await fetchFinnhubFinancialsReported({
  symbol: ticker,
  freq: "annual",
});
const annualRowsAll = annualResp.data ?? [];

const annual = takeMostRecentAnnual(annualRowsAll, 5);
const annualYears = new Set(annual.map((r) => r.year));

// 2) Fetch quarterlies separately (Finnhub requires freq=quarterly)
const quarterlyResp = await fetchFinnhubFinancialsReported({
  // Prefer cik (more reliable), fallback to symbol
  cik: annualResp.cik,
  symbol: annualResp.cik ? undefined : ticker,
  freq: "quarterly",
});
const quarterlyRowsAll = quarterlyResp.data ?? [];

// Pick the most recent 5 distinct quarterly fiscal years available (Q1–Q3)
const quarterlyYearsArr = Array.from(
  new Set(
    quarterlyRowsAll
      .filter((r) => r.quarter >= 1 && r.quarter <= 3)
      .map((r) => r.year)
  )
)
  .sort((a, b) => b - a)
  .slice(0, 5);

const quarterlyYears = new Set(quarterlyYearsArr);

// ✅ Keep only last 5 ANNUAL years (quarter = 0)
await prisma.companyFinancial.deleteMany({
  where: {
    ticker,
    statementType: StatementType.balance_sheet,
    quarter: 0,
    fiscalYear: { notIn: Array.from(annualYears) },
  },
});

// ✅ Keep only last 5 QUARTERLY years (quarter IN 1..3)
await prisma.companyFinancial.deleteMany({
  where: {
    ticker,
    statementType: StatementType.balance_sheet,
    quarter: { in: [1, 2, 3] },
    fiscalYear: { notIn: Array.from(quarterlyYears) },
  },
});

const quarterlies = takeQuarterliesForYears(quarterlyRowsAll, quarterlyYears);

  const ops: any[] = [];

  for (const r of annual) {
    const items = pickBalanceSheetItemsInOrder(r);
    const d = parseDateMaybe(r.endDate) ?? parseDateMaybe(r.filedDate);

    ops.push(
      prisma.companyFinancial.upsert({
        where: {
          ticker_statementType_fiscalYear_periodType_quarter: {
            ticker,
            statementType: StatementType.balance_sheet,
            fiscalYear: r.year,
            periodType: PeriodType.annual,
            quarter: 0,
          },
        },
        update: {
          fiscalDateEnding: d,
          reportedCurrency: "USD",
          payload: { source: "finnhub", items },
        },
        create: {
          ticker,
          statementType: StatementType.balance_sheet,
          fiscalYear: r.year,
          periodType: PeriodType.annual,
          quarter: 0,
          fiscalDateEnding: d,
          reportedCurrency: "USD",
          payload: { source: "finnhub", items },
        },
      })
    );
  }

  for (const r of quarterlies) {
    const items = pickBalanceSheetItemsInOrder(r);
    const d = parseDateMaybe(r.endDate) ?? parseDateMaybe(r.filedDate);

    ops.push(
      prisma.companyFinancial.upsert({
        where: {
          ticker_statementType_fiscalYear_periodType_quarter: {
            ticker,
            statementType: StatementType.balance_sheet,
            fiscalYear: r.year,
            periodType: PeriodType.quarterly,
            quarter: r.quarter,
          },
        },
        update: {
          fiscalDateEnding: d,
          reportedCurrency: "USD",
          payload: { source: "finnhub", items },
        },
        create: {
          ticker,
          statementType: StatementType.balance_sheet,
          fiscalYear: r.year,
          periodType: PeriodType.quarterly,
          quarter: r.quarter,
          fiscalDateEnding: d,
          reportedCurrency: "USD",
          payload: { source: "finnhub", items },
        },
      })
    );
  }

  // Batch transactions
  const batchSize = 25;
  for (let i = 0; i < ops.length; i += batchSize) {
    await prisma.$transaction(ops.slice(i, i + batchSize));
  }

  return {
    ok: true,
    ticker,
    statementType: "balance_sheet",
    annualSaved: annual.length,
    quarterlySaved: quarterlies.length,
  };
}
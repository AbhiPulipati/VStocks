// lib/finnhub/syncCashFlow.ts
import { prisma } from "@/lib/prisma";
import { PeriodType, StatementType } from "@prisma/client";
import {
  fetchFinnhubFinancialsReported,
  pickCashFlowItemsInOrder,
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
  return rows
    .filter((r) => r.quarter >= 1 && r.quarter <= 4 && years.has(r.year))
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

export async function bootstrapCashFlowForTickerFinnhub(tickerRaw: string) {
  const ticker = tickerRaw.trim().toUpperCase();
  if (!ticker) throw new Error("Missing ticker");

  await ensureCompanyExists(ticker);

  // 1) Annual: grab most recent 5
  const annualResp = await fetchFinnhubFinancialsReported({
    symbol: ticker,
    freq: "annual",
  });
  const annualRowsAll = annualResp.data ?? [];
  const annual = takeMostRecentAnnual(annualRowsAll, 5);
  const annualYears = new Set(annual.map((r) => r.year));

  // 2) Quarterly: most recent 5 distinct fiscal years available (Q1–Q4)
  const quarterlyResp = await fetchFinnhubFinancialsReported({
    cik: annualResp.cik,
    symbol: annualResp.cik ? undefined : ticker,
    freq: "quarterly",
  });
  const quarterlyRowsAll = quarterlyResp.data ?? [];

  const quarterlyYearsArr = Array.from(
    new Set(
      quarterlyRowsAll
        .filter((r) => r.quarter >= 1 && r.quarter <= 4)
        .map((r) => r.year)
    )
  )
    .sort((a, b) => b - a)
    .slice(0, 5);

  const quarterlyYears = new Set(quarterlyYearsArr);
  const quarterlies = takeQuarterliesForYears(quarterlyRowsAll, quarterlyYears);

  // ✅ keep only last 5 annual years
  await prisma.companyFinancial.deleteMany({
    where: {
      ticker,
      statementType: StatementType.cash_flow,
      periodType: PeriodType.annual,
      quarter: 0,
      fiscalYear: { notIn: Array.from(annualYears) },
    },
  });

  // ✅ keep only last 5 quarterly years
  await prisma.companyFinancial.deleteMany({
    where: {
      ticker,
      statementType: StatementType.cash_flow,
      periodType: PeriodType.quarterly,
      quarter: { in: [1, 2, 3, 4] },
      fiscalYear: { notIn: Array.from(quarterlyYears) },
    },
  });

  const ops: any[] = [];

  // Write annual via UPSERT (prevents composite-id collisions)
  for (const r of annual) {
    const items = pickCashFlowItemsInOrder(r);
    const d = parseDateMaybe(r.endDate) ?? parseDateMaybe(r.filedDate);

    ops.push(
      prisma.companyFinancial.upsert({
        where: {
          ticker_statementType_fiscalYear_periodType_quarter: {
            ticker,
            statementType: StatementType.cash_flow,
            fiscalYear: r.year,
            periodType: PeriodType.annual,
            quarter: 0,
          },
        },
        update: {
          fiscalDateEnding: d,
          reportedCurrency: "USD",
          payload: { source: "finnhub_cf", items },
        },
        create: {
          ticker,
          statementType: StatementType.cash_flow,
          fiscalYear: r.year,
          periodType: PeriodType.annual,
          quarter: 0,
          fiscalDateEnding: d,
          reportedCurrency: "USD",
          payload: { source: "finnhub_cf", items },
        },
      })
    );
  }

  // Write quarterly via UPSERT
  for (const r of quarterlies) {
    const items = pickCashFlowItemsInOrder(r);
    const d = parseDateMaybe(r.endDate) ?? parseDateMaybe(r.filedDate);

    ops.push(
      prisma.companyFinancial.upsert({
        where: {
          ticker_statementType_fiscalYear_periodType_quarter: {
            ticker,
            statementType: StatementType.cash_flow,
            fiscalYear: r.year,
            periodType: PeriodType.quarterly,
            quarter: r.quarter,
          },
        },
        update: {
          fiscalDateEnding: d,
          reportedCurrency: "USD",
          payload: { source: "finnhub_cf", items },
        },
        create: {
          ticker,
          statementType: StatementType.cash_flow,
          fiscalYear: r.year,
          periodType: PeriodType.quarterly,
          quarter: r.quarter,
          fiscalDateEnding: d,
          reportedCurrency: "USD",
          payload: { source: "finnhub_cf", items },
        },
      })
    );
  }

  // Batch transactions (safer on serverless)
  const batchSize = 25;
  for (let i = 0; i < ops.length; i += batchSize) {
    await prisma.$transaction(ops.slice(i, i + batchSize));
  }

  return {
    ok: true,
    ticker,
    statementType: "cash_flow",
    annualSaved: annual.length,
    quarterlySaved: quarterlies.length,
    annualYears: Array.from(annualYears).sort((a, b) => b - a),
    quarterlyYears: Array.from(quarterlyYears).sort((a, b) => b - a),
  };
}
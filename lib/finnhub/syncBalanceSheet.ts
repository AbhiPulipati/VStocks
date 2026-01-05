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

function takeMostRecentAnnual(rows: FinnhubFinancialsReportedRow[], limit = 10) {
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

  const data = await fetchFinnhubFinancialsReported(ticker);
  const rows = data.data ?? [];

  // Annual: keep up to 10 most recent
  const annual = takeMostRecentAnnual(rows, 10);
  const years = new Set(annual.map((r) => r.year));

  // Quarterly: include quarters 1..3 for those years
  const quarterlies = takeQuarterliesForYears(rows, years);

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
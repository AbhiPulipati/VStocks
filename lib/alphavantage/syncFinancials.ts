// lib/alphavantage/syncFinancials.ts
import { prisma } from "@/lib/prisma";
import {
  fetchAvStatement,
  parseFiscalDateEnding,
  cleanPayload,
  type AvStatementFn,
  type AvReport,
} from "@/lib/alphavantage/financials";
import { StatementType, PeriodType } from "@/lib/generated/prisma/client";

function mapStatementType(fn: AvStatementFn): StatementType {
  switch (fn) {
    case "INCOME_STATEMENT":
      return StatementType.income;
    case "BALANCE_SHEET":
      return StatementType.balance_sheet;
    case "CASH_FLOW":
      return StatementType.cash_flow;
  }
}

function fiscalYearFromDate(d: Date) {
  return d.getUTCFullYear();
}

function take10MostRecentAnnual(annualReports: AvReport[] = []) {
  return [...annualReports]
    .map((r) => ({ r, d: parseFiscalDateEnding(r) }))
    .filter((x) => x.d)
    .sort((a, b) => b.d!.getTime() - a.d!.getTime())
    .slice(0, 10)
    .map((x) => x.r);
}

function getAnnualYearWindow(annual10: AvReport[]) {
  const years = annual10
    .map(parseFiscalDateEnding)
    .filter((d): d is Date => !!d)
    .map((d) => fiscalYearFromDate(d));

  if (!years.length) return null;

  return {
    minYear: Math.min(...years),
    maxYear: Math.max(...years),
  };
}

function filterQuarterliesWithin10Years(
  quarterlyReports: AvReport[] = [],
  annual10: AvReport[]
) {
  const window = getAnnualYearWindow(annual10);
  if (!window) return [];

  return [...quarterlyReports]
    .map((r) => ({ r, d: parseFiscalDateEnding(r) }))
    .filter((x) => x.d && fiscalYearFromDate(x.d) >= window.minYear)
    .sort((a, b) => b.d!.getTime() - a.d!.getTime())
    .map((x) => x.r);
}

function assignQuartersByYear(quarterlies: AvReport[]) {
  // group by fiscal year and assign quarter 1..4 based on chronological order
  const byYear = new Map<number, { r: AvReport; d: Date }[]>();

  for (const r of quarterlies) {
    const d = parseFiscalDateEnding(r);
    if (!d) continue;
    const y = fiscalYearFromDate(d);
    const list = byYear.get(y) ?? [];
    list.push({ r, d });
    byYear.set(y, list);
  }

  const out: { r: AvReport; y: number; q: number; d: Date }[] = [];

  for (const [y, list] of byYear.entries()) {
    // sort oldest -> newest, then label 1..N
    const sorted = [...list].sort((a, b) => a.d.getTime() - b.d.getTime());

    // If more than 4 somehow, keep the most recent 4 within that year
    const lastFour = sorted.slice(Math.max(0, sorted.length - 4));

    lastFour.forEach((item, idx) => {
      out.push({ r: item.r, y, q: idx + 1, d: item.d });
    });
  }

  // newest first for batching convenience
  return out.sort((a, b) => b.d.getTime() - a.d.getTime());
}

async function ensureCompanyExists(ticker: string) {
  // Company.name is required, so create a placeholder if needed
  await prisma.company.upsert({
    where: { ticker },
    update: {},
    create: { ticker, name: ticker },
  });
}

async function hasAnnualCached10(ticker: string, statementType: StatementType) {
  const count = await prisma.companyFinancial.count({
    where: {
      ticker,
      statementType,
      periodType: PeriodType.annual,
      quarter: 0,
    },
  });
  return count >= 10;
}

export async function bootstrapFinancialsForTicker(tickerRaw: string) {
  const ticker = tickerRaw.trim().toUpperCase();
  if (!ticker) throw new Error("Missing ticker");

  await ensureCompanyExists(ticker);

  const fns: AvStatementFn[] = ["INCOME_STATEMENT", "BALANCE_SHEET", "CASH_FLOW"];
  const results: any[] = [];

  for (const fn of fns) {
    const statementType = mapStatementType(fn);

    if (await hasAnnualCached10(ticker, statementType)) {
      results.push({ statementType, skipped: true, reason: "annual_cached_10" });
      continue;
    }

    const data = await fetchAvStatement(ticker, fn);

    const annual10 = take10MostRecentAnnual(data.annualReports ?? []);
    const quarterlies = filterQuarterliesWithin10Years(data.quarterlyReports ?? [], annual10);
    const assigned = assignQuartersByYear(quarterlies);

    const ops: any[] = [];

    // Annual (quarter=0)
    for (const r of annual10) {
      const d = parseFiscalDateEnding(r);
      if (!d) continue;

      const fy = fiscalYearFromDate(d);

      ops.push(
        prisma.companyFinancial.upsert({
          where: {
            ticker_statementType_fiscalYear_periodType_quarter: {
              ticker,
              statementType,
              fiscalYear: fy,
              periodType: PeriodType.annual,
              quarter: 0,
            },
          },
          update: {
            fiscalDateEnding: d,
            reportedCurrency:
              r.reportedCurrency && r.reportedCurrency !== "None" ? r.reportedCurrency : null,
            payload: cleanPayload(r),
          },
          create: {
            ticker,
            statementType,
            fiscalYear: fy,
            periodType: PeriodType.annual,
            quarter: 0,
            fiscalDateEnding: d,
            reportedCurrency:
              r.reportedCurrency && r.reportedCurrency !== "None" ? r.reportedCurrency : null,
            payload: cleanPayload(r),
          },
        })
      );
    }

    // Quarterly (quarter=1..4)
    for (const { r, y, q, d } of assigned) {
      ops.push(
        prisma.companyFinancial.upsert({
          where: {
            ticker_statementType_fiscalYear_periodType_quarter: {
              ticker,
              statementType,
              fiscalYear: y,
              periodType: PeriodType.quarterly,
              quarter: q,
            },
          },
          update: {
            fiscalDateEnding: d,
            reportedCurrency:
              r.reportedCurrency && r.reportedCurrency !== "None" ? r.reportedCurrency : null,
            payload: cleanPayload(r),
          },
          create: {
            ticker,
            statementType,
            fiscalYear: y,
            periodType: PeriodType.quarterly,
            quarter: q,
            fiscalDateEnding: d,
            reportedCurrency:
              r.reportedCurrency && r.reportedCurrency !== "None" ? r.reportedCurrency : null,
            payload: cleanPayload(r),
          },
        })
      );
    }

    // Batch transactions to avoid huge concurrent load
    const batchSize = 25;
    for (let i = 0; i < ops.length; i += batchSize) {
      await prisma.$transaction(ops.slice(i, i + batchSize));
    }

    results.push({
      statementType,
      annualSaved: annual10.length,
      quarterlySaved: assigned.length,
    });
  }

  return { ok: true, ticker, results };
}
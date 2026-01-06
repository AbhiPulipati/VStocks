import { prisma } from "@/lib/prisma";
import {
  fetchFinnhubFinancialsReported,
  pickCashFlowItemsInOrder,
  type FinnhubFinancialsReportedRow,
} from "@/lib/finnhub/financialsReported";

function parseDateMaybe(s?: string) {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function takeMostRecentAnnual(rows: FinnhubFinancialsReportedRow[], limit = 5) {
  const annual = rows.filter((r) => r.quarter === 0);
  annual.sort((a, b) => String(b.endDate ?? "").localeCompare(String(a.endDate ?? "")));
  return annual.slice(0, limit);
}

function takeQuarterliesForYears(rows: FinnhubFinancialsReportedRow[], years: Set<number>) {
  const q = rows.filter((r) => r.quarter >= 1 && r.quarter <= 4 && years.has(r.year));
  q.sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.quarter - a.quarter;
  });
  return q;
}

async function upsertCompanyFinancialByLookup(args: {
  ticker: string;
  statementType: "cash_flow";
  periodType: "annual" | "quarterly";
  fiscalYear: number;
  quarter: number;
  fiscalDateEnding: Date | null;
  payload: any;
}) {
  const existing = await prisma.companyFinancial.findFirst({
    where: {
      ticker: args.ticker,
      statementType: args.statementType,
      periodType: args.periodType,
      fiscalYear: args.fiscalYear,
      quarter: args.quarter,
    },
  });

  /*if (existing) {
    return prisma.companyFinancial.update({
      where: { id: existing.id },
      data: {
        fiscalDateEnding: args.fiscalDateEnding,
        reportedCurrency: null,
        payload: args.payload,
      },
    });
  }*/

  return prisma.companyFinancial.create({
    data: {
      ticker: args.ticker,
      statementType: args.statementType,
      periodType: args.periodType,
      fiscalYear: args.fiscalYear,
      quarter: args.quarter,
      fiscalDateEnding: args.fiscalDateEnding,
      reportedCurrency: null,
      payload: args.payload,
    },
  });
}

export async function bootstrapCashFlowForTickerFinnhub(tickerRaw: string) {
  const ticker = tickerRaw.trim().toUpperCase();
  if (!ticker) throw new Error("Missing ticker");

  // 1) Annual (last 5)
  const annualResp = await fetchFinnhubFinancialsReported({
    symbol: ticker,
    freq: "annual",
  });
  const annualRowsAll = annualResp.data ?? [];
  const annual = takeMostRecentAnnual(annualRowsAll, 5);
  const annualYears = new Set(annual.map((r) => r.year));

  // 2) Quarterly (last 5 distinct fiscal years available)
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

  // ✅ Keep only last 5 ANNUAL years (quarter=0)
  await prisma.companyFinancial.deleteMany({
    where: {
      ticker,
      statementType: "cash_flow",
      quarter: 0,
      fiscalYear: { notIn: Array.from(annualYears) },
    },
  });

  // ✅ Keep only last 5 QUARTERLY years (quarter 1..4)
  await prisma.companyFinancial.deleteMany({
    where: {
      ticker,
      statementType: "cash_flow",
      quarter: { in: [1, 2, 3, 4] },
      fiscalYear: { notIn: Array.from(quarterlyYears) },
    },
  });

  // Write annual
  for (const r of annual) {
    const items = pickCashFlowItemsInOrder(r);
    const d = parseDateMaybe(r.endDate) ?? parseDateMaybe(r.filedDate);

    await upsertCompanyFinancialByLookup({
      ticker,
      statementType: "cash_flow",
      periodType: "annual",
      fiscalYear: r.year,
      quarter: 0,
      fiscalDateEnding: d,
      payload: { source: "finnhub_cf", items },
    });
  }

  // Write quarterly
  for (const r of quarterlies) {
    const items = pickCashFlowItemsInOrder(r);
    const d = parseDateMaybe(r.endDate) ?? parseDateMaybe(r.filedDate);

    await upsertCompanyFinancialByLookup({
      ticker,
      statementType: "cash_flow",
      periodType: "quarterly",
      fiscalYear: r.year,
      quarter: r.quarter,
      fiscalDateEnding: d,
      payload: { source: "finnhub_cf", items },
    });
  }

  return {
    ok: true,
    ticker,
    annualYears: Array.from(annualYears).sort((a, b) => b - a),
    quarterlyYears: Array.from(quarterlyYears).sort((a, b) => b - a),
  };
}
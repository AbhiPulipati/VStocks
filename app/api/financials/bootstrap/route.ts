// app/api/financials/bootstrap/route.ts
import { NextRequest, NextResponse } from "next/server";
import { bootstrapFinancialsForTicker } from "@/lib/alphavantage/syncFinancials";
import { bootstrapBalanceSheetForTickerFinnhub } from "@/lib/finnhub/syncBalanceSheet";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const ticker = (body?.ticker ?? "").toString().trim().toUpperCase();

    if (!ticker) {
      return NextResponse.json({ error: "Missing ticker" }, { status: 400 });
    }

    // 1) Income statement (AlphaVantage)
const income = await bootstrapFinancialsForTicker(ticker);

// 2) Balance sheet (Finnhub, as-reported)
const balanceSheet = await bootstrapBalanceSheetForTickerFinnhub(ticker);

return NextResponse.json({ ok: true, ticker, income, balanceSheet });

  } catch (err: any) {
    console.error("API /api/financials/bootstrap error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
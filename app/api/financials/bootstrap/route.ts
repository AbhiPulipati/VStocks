// app/api/financials/bootstrap/route.ts
import { NextRequest, NextResponse } from "next/server";
import { bootstrapFinancialsForTicker } from "@/lib/alphavantage/syncFinancials";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const ticker = (body?.ticker ?? "").toString().trim().toUpperCase();

    if (!ticker) {
      return NextResponse.json({ error: "Missing ticker" }, { status: 400 });
    }

    const result = await bootstrapFinancialsForTicker(ticker);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("API /api/financials/bootstrap error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
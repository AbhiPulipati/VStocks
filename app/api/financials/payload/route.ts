import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const ticker = (searchParams.get("ticker") ?? "").trim().toUpperCase();
    const statementType = (searchParams.get("statementType") ?? "").trim();
    const periodType = (searchParams.get("periodType") ?? "").trim();
    const fiscalYear = Number(searchParams.get("fiscalYear"));
    const quarter = Number(searchParams.get("quarter"));

    if (!ticker || !statementType || !periodType || !Number.isFinite(fiscalYear) || !Number.isFinite(quarter)) {
      return NextResponse.json(
        { error: "Missing/invalid query params" },
        { status: 400 }
      );
    }

    const row = await prisma.companyFinancial.findUnique({
      where: {
        ticker_statementType_fiscalYear_periodType_quarter: {
          ticker,
          statementType: statementType as any,
          fiscalYear,
          periodType: periodType as any,
          quarter,
        },
      },
      select: {
        ticker: true,
        statementType: true,
        periodType: true,
        fiscalYear: true,
        quarter: true,
        fiscalDateEnding: true,
        reportedCurrency: true,
        payload: true,
      },
    });

    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, row });
  } catch (err: any) {
    console.error("GET /api/financials/payload error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
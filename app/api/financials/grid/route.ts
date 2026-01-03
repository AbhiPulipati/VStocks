// app/api/financials/grid/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

    // Annual: quarter=0, take 10 most recent by fiscalDateEnding desc
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
        take: 10,
      });

      return NextResponse.json({ ok: true, rows });
    }

    // Quarterly: require fiscalYear, return up to 4 quarters for that year
    const rows = await prisma.companyFinancial.findMany({
      where: {
        ...baseWhere,
        fiscalYear: fiscalYear!,
        quarter: { in: [1, 2, 3, 4] },
      },
      select: {
        fiscalYear: true,
        quarter: true,
        fiscalDateEnding: true,
        reportedCurrency: true,
        payload: true,
      },
      // newest quarter first (Q4 -> Q1)
      orderBy: [{ quarter: "desc" }],
      take: 4,
    });

    return NextResponse.json({ ok: true, rows });
  } catch (err: any) {
    console.error("GET /api/financials/grid error:", err);
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}
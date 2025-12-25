import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ticker = (searchParams.get("ticker") ?? "").trim().toUpperCase();

    if (!ticker) {
      return NextResponse.json({ error: "Missing ticker" }, { status: 400 });
    }

    const rows = await prisma.companyFinancial.findMany({
      where: { ticker },
      select: {
        ticker: true,
        statementType: true,
        periodType: true,
        fiscalYear: true,
        quarter: true,
        fiscalDateEnding: true,
        reportedCurrency: true,
      },
      orderBy: [
        { statementType: "asc" },
        { periodType: "asc" },
        { fiscalYear: "desc" },
        { quarter: "asc" },
      ],
    });

    return NextResponse.json({ ok: true, ticker, rows });
  } catch (err: any) {
    console.error("GET /api/financials/meta error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
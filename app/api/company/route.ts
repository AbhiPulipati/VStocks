import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncCompany } from "@/lib/fmp/company";

export async function GET(req: NextRequest) {
  try {
    const tickerParam = req.nextUrl.searchParams.get("ticker");
    const ticker = tickerParam?.trim().toUpperCase();

    const refreshParam = req.nextUrl.searchParams.get("refresh");
    const refresh = refreshParam === "1" || refreshParam === "true";

    if (!ticker) {
      return NextResponse.json({ error: "Missing ticker" }, { status: 400 });
    }

    // If refresh explicitly requested, always fetch+upsert
    if (refresh) {
      const updated = await syncCompany(ticker);
      return NextResponse.json(updated);
    }

    // Otherwise: DB first
    const existing = await prisma.company.findUnique({ where: { ticker } });

    if (existing) {
      // ✅ Auto-refresh if important fields are missing
      const missingCoreFields = !existing.ceo || !existing.ipoDate;

      if (missingCoreFields) {
        const updated = await syncCompany(ticker);
        return NextResponse.json(updated);
      }

      return NextResponse.json(existing);
    }

    // If not found, fetch+insert
    const created = await syncCompany(ticker);
    return NextResponse.json(created);
  } catch (err: any) {
    console.error("API /api/company error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

    // Return empty array for empty/short queries (prevents spamming DB)
    if (!q || q.length < 2) {
      return NextResponse.json([]);
    }

    const results = await prisma.company.findMany({
      where: {
        OR: [
          { ticker: { contains: q, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } },
        ],
      },
      select: {
        ticker: true,
        name: true,
        logoUrl: true,
        exchange: true,
      },
      take: 8,
      orderBy: [
        // nicer ordering: tickers that start with the query first, then name
        { ticker: "asc" },
        { name: "asc" },
      ],
    });

    return NextResponse.json(results);
  } catch (err: any) {
    console.error("API /api/company/search error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
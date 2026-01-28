import { NextRequest, NextResponse } from "next/server";

type FinnhubEarningsRow = {
  period: string; // "YYYY-MM-DD"
  actual: number;
  estimate: number;
};

type EPSTrendResponse =
  | { ok: false; error: string }
  | {
      ok: true;
      ticker: string;
      source: { earnings: "finnhub" };
      data: Array<{
        period: string;
        year: number;
        quarter: number;
        actual: number;
        estimate: number;
        surprise: number;
        surprisePercent: number;
      }>;
    };

const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const memCache = new Map<string, { ts: number; data: EPSTrendResponse }>();

function toNum(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function parseYearQuarter(period: string) {
  const d = new Date(period);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth(); // 0–11
  const quarter = Math.floor(month / 3) + 1;
  return { year, quarter };
}

async function fetchFinnhubEarnings(ticker: string): Promise<FinnhubEarningsRow[]> {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) return [];

  const url = `https://finnhub.io/api/v1/stock/earnings?symbol=${encodeURIComponent(
    ticker
  )}&token=${encodeURIComponent(token)}`;

  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => null);

  if (!res.ok || !Array.isArray(json)) return [];

  return json
    .map((x: any) => ({
      period: String(x?.period ?? ""),
      actual: toNum(x?.actual),
      estimate: toNum(x?.estimate),
    }))
    .filter((x: FinnhubEarningsRow) => Boolean(x.period));
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ticker = (searchParams.get("ticker") || "").trim().toUpperCase();

  if (!ticker) {
    return NextResponse.json(
      { ok: false, error: "Missing ticker" } satisfies EPSTrendResponse,
      { status: 400 }
    );
  }

  const cacheKey = `eps:${ticker}`;
  const cached = memCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TTL_MS) {
    return NextResponse.json(cached.data);
  }

  try {
    const rows = await fetchFinnhubEarnings(ticker);

    if (!rows.length) {
      const out: EPSTrendResponse = {
        ok: false,
        error: "No EPS data found (or FINNHUB_API_KEY missing).",
      };
      memCache.set(cacheKey, { ts: Date.now(), data: out });
      return NextResponse.json(out, { status: 404 });
    }

    const sorted = rows
      .slice()
      .sort((a, b) => a.period.localeCompare(b.period))
      .slice(-12); // last 12 quarters

    const data = sorted.map((r) => {
      const surprise = r.actual - r.estimate;
      const surprisePercent =
        r.estimate !== 0 ? (surprise / Math.abs(r.estimate)) * 100 : 0;

      const { year, quarter } = parseYearQuarter(r.period);

      return {
        period: r.period,
        year,
        quarter,
        actual: r.actual,
        estimate: r.estimate,
        surprise,
        surprisePercent,
      };
    });

    const out: EPSTrendResponse = {
      ok: true,
      ticker,
      source: { earnings: "finnhub" },
      data,
    };

    memCache.set(cacheKey, { ts: Date.now(), data: out });
    return NextResponse.json(out);
  } catch (e: any) {
    const out: EPSTrendResponse = { ok: false, error: e?.message || "Unknown error" };
    return NextResponse.json(out, { status: 500 });
  }
}
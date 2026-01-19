import { NextRequest, NextResponse } from "next/server";

type FinnhubRecRow = {
  period: string; // "YYYY-MM-DD"
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
};

type Bucket =
  | "Strong Buy"
  | "Buy"
  | "Hold"
  | "Sell"
  | "Strong Sell";

type AnalystRatingsResponse =
  | { ok: false; error: string }
  | {
      ok: true;
      ticker: string;
      source: { recommendationTrends: "finnhub" };
      latest: {
        period: string;
        counts: {
          strongBuy: number;
          buy: number;
          hold: number;
          sell: number;
          strongSell: number;
          total: number;
        };
        // Weighted score in [-2,2] (for needle position)
        score: number;
        // Dominant bucket for the latest period
        dominant: {
          bucket: Bucket;
          count: number;
          total: number;
          text: string; // e.g. "30/60 Buy"
        };
      };
      // trend for sparkline (last 12 periods)
      trend: Array<{
        period: string;
        score: number;
        total: number;
        dominantBucket: Bucket;
        dominantCount: number;
      }>;
    };

const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const memCache = new Map<string, { ts: number; data: AnalystRatingsResponse }>();

function toInt(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

function computeScore(r: FinnhubRecRow) {
  const sb = toInt(r.strongBuy);
  const b = toInt(r.buy);
  const h = toInt(r.hold);
  const s = toInt(r.sell);
  const ss = toInt(r.strongSell);

  const total = sb + b + h + s + ss;
  if (total <= 0) return { score: 0, total };

  // normalized [-2,2]
  const raw = 2 * sb + 1 * b + 0 * h - 1 * s - 2 * ss;
  return { score: raw / total, total };
}

// Tie-break order (more bullish wins ties)
const DOM_TIE_ORDER: Bucket[] = [
  "Strong Buy",
  "Buy",
  "Hold",
  "Sell",
  "Strong Sell",
];

function dominantBucket(r: FinnhubRecRow): { bucket: Bucket; count: number; total: number } {
  const sb = toInt(r.strongBuy);
  const b = toInt(r.buy);
  const h = toInt(r.hold);
  const s = toInt(r.sell);
  const ss = toInt(r.strongSell);
  const total = sb + b + h + s + ss;

  const map: Record<Bucket, number> = {
    "Strong Buy": sb,
    Buy: b,
    Hold: h,
    Sell: s,
    "Strong Sell": ss,
  };

  let best: Bucket = "Hold";
  let bestCount = -1;

  for (const bucket of DOM_TIE_ORDER) {
    const c = map[bucket];
    if (c > bestCount) {
      best = bucket;
      bestCount = c;
    }
  }

  return { bucket: best, count: Math.max(0, bestCount), total };
}

async function fetchFinnhubRecommendationTrends(ticker: string): Promise<FinnhubRecRow[]> {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) return [];

  const url = `https://finnhub.io/api/v1/stock/recommendation?symbol=${encodeURIComponent(
    ticker
  )}&token=${encodeURIComponent(token)}`;

  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json().catch(() => null);
  if (!res.ok || !Array.isArray(data)) return [];

  return data
    .map((x: any) => ({
      period: String(x?.period ?? ""),
      strongBuy: toInt(x?.strongBuy),
      buy: toInt(x?.buy),
      hold: toInt(x?.hold),
      sell: toInt(x?.sell),
      strongSell: toInt(x?.strongSell),
    }))
    .filter((x: FinnhubRecRow) => Boolean(x.period));
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ticker = (searchParams.get("ticker") || "").trim().toUpperCase();

  if (!ticker) {
    return NextResponse.json(
      { ok: false, error: "Missing ticker" } satisfies AnalystRatingsResponse,
      { status: 400 }
    );
  }

  const cacheKey = `analyst:${ticker}`;
  const cached = memCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TTL_MS) {
    return NextResponse.json(cached.data);
  }

  try {
    const rows = await fetchFinnhubRecommendationTrends(ticker);

    if (!rows.length) {
      const out: AnalystRatingsResponse = {
        ok: false,
        error: "No analyst recommendation data found (or FINNHUB_API_KEY missing).",
      };
      memCache.set(cacheKey, { ts: Date.now(), data: out });
      return NextResponse.json(out, { status: 404 });
    }

    // Finnhub usually returns newest-first; normalize ascending
    const sorted = rows.slice().sort((a, b) => String(a.period).localeCompare(String(b.period)));
    const latestRow = sorted[sorted.length - 1];

    const sb = toInt(latestRow.strongBuy);
    const b = toInt(latestRow.buy);
    const h = toInt(latestRow.hold);
    const s = toInt(latestRow.sell);
    const ss = toInt(latestRow.strongSell);
    const total = sb + b + h + s + ss;

    const sc = computeScore(latestRow);
    const dom = dominantBucket(latestRow);

    const out: AnalystRatingsResponse = {
      ok: true,
      ticker,
      source: { recommendationTrends: "finnhub" },
      latest: {
        period: latestRow.period,
        counts: {
          strongBuy: sb,
          buy: b,
          hold: h,
          sell: s,
          strongSell: ss,
          total,
        },
        score: Number.isFinite(sc.score) ? sc.score : 0,
        dominant: {
          bucket: dom.bucket,
          count: dom.count,
          total: dom.total,
          text: `${dom.count}/${dom.total} ${dom.bucket}`,
        },
      },
      trend: sorted.slice(-12).map((r) => {
        const scc = computeScore(r);
        const domm = dominantBucket(r);
        return {
          period: r.period,
          score: Number.isFinite(scc.score) ? scc.score : 0,
          total: scc.total,
          dominantBucket: domm.bucket,
          dominantCount: domm.count,
        };
      }),
    };

    memCache.set(cacheKey, { ts: Date.now(), data: out });
    return NextResponse.json(out);
  } catch (e: any) {
    const out: AnalystRatingsResponse = { ok: false, error: e?.message || "Unknown error" };
    return NextResponse.json(out, { status: 500 });
  }
}
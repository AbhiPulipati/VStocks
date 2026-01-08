import { NextResponse } from "next/server";

// Alpha Vantage News & Sentiment
// Docs: https://www.alphavantage.co/documentation/#news-sentiment

type AvNewsResponse = {
  feed?: any[];
  Note?: string;
  Information?: string;
  "Error Message"?: string;
};

export type NewsItem = {
  title: string;
  url: string;
  timePublished: string; // AV: YYYYMMDDTHHMMSS
  summary: string;
  bannerImage: string | null;
  source: string;
  sourceDomain: string | null;
  tickers: { ticker: string; label: string; score: number }[];
};

// ----------
// Simple in-memory cache (dev/testing friendly)
// NOTE: On serverless (Vercel), memory cache is best-effort and may not persist across instances.
// We keep the interface small so you can later swap to Redis/Upstash by replacing getCached/setCached.
// ----------

type CacheEntry = { expiresAt: number; data: NewsItem[] };
const memoryCache = new Map<string, CacheEntry>();
const TTL_MS = 60 * 60 * 1000; // 1 hour

async function getCached(key: string): Promise<NewsItem[] | null> {
  const hit = memoryCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return hit.data;
}

async function setCached(key: string, data: NewsItem[]): Promise<void> {
  memoryCache.set(key, { expiresAt: Date.now() + TTL_MS, data });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithBackoff(url: string, tries = 4) {
  let lastErr: any = null;

  for (let attempt = 1; attempt <= tries; attempt++) {
    const res = await fetch(url, { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as AvNewsResponse;

    // AlphaVantage throttling responses
    if ((data as any)?.Note || (data as any)?.Information) {
      lastErr = new Error((data as any).Note || (data as any).Information);
      await sleep(1200 * attempt * attempt);
      continue;
    }

    if (!res.ok || (data as any)?.["Error Message"]) {
      lastErr = new Error(
        `AlphaVantage error: ${res.status} ${(data as any)?.["Error Message"] ?? ""}`.trim()
      );
      await sleep(500 * attempt);
      continue;
    }

    return data;
  }

  throw lastErr ?? new Error("AlphaVantage request failed.");
}

function toNumber(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeBannerImage(v: any): string | null {
  const s = (v ?? "").toString().trim();
  if (!s || s.toLowerCase() === "null") return null;
  return s;
}

function normalizeTickers(feedItem: any): NewsItem["tickers"] {
  const arr = Array.isArray(feedItem?.ticker_sentiment) ? feedItem.ticker_sentiment : [];

  const tickers = arr
    .map((t: any) => ({
      ticker: (t?.ticker ?? "").toString().trim().toUpperCase(),
      label: (t?.ticker_sentiment_label ?? "").toString().trim() || "Neutral",
      score: toNumber(t?.ticker_sentiment_score),
      relevance: toNumber(t?.relevance_score),
    }))
    .filter((t: any) => t.ticker);

  // Prefer the most relevant tickers
  tickers.sort((a: any, b: any) => (b.relevance ?? 0) - (a.relevance ?? 0));

  return tickers.slice(0, 6).map(({ ticker, label, score }: any) => ({ ticker, label, score }));
}

function normalizeFeedItem(feedItem: any): NewsItem | null {
  const title = (feedItem?.title ?? "").toString().trim();
  const url = (feedItem?.url ?? "").toString().trim();
  if (!title || !url) return null;

  return {
    title,
    url,
    timePublished: (feedItem?.time_published ?? "").toString().trim(),
    summary: (feedItem?.summary ?? "").toString().trim(),
    bannerImage: normalizeBannerImage(feedItem?.banner_image),
    source: (feedItem?.source ?? feedItem?.source_domain ?? "").toString().trim() || "Source",
    sourceDomain: (feedItem?.source_domain ?? "").toString().trim() || null,
    tickers: normalizeTickers(feedItem),
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ticker = (searchParams.get("ticker") ?? "").trim().toUpperCase();

  if (!ticker) {
    return NextResponse.json({ error: "Missing ticker" }, { status: 400 });
  }

  const apiKey = process.env.ALPHAVANTAGE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing ALPHAVANTAGE_API_KEY" }, { status: 500 });
  }

  const cacheKey = `av-news:${ticker}`;
  const cached = await getCached(cacheKey);
  if (cached) {
    return NextResponse.json({ items: cached, source: "alphavantage", cached: true });
  }

  const url = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${encodeURIComponent(
    ticker
  )}&sort=LATEST&limit=50&apikey=${apiKey}`;

  try {
    const data = (await fetchWithBackoff(url)) as AvNewsResponse;
    const feed = Array.isArray((data as any)?.feed) ? (data as any).feed : [];

    const items: NewsItem[] = feed
      .map(normalizeFeedItem)
      .filter(Boolean)
      .slice(0, 48) as NewsItem[];

    await setCached(cacheKey, items);

    return NextResponse.json({ items, source: "alphavantage", cached: false });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed to load news" }, { status: 500 });
  }
}
import { NextRequest, NextResponse } from "next/server";

// Cache to prevent hitting Finnhub's rate limit (60 calls/minute for free tier)
const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const memCache = new Map<string, { ts: number; data: any }>();

/**
 * Sanitizes Finnhub values to ensure we always return a valid number
 */
function toNum(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Fetches actual financial metrics from Finnhub
 * This endpoint provides TTM, Annual, and Quarterly data points
 */
async function fetchFinnhubRatios(ticker: string) {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) {
    console.error("FINNHUB_API_KEY is missing from environment variables");
    return {};
  }

  try {
    // Basic Financials endpoint covers roughly 90% of your RatioConfig keys
    const url = `https://finnhub.io/api/v1/stock/metric?symbol=${ticker}&metric=all&token=${token}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Finnhub API error: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();
    const rawMetrics = json.metric || {};

    // Transform raw Finnhub metrics into our required key-value map
    const metrics: Record<string, number> = {};
    
    // We iterate through all available metrics returned by Finnhub
    Object.keys(rawMetrics).forEach((key) => {
      metrics[key] = toNum(rawMetrics[key]);
    });

    // Special handling for specific keys if they are named differently in Finnhub's raw response
    // For example, if 'forwardPE' isn't in 'metric', check other potential fields
    if (json.series?.annual?.pe) {
      metrics["peAnnual"] = toNum(json.series.annual.pe[0]?.v);
    }

    return metrics;
  } catch (error) {
    console.error(`Error fetching metrics for ${ticker}:`, error);
    return {};
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ticker = (searchParams.get("ticker") || "").trim().toUpperCase();

  if (!ticker) {
    return NextResponse.json({ ok: false, error: "Missing ticker" }, { status: 400 });
  }

  // Check memory cache
  const cacheKey = `ratios:${ticker}`;
  const cached = memCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TTL_MS) {
    return NextResponse.json(cached.data);
  }

  try {
    const metrics = await fetchFinnhubRatios(ticker);
    
    // Check if we actually got data back
    if (Object.keys(metrics).length === 0) {
      return NextResponse.json({ 
        ok: false, 
        error: "No data returned from Finnhub. Check ticker or API key." 
      }, { status: 404 });
    }

    const out = { ok: true, ticker, metrics };
    
    // Update cache
    memCache.set(cacheKey, { ts: Date.now(), data: out });
    
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ 
      ok: false, 
      error: e?.message || "Internal Server Error" 
    }, { status: 500 });
  }
}
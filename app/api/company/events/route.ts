// app/api/company/events/route.ts
import { NextRequest, NextResponse } from "next/server";

type Filing = {
  date: string; // YYYY-MM-DD
  form: string;
  description?: string | null;
  url?: string | null;
};

type EarningsEvent = {
  date: string; // YYYY-MM-DD
  quarter?: number | null;
  year?: number | null;
  epsEstimate?: number | null;
  epsActual?: number | null;
  revenueEstimate?: number | null;
  revenueActual?: number | null;
};

type DividendEvent = {
  exDividendDate?: string | null; // YYYY-MM-DD
  dividendDate?: string | null;   // YYYY-MM-DD
  dividendPerShare?: number | null;
  dividendYield?: number | null;
};

type EventsResponse = {
  ok: true;
  ticker: string;
  source: {
    filings: "finnhub";
    earnings: "finnhub";
    dividends: "alphavantage";
  };
  recent: {
    filings: Filing[];
  };
  upcoming: {
    earnings: EarningsEvent[];
    dividend: DividendEvent | null;
  };
};

const TTL_MS = 60 * 60 * 1000; // 1 hour
const memCache = new Map<string, { ts: number; data: EventsResponse }>();

function ymd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toNum(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

async function fetchFinnhubFilings(ticker: string) {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) return [];

  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 45);

  const url = `https://finnhub.io/api/v1/stock/filings?symbol=${encodeURIComponent(
    ticker
  )}&from=${ymd(from)}&to=${ymd(to)}&token=${encodeURIComponent(token)}`;

  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json().catch(() => null);
  if (!res.ok || !Array.isArray(data)) return [];

  // Finnhub returns newest first usually; we’ll normalize and take a few.
  const mapped: Filing[] = data
    .map((x: any) => ({
      date: String(x?.filingDate ?? x?.acceptedDate ?? "").slice(0, 10),
      form: String(x?.form ?? x?.type ?? "Filing"),
      description: x?.description ?? x?.title ?? null,
      url: x?.reportUrl ?? x?.url ?? null,
    }))
    .filter((x: Filing) => x.date && x.form)
    .slice(0, 6);

  return mapped;
}

async function fetchFinnhubEarnings(ticker: string) {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) return [];

  const from = new Date();
  const to = new Date();
  to.setDate(from.getDate() + 120);

  const url = `https://finnhub.io/api/v1/calendar/earnings?symbol=${encodeURIComponent(
    ticker
  )}&from=${ymd(from)}&to=${ymd(to)}&token=${encodeURIComponent(token)}`;

  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) return [];

  const list = Array.isArray(data?.earningsCalendar) ? data.earningsCalendar : [];
  const mapped: EarningsEvent[] = list
    .map((x: any) => ({
      date: String(x?.date ?? "").slice(0, 10),
      quarter: x?.quarter != null ? Number(x.quarter) : null,
      year: x?.year != null ? Number(x.year) : null,
      epsEstimate: toNum(x?.epsEstimate),
      epsActual: toNum(x?.epsActual),
      revenueEstimate: toNum(x?.revenueEstimate),
      revenueActual: toNum(x?.revenueActual),
    }))
    .filter((x: EarningsEvent) => x.date)
    .slice(0, 6);

  return mapped;
}

async function fetchAlphaVantageDividendOverview(ticker: string) {
  const key = process.env.ALPHAVANTAGE_API_KEY;
  if (!key) return null;

  const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${encodeURIComponent(
    ticker
  )}&apikey=${encodeURIComponent(key)}`;

  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) return null;

  // These fields are commonly present in OVERVIEW (but not guaranteed).
  const exDividendDate =
    typeof data.ExDividendDate === "string" ? data.ExDividendDate : null;
  const dividendDate =
    typeof data.DividendDate === "string" ? data.DividendDate : null;

  const dividendPerShare = toNum(data.DividendPerShare);
  const dividendYield = toNum(data.DividendYield);

  // If nothing useful, return null
  if (!exDividendDate && !dividendDate && dividendPerShare == null && dividendYield == null)
    return null;

  const out: DividendEvent = {
    exDividendDate,
    dividendDate,
    dividendPerShare,
    dividendYield,
  };

  return out;
}

export async function GET(req: NextRequest) {
  try {
    const tickerParam = req.nextUrl.searchParams.get("ticker");
    const ticker = tickerParam?.trim().toUpperCase();

    if (!ticker) {
      return NextResponse.json({ error: "Missing ticker" }, { status: 400 });
    }

    const cacheKey = `events:${ticker}`;
    const hit = memCache.get(cacheKey);
    if (hit && Date.now() - hit.ts < TTL_MS) {
      return NextResponse.json(hit.data);
    }

    const [filings, earnings, dividend] = await Promise.all([
      fetchFinnhubFilings(ticker),
      fetchFinnhubEarnings(ticker),
      fetchAlphaVantageDividendOverview(ticker),
    ]);

    const payload: EventsResponse = {
      ok: true,
      ticker,
      source: {
        filings: "finnhub",
        earnings: "finnhub",
        dividends: "alphavantage",
      },
      recent: { filings },
      upcoming: { earnings, dividend },
    };

    memCache.set(cacheKey, { ts: Date.now(), data: payload });
    return NextResponse.json(payload);
  } catch (err: any) {
    console.error("GET /api/company/events error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
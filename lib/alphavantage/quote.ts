const AV_BASE = "https://www.alphavantage.co/query";
const API_KEY = process.env.ALPHAVANTAGE_API_KEY!;

export type AvQuote = {
  price: number | null;
  lastTradingDay: string | null;
};

function toNum(v: any): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

export async function fetchAlphaVantagePrice(
  tickerRaw: string
): Promise<AvQuote | null> {
  const ticker = String(tickerRaw ?? "").trim().toUpperCase();
  if (!ticker) return null;

  if (!API_KEY) throw new Error("Missing ALPHAVANTAGE_API_KEY");

  const url = `${AV_BASE}?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(
    ticker
  )}&apikey=${API_KEY}`;

  // Cache a bit so you don’t burn AV limits
const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 } }); // ✅ 1 day
  if (!res.ok) return null;

  const data = await res.json().catch(() => null);
  const q = data?.["Global Quote"];
  if (!q) return null;

  // AlphaVantage uses string keys like "05. price"
  const price = toNum(q["05. price"]);
  const lastTradingDay = (q["07. latest trading day"] as string) ?? null;

  return { price, lastTradingDay };
}
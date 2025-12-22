const FMP_BASE = "https://financialmodelingprep.com";
const API_KEY = process.env.FMP_API_KEY!;

export type SimpleQuote = {
  price: number;
  change: number;
  changePercent: number; // percent value like 1.23 (not 0.0123)
};

function parsePercent(value: any): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value.replace("%", ""));
  return NaN;
}

export async function fetchQuote(tickerRaw: string): Promise<SimpleQuote | null> {
  const ticker = String(tickerRaw ?? "").trim().toUpperCase();
  if (!ticker) return null;

  const res = await fetch(
    `${FMP_BASE}/stable/quote?symbol=${encodeURIComponent(ticker)}&apikey=${API_KEY}`,
    {
      // Since you're fine with EOD / not intraday, cache daily
      next: { revalidate: 60 * 60 * 24 },
    }
  );

  if (!res.ok) return null;

  const data = await res.json();
  const q = data?.[0];
  if (!q) return null;

  const price = Number(q.price);
  const change = Number(q.change);

  // FMP commonly uses "changesPercentage"
  const changePercent = parsePercent(
    q.changesPercentage ?? q.changePercentage ?? q.changePercent
  );

  if (!Number.isFinite(price) || !Number.isFinite(change) || !Number.isFinite(changePercent)) {
    return null;
  }

  return { price, change, changePercent };
}
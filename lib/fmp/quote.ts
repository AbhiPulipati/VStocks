const FMP_BASE = "https://financialmodelingprep.com";
const API_KEY = process.env.FMP_API_KEY!;

export type SimpleQuote = {
  price: number;
  change: number;
  changePercent: number; // percent value like 1.23 (not 0.0123)
  marketCap: number | null;
  pe: number | null;
};

function parsePercent(value: any): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value.replace("%", ""));
  return NaN;
}

function toNum(v: any): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    // remove commas just in case
    const n = Number(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function fetchQuote(tickerRaw: string): Promise<SimpleQuote | null> {
  const ticker = String(tickerRaw ?? "").trim().toUpperCase();
  if (!ticker) return null;

  const res = await fetch(
    `${FMP_BASE}/stable/quote?symbol=${encodeURIComponent(ticker)}&apikey=${API_KEY}`,
    { next: { revalidate: 60 * 60 * 24 } }
  );

  if (!res.ok) return null;

  const data = await res.json();
  const q = data?.[0];
  if (!q) return null;

  const price = toNum(q.price);
  const change = toNum(q.change);

  const changePercent = parsePercent(
    q.changesPercentage ?? q.changePercentage ?? q.changePercent
  );

  // ✅ Market cap: try many common key names
  const marketCap =
    toNum(q.marketCap) ??
    toNum(q.mktCap) ??
    toNum(q.marketCapitalization) ??
    toNum(q.market_cap) ??
    null;

  // ✅ P/E: try many common key names
  const pe =
    toNum(q.pe) ??
    toNum(q.peRatio) ??
    toNum(q.PE) ??
    toNum(q.priceEarningsRatio) ??
    toNum(q.priceToEarnings) ??
    toNum(q.trailingPE) ??
    null;

  if (!Number.isFinite(price ?? NaN) || !Number.isFinite(change ?? NaN) || !Number.isFinite(changePercent)) {
    return null;
  }

  return {
    price: price!,
    change: change!,
    changePercent,
    marketCap,
    pe,
  };
}
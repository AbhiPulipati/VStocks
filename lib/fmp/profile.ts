const FMP_BASE = "https://financialmodelingprep.com";
const API_KEY = process.env.FMP_API_KEY!;

export type FmpProfileLite = {
  sharesOutstanding: number | null;
  beta: number | null;
  marketCap: number | null;
};

function toNum(v: any): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

async function fetchSharesOutstandingFromSharesFloat(
  ticker: string
): Promise<number | null> {
  // Docs: /stable/shares-float?symbol=AAPL :contentReference[oaicite:2]{index=2}
  const res = await fetch(
    `${FMP_BASE}/stable/shares-float?symbol=${encodeURIComponent(
      ticker
    )}&apikey=${API_KEY}`,
    { next: { revalidate: 60 * 60 * 24 } } // daily cache
  );

  if (!res.ok) return null;

  const data = await res.json().catch(() => null);
  const row = Array.isArray(data) ? data[0] : data?.[0];
  if (!row) return null;

  // Be flexible with possible field names
  return (
    toNum(row.sharesOutstanding) ??
    toNum(row.shares_outstanding) ??
    toNum(row.outstandingShares) ??
    toNum(row.outstanding_shares) ??
    null
  );
}

export async function fetchProfileLite(
  tickerRaw: string
): Promise<FmpProfileLite | null> {
  const ticker = String(tickerRaw ?? "").trim().toUpperCase();
  if (!ticker) return null;

  if (!API_KEY) throw new Error("Missing FMP_API_KEY");

  // Docs: /stable/profile?symbol=AAPL :contentReference[oaicite:3]{index=3}
  const res = await fetch(
    `${FMP_BASE}/stable/profile?symbol=${encodeURIComponent(
      ticker
    )}&apikey=${API_KEY}`,
    { next: { revalidate: 60 * 60 * 24 } } // daily cache
  );

  if (!res.ok) return null;

  const data = await res.json().catch(() => null);
  const profile = Array.isArray(data) ? data[0] : data?.[0];
  if (!profile) return null;

  let shares =
    toNum(profile.sharesOutstanding) ??
    toNum(profile.shares_outstanding) ??
    null;

  // ✅ Fallback: shares-float endpoint if profile missing shares
  if (shares == null) {
    shares = await fetchSharesOutstandingFromSharesFloat(ticker);
  }

  return {
    sharesOutstanding: shares,
    beta: toNum(profile.beta),
    marketCap: toNum(profile.mktCap) ?? toNum(profile.marketCap),
  };
}
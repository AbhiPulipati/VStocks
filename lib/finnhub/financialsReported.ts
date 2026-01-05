// lib/finnhub/financialsReported.ts
// Fetch Finnhub "financials-reported" and keep the original reported order.

export type FinnhubReportedItem = {
  label: string;
  value: number | null;
};

export type FinnhubFinancialsReportedRow = {
  symbol: string;
  year: number;
  quarter: number; // 0 = annual (10-K), 1..3 = 10-Q
  form?: string;
  endDate?: string;
  filedDate?: string;
  report: {
    bs?: Array<{ label?: string; value?: number | null }>;
  };
};

export async function fetchFinnhubFinancialsReported(symbol: string) {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) throw new Error("Missing FINNHUB_API_KEY");

  const url = new URL("https://finnhub.io/api/v1/stock/financials-reported");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("token", key);

  const res = await fetch(url.toString(), { cache: "no-store" });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) throw new Error(data?.error ?? `Finnhub error (${res.status})`);

  return data as {
    cik?: string;
    data?: FinnhubFinancialsReportedRow[];
  };
}

export function pickBalanceSheetItemsInOrder(
  row: FinnhubFinancialsReportedRow
): FinnhubReportedItem[] {
  const bs = row?.report?.bs ?? [];

  // Keep array order exactly as provided.
  return bs
    .map((it) => {
      const label = (it?.label ?? "").toString().trim();
      const value =
        typeof it?.value === "number" && Number.isFinite(it.value) ? it.value : null;
      return label ? { label, value } : null;
    })
    .filter((x): x is FinnhubReportedItem => !!x);
}
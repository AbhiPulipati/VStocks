// lib/finnhub/financialsReported.ts

export type FinnhubReportedItem = {
  concept: string;
  unit: string | null;
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
    bs?: Array<{
      concept?: string;
      unit?: string;
      label?: string;
      value?: number | null;
    }>;
  };
};

type FetchOpts = {
  symbol?: string;      // e.g. "NVDA"
  cik?: string;         // e.g. "320193"
  freq?: "annual" | "quarterly";
};

export async function fetchFinnhubFinancialsReported(opts: FetchOpts) {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) throw new Error("Missing FINNHUB_API_KEY");

  const url = new URL("https://finnhub.io/api/v1/stock/financials-reported");

  if (opts.cik) url.searchParams.set("cik", opts.cik);
  else if (opts.symbol) url.searchParams.set("symbol", opts.symbol);
  else throw new Error("fetchFinnhubFinancialsReported: symbol or cik required");

  if (opts.freq) url.searchParams.set("freq", opts.freq);

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

  return bs
    .map((it) => {
      const concept = (it?.concept ?? "").toString().trim();
      const label = (it?.label ?? "").toString().trim();
      const unit = it?.unit != null ? String(it.unit).trim() : null;

      const value =
        typeof it?.value === "number" && Number.isFinite(it.value)
          ? it.value
          : null;

      if (!concept || !label) return null;
      return { concept, unit: unit || null, label, value };
    })
    .filter((x): x is FinnhubReportedItem => !!x);
}

export function pickCashFlowItemsInOrder(
  row: FinnhubFinancialsReportedRow
): FinnhubReportedItem[] {
  const cf = (row as any)?.report?.cf ?? [];

  return cf
    .map((it: any) => {
      const concept = (it?.concept ?? "").toString().trim();
      const label = (it?.label ?? "").toString().trim();
      const unit = it?.unit != null ? String(it.unit).trim() : null;

      const value =
        typeof it?.value === "number" && Number.isFinite(it.value)
          ? it.value
          : null;

      if (!concept || !label) return null;
      return { concept, unit: unit || null, label, value };
    })
    .filter((x: any) => !!x);
}

// lib/alphavantage/financials.ts
export type AvStatementFn = "INCOME_STATEMENT" | "BALANCE_SHEET" | "CASH_FLOW";

export type AvReport = Record<string, string>;

export type AvResponse = {
  symbol?: string;
  annualReports?: AvReport[];
  quarterlyReports?: AvReport[];
  Note?: string;
  Information?: string;
  "Error Message"?: string;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithBackoff(url: string, tries = 4) {
  let lastErr: any = null;

  for (let attempt = 1; attempt <= tries; attempt++) {
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));

    // AlphaVantage throttling responses
    if (data?.Note || data?.Information) {
      lastErr = new Error(data.Note || data.Information);
      await sleep(1200 * attempt * attempt);
      continue;
    }

    if (!res.ok || data?.["Error Message"]) {
      lastErr = new Error(
        `AlphaVantage error: ${res.status} ${data?.["Error Message"] ?? ""}`.trim()
      );
      await sleep(500 * attempt);
      continue;
    }

    return data as AvResponse;
  }

  throw lastErr ?? new Error("AlphaVantage request failed.");
}

export async function fetchAvStatement(ticker: string, fn: AvStatementFn) {
  const apiKey = process.env.ALPHAVANTAGE_API_KEY;
  if (!apiKey) throw new Error("Missing ALPHAVANTAGE_API_KEY in .env");

  const url = `https://www.alphavantage.co/query?function=${fn}&symbol=${encodeURIComponent(
    ticker
  )}&apikey=${apiKey}`;

  return fetchWithBackoff(url);
}

export function parseFiscalDateEnding(report: AvReport): Date | null {
  const s = report?.fiscalDateEnding;
  if (!s || s === "None") return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function cleanPayload(report: AvReport): Record<string, any> {
  const out: Record<string, any> = {};

  for (const [k, vRaw] of Object.entries(report ?? {})) {
    const v = (vRaw ?? "").toString();

    // ✅ Drop AlphaVantage "None" fields entirely (saves space)
    if (v === "None") continue;

    // Keep fiscalDateEnding / reportedCurrency as strings (nice to preserve)
    if (k === "fiscalDateEnding" || k === "reportedCurrency") {
      out[k] = v;
      continue;
    }

    // Convert numeric strings -> numbers
    const n = Number(v);
    out[k] = Number.isFinite(n) && v.trim() !== "" ? n : v;
  }

  return out;
}
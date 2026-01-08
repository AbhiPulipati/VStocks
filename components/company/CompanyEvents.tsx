"use client";

import { useEffect, useMemo, useState } from "react";

type Filing = {
  date: string;
  form: string;
  description?: string | null;
  url?: string | null;
};

type EarningsEvent = {
  date: string;
  quarter?: number | null;
  year?: number | null;
  epsEstimate?: number | null;
  epsActual?: number | null;
  revenueEstimate?: number | null;
  revenueActual?: number | null;
};

type DividendEvent = {
  exDividendDate?: string | null;
  dividendDate?: string | null;
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
  recent: { filings: Filing[] };
  upcoming: { earnings: EarningsEvent[]; dividend: DividendEvent | null };
};

function fmtMoneyCompact(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(0);
}

export default function CompanyEvents({ ticker }: { ticker: string }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<EventsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!ticker) return;
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/company/events?ticker=${encodeURIComponent(ticker)}`);
        const json = (await res.json().catch(() => null)) as EventsResponse | null;

        if (!res.ok || !json) throw new Error((json as any)?.error ?? "Failed to load events");

        if (!cancelled) setData(json);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load events");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  const filings = data?.recent?.filings ?? [];
  const earnings = data?.upcoming?.earnings ?? [];
  const dividend = data?.upcoming?.dividend ?? null;

  const dividendLine = useMemo(() => {
    if (!dividend) return null;
    const parts: string[] = [];

    const ex = dividend.exDividendDate ? `Ex: ${dividend.exDividendDate}` : null;
    const pay = dividend.dividendDate ? `Pay: ${dividend.dividendDate}` : null;

    if (ex) parts.push(ex);
    if (pay) parts.push(pay);

    if (dividend.dividendPerShare != null) parts.push(`DPS: ${dividend.dividendPerShare}`);
    if (dividend.dividendYield != null) parts.push(`Yield: ${(dividend.dividendYield * 100).toFixed(2)}%`);

    return parts.length ? parts.join(" · ") : null;
  }, [dividend]);

  return (
    <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Recent Events */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-black">Recent Events</h2>
          <div className="text-xs text-gray-500">Source: Finnhub</div>
        </div>

        {loading ? (
          <div className="mt-4 text-sm text-gray-500">Loading…</div>
        ) : error ? (
          <div className="mt-4 text-sm text-red-700">{error}</div>
        ) : filings.length ? (
          <ul className="mt-4 space-y-3">
            {filings.slice(0, 4).map((f, i) => (
              <li key={`${f.date}-${f.form}-${i}`} className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-black">
                    {f.form} <span className="text-gray-500 font-normal">· {f.date}</span>
                  </div>
                  <div className="text-sm text-gray-700 line-clamp-2">
                    {f.description ?? "SEC filing"}
                  </div>
                </div>

                {f.url ? (
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-sm text-blue-600 hover:underline"
                  >
                    Open
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-4 text-sm text-gray-500">No recent filings found.</div>
        )}
      </div>

      {/* Upcoming Events */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-black">Upcoming Events</h2>
          <div className="text-xs text-gray-500">Earnings: Finnhub · Dividends: AlphaVantage</div>
        </div>

        {loading ? (
          <div className="mt-4 text-sm text-gray-500">Loading…</div>
        ) : error ? (
          <div className="mt-4 text-sm text-red-700">{error}</div>
        ) : (
          <div className="mt-4 space-y-4">
            {/* Earnings */}
            <div>
              <div className="text-sm font-semibold text-black">Earnings</div>

              {earnings.length ? (
                <ul className="mt-2 space-y-2">
                  {earnings.slice(0, 3).map((e, i) => (
                    <li key={`${e.date}-${i}`} className="flex items-start justify-between gap-4">
                      <div className="text-sm text-gray-800">
                        <span className="font-semibold text-black">{e.date}</span>
                        {e.year != null && e.quarter != null ? (
                          <span className="text-gray-500"> · FY{e.year} Q{e.quarter}</span>
                        ) : null}
                      </div>

                      <div className="text-sm text-gray-600 text-right tabular-nums">
                        {e.epsEstimate != null ? (
                          <div>EPS est: {e.epsEstimate}</div>
                        ) : null}
                        {e.revenueEstimate != null ? (
                          <div>Rev est: {fmtMoneyCompact(e.revenueEstimate)}</div>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-2 text-sm text-gray-500">No upcoming earnings found.</div>
              )}
            </div>

            {/* Dividends */}
            <div>
              <div className="text-sm font-semibold text-black">Dividends</div>
              {dividendLine ? (
                <div className="mt-2 text-sm text-gray-800">{dividendLine}</div>
              ) : (
                <div className="mt-2 text-sm text-gray-500">No dividend dates available.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
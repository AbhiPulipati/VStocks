"use client";

import { useEffect, useMemo, useState } from "react";

type NewsItem = {
  title: string;
  url: string;
  timePublished: string;
  summary: string;
  bannerImage: string | null;
  source: string;
  sourceDomain: string | null;
  tickers: { ticker: string; label: string; score: number }[];
};

type ApiResponse = {
  items?: NewsItem[];
  source?: string;
  cached?: boolean;
  error?: string;
};

function parseAvTime(timePublished: string): Date | null {
  const s = (timePublished ?? "").toString().trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (!m) return null;
  const [, yy, mm, dd, hh, mi, ss] = m;
  // Alpha Vantage timestamps are UTC
  const d = new Date(
    Date.UTC(
      Number(yy),
      Number(mm) - 1,
      Number(dd),
      Number(hh),
      Number(mi),
      Number(ss)
    )
  );
  return isNaN(d.getTime()) ? null : d;
}

function fmtDateTime(d: Date | null): string {
  if (!d) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function sentimentColor(label: string) {
  const s = (label ?? "").toLowerCase();
  if (s.includes("bullish")) return "bg-green-500"; // bullish + somewhat-bullish
  if (s.includes("bearish")) return "bg-red-500"; // bearish + somewhat-bearish
  return "bg-yellow-500"; // neutral / unknown
}

// Placeholder image (Option A)
function NewsImage({
  src,
  alt,
  sourceDomain,
}: {
  src: string | null;
  alt: string;
  sourceDomain?: string | null;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className="h-full w-full rounded-xl border border-gray-200 bg-gradient-to-br from-slate-50 to-gray-100 flex flex-col items-center justify-center">
        <div className="text-2xl">📰</div>
        <div className="mt-1 text-[11px] font-semibold tracking-wide text-gray-600">
          NEWS
        </div>
        {sourceDomain ? (
          <div className="mt-2 px-2 text-[10px] text-gray-500 truncate max-w-[140px]">
            {sourceDomain}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className="h-full w-full object-cover rounded-xl border border-gray-200"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function TickerChip({
  ticker,
  label,
  score,
}: {
  ticker: string;
  label: string;
  score: number;
}) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-800"
      title={`${ticker}: ${label}${Number.isFinite(score) ? ` (${score.toFixed(2)})` : ""}`}
    >
      <span className="truncate">{ticker}</span>
      <span className={`h-2 w-2 rounded-full ${sentimentColor(label)}`} />
    </span>
  );
}

export default function CompanyNews({ ticker }: { ticker: string }) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<NewsItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const PAGE_SIZE = 8;
const [page, setPage] = useState(0);

// reset paging when ticker changes
useEffect(() => {
  setPage(0);
}, [ticker]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const t = (ticker ?? "").trim().toUpperCase();
      if (!t) return;

      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/news?ticker=${encodeURIComponent(t)}`);
        const data = (await res.json().catch(() => ({}))) as ApiResponse;
        if (!res.ok) throw new Error(data?.error ?? "Failed to load news");

        if (!cancelled) setItems(Array.isArray(data.items) ? data.items : []);
      } catch (e: any) {
        if (!cancelled) {
          setItems([]);
          setError(e?.message ?? "Failed to load news");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  const normalized = useMemo(() => {
    return items.map((it) => ({
      ...it,
      _dt: parseAvTime(it.timePublished),
    }));
  }, [items]);

  const total = normalized.length;
const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
const pageSafe = Math.min(page, totalPages - 1);

const pageItems = useMemo(() => {
  const start = pageSafe * PAGE_SIZE;
  return normalized.slice(start, start + PAGE_SIZE);
}, [normalized, pageSafe]);

const rangeLabel = useMemo(() => {
  if (!total) return "";
  const start = pageSafe * PAGE_SIZE + 1;
  const end = Math.min(total, (pageSafe + 1) * PAGE_SIZE);
  return `Showing ${start}–${end} of ${total}`;
}, [total, pageSafe]);

  return (
    <div className="mt-5 rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-black">Recent News</h2>
        <div className="text-xs text-gray-500">Source: Alpha Vantage</div>
      </div>

      {loading ? (
        <div className="mt-4 text-sm text-gray-500">Loading news…</div>
      ) : error ? (
        <div className="mt-4 text-sm text-red-600">{error}</div>
      ) : !normalized.length ? (
        <div className="mt-4 text-sm text-gray-500">No recent news found.</div>
      ) : (
        <div className="mt-4 space-y-4">
        {pageItems.map((it, idx) => {
            const chips = it.tickers ?? [];
            const maxChips = 5;
            const shown = chips.slice(0, maxChips);
            const extra = chips.length - shown.length;

            return (
            <a
                key={`${it.url}-${idx}`}
                href={it.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-2xl border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow"
            >
                <div className="flex gap-4 p-4 items-stretch">
                <div className="w-[170px] shrink-0">
                    <div className="h-full min-h-[128px]">
                    <NewsImage
                        src={it.bannerImage}
                        alt={it.title}
                        sourceDomain={it.sourceDomain}
                    />
                    </div>
                </div>

                <div className="min-w-0 flex-1 flex flex-col">
                    <div className="text-base md:text-lg font-extrabold text-black leading-snug line-clamp-2">
                    {it.title}
                    </div>

                    {it.summary ? (
                    <div className="mt-1 text-sm text-gray-700 line-clamp-3">
                        {it.summary}
                    </div>
                    ) : null}

                    <div className="mt-auto pt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="text-xs text-gray-500">
                        <span className="font-semibold text-gray-700">{it.source}</span>
                        {it._dt ? <span> · {fmtDateTime(it._dt)}</span> : null}
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {shown.map((t) => (
                        <TickerChip
                            key={`${it.url}-${t.ticker}`}
                            ticker={t.ticker}
                            label={t.label}
                            score={t.score}
                        />
                        ))}
                        {extra > 0 ? (
                        <span
                            className="inline-flex items-center rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-700"
                            title={chips
                            .slice(maxChips)
                            .map((t) => `${t.ticker}: ${t.label}`)
                            .join("\n")}
                        >
                            +{extra}
                        </span>
                        ) : null}
                    </div>
                    </div>
                </div>
                </div>
            </a>
            );
        })}
        </div>
      )}
      {/* Bottom pagination controls */}
      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="text-xs text-gray-500">
            {total > 0 ? `Page ${pageSafe + 1} of ${totalPages}` : ""}
            {rangeLabel ? ` · ${rangeLabel}` : ""}
        </div>

        <div className="flex items-center gap-2">
            <button
            type="button"
            className="rounded-lg border px-3 py-2 text-sm bg-white disabled:opacity-40"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={loading || !!error || pageSafe === 0}
            >
            Prev
            </button>

            <button
            type="button"
            className="rounded-lg border px-3 py-2 text-sm bg-white disabled:opacity-40"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={loading || !!error || pageSafe >= totalPages - 1}
            >
            Next
            </button>
        </div>
        </div>
    </div>
  );
}
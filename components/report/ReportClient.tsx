"use client";

import { useEffect, useRef, useState } from "react";
import {
  FileText,
  RefreshCw,
  Download,
  ChevronDown,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertCircle,
  CheckCircle,
  Clock,
  Sparkles,
} from "lucide-react";

type CompanyData = {
  name: string;
  sector?: string | null;
  industry?: string | null;
  description?: string | null;
  exchange?: string | null;
  ceo?: string | null;
  ipoDate?: string | null;
  price?: number | null;
  change?: number | null;
  changePercent?: number | null;
  marketCap?: number | null;
  revenue?: number | null;
  netIncome?: number | null;
  netProfitMargin?: number | null;
  pe?: number | null;
  fairValue?: number | null;
  upsidePct?: number | null;
  verdict?: string | null;
  revenueGrowth?: number | null;
  operatingMargin?: number | null;
  grossMargin?: number | null;
  roe?: number | null;
  currentRatio?: number | null;
  debtToEquity?: number | null;
  analystScore?: number | null;
  analystDominant?: string | null;
  strongBuy?: number;
  buy?: number;
  hold?: number;
  sell?: number;
  strongSell?: number;
};

type Status = "idle" | "loading" | "streaming" | "done" | "error";

// Minimal markdown renderer — handles ##, **bold**, bullet lists, and paragraphs
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    // ## Heading
    if (line.startsWith("## ")) {
      nodes.push(
        <h2
          key={i}
          className="mt-8 mb-3 text-lg font-bold text-gray-900 border-b border-gray-100 pb-2 first:mt-0"
        >
          {renderInline(line.slice(3))}
        </h2>
      );
      i++;
      continue;
    }

    // ### Sub-heading
    if (line.startsWith("### ")) {
      nodes.push(
        <h3 key={i} className="mt-5 mb-2 text-base font-semibold text-gray-800">
          {renderInline(line.slice(4))}
        </h3>
      );
      i++;
      continue;
    }

    // Bullet list block
    if (line.startsWith("- ") || line.startsWith("* ")) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && (lines[i].startsWith("- ") || lines[i].startsWith("* "))) {
        items.push(
          <li key={i} className="flex gap-2 text-gray-700 leading-relaxed">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
            <span>{renderInline(lines[i].slice(2))}</span>
          </li>
        );
        i++;
      }
      nodes.push(
        <ul key={`ul-${i}`} className="my-3 space-y-2 pl-1">
          {items}
        </ul>
      );
      continue;
    }

    // Regular paragraph
    nodes.push(
      <p key={i} className="my-3 text-gray-700 leading-relaxed">
        {renderInline(line)}
      </p>
    );
    i++;
  }

  return nodes;
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-gray-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

function VerdictBadge({ verdict }: { verdict?: string | null }) {
  if (!verdict) return null;
  const v = verdict.toLowerCase();
  const isBull = v === "undervalued";
  const isBear = v === "overvalued";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
        isBull
          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
          : isBear
          ? "bg-red-50 text-red-700 border border-red-200"
          : "bg-amber-50 text-amber-700 border border-amber-200"
      }`}
    >
      {isBull ? <TrendingUp size={12} /> : isBear ? <TrendingDown size={12} /> : <Minus size={12} />}
      {verdict}
    </span>
  );
}

function StatPill({ label, value, highlight }: { label: string; value: string; highlight?: "green" | "red" | "neutral" }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">{label}</span>
      <span
        className={`text-sm font-bold tabular-nums ${
          highlight === "green"
            ? "text-emerald-600"
            : highlight === "red"
            ? "text-red-600"
            : "text-gray-900"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function LoadingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

export default function ReportClient({
  ticker,
  companyData,
}: {
  ticker: string;
  companyData: CompanyData;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [report, setReport] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const generate = async () => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setStatus("loading");
    setReport("");
    setError(null);

    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, companyData }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error ?? "Failed to generate report");
      }

      setStatus("streaming");

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        full += chunk;
        setReport(full);
      }

      setStatus("done");
      setGeneratedAt(new Date().toLocaleString());
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setError(e?.message ?? "Something went wrong");
      setStatus("error");
    }
  };

  // Auto-generate on mount
  useEffect(() => {
    generate();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);

  const handlePrint = () => window.print();

  const fmtCompact = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 });

  const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

  const pricePositive = (companyData.changePercent ?? 0) >= 0;
  const upsidePositive = (companyData.upsidePct ?? 0) >= 0;

  return (
    <div className="space-y-5 print:space-y-4">
      {/* ── Report Header ── */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
              <FileText size={20} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">AI Research Report</h1>
              <p className="text-sm text-gray-500">
                {companyData.name} · {ticker}
                {companyData.exchange ? ` · ${companyData.exchange}` : ""}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 print:hidden">
            {status === "done" && (
              <button
                onClick={handlePrint}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
              >
                <Download size={14} />
                Print / Save PDF
              </button>
            )}
            <button
              onClick={generate}
              disabled={status === "loading" || status === "streaming"}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition"
            >
              <RefreshCw size={14} className={status === "streaming" ? "animate-spin" : ""} />
              {status === "loading" || status === "streaming" ? "Generating…" : "Regenerate"}
            </button>
          </div>
        </div>

        {/* Key stats strip */}
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {companyData.price != null && (
            <StatPill
              label="Price"
              value={`$${companyData.price.toFixed(2)}`}
            />
          )}
          {companyData.changePercent != null && (
            <StatPill
              label="Today"
              value={fmtPct(companyData.changePercent)}
              highlight={pricePositive ? "green" : "red"}
            />
          )}
          {companyData.marketCap != null && (
            <StatPill label="Market Cap" value={fmtCompact(companyData.marketCap)} />
          )}
          {companyData.pe != null && (
            <StatPill label="P/E Ratio" value={companyData.pe.toFixed(1)} />
          )}
          {companyData.upsidePct != null && (
            <StatPill
              label="DCF Upside"
              value={fmtPct(companyData.upsidePct)}
              highlight={upsidePositive ? "green" : "red"}
            />
          )}
          {companyData.verdict && (
            <div className="flex flex-col gap-0.5 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Verdict</span>
              <VerdictBadge verdict={companyData.verdict} />
            </div>
          )}
        </div>
      </div>

      {/* ── Report Body ── */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 lg:p-8" ref={reportRef}>
        {/* Status: loading */}
        {status === "loading" && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
              <Sparkles size={28} className="text-blue-500 animate-pulse" />
            </div>
            <div>
              <p className="text-base font-semibold text-gray-800">Analyzing {ticker}…</p>
              <p className="mt-1 text-sm text-gray-500">Gathering financials, ratios, and market data</p>
            </div>
            <LoadingDots />
          </div>
        )}

        {/* Status: error */}
        {status === "error" && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertCircle size={32} className="text-red-400" />
            <p className="text-base font-semibold text-gray-800">Report generation failed</p>
            <p className="text-sm text-red-600">{error}</p>
            <button
              onClick={generate}
              className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Status: streaming or done */}
        {(status === "streaming" || status === "done") && (
          <>
            {/* Streaming indicator */}
            {status === "streaming" && (
              <div className="mb-5 flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-4 py-2.5 text-sm text-blue-700">
                <Sparkles size={14} className="animate-pulse" />
                <span className="font-medium">Generating report</span>
                <LoadingDots />
              </div>
            )}

            {/* Rendered report */}
            <div className="prose-sm max-w-none">
              {renderMarkdown(report)}
              {status === "streaming" && (
                <span className="ml-1 inline-block h-4 w-0.5 animate-pulse bg-blue-500" />
              )}
            </div>

            {/* Footer */}
            {status === "done" && (
              <div className="mt-8 flex items-center gap-2 border-t border-gray-100 pt-5 text-xs text-gray-400">
                <CheckCircle size={12} className="text-emerald-400" />
                <span>Report generated {generatedAt}</span>
                <span className="mx-1">·</span>
                <Clock size={12} />
                <span>Data may be delayed</span>
                <span className="mx-1">·</span>
                <span className="italic">For informational purposes only. Not financial advice.</span>
              </div>
            )}
          </>
        )}

        {/* Status: idle (shouldn't show, but safety net) */}
        {status === "idle" && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <FileText size={32} className="text-gray-300" />
            <p className="text-sm text-gray-500">Click Generate to create your report</p>
            <button
              onClick={generate}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Generate Report
            </button>
          </div>
        )}
      </div>

      {/* ── Disclaimer ── */}
      <div className="rounded-xl border border-amber-100 bg-amber-50 px-5 py-3 text-xs text-amber-700 print:hidden">
        <strong>Disclaimer:</strong> This AI-generated report is for informational purposes only and does not constitute
        financial, investment, or legal advice. Always conduct your own research before making investment decisions.
      </div>
    </div>
  );
}

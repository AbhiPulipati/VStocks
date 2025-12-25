"use client";

import { useEffect, useMemo, useState } from "react";

type StatementType = "income" | "balance_sheet" | "cash_flow";
type PeriodType = "annual" | "quarterly";

type MetaRow = {
  ticker: string;
  statementType: StatementType;
  periodType: PeriodType;
  fiscalYear: number;
  quarter: number; // 0 annual, 1-4 quarterly
  fiscalDateEnding: string | null;
  reportedCurrency: string | null;
};

export default function FinancialsTester({ ticker }: { ticker: string }) {
  const [bootstrapping, setBootstrapping] = useState(true);
  const [bootstrapMsg, setBootstrapMsg] = useState<string>("Bootstrapping financials...");

  const [meta, setMeta] = useState<MetaRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [statementType, setStatementType] = useState<StatementType>("income");
  const [periodType, setPeriodType] = useState<PeriodType>("annual");
  const [year, setYear] = useState<number | null>(null);
  const [quarter, setQuarter] = useState<number>(0);

  const [payloadRow, setPayloadRow] = useState<any>(null);
  const [payloadLoading, setPayloadLoading] = useState(false);

  // 1) Bootstrap once on mount (when user opens Financials tab)
  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setBootstrapping(true);
        setError(null);
        setBootstrapMsg("Bootstrapping financials...");

        const res = await fetch("/api/financials/bootstrap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticker }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error ?? "Bootstrap failed");

        if (!cancelled) {
          setBootstrapMsg("Bootstrapped ✓ Loading metadata...");
        }

        const metaRes = await fetch(`/api/financials/meta?ticker=${encodeURIComponent(ticker)}`);
        const metaData = await metaRes.json().catch(() => ({}));
        if (!metaRes.ok) throw new Error(metaData?.error ?? "Meta fetch failed");

        const rows: MetaRow[] = metaData.rows ?? [];
        if (!cancelled) {
          setMeta(rows);
          setBootstrapping(false);
          setBootstrapMsg("Ready");
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? "Something went wrong");
          setBootstrapping(false);
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  // Filter meta rows for current selection
  const rowsForSelection = useMemo(() => {
    return meta.filter((r) => r.statementType === statementType && r.periodType === periodType);
  }, [meta, statementType, periodType]);

  const years = useMemo(() => {
    const set = new Set<number>();
    rowsForSelection.forEach((r) => set.add(r.fiscalYear));
    return Array.from(set).sort((a, b) => b - a);
  }, [rowsForSelection]);

  const quartersForYear = useMemo(() => {
    if (periodType !== "quarterly" || year == null) return [];
    return rowsForSelection
      .filter((r) => r.fiscalYear === year)
      .map((r) => r.quarter)
      .filter((q) => q >= 1 && q <= 4)
      .sort((a, b) => a - b);
  }, [rowsForSelection, periodType, year]);

  // Default year once meta loads / selection changes
  useEffect(() => {
    if (!years.length) return;
    setYear((prev) => (prev == null || !years.includes(prev) ? years[0] : prev));
  }, [years]);

  // Default quarter when switching to quarterly / year changes
  useEffect(() => {
    if (periodType !== "quarterly") {
      setQuarter(0);
      return;
    }
    if (quartersForYear.length) setQuarter(quartersForYear[0]);
  }, [periodType, quartersForYear]);

  // Fetch payload when selection changes
  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (bootstrapping) return;
      if (year == null) return;
      if (periodType === "quarterly" && !(quarter >= 1 && quarter <= 4)) return;
      if (periodType === "annual") {
        // annual stored as quarter=0
        if (quarter !== 0) setQuarter(0);
      }

      try {
        setPayloadLoading(true);
        setError(null);

        const q = periodType === "annual" ? 0 : quarter;

        const url =
          `/api/financials/payload?ticker=${encodeURIComponent(ticker)}` +
          `&statementType=${encodeURIComponent(statementType)}` +
          `&periodType=${encodeURIComponent(periodType)}` +
          `&fiscalYear=${encodeURIComponent(String(year))}` +
          `&quarter=${encodeURIComponent(String(q))}`;

        const res = await fetch(url);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error ?? "Payload fetch failed");

        if (!cancelled) setPayloadRow(data.row);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Something went wrong");
      } finally {
        if (!cancelled) setPayloadLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [bootstrapping, ticker, statementType, periodType, year, quarter]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm text-muted-foreground">Financials Tester</div>
            <div className="text-xl font-semibold">{ticker}</div>
          </div>

          <div className="text-sm text-muted-foreground">
            {bootstrapping ? bootstrapMsg : "Loaded"}
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Statement</div>
            <select
              className="w-full rounded-lg border px-3 py-2 text-sm"
              value={statementType}
              onChange={(e) => setStatementType(e.target.value as StatementType)}
            >
              <option value="income">Income Statement</option>
              <option value="balance_sheet">Balance Sheet</option>
              <option value="cash_flow">Cash Flow</option>
            </select>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Period</div>
            <select
              className="w-full rounded-lg border px-3 py-2 text-sm"
              value={periodType}
              onChange={(e) => setPeriodType(e.target.value as PeriodType)}
            >
              <option value="annual">Annual</option>
              <option value="quarterly">Quarterly</option>
            </select>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Year</div>
            <select
              className="w-full rounded-lg border px-3 py-2 text-sm"
              value={year ?? ""}
              onChange={(e) => setYear(Number(e.target.value))}
              disabled={!years.length}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Quarter</div>
            <select
              className="w-full rounded-lg border px-3 py-2 text-sm"
              value={periodType === "annual" ? 0 : quarter}
              onChange={(e) => setQuarter(Number(e.target.value))}
              disabled={periodType !== "quarterly"}
            >
              {periodType === "annual" ? (
                <option value={0}>—</option>
              ) : (
                quartersForYear.map((q) => (
                  <option key={q} value={q}>
                    Q{q}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Stored Payload</div>
          <div className="text-xs text-muted-foreground">
            {payloadLoading ? "Loading..." : payloadRow?.fiscalDateEnding ?? ""}
          </div>
        </div>

        <pre className="mt-3 max-h-[520px] overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-50">
          {payloadRow ? JSON.stringify(payloadRow.payload, null, 2) : "No payload loaded."}
        </pre>
      </div>
    </div>
  );
}
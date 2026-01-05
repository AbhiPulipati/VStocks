"use client";

import { useEffect, useMemo, useState } from "react";
import IncomeStatementGrid from "@/components/financials/incomeStatementGrid";
import IncomeStatementSankey from "@/components/financials/IncomeStatementSankey";
import type { UnitScale } from "@/lib/financials/incomeStatementRows";
import BalanceSheetGrid from "@/components/financials/BalanceSheetGrid";

type StatementType = "income" | "balance_sheet" | "cash_flow";
type PeriodType = "annual" | "quarterly";
type ViewType = "grid" | "sankey" | "pie";

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

  // UI selections (matches your desired top block)
  const [statementType, setStatementType] = useState<StatementType>("income");
const [periodType, setPeriodType] = useState<PeriodType>("annual");
const [year, setYear] = useState<number | null>(null);
const [quarter, setQuarter] = useState<number>(4); // ✅ NEW
const [view, setView] = useState<ViewType>("grid");
const [units, setUnits] = useState<UnitScale>("millions");

useEffect(() => {
  // Sankey only valid for income
  if (statementType !== "income" && view === "sankey") setView("grid");
  // Pie will be for balance_sheet later; for now keep grid if income picked
  if (statementType === "income" && view === "pie") setView("grid");
}, [statementType, view]);

  // 1) Bootstrap once on mount
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

        if (!cancelled) setBootstrapMsg("Bootstrapped ✓ Loading metadata...");

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

  // Meta filtered for statement + period
  const rowsForSelection = useMemo(() => {
    return meta.filter((r) => r.statementType === statementType && r.periodType === periodType);
  }, [meta, statementType, periodType]);

  // Available years (for quarterly year selector)
  const years = useMemo(() => {
    const set = new Set<number>();
    rowsForSelection.forEach((r) => set.add(r.fiscalYear));
    return Array.from(set).sort((a, b) => b - a);
  }, [rowsForSelection]);

  // Quarters available for the selected year (quarterly only)
const quartersForYear = useMemo(() => {
  if (periodType !== "quarterly" || year == null) return [];
  const set = new Set<number>();
  rowsForSelection
    .filter((r) => r.fiscalYear === year && r.quarter > 0)
    .forEach((r) => set.add(r.quarter));
  return Array.from(set).sort((a, b) => b - a); // newest first
}, [rowsForSelection, periodType, year]);

  // Default year when switching to quarterly or when meta loads
  useEffect(() => {
    if (periodType !== "quarterly") return;
    if (!years.length) return;
    setYear((prev) => (prev == null || !years.includes(prev) ? years[0] : prev));
  }, [periodType, years]);

  // Default quarter when switching years in quarterly mode
useEffect(() => {
  if (periodType !== "quarterly") return;
  if (!quartersForYear.length) return;
  setQuarter((prev) => (quartersForYear.includes(prev) ? prev : quartersForYear[0]));
}, [periodType, quartersForYear]);

// Year is only selectable when quarterly (for any statement)
const yearDisabled = periodType === "annual";

const yearOptions =
  periodType === "annual"
    ? [{ value: "—", label: "—" }]
    : years.map((y) => ({ value: String(y), label: String(y) }));

  return (
    <div className="space-y-4">
      {/* Top block (selectors) */}
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
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

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-5">
          <SelectBlock
            label="Statement"
            value={statementType}
            onChange={(v) => setStatementType(v as StatementType)}
            options={[
              { value: "income", label: "Income Statement" },
              { value: "balance_sheet", label: "Balance Sheet" },
              { value: "cash_flow", label: "Cash Flow" },
            ]}
          />

          <SelectBlock
            label="Period"
            value={periodType}
            onChange={(v) => setPeriodType(v as PeriodType)}
            options={[
              { value: "annual", label: "Annual" },
              { value: "quarterly", label: "Quarterly" },
            ]}
          />

          {view === "sankey" && periodType === "quarterly" ? (
  // ✅ Sankey + Quarterly: show Year + Quarter side-by-side (half + half)
  <div className="space-y-1">
    <div className="text-xs text-muted-foreground">Year / Quarter</div>
    <div className="flex gap-2">
      <select
        className="w-1/2 rounded-lg border px-3 py-2 text-sm bg-white"
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

      <select
        className="w-1/2 rounded-lg border px-3 py-2 text-sm bg-white"
        value={quarter}
        onChange={(e) => setQuarter(Number(e.target.value))}
        disabled={!quartersForYear.length}
      >
        {quartersForYear.map((q) => (
          <option key={q} value={q}>
            Q{q}
          </option>
        ))}
      </select>
    </div>
  </div>
    ) : (
    // ✅ Otherwise: keep your existing Year selector behavior (dashes for annual grid)
    <SelectBlock
        label="Year"
        value={periodType === "annual" ? "—" : year ?? ""}
        onChange={(v) => {
        if (v === "—") return;
        setYear(Number(v));
        }}
        disabled={yearDisabled || !years.length}
        options={yearOptions}
    />
    )}

          <SelectBlock
            label="Units"
            value={units}
            onChange={(v) => setUnits(v as UnitScale)}
            options={[
              { value: "thousands", label: "Thousands" },
              { value: "millions", label: "Millions" },
              { value: "billions", label: "Billions" },
            ]}
          />

          <SelectBlock
            label="View"
            value={view}
            onChange={(v) => setView(v as ViewType)}
            options={
                statementType === "income"
                ? [
                    { value: "grid", label: "Grid" },
                    { value: "sankey", label: "Sankey" },
                    ]
                : [
                    { value: "grid", label: "Grid" },
                    { value: "pie", label: "Pie" }, // coming next
                    ]
            }
            />
        </div>
      </div>

      {/* Grid block */}
      {/* Main block */}
{statementType === "balance_sheet" ? (
  view === "pie" ? (
    <div className="rounded-xl border bg-white p-4 shadow-sm text-sm text-muted-foreground">
      Balance Sheet pie coming next.
    </div>
  ) : (
    <BalanceSheetGrid
      ticker={ticker}
      periodType={periodType}
      fiscalYear={periodType === "quarterly" ? year : null}
      units={units}
    />
  )
) : statementType === "income" ? (
  view === "sankey" ? (
    <IncomeStatementSankey
      ticker={ticker}
      statementType={statementType}
      periodType={periodType}
      fiscalYear={year}
      quarter={periodType === "quarterly" ? quarter : undefined}
      units={units}
    />
  ) : (
    <IncomeStatementGrid
      ticker={ticker}
      statementType={statementType}
      periodType={periodType}
      fiscalYear={periodType === "quarterly" ? year : null}
      units={units}
    />
  )
) : (
  <div className="rounded-xl border bg-white p-4 shadow-sm text-sm text-muted-foreground">
    Cash Flow coming next.
  </div>
)}
    </div>
  );
}

function SelectBlock(props: {
  label: string;
  value: any;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{props.label}</div>
      <select
        className="w-full rounded-lg border px-3 py-2 text-sm bg-white"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        disabled={props.disabled}
      >
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
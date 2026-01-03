"use client";

import { useEffect, useMemo, useState } from "react";
import { incomeStatementRows, type IncomeRow, type UnitScale } from "@/lib/financials/incomeStatementRows";

type StatementType = "income" | "balance_sheet" | "cash_flow";
type PeriodType = "annual" | "quarterly";

type GridApiRow = {
  fiscalYear: number;
  quarter: number; // 0 annual, 1-4 quarterly
  fiscalDateEnding: string | null;
  reportedCurrency: string | null;
  payload: Record<string, any>;
};

type Props = {
  ticker: string;
  statementType: StatementType; // we’ll render income for now
  periodType: PeriodType;
  fiscalYear: number | null; // used only when quarterly
  units: UnitScale;
};

export default function IncomeStatementGrid({
  ticker,
  statementType,
  periodType,
  fiscalYear,
  units,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<GridApiRow[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    operatingExpensesGroup: false,
    otherIncomeGroup: false,
    netInterestIncomeGroup: false,
  });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (statementType !== "income") {
        setRows([]);
        return;
      }
      if (periodType === "quarterly" && fiscalYear == null) return;

      setLoading(true);
      const params = new URLSearchParams({
        ticker,
        statementType,
        periodType,
      });
      if (periodType === "quarterly" && fiscalYear != null) {
        params.set("fiscalYear", String(fiscalYear));
      }

      try {
        const res = await fetch(`/api/financials/grid?${params.toString()}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error ?? "Grid fetch failed");
        if (!cancelled) setRows(data.rows ?? []);
      } catch (e) {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [ticker, statementType, periodType, fiscalYear]);

  const columns = useMemo(() => {
    // API returns newest first already; keep that order for display
    return rows.map((r) => ({
      key: r.fiscalDateEnding ?? `${r.fiscalYear}${r.quarter ? `Q${r.quarter}` : ""}`,
      label: formatColumnLabel(r.fiscalDateEnding, periodType, r.fiscalYear, r.quarter),
    }));
  }, [rows, periodType]);

  const scaleDivisor = useMemo(() => {
    if (units === "thousands") return 1_000;
    if (units === "millions") return 1_000_000;
    return 1_000_000_000;
  }, [units]);

  if (statementType !== "income") {
    return (
      <div className="rounded-xl border bg-white p-4 shadow-sm text-sm text-muted-foreground">
        {statementType === "balance_sheet" ? "Balance Sheet grid coming next." : "Cash Flow grid coming next."}
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading grid…</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-muted-foreground">No data found for this selection.</div>
      ) : (
        <div className="relative overflow-x-auto rounded-lg border">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-20 bg-white">
              <tr>
                <th className="sticky left-0 z-30 bg-white px-3 py-2 text-left font-semibold border-b">
                  Breakdown
                </th>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className="px-3 py-2 text-right font-semibold border-b whitespace-nowrap"
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {renderRows({
                defs: incomeStatementRows,
                reports: rows,
                columns,
                expanded,
                setExpanded,
                scaleDivisor,
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function renderRows(args: {
  defs: IncomeRow[];
  reports: GridApiRow[];
  columns: { key: string; label: string }[];
  expanded: Record<string, boolean>;
  setExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  scaleDivisor: number;
}) {
  const { defs, reports, columns, expanded, setExpanded, scaleDivisor } = args;

const out: React.ReactNode[] = [];

  const walk = (row: IncomeRow) => {
    if (row.type === "group") {
      const isOpen = !!expanded[row.id];
      const hasChildren = row.children?.length > 0;

      // group header value: compute if provided, otherwise null
      const values = reports.map((r) => (row.compute ? row.compute(r.payload) : null));

      out.push(
        <tr key={row.id} className="hover:bg-slate-50">
          <td
            className="sticky left-0 z-10 bg-white px-3 py-2 border-b"
            style={{ paddingLeft: `${12 + (row.indent ?? 0) * 16}px` }}
          >
            <div className="flex items-center gap-2">
              {hasChildren ? (
                <button
                  type="button"
                  onClick={() =>
                    setExpanded((prev) => ({ ...prev, [row.id]: !prev[row.id] }))
                  }
                  className="text-xs rounded-md border px-1.5 py-0.5 text-slate-700 hover:bg-slate-100"
                  aria-label={isOpen ? "Collapse" : "Expand"}
                >
                  {isOpen ? "−" : "+"}
                </button>
              ) : (
                <span className="w-[22px]" />
              )}

              <span className={row.bold ? "font-semibold" : ""}>{row.label}</span>
            </div>
          </td>

          {columns.map((c, idx) => (
            <td key={c.key} className="px-3 py-2 text-right border-b tabular-nums">
            {formatNumber(values[idx], scaleDivisor, !!row.isExpense)}
            </td>
          ))}
        </tr>
      );

      if (hasChildren && isOpen) {
        row.children.forEach(walk);
      }

      return;
    }

    // value row
const values = reports.map((r) => {
  if (row.compute) return row.compute(r.payload);
  const keys = row.keys ?? [];
  return pickFirstNumber(r.payload, keys);
});

    out.push(
      <tr key={row.id} className="hover:bg-slate-50">
        <td
          className="sticky left-0 z-10 bg-white px-3 py-2 border-b"
          style={{ paddingLeft: `${12 + (row.indent ?? 0) * 16}px` }}
        >
          <span className={row.bold ? "font-semibold" : ""}>{row.label}</span>
        </td>

        {columns.map((c, idx) => (
          <td key={c.key} className="px-3 py-2 text-right border-b tabular-nums">
            {formatNumber(values[idx], scaleDivisor, !!row.isExpense)}
          </td>
        ))}
      </tr>
    );
  };

  defs.forEach(walk);
  return out;
}

function pickFirstNumber(payload: Record<string, any>, keys: string[]) {
  for (const k of keys) {
    const v = payload?.[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

function formatNumber(value: number | null, divisor: number, forceExpense: boolean) {
  if (value == null) return "—";

  const scaled = value / divisor;
  const isNegative = scaled < 0;

  // If forcing expense formatting, always show parentheses (using abs value)
  if (forceExpense) {
    const abs = Math.abs(scaled);
    const formatted = abs.toLocaleString(undefined, {
      maximumFractionDigits: abs >= 100 ? 0 : 1,
    });
    return `(${formatted})`;
  }

  // Otherwise respect the actual sign from AlphaVantage
  const abs = Math.abs(scaled);
  const formatted = abs.toLocaleString(undefined, {
    maximumFractionDigits: abs >= 100 ? 0 : 1,
  });

  if (isNegative) return `(${formatted})`;
  return formatted;
}

function formatColumnLabel(
  fiscalDateEnding: string | null,
  periodType: "annual" | "quarterly",
  fiscalYear: number,
  quarter: number
) {
  // Keep it simple: show date if we have it; otherwise fall back to FY/Q
  if (fiscalDateEnding) {
    // display like 6/30/2025
    const d = new Date(fiscalDateEnding);
    if (!isNaN(d.getTime())) {
      const m = d.getUTCMonth() + 1;
      const day = d.getUTCDate();
      const y = d.getUTCFullYear();
      return `${m}/${day}/${y}`;
    }
    return fiscalDateEnding;
  }

  if (periodType === "annual") return `FY ${fiscalYear}`;
  return `Q${quarter} ${fiscalYear}`;
}

"use client";

import { useEffect, useMemo, useState } from "react";
import type { UnitScale } from "@/lib/financials/incomeStatementRows";

type PeriodType = "annual" | "quarterly";

type GridApiRow = {
  fiscalYear: number;
  quarter: number; // 0 annual, 1..3 quarterly (Finnhub)
  fiscalDateEnding: string | null;
  reportedCurrency: string | null;
  payload: any; // { source: "finnhub", items: Array<{label,value}> }
};

type Props = {
  ticker: string;
  periodType: PeriodType;
  fiscalYear: number | null; // required for quarterly
  units: UnitScale;
};

function formatScaled(value: number, divisor: number) {
  const scaled = value / divisor;
  const abs = Math.abs(scaled);
  const formatted = abs.toLocaleString(undefined, {
    maximumFractionDigits: abs >= 100 ? 0 : 1,
  });
  return scaled < 0 ? `(${formatted})` : formatted;
}

export default function BalanceSheetGrid({
  ticker,
  periodType,
  fiscalYear,
  units,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<GridApiRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!ticker) return;
      if (periodType === "quarterly" && fiscalYear == null) return;

      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        ticker,
        statementType: "balance_sheet",
        periodType,
      });

      if (periodType === "quarterly" && fiscalYear != null) {
        params.set("fiscalYear", String(fiscalYear));
      }

      try {
        const res = await fetch(`/api/financials/grid?${params.toString()}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error ?? "Failed to load balance sheet grid");
        if (!cancelled) setRows(Array.isArray(data.rows) ? data.rows : []);
      } catch (e: any) {
        if (!cancelled) {
          setRows([]);
          setError(e?.message ?? "Failed to load balance sheet grid");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [ticker, periodType, fiscalYear]);

  const scaleDivisor = useMemo(() => {
    if (units === "thousands") return 1_000;
    if (units === "millions") return 1_000_000;
    return 1_000_000_000;
  }, [units]);

  const columns = useMemo(() => {
    // rows already come sorted from the API (annual: newest first; quarterly: Q3->Q1)
    return rows.map((r) => {
      const label =
        periodType === "annual"
          ? `FY ${r.fiscalYear}`
          : `Q${r.quarter} ${r.fiscalYear}`;

      const date = r.fiscalDateEnding ? ` • ${r.fiscalDateEnding}` : "";
      return { key: `${r.fiscalYear}-${r.quarter}`, label: `${label}${date}` };
    });
  }, [rows, periodType]);

  type BsItem = { id?: string; label: string; value: number | null };

const orderedItems = useMemo(() => {
  const firstItems = (rows[0]?.payload?.items ?? []) as BsItem[];

  // create a stable id if not present (fallback: label + index)
  return firstItems
    .map((it, idx) => ({
      id: (it.id ?? `${it.label}__${idx}`).toString(),
      label: (it.label ?? "").toString().trim(),
    }))
    .filter((it) => Boolean(it.label));
}, [rows]);

  const valueMaps = useMemo(() => {
  return rows.map((r) => {
    const items = (r?.payload?.items ?? []) as BsItem[];

    const map: Record<string, number | null> = {};
    items.forEach((it, idx) => {
      const id = (it.id ?? `${it.label}__${idx}`).toString();
      map[id] =
        typeof it.value === "number" && Number.isFinite(it.value) ? it.value : null;
    });
    return map;
  });
}, [rows]);

  if (loading) {
    return (
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="text-sm text-muted-foreground">Loading balance sheet…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="text-sm text-red-700">{error}</div>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="text-sm text-muted-foreground">No balance sheet data.</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold">Balance Sheet (As Reported)</div>
        <div className="text-xs text-muted-foreground">
          {periodType === "annual" ? "Annual" : `Quarterly • ${fiscalYear}`}
        </div>
      </div>

      <div className="overflow-auto">
        <table className="min-w-[760px] w-full border-collapse">
          <thead>
            <tr className="border-b">
              <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-700">
                Line Item
              </th>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className="px-3 py-2 text-right text-xs font-semibold text-slate-700"
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {orderedItems.map((rowItem) => (
            <tr key={rowItem.id} className="border-b last:border-b-0">
                <td className="sticky left-0 z-10 bg-white px-3 py-2 text-xs text-slate-800">
                {rowItem.label}
                </td>

                {valueMaps.map((map, idx) => {
                const v = map[rowItem.id];
                return (
                    <td
                    key={`${rowItem.id}-${idx}`}
                    className="px-3 py-2 text-right text-xs text-slate-800 tabular-nums"
                    >
                    {v == null ? "—" : formatScaled(v, scaleDivisor)}
                    </td>
                );
                })}
            </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2 text-[11px] text-muted-foreground">
        Source: Finnhub • Order preserved as reported
      </div>
    </div>
  );
}
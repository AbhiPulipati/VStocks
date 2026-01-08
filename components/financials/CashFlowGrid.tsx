"use client";

import { useEffect, useMemo, useState } from "react";
import type { UnitScale } from "@/lib/financials/incomeStatementRows";

type PeriodType = "annual" | "quarterly";

type GridApiRow = {
  fiscalYear: number;
  quarter: number;
  fiscalDateEnding: string | null;
  reportedCurrency: string | null;
  payload: any;
};

type GridApiResponse = {
  rows?: GridApiRow[];
  notice?: string;
  dropdownAvailable?: boolean;
  error?: string;
};

type Props = {
  ticker: string;
  periodType: PeriodType;
  fiscalYear: number | null; // required for quarterly
  units: UnitScale;
};

type CfItem = {
  concept: string;
  unit: string | null;
  label: string;
  value: number | null;
};

type SectionId = "op" | "inv" | "fin";

function formatScaled(value: number, divisor: number) {
  const scaled = value / divisor;
  const abs = Math.abs(scaled);
  const formatted = abs.toLocaleString(undefined, {
    maximumFractionDigits: abs >= 100 ? 0 : 1,
  });
  return scaled < 0 ? `(${formatted})` : formatted;
}

function formatMDY(dateStr: string | null | undefined) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.slice(0, 10).split("-");
  return `${m}/${d}/${y}`;
}

function normalizeLabel(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function findAnchorIndex(items: CfItem[], opts: { concepts?: string[]; labels?: string[] }) {
  const conceptSet = new Set((opts.concepts ?? []).map((c) => c.trim()));
  const labelSet = new Set((opts.labels ?? []).map((l) => normalizeLabel(l)));

  if (conceptSet.size) {
    const idx = items.findIndex((it) => conceptSet.has(it.concept));
    if (idx !== -1) return idx;
  }
  if (labelSet.size) {
    const idx = items.findIndex((it) => labelSet.has(normalizeLabel(it.label)));
    if (idx !== -1) return idx;
  }
  return -1;
}

export default function CashFlowGrid({ ticker, periodType, fiscalYear, units }: Props) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<GridApiRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dropdownAvailable, setDropdownAvailable] = useState(true);

  const [open, setOpen] = useState<Record<SectionId, boolean>>({
    op: false,
    inv: false,
    fin: false,
  });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!ticker) return;

      if (periodType === "quarterly" && fiscalYear == null) {
        setRows([]);
        setNotice(null);
        setDropdownAvailable(true);
        return;
      }

      setLoading(true);
      setError(null);
      setNotice(null);
      setDropdownAvailable(true);

      const params = new URLSearchParams({
        ticker,
        statementType: "cash_flow",
        periodType,
      });

      if (periodType === "quarterly" && fiscalYear != null) {
        params.set("fiscalYear", String(fiscalYear));
      }

      try {
        const res = await fetch(`/api/financials/grid?${params.toString()}`);
        const data = (await res.json().catch(() => ({}))) as GridApiResponse;

        if (!res.ok) throw new Error(data?.error ?? "Failed to load cash flow grid");

        if (!cancelled) {
          setRows(Array.isArray(data.rows) ? data.rows : []);
          setNotice(typeof data.notice === "string" ? data.notice : null);
          setDropdownAvailable(data.dropdownAvailable !== false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setRows([]);
          setNotice(null);
          setDropdownAvailable(true);
          setError(e?.message ?? "Failed to load cash flow grid");
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
    return rows.map((r) => {
      const key = `${r.fiscalYear}-${r.quarter}`;
      return { key, label: formatMDY(r.fiscalDateEnding) };
    });
  }, [rows]);

  const periods = useMemo(() => {
    return rows.map((r) => {
      const items = (r?.payload?.items ?? []) as CfItem[];
      return { key: `${r.fiscalYear}-${r.quarter}`, row: r, items };
    });
  }, [rows]);

  const derivedAndBuckets = useMemo(() => {
    const OP_TOTAL = {
      concepts: [
        "us-gaap_NetCashProvidedByUsedInOperatingActivities",
        "us-gaap_NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
      ],
      labels: ["Net cash provided by (used in) operating activities"],
    };

    const INV_TOTAL = {
      concepts: [
        "us-gaap_NetCashProvidedByUsedInInvestingActivities",
        "us-gaap_NetCashProvidedByUsedInInvestingActivitiesContinuingOperations",
      ],
      labels: ["Net cash provided by (used in) investing activities"],
    };

    const FIN_TOTAL = {
      concepts: [
        "us-gaap_NetCashProvidedByUsedInFinancingActivities",
        "us-gaap_NetCashProvidedByUsedInFinancingActivitiesContinuingOperations",
      ],
      labels: ["Net cash provided by (used in) financing activities"],
    };

    const NET_INCOME = {
      concepts: [
        "us-gaap_NetIncomeLoss",
        "us-gaap_ProfitLoss",
        "us-gaap_NetIncomeLossAvailableToCommonStockholdersBasic",
      ],
      labels: ["Net income", "Net (loss) income", "Profit (loss)"],
    };

    const NET_CHANGE_CASH = {
      concepts: [
        "us-gaap_CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect",
        "us-gaap_CashAndCashEquivalentsPeriodIncreaseDecrease",
        "us-gaap_CashPeriodIncreaseDecrease",
        "us-gaap_IncreaseDecreaseInCashAndCashEquivalents",
      ],
      labels: [
        "Net increase (decrease) in cash",
        "Net change in cash",
        "Cash, cash equivalents, restricted cash and restricted cash equivalents, period increase (decrease)",
      ],
    };

    type BucketedPeriod = {
      totals: Record<SectionId, number | null>;
      netIncome: number | null;
      netChangeInCash: number | null;
      valueByRowKey: Record<string, number | null>;
      labelByRowKey: Record<string, string>;
    };

    const bucketed: BucketedPeriod[] = periods.map(({ items }) => {

      const idxOp = findAnchorIndex(items, OP_TOTAL);
const idxInv = findAnchorIndex(items, INV_TOTAL);
const idxFin = findAnchorIndex(items, FIN_TOTAL);

const slice = (a: number, b: number) => {
  const start = Math.max(0, a);
  const end = Math.max(0, b);
  if (end <= start) return [];
  return items.slice(start, end);
};

// ✅ Determine the actual order of sections by where each TOTAL appears
const anchors = ([
  { id: "op" as const, idx: idxOp },
  { id: "inv" as const, idx: idxInv },
  { id: "fin" as const, idx: idxFin },
] as const)
  .filter((a) => a.idx !== -1)
  .sort((a, b) => a.idx - b.idx);

// Default empty
let opItems: CfItem[] = [];
let invItems: CfItem[] = [];
let finItems: CfItem[] = [];

// ✅ For each section, items are everything since the previous total (or start) up to this total
for (let i = 0; i < anchors.length; i++) {
  const cur = anchors[i];
  const start = i === 0 ? 0 : anchors[i - 1].idx + 1;
  const end = cur.idx;

  const sectionItems = slice(start, end);

  if (cur.id === "op") opItems = sectionItems;
  if (cur.id === "inv") invItems = sectionItems;
  if (cur.id === "fin") finItems = sectionItems;
}

      const getValue = (opts: { concepts?: string[]; labels?: string[] }) => {
        if (opts.concepts?.length) {
          for (const c of opts.concepts) {
            const found = items.find((it) => it.concept === c);
            if (found) return found.value ?? null;
          }
        }
        if (opts.labels?.length) {
          const labelSet = new Set(opts.labels.map((l) => normalizeLabel(l)));
          const found = items.find((it) => labelSet.has(normalizeLabel(it.label)));
          if (found) return found.value ?? null;
        }
        return null;
      };

      const totalOp = getValue(OP_TOTAL);
      const totalInv = getValue(INV_TOTAL);
      const totalFin = getValue(FIN_TOTAL);

      const netIncome = getValue(NET_INCOME);
      const netChangeInCash = getValue(NET_CHANGE_CASH);

      const makeSectionMaps = (sectionId: SectionId, sectionItems: CfItem[]) => {
        const counts: Record<string, number> = {};
        const valueByRowKey: Record<string, number | null> = {};
        const labelByRowKey: Record<string, string> = {};

        for (const it of sectionItems) {
          const n = (counts[it.concept] ?? 0) + 1;
          counts[it.concept] = n;

          const key = `${sectionId}::${it.concept}::${n}`;
          valueByRowKey[key] = it.value ?? null;
          labelByRowKey[key] = it.label;
        }

        return { valueByRowKey, labelByRowKey };
      };

      const opMaps = makeSectionMaps("op", opItems);
      const invMaps = makeSectionMaps("inv", invItems);
      const finMaps = makeSectionMaps("fin", finItems);

      return {
        totals: { op: totalOp, inv: totalInv, fin: totalFin },
        netIncome,
        netChangeInCash,
        valueByRowKey: {
          ...opMaps.valueByRowKey,
          ...invMaps.valueByRowKey,
          ...finMaps.valueByRowKey,
        },
        labelByRowKey: {
          ...opMaps.labelByRowKey,
          ...invMaps.labelByRowKey,
          ...finMaps.labelByRowKey,
        },
      };
    });

    const unionOrderForSection = (sectionPrefix: SectionId) => {
      const seen = new Set<string>();
      const ordered: string[] = [];

      for (const p of bucketed) {
        const keys = Object.keys(p.valueByRowKey).filter((k) =>
          k.startsWith(`${sectionPrefix}::`)
        );

        keys.sort((a, b) => {
          const na = Number(a.split("::").pop() ?? "0");
          const nb = Number(b.split("::").pop() ?? "0");
          return na - nb;
        });

        for (const k of keys) {
          if (seen.has(k)) continue;
          seen.add(k);
          ordered.push(k);
        }
      }
        const hasAnyNonZero = (rowKey: string) => {
        for (const p of bucketed) {
            const v = p.valueByRowKey[rowKey];
            if (v == null) continue;   // "—"
            if (v !== 0) return true;  // keep if any non-zero
        }
        return false; // all 0 or all —
        };
        return ordered.filter(hasAnyNonZero);
    };

    const unions = {
      op: unionOrderForSection("op"),
      inv: unionOrderForSection("inv"),
      fin: unionOrderForSection("fin"),
    };

    const latestLabelFor = (rowKey: string) => {
      for (const p of bucketed) {
        const lab = p.labelByRowKey[rowKey];
        if (lab) return lab;
      }
      return rowKey;
    };

    return { bucketed, unions, latestLabelFor };
  }, [periods]);

  const toggle = (k: SectionId) => setOpen((prev) => ({ ...prev, [k]: !prev[k] }));

  const ExpandBtn = ({
    isOpen,
    disabled,
    onClick,
  }: {
    isOpen: boolean;
    disabled?: boolean;
    onClick: () => void;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "mr-2 inline-flex h-6 w-6 items-center justify-center rounded-md border text-xs",
        disabled ? "cursor-not-allowed opacity-40" : "hover:bg-slate-50 active:bg-slate-100",
      ].join(" ")}
      aria-label={isOpen ? "Collapse" : "Expand"}
    >
      {isOpen ? "−" : "+"}
    </button>
  );

  const renderSectionRows = (sectionKey: SectionId, indentPx = 14) => {
    const rowKeys = derivedAndBuckets.unions[sectionKey];

    return rowKeys.map((rk) => (
      <tr key={rk} className="border-b last:border-b-0">
        <td
          className="sticky left-0 z-10 bg-white px-3 py-2 text-sm text-slate-700"
          style={{ paddingLeft: indentPx }}
        >
          {derivedAndBuckets.latestLabelFor(rk)}
        </td>
        {derivedAndBuckets.bucketed.map((p, idx) => {
          const v = p.valueByRowKey[rk] ?? null;
          return (
            <td
              key={`${rk}-${idx}`}
              className="px-3 py-2 text-right text-sm text-slate-800 tabular-nums"
            >
              {v == null ? "—" : formatScaled(v, scaleDivisor)}
            </td>
          );
        })}
      </tr>
    ));
  };

  if (loading) {
    return (
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="text-sm text-muted-foreground">Loading cash flow…</div>
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
        <div className="text-sm text-muted-foreground">No cash flow data.</div>
      </div>
    );
  }

  const { bucketed } = derivedAndBuckets;

  const TotalRow = ({
    id,
    label,
    disabled,
  }: {
    id: SectionId;
    label: string;
    disabled?: boolean;
  }) => {
    const isOpen = open[id];
    const canOpen = !disabled && dropdownAvailable;

    return (
      <>
        <tr className="border-b bg-slate-50">
          <td className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900">
            <div className="flex items-center">
              <ExpandBtn isOpen={isOpen} disabled={!canOpen} onClick={() => toggle(id)} />
              {label}
            </div>
          </td>
          {bucketed.map((p, idx) => {
            const v = p.totals[id];
            return (
              <td
                key={`${id}-t-${idx}`}
                className="px-3 py-2 text-right text-sm font-medium text-slate-900 tabular-nums"
              >
                {v == null ? "—" : formatScaled(v, scaleDivisor)}
              </td>
            );
          })}
        </tr>

        {isOpen && canOpen ? renderSectionRows(id, 28) : null}
      </>
    );
  };

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">

      <div className="overflow-x-auto">
        <table className="min-w-[760px] w-full border-collapse">
          <thead>
            <tr className="border-b">
              <th className="sticky left-0 z-20 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-600">
                Cash Flow
              </th>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className="px-3 py-2 text-right text-xs font-semibold text-slate-600"
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {/* Net Income (top) */}
            <tr className="border-b bg-slate-50">
              <td className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900">
                Net Income
              </td>
              {bucketed.map((p, idx) => (
                <td
                  key={`ni-${idx}`}
                  className="px-3 py-2 text-right text-sm font-medium text-slate-900 tabular-nums"
                >
                  {p.netIncome == null ? "—" : formatScaled(p.netIncome, scaleDivisor)}
                </td>
              ))}
            </tr>

            <TotalRow id="op" label="Net cash from Operating Activities" />
            <TotalRow id="inv" label="Net cash from Investing Activities" />
            <TotalRow id="fin" label="Net cash from Financing Activities" />

            {/* Net Change in Cash (bottom) */}
            <tr className="border-b bg-slate-50">
              <td className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900">
                Net Change in Cash
              </td>
              {bucketed.map((p, idx) => (
                <td
                  key={`ncc-${idx}`}
                  className="px-3 py-2 text-right text-sm font-medium text-slate-900 tabular-nums"
                >
                  {p.netChangeInCash == null
                    ? "—"
                    : formatScaled(p.netChangeInCash, scaleDivisor)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
            {(() => {
        const src = rows?.[0]?.payload?.source;
        const sourceLabel =
          typeof src === "string" && src.toLowerCase().includes("alphavantage")
            ? "AlphaVantage"
            : "Finnhub";

        return (
          <div className="mt-2 text-xs text-muted-foreground">
            Source: {sourceLabel}
            {!dropdownAvailable
              ? " (dropdown breakdown unavailable)"
              : ""}
          </div>
        );
      })()}
    </div>
  );
}
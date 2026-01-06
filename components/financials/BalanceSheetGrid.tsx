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

type BsItem = {
  concept: string;
  unit: string | null;
  label: string;
  value: number | null;
};

type SectionId =
  | "assets_total"
  | "assets_current"
  | "assets_noncurrent"
  | "liab_total"
  | "liab_current"
  | "liab_noncurrent"
  | "equity_total"
  | "liab_eq_total";

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
  // Works for "2024-12-31" and ISO strings
  const [y, m, d] = dateStr.slice(0, 10).split("-");
  return `${m}/${d}/${y}`;
}

function normalizeLabel(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function findAnchorIndex(
  items: BsItem[],
  opts: { concepts?: string[]; labels?: string[] }
) {
  const conceptSet = new Set((opts.concepts ?? []).map((c) => c.trim()));
  const labelSet = new Set((opts.labels ?? []).map((l) => normalizeLabel(l)));

  // prefer concept match
  if (conceptSet.size) {
    const idx = items.findIndex((it) => conceptSet.has(it.concept));
    if (idx !== -1) return idx;
  }

  // fallback: label match
  if (labelSet.size) {
    const idx = items.findIndex((it) => labelSet.has(normalizeLabel(it.label)));
    if (idx !== -1) return idx;
  }

  return -1;
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
  const [notice, setNotice] = useState<string | null>(null);
const [dropdownAvailable, setDropdownAvailable] = useState(true);

  // dropdown state per totals row
  const [open, setOpen] = useState<Record<string, boolean>>({
    assets_current: false,
    assets_noncurrent: false,
    liab_current: false,
    liab_noncurrent: false,
    equity_total: false,
  });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!ticker) return;
      if (periodType === "quarterly" && fiscalYear == null) {
        // Clear previous (annual) rows so the UI doesn't look like it's still annual
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
        statementType: "balance_sheet",
        periodType,
      });

      if (periodType === "quarterly" && fiscalYear != null) {
        params.set("fiscalYear", String(fiscalYear));
      }

      try {
        const res = await fetch(`/api/financials/grid?${params.toString()}`);
        const data = (await res.json().catch(() => ({}))) as GridApiResponse;

        if (!res.ok) throw new Error(data?.error ?? "Failed to load balance sheet grid");

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
  return rows.map((r) => {
    const key = `${r.fiscalYear}-${r.quarter}`;
    return { key, label: formatMDY(r.fiscalDateEnding) };
  });
}, [rows]);

  const periods = useMemo(() => {
  return rows.map((r) => {
    const items = (r?.payload?.items ?? []) as BsItem[];
    const totals = (r?.payload?.totals ?? null) as Record<SectionId, number | null> | null;
    return { key: `${r.fiscalYear}-${r.quarter}`, row: r, items, totals };
  });
}, [rows]);

  const derivedAndBuckets = useMemo(() => {
    // Anchor definitions (concept preferred, label fallback)
    const A_TOTAL_CURRENT_ASSETS = {
      concepts: ["us-gaap_AssetsCurrent"],
      labels: ["Total current assets"],
    };
    const A_TOTAL_ASSETS = {
      concepts: ["us-gaap_Assets"],
      labels: ["Total assets"],
    };

    const L_TOTAL_CURRENT_LIAB = {
      concepts: ["us-gaap_LiabilitiesCurrent"],
      labels: ["Total current liabilities"],
    };
    const L_TOTAL_LIAB = {
      concepts: ["us-gaap_Liabilities"],
      labels: ["Total liabilities"],
    };

    const E_TOTAL_STOCKHOLDERS = {
      concepts: ["us-gaap_StockholdersEquity"],
      labels: ["Total stockholders' equity", "Total stockholders’ equity"],
    };
    const E_TOTAL_EQUITY = {
      concepts: ["us-gaap_StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
      labels: ["Total equity"],
    };

    const LE_TOTAL = {
      concepts: ["us-gaap_LiabilitiesAndStockholdersEquity"],
      labels: ["Total liabilities and equity"],
    };

    type BucketedPeriod = {
      // totals (explicit or derived)
      totals: Record<SectionId, number | null>;
      // section line items (union needs these)
      sections: Record<
        Exclude<SectionId, "assets_total" | "liab_total" | "equity_total" | "liab_eq_total">,
        BsItem[]
      >;
      // maps for value lookup by rowKey
      valueByRowKey: Record<string, number | null>;
      // latest labels by rowKey
      labelByRowKey: Record<string, string>;
    };

    const bucketed: BucketedPeriod[] = periods.map(({ items, totals }) => {
        // ✅ AlphaVantage fallback: totals-only, no dropdown sections
        if (totals) {
        return {
            totals,
            sections: {
            assets_current: [],
            assets_noncurrent: [],
            liab_current: [],
            liab_noncurrent: [],
            },
            valueByRowKey: {},
            labelByRowKey: {},
        } satisfies BucketedPeriod;
        }

      const idxAcur = findAnchorIndex(items, A_TOTAL_CURRENT_ASSETS);
      const idxAtot = findAnchorIndex(items, A_TOTAL_ASSETS);

      const idxLcur = findAnchorIndex(items, L_TOTAL_CURRENT_LIAB);
      const idxLtot = findAnchorIndex(items, L_TOTAL_LIAB);

      const idxEstk = findAnchorIndex(items, E_TOTAL_STOCKHOLDERS);
      const idxEeq = findAnchorIndex(items, E_TOTAL_EQUITY);

      // choose “equity total” anchor: prefer stockholders’ equity, else total equity, else none
      const idxEquityTotal =
        idxEstk !== -1 ? idxEstk : (idxEeq !== -1 ? idxEeq : -1);

      const idxLE = findAnchorIndex(items, LE_TOTAL);

      // helper: safe slice
      const slice = (a: number, b: number) => {
        const start = Math.max(0, a);
        const end = Math.max(0, b);
        if (end <= start) return [];
        return items.slice(start, end);
      };

      // Rule B buckets by position
      const currentAssets = idxAcur !== -1 ? slice(0, idxAcur) : [];
      const nonCurrentAssets =
        idxAcur !== -1 && idxAtot !== -1 ? slice(idxAcur + 1, idxAtot) : [];

      // liabilities start after total assets if present, else after end of assets block
      const liabStart = idxAtot !== -1 ? idxAtot + 1 : items.length;

      const currentLiab =
        idxLcur !== -1 ? slice(liabStart, idxLcur) : [];

      const nonCurrentLiab =
        idxLcur !== -1 && idxLtot !== -1 ? slice(idxLcur + 1, idxLtot) : [];

      const equityItems =
        idxLtot !== -1
          ? slice(idxLtot + 1, idxEquityTotal !== -1 ? idxEquityTotal : (idxLE !== -1 ? idxLE : items.length))
          : [];

      // grab explicit totals if present
      const getConceptValue = (concepts: string[]) => {
        for (const c of concepts) {
          const found = items.find((it) => it.concept === c);
          if (found) return found.value ?? null;
        }
        return null;
      };

      const totalAssets = getConceptValue(A_TOTAL_ASSETS.concepts!);
      const totalCurrentAssets = getConceptValue(A_TOTAL_CURRENT_ASSETS.concepts!);

      const totalLiab = getConceptValue(L_TOTAL_LIAB.concepts!);
      const totalCurrentLiab = getConceptValue(L_TOTAL_CURRENT_LIAB.concepts!);

      const totalStockholders = getConceptValue(E_TOTAL_STOCKHOLDERS.concepts!);
      const totalEquityExplicit = getConceptValue(E_TOTAL_EQUITY.concepts!);

      const totalLiabEq = getConceptValue(LE_TOTAL.concepts!);

      // Derivations per your rule:
      // non-current assets/liab derived if missing
      const totalNonCurrentAssets =
        idxAcur !== -1 && idxAtot !== -1 && totalAssets != null && totalCurrentAssets != null
          ? totalAssets - totalCurrentAssets
          : null;

      const totalNonCurrentLiab =
        idxLcur !== -1 && idxLtot !== -1 && totalLiab != null && totalCurrentLiab != null
          ? totalLiab - totalCurrentLiab
          : null;

      // equity total: prefer stockholders if present else explicit total equity else derived
      const totalEquity =
        totalStockholders != null
          ? totalStockholders
          : (totalEquityExplicit != null ? totalEquityExplicit : (totalAssets != null && totalLiab != null ? totalAssets - totalLiab : null));

      // total liabilities and equity: prefer explicit else derived
      const totalLiabilitiesAndEquity =
        totalLiabEq != null
          ? totalLiabEq
          : (totalAssets != null ? totalAssets : (totalLiab != null && totalEquity != null ? totalLiab + totalEquity : null));

      // Build per-section rowKey maps
      // rowKey includes section + concept (+ occurrence index if concept repeats within that section)
      const makeSectionMaps = (sectionId: string, sectionItems: BsItem[]) => {
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

      const aCurMaps = makeSectionMaps("assets_current", currentAssets);
      const aNonMaps = makeSectionMaps("assets_noncurrent", nonCurrentAssets);
      const lCurMaps = makeSectionMaps("liab_current", currentLiab);
      const lNonMaps = makeSectionMaps("liab_noncurrent", nonCurrentLiab);
      const eMaps = makeSectionMaps("equity_total", equityItems);

      return {
        totals: {
          assets_total: totalAssets,
          assets_current: totalCurrentAssets,
          assets_noncurrent: totalNonCurrentAssets,
          liab_total: totalLiab,
          liab_current: totalCurrentLiab,
          liab_noncurrent: totalNonCurrentLiab,
          equity_total: totalEquity,
          liab_eq_total: totalLiabilitiesAndEquity,
        },
        sections: {
          assets_current: currentAssets,
          assets_noncurrent: nonCurrentAssets,
          liab_current: currentLiab,
          liab_noncurrent: nonCurrentLiab,
        },
        valueByRowKey: {
          ...aCurMaps.valueByRowKey,
          ...aNonMaps.valueByRowKey,
          ...lCurMaps.valueByRowKey,
          ...lNonMaps.valueByRowKey,
          ...eMaps.valueByRowKey,
        },
        labelByRowKey: {
          ...aCurMaps.labelByRowKey,
          ...aNonMaps.labelByRowKey,
          ...lCurMaps.labelByRowKey,
          ...lNonMaps.labelByRowKey,
          ...eMaps.labelByRowKey,
        },
      } satisfies BucketedPeriod;
    });

    // Build union row lists (ordered) per section:
    // Start from most recent period’s section order, then append older-only rows.
    const unionOrderForSection = (sectionPrefix: string) => {
      const seen = new Set<string>();
      const ordered: string[] = [];

      for (const p of bucketed) {
        // take keys that belong to this sectionPrefix
        const keys = Object.keys(p.valueByRowKey)
          .filter((k) => k.startsWith(`${sectionPrefix}::`));

        // preserve the order by reconstructing from the section items, not key sort:
        // BUT we encoded occurrence index while scanning in order, so sorting by that suffix is safe.
        keys.sort((a, b) => {
          const na = Number(a.split("::").pop() ?? "0");
          const nb = Number(b.split("::").pop() ?? "0");
          // keep stable between concepts by keeping original insertion order across scan
          // (this sort only ensures 1,2,3 for duplicates of same concept; cross-concept order is already by scan)
          return na - nb;
        });

        for (const k of keys) {
          if (seen.has(k)) continue;
          seen.add(k);
          ordered.push(k);
        }
      }

      return ordered;
    };

    const unions = {
      assets_current: unionOrderForSection("assets_current"),
      assets_noncurrent: unionOrderForSection("assets_noncurrent"),
      liab_current: unionOrderForSection("liab_current"),
      liab_noncurrent: unionOrderForSection("liab_noncurrent"),
      equity_total: unionOrderForSection("equity_total"),
    };

    // Latest label for each rowKey: take from first (most recent) period that has it
    const latestLabelFor = (rowKey: string) => {
      for (const p of bucketed) {
        const lab = p.labelByRowKey[rowKey];
        if (lab) return lab;
      }
      // fallback
      return rowKey;
    };

    return { bucketed, unions, latestLabelFor };
  }, [periods]);

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

  const { bucketed, unions, latestLabelFor } = derivedAndBuckets;

  const toggle = (k: keyof typeof open) => {
    setOpen((prev) => ({ ...prev, [k]: !prev[k] }));
  };

  const renderValueCells = (getValue: (pIdx: number) => number | null) => {
    return bucketed.map((p, idx) => {
      const v = getValue(idx);
      return (
        <td
          key={`v-${idx}`}
          className="px-3 py-2 text-right text-sm text-slate-800 tabular-nums"
        >
          {v == null ? "—" : formatScaled(v, scaleDivisor)}
        </td>
      );
    });
  };

  const renderSectionRows = (sectionKey: keyof typeof unions, indentPx = 14) => {
    const rowKeys = unions[sectionKey];

    return rowKeys.map((rk) => (
      <tr key={rk} className="border-b last:border-b-0">
        <td
          className="sticky left-0 z-10 bg-white px-3 py-2 text-sm text-slate-700"
          style={{ paddingLeft: indentPx }}
        >
          {latestLabelFor(rk)}
        </td>
        {bucketed.map((p, idx) => {
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

const ExpandBtn = ({
  isOpen,
  onClick,
  disabled,
}: {
  isOpen: boolean;
  onClick: () => void;
  disabled?: boolean;
}) => (
  <button
    onClick={disabled ? undefined : onClick}
    disabled={disabled}
    className={`mr-2 inline-flex h-6 w-6 items-center justify-center rounded-md border text-sm font-semibold ${
      disabled ? "cursor-not-allowed opacity-40" : "hover:bg-slate-50"
    }`}
    aria-label={isOpen ? "Collapse" : "Expand"}
    type="button"
  >
    {isOpen ? "−" : "+"}
  </button>
);

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold">Balance Sheet (As Reported)</div>
        <div className="text-sm text-muted-foreground">
          {periodType === "annual"
            ? "Annual (last 5 years)"
            : fiscalYear != null
                ? `Quarterly • FY ${fiscalYear} (Q1–Q3)`
                : "Quarterly • Select a fiscal year"}
        </div>
      </div>
      <div className="overflow-auto">
        <table className="min-w-[760px] w-full border-collapse">
          <thead>
            <tr className="border-b">
              <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-700">
                Line Item
              </th>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className="px-3 py-2 text-right text-sm font-semibold text-slate-700"
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {/* ===== ASSETS ===== */}
            <tr className="border-b bg-slate-50">
              <td className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-900">
                Total assets
              </td>
              {renderValueCells((i) => bucketed[i].totals.assets_total)}
            </tr>

            <tr className="border-b">
              <td className="sticky left-0 z-10 bg-white px-3 py-2 text-sm font-semibold text-slate-900">
                <ExpandBtn
                    isOpen={open.assets_current}
                    onClick={() => toggle("assets_current")}
                    disabled={!dropdownAvailable}
                    />
                Total current assets
              </td>
              {renderValueCells((i) => bucketed[i].totals.assets_current)}
            </tr>
            {open.assets_current && renderSectionRows("assets_current", 28)}

            <tr className="border-b">
              <td className="sticky left-0 z-10 bg-white px-3 py-2 text-sm font-semibold text-slate-900">
                <ExpandBtn
                    isOpen={open.assets_noncurrent}
                    onClick={() => toggle("assets_noncurrent")}
                    disabled={!dropdownAvailable}
                    />
                Total non-current assets
              </td>
              {renderValueCells((i) => bucketed[i].totals.assets_noncurrent)}
            </tr>
            {open.assets_noncurrent && renderSectionRows("assets_noncurrent", 28)}

            {/* ===== LIABILITIES ===== */}
            <tr className="border-b bg-slate-50">
              <td className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-900">
                Total liabilities
              </td>
              {renderValueCells((i) => bucketed[i].totals.liab_total)}
            </tr>

            <tr className="border-b">
              <td className="sticky left-0 z-10 bg-white px-3 py-2 text-sm font-semibold text-slate-900">
                <ExpandBtn
                  isOpen={open.liab_current}
                  onClick={() => toggle("liab_current")}
                  disabled={!dropdownAvailable}
                />
                Total current liabilities
              </td>
              {renderValueCells((i) => bucketed[i].totals.liab_current)}
            </tr>
            {open.liab_current && renderSectionRows("liab_current", 28)}

            <tr className="border-b">
              <td className="sticky left-0 z-10 bg-white px-3 py-2 text-sm font-semibold text-slate-900">
                <ExpandBtn
                  isOpen={open.liab_noncurrent}
                  onClick={() => toggle("liab_noncurrent")}
                  disabled={!dropdownAvailable}
                />
                Total non-current liabilities
              </td>
              {renderValueCells((i) => bucketed[i].totals.liab_noncurrent)}
            </tr>
            {open.liab_noncurrent && renderSectionRows("liab_noncurrent", 28)}

            {/* ===== EQUITY ===== */}
            <tr className="border-b bg-slate-50">
              <td className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-900">
                <ExpandBtn
                  isOpen={open.equity_total}
                  onClick={() => toggle("equity_total")}
                  disabled={!dropdownAvailable}
                />
                Total equity
              </td>
              {renderValueCells((i) => bucketed[i].totals.equity_total)}
            </tr>
            {open.equity_total && renderSectionRows("equity_total", 28)}

            {/* ===== LIABILITIES + EQUITY ===== */}
            <tr className="border-b bg-slate-50">
              <td className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-900">
                Total liabilities and equity
              </td>
              {renderValueCells((i) => bucketed[i].totals.liab_eq_total)}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-2 text-[11px] text-muted-foreground">
  {dropdownAvailable
    ? "Source: Finnhub"
    : "Source: AlphaVantage · Dropdown breakdown unavailable for this company"}
</div>
    </div>
  );
}
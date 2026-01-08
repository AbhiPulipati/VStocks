"use client";

import React, { useEffect, useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import type { UnitScale } from "@/lib/financials/incomeStatementRows";

type PeriodType = "annual" | "quarterly";
type StatementType = "income" | "balance_sheet" | "cash_flow";

type GridApiRow = {
  fiscalYear: number;
  quarter: number;
  fiscalDateEnding: string | null;
  reportedCurrency: string | null;
  payload: any;
};

type GridApiResponse = {
  rows?: GridApiRow[];
  dropdownAvailable?: boolean;
  notice?: string;
  error?: string;
};

type Props = {
  ticker: string;
  // keep in sync with financials tab controls, but this chart can show BOTH
  periodType: PeriodType;
  fiscalYear: number | null; // required for quarterly endpoint
  units: UnitScale;
};

type MetricUnit = "money" | "percent" | "ratio";
type Mode = "value" | "growth";

type MetricDef = {
  id: string;
  label: string;
  group: StatementType; // used only for organizing dropdown
  unit: MetricUnit;
  get: (row: GridApiRow) => number | null;
};

type PeriodKeyParts = { fiscalYear: number; quarter: number; fiscalDateEnding?: string | null };

function periodKey(p: PeriodKeyParts) {
  // annual rows usually have quarter = 0
  return p.quarter && p.quarter > 0 ? `${p.fiscalYear}-Q${p.quarter}` : `FY${p.fiscalYear}`;
}

function periodLabel(p: PeriodKeyParts) {
  return p.quarter && p.quarter > 0 ? `Q${p.quarter} ${p.fiscalYear}` : `${p.fiscalYear}`;
}

function periodSortValue(p: PeriodKeyParts) {
  // sorts annual as Q4 for that year so it sits at the end of the year
  const q = p.quarter && p.quarter > 0 ? p.quarter : 4;
  return p.fiscalYear * 10 + q;
}

function formatMDY(dateStr: string | null | undefined) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.slice(0, 10).split("-");
  return `${m}/${d}/${y}`;
}

function normalizeLabel(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function pickFromItems(
  items: { concept: string; label: string; value: number | null }[],
  opts: { concepts?: string[]; labels?: string[] }
) {
  if (opts.concepts?.length) {
    for (const c of opts.concepts) {
      const found = items.find((it) => it.concept === c);
      if (found) return found.value ?? null;
    }
  }
  if (opts.labels?.length) {
    const set = new Set(opts.labels.map((l) => normalizeLabel(l)));
    const found = items.find((it) => set.has(normalizeLabel(it.label)));
    if (found) return found.value ?? null;
  }
  return null;
}

function scaleDivisor(units: UnitScale) {
  if (units === "thousands") return 1_000;
  if (units === "millions") return 1_000_000;
  return 1_000_000_000;
}

function formatScaledNumber(v: number, divisor: number) {
  const scaled = v / divisor;
  const abs = Math.abs(scaled);
  const formatted = abs.toLocaleString(undefined, {
    maximumFractionDigits: abs >= 100 ? 0 : 1,
  });
  return scaled < 0 ? `(${formatted})` : formatted;
}

function formatPercent(v: number) {
  const pct = v * 100;
  const abs = Math.abs(pct);
  const formatted = abs.toLocaleString(undefined, { maximumFractionDigits: abs >= 100 ? 0 : 1 });
  return pct < 0 ? `(${formatted}%)` : `${formatted}%`;
}

function niceGroupName(g: StatementType) {
  if (g === "income") return "Income Statement";
  if (g === "balance_sheet") return "Balance Sheet";
  return "Cash Flow";
}

function statementHeaderClasses(active: boolean) {
  return [
    "flex items-center justify-between rounded-md px-3 py-2 text-sm",
    active ? "bg-slate-900 text-white" : "hover:bg-slate-50 text-slate-800",
  ].join(" ");
}

/**
 * Unified metric registry:
 * - Income uses AV payload fields
 * - Balance/cashflow use Finnhub items, and tolerates AV totals-only via payload.totals (if present)
 *
 * You can expand this list later without changing the UI.
 */
function buildMetrics(): MetricDef[] {
  const income: MetricDef[] = [
    {
      id: "revenue",
      label: "Revenue",
      group: "income",
      unit: "money",
      get: (r) => (typeof r.payload?.totalRevenue === "number" ? r.payload.totalRevenue : null),
    },
    {
      id: "grossProfit",
      label: "Gross Profit",
      group: "income",
      unit: "money",
      get: (r) => (typeof r.payload?.grossProfit === "number" ? r.payload.grossProfit : null),
    },
    {
      id: "operatingIncome",
      label: "Operating Income",
      group: "income",
      unit: "money",
      get: (r) => (typeof r.payload?.operatingIncome === "number" ? r.payload.operatingIncome : null),
    },
    {
      id: "netIncome",
      label: "Net Income",
      group: "income",
      unit: "money",
      get: (r) => (typeof r.payload?.netIncome === "number" ? r.payload.netIncome : null),
    },
    {
      id: "ebitda",
      label: "EBITDA",
      group: "income",
      unit: "money",
      get: (r) => (typeof r.payload?.ebitda === "number" ? r.payload.ebitda : null),
    },
    {
      id: "grossMargin",
      label: "Gross Margin",
      group: "income",
      unit: "percent",
      get: (r) => {
        const rev = typeof r.payload?.totalRevenue === "number" ? r.payload.totalRevenue : null;
        const gp = typeof r.payload?.grossProfit === "number" ? r.payload.grossProfit : null;
        if (rev == null || gp == null || rev === 0) return null;
        return gp / rev;
      },
    },
    {
      id: "operatingMargin",
      label: "Operating Margin",
      group: "income",
      unit: "percent",
      get: (r) => {
        const rev = typeof r.payload?.totalRevenue === "number" ? r.payload.totalRevenue : null;
        const oi = typeof r.payload?.operatingIncome === "number" ? r.payload.operatingIncome : null;
        if (rev == null || oi == null || rev === 0) return null;
        return oi / rev;
      },
    },
    {
      id: "netMargin",
      label: "Net Margin",
      group: "income",
      unit: "percent",
      get: (r) => {
        const rev = typeof r.payload?.totalRevenue === "number" ? r.payload.totalRevenue : null;
        const ni = typeof r.payload?.netIncome === "number" ? r.payload.netIncome : null;
        if (rev == null || ni == null || rev === 0) return null;
        return ni / rev;
      },
    },
  ];

  const balance: MetricDef[] = [
    {
      id: "assets",
      label: "Total Assets",
      group: "balance_sheet",
      unit: "money",
      get: (r) => {
        const totals = r.payload?.totals;
        if (totals && typeof totals.assets_total === "number") return totals.assets_total;
        const items = Array.isArray(r.payload?.items) ? r.payload.items : [];
        return pickFromItems(items, { concepts: ["us-gaap_Assets"], labels: ["Total assets"] });
      },
    },
    {
      id: "liabilities",
      label: "Total Liabilities",
      group: "balance_sheet",
      unit: "money",
      get: (r) => {
        const totals = r.payload?.totals;
        if (totals && typeof totals.liab_total === "number") return totals.liab_total;
        const items = Array.isArray(r.payload?.items) ? r.payload.items : [];
        return pickFromItems(items, { concepts: ["us-gaap_Liabilities"], labels: ["Total liabilities"] });
      },
    },
    {
      id: "equity",
      label: "Total Equity",
      group: "balance_sheet",
      unit: "money",
      get: (r) => {
        const totals = r.payload?.totals;
        if (totals && typeof totals.equity_total === "number") return totals.equity_total;
        const items = Array.isArray(r.payload?.items) ? r.payload.items : [];
        return (
          pickFromItems(items, {
            concepts: [
              "us-gaap_StockholdersEquity",
              "us-gaap_StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
            ],
            labels: ["Total equity", "Total stockholders' equity"],
          }) ?? null
        );
      },
    },
    {
      id: "cash",
      label: "Cash & Equivalents",
      group: "balance_sheet",
      unit: "money",
      get: (r) => {
        const items = Array.isArray(r.payload?.items) ? r.payload.items : [];
        return (
          pickFromItems(items, {
            concepts: ["us-gaap_CashAndCashEquivalentsAtCarryingValue", "us-gaap_CashCashEquivalentsAndShortTermInvestments"],
            labels: ["Cash and cash equivalents"],
          }) ?? null
        );
      },
    },
    {
      id: "debtToEquity",
      label: "Debt / Equity",
      group: "balance_sheet",
      unit: "ratio",
      get: (r) => {
        const items = Array.isArray(r.payload?.items) ? r.payload.items : [];
        const eq =
          pickFromItems(items, {
            concepts: [
              "us-gaap_StockholdersEquity",
              "us-gaap_StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
            ],
            labels: ["Total equity"],
          }) ?? null;

        const st =
          pickFromItems(items, {
            concepts: ["us-gaap_DebtCurrent", "us-gaap_LongTermDebtCurrent"],
          }) ?? 0;

        const lt =
          pickFromItems(items, {
            concepts: ["us-gaap_LongTermDebtNoncurrent", "us-gaap_LongTermDebt"],
          }) ?? 0;

        const debt = (st ?? 0) + (lt ?? 0);
        if (eq == null || eq === 0 || !debt) return null;
        return debt / eq;
      },
    },
  ];

  const cashFlow: MetricDef[] = [
    {
      id: "cfo",
      label: "Operating Cash Flow",
      group: "cash_flow",
      unit: "money",
      get: (r) => {
        const totals = r.payload?.totals;
        if (totals && typeof totals.op === "number") return totals.op;
        const items = Array.isArray(r.payload?.items) ? r.payload.items : [];
        return pickFromItems(items, {
          concepts: [
            "us-gaap_NetCashProvidedByUsedInOperatingActivities",
            "us-gaap_NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
          ],
        });
      },
    },
    {
      id: "cfi",
      label: "Investing Cash Flow",
      group: "cash_flow",
      unit: "money",
      get: (r) => {
        const totals = r.payload?.totals;
        if (totals && typeof totals.inv === "number") return totals.inv;
        const items = Array.isArray(r.payload?.items) ? r.payload.items : [];
        return pickFromItems(items, {
          concepts: [
            "us-gaap_NetCashProvidedByUsedInInvestingActivities",
            "us-gaap_NetCashProvidedByUsedInInvestingActivitiesContinuingOperations",
          ],
        });
      },
    },
    {
      id: "cff",
      label: "Financing Cash Flow",
      group: "cash_flow",
      unit: "money",
      get: (r) => {
        const totals = r.payload?.totals;
        if (totals && typeof totals.fin === "number") return totals.fin;
        const items = Array.isArray(r.payload?.items) ? r.payload.items : [];
        return pickFromItems(items, {
          concepts: [
            "us-gaap_NetCashProvidedByUsedInFinancingActivities",
            "us-gaap_NetCashProvidedByUsedInFinancingActivitiesContinuingOperations",
          ],
        });
      },
    },
    {
      id: "capex",
      label: "CapEx",
      group: "cash_flow",
      unit: "money",
      get: (r) => {
        const items = Array.isArray(r.payload?.items) ? r.payload.items : [];
        return pickFromItems(items, {
          concepts: ["us-gaap_PaymentsToAcquirePropertyPlantAndEquipment"],
        });
      },
    },
    {
      id: "fcf",
      label: "Free Cash Flow (CFO − CapEx)",
      group: "cash_flow",
      unit: "money",
      get: (r) => {
        const items = Array.isArray(r.payload?.items) ? r.payload.items : [];
        const cfo = pickFromItems(items, {
          concepts: [
            "us-gaap_NetCashProvidedByUsedInOperatingActivities",
            "us-gaap_NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
          ],
        });
        const capex = pickFromItems(items, {
          concepts: ["us-gaap_PaymentsToAcquirePropertyPlantAndEquipment"],
        });
        if (cfo == null || capex == null) return null;
        return cfo - Math.abs(capex);
      },
    },
    {
      id: "netChangeCash",
      label: "Net Change in Cash",
      group: "cash_flow",
      unit: "money",
      get: (r) => {
        const totals = r.payload?.totals;
        if (totals && typeof totals.netChangeInCash === "number") return totals.netChangeInCash;
        const items = Array.isArray(r.payload?.items) ? r.payload.items : [];
        return pickFromItems(items, {
          concepts: [
            "us-gaap_CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect",
            "us-gaap_CashAndCashEquivalentsPeriodIncreaseDecrease",
            "us-gaap_CashPeriodIncreaseDecrease",
            "us-gaap_IncreaseDecreaseInCashAndCashEquivalents",
          ],
        });
      },
    },
  ];

  return [...income, ...balance, ...cashFlow];
}

export default function FinancialsTrends({ ticker, periodType, fiscalYear, units }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // allow Annual/Quarterly/Both (default both)
  const [showAnnual, setShowAnnual] = useState(true);
  const [showQuarterly, setShowQuarterly] = useState(true);

  // chart mode: raw value vs growth %
  const [mode, setMode] = useState<Mode>("value");

  // one "add metric" menu, selected metrics render as chips
  const [selected, setSelected] = useState<string[]>(["revenue", "netIncome"]);

  // menu UI state
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeGroup, setActiveGroup] = useState<StatementType>("income");

  // data buckets
  const [annualRows, setAnnualRows] = useState<GridApiRow[]>([]);
  const [qRows, setQRows] = useState<GridApiRow[]>([]);
  const [annualSource, setAnnualSource] = useState<string>("—");
  const [qSource, setQSource] = useState<string>("—");

  const divisor = useMemo(() => scaleDivisor(units), [units]);
  const metrics = useMemo(() => buildMetrics(), []);

  const metricById = useMemo(() => {
    const map = new Map<string, MetricDef>();
    metrics.forEach((m) => map.set(m.id, m));
    return map;
  }, [metrics]);

  const grouped = useMemo(() => {
    const g: Record<StatementType, MetricDef[]> = { income: [], balance_sheet: [], cash_flow: [] };
    metrics.forEach((m) => g[m.group].push(m));
    // stable order by label
    (Object.keys(g) as StatementType[]).forEach((k) => g[k].sort((a, b) => a.label.localeCompare(b.label)));
    return g;
  }, [metrics]);

  const selectedMetrics = useMemo(() => {
    return selected.map((id) => metricById.get(id)).filter(Boolean) as MetricDef[];
  }, [selected, metricById]);

  // fetch annual always when showAnnual
  useEffect(() => {
    let cancelled = false;

    async function loadAnnual() {
      if (!ticker || !showAnnual) return;

      setLoading(true);
      setError(null);

      try {
        // we pull each statement separately and merge by fiscalYear
        const calls: Promise<GridApiResponse>[] = (["income", "balance_sheet", "cash_flow"] as StatementType[]).map(
          async (st) => {
            const params = new URLSearchParams({ ticker, statementType: st, periodType: "annual" });
            const res = await fetch(`/api/financials/grid?${params.toString()}`);
            const data = (await res.json().catch(() => ({}))) as GridApiResponse;
            if (!res.ok) throw new Error(data?.error ?? `Failed to load annual ${st}`);
            return data;
          }
        );

        const [inc, bs, cf] = await Promise.all(calls);
        if (cancelled) return;

        const byYear = new Map<number, GridApiRow>();

        const merge = (rows: GridApiRow[] | undefined, key: "income" | "balance_sheet" | "cash_flow") => {
          (rows ?? []).forEach((r) => {
            const yr = r.fiscalYear;
            const existing = byYear.get(yr);
            const payload = existing?.payload ?? {};
            byYear.set(yr, {
              fiscalYear: yr,
              quarter: 0,
              fiscalDateEnding: r.fiscalDateEnding ?? existing?.fiscalDateEnding ?? null,
              reportedCurrency: r.reportedCurrency ?? existing?.reportedCurrency ?? null,
              payload: { ...payload, [key]: r.payload },
            });
          });
        };

        merge(inc.rows, "income");
        merge(bs.rows, "balance_sheet");
        merge(cf.rows, "cash_flow");

        const merged = Array.from(byYear.values()).sort((a, b) => a.fiscalYear - b.fiscalYear);
        setAnnualRows(merged);

        const src =
          (inc.rows?.[0]?.payload?.source as string) ??
          (bs.rows?.[0]?.payload?.source as string) ??
          (cf.rows?.[0]?.payload?.source as string) ??
          "—";
        setAnnualSource(src.includes("alphavantage") ? "AlphaVantage" : src.includes("finnhub") ? "Finnhub" : "—");
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load annual trends");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadAnnual();
    return () => {
      cancelled = true;
    };
  }, [ticker, showAnnual]);

    useEffect(() => {
    // If parent provides a year, always respect it
    if (fiscalYear != null) {
      setQFiscalYear(fiscalYear);
      return;
    }

    // Otherwise, infer from annual data (latest year)
    if (annualRows.length) {
      const latest = Math.max(...annualRows.map((r) => r.fiscalYear));
      setQFiscalYear(latest);
      return;
    }

    // Fallback
    setQFiscalYear(new Date().getFullYear());
  }, [fiscalYear, annualRows]);

  // fetch quarterly (for selected year) when showQuarterly
  useEffect(() => {
    let cancelled = false;

    async function loadQuarterly() {
      if (!ticker || !showQuarterly) return;
        if (qFiscalYear == null) {
        setQRows([]);
        return;
      }


      setLoading(true);
      setError(null);

      try {
        const calls: Promise<GridApiResponse>[] = (["income", "balance_sheet", "cash_flow"] as StatementType[]).map(
          async (st) => {
            const params = new URLSearchParams({
              ticker,
              statementType: st,
              periodType: "quarterly",
              fiscalYear: String(qFiscalYear),
            });
            const res = await fetch(`/api/financials/grid?${params.toString()}`);
            const data = (await res.json().catch(() => ({}))) as GridApiResponse;
            if (!res.ok) throw new Error(data?.error ?? `Failed to load quarterly ${st}`);
            return data;
          }
        );

        const [inc, bs, cf] = await Promise.all(calls);
        if (cancelled) return;

        // merge by quarter
        const byQ = new Map<number, GridApiRow>();

        const merge = (rows: GridApiRow[] | undefined, key: "income" | "balance_sheet" | "cash_flow") => {
          (rows ?? []).forEach((r) => {
            const q = r.quarter;
            const existing = byQ.get(q);
            const payload = existing?.payload ?? {};
            byQ.set(q, {
              fiscalYear: r.fiscalYear,
              quarter: q,
              fiscalDateEnding: r.fiscalDateEnding ?? existing?.fiscalDateEnding ?? null,
              reportedCurrency: r.reportedCurrency ?? existing?.reportedCurrency ?? null,
              payload: { ...payload, [key]: r.payload },
            });
          });
        };

        merge(inc.rows, "income");
        merge(bs.rows, "balance_sheet");
        merge(cf.rows, "cash_flow");

        const merged = Array.from(byQ.values()).sort((a, b) => a.quarter - b.quarter);
        setQRows(merged);

        const src =
          (inc.rows?.[0]?.payload?.source as string) ??
          (bs.rows?.[0]?.payload?.source as string) ??
          (cf.rows?.[0]?.payload?.source as string) ??
          "—";
        setQSource(src.includes("alphavantage") ? "AlphaVantage" : src.includes("finnhub") ? "Finnhub" : "—");
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load quarterly trends");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadQuarterly();
    return () => {
      cancelled = true;
    };
  }, [ticker, showQuarterly, fiscalYear]);

    const [qFiscalYear, setQFiscalYear] = useState<number | null>(null);

  // IMPORTANT: our MetricDef.get expects a unified row with fields at row.payload.<statement>.*
  // so we wrap a row into a "view" row object where payload top-level includes the merged statement payloads
  const wrapForMetricGet = (r: GridApiRow): GridApiRow => {
    const income = r.payload?.income ?? {};
    const bs = r.payload?.balance_sheet ?? {};
    const cf = r.payload?.cash_flow ?? {};
    return {
      ...r,
      payload: {
        ...income,
        // keep originals accessible if needed
        __income: income,
        __balance: bs,
        __cashflow: cf,
        // for balance/cf metrics that read items/totals, prefer those statement payloads
        // (they look for payload.items / payload.totals)
        // We'll attach "items/totals" from whichever statement is needed when called via get.
        // Our metric.get implementations already pull from r.payload (which will include income fields).
        // For balance/cf fields we need items/totals, so we attach them under payload.items/totals contextually:
        // easiest: just include both; metric.get picks the ones it knows.
        items: (cf.items ?? bs.items ?? income.items) ?? undefined,
        totals: (cf.totals ?? bs.totals ?? income.totals) ?? undefined,
        // also include these namespaces if you want to expand later
        balance_sheet: bs,
        cash_flow: cf,
      },
    };
  };

  const annualWrapped = useMemo(() => annualRows.map(wrapForMetricGet), [annualRows]);
  const qWrapped = useMemo(() => qRows.map(wrapForMetricGet), [qRows]);

  // Build x-axis + series
  const chartModel = useMemo(() => {
    const parts: {
      namePrefix: string;
      rows: GridApiRow[];
      x: string[];
      source: string;
    }[] = [];

    if (showAnnual && annualWrapped.length) {
      parts.push({
        namePrefix: "Annual",
        rows: annualWrapped,
        x: annualWrapped.map((r) => String(r.fiscalYear)),
        source: annualSource,
      });
    }

    if (showQuarterly && qWrapped.length) {
      parts.push({
        namePrefix: `Quarterly ${fiscalYear ?? ""}`.trim(),
        rows: qWrapped,
        x: qWrapped.map((r) => (r.fiscalDateEnding ? formatMDY(r.fiscalDateEnding) : `Q${r.quarter}`)),
        source: qSource,
      });
    }

    return parts;
  }, [showAnnual, showQuarterly, annualWrapped, qWrapped, annualSource, qSource, fiscalYear]);

  const useDualAxis =
  selectedMetrics.some((m) => (mode === "growth" ? true : m.unit === "percent")) &&
  selectedMetrics.some((m) => (mode === "growth" ? false : m.unit !== "percent"));

  const option = useMemo(() => {
    const allSeries: any[] = [];
    const xAxis: any[] = [];
    const yAxes: any[] = [];

    const hasAny = selectedMetrics.length > 0 && chartModel.length > 0;

    const useDualAxis = selectedMetrics.some((m) => m.unit === "percent") && selectedMetrics.some((m) => m.unit !== "percent");

    yAxes.push({
      type: "value",
      axisLabel: {
        formatter: (val: number) => {
          // left axis: money/ratio by default
          return formatScaledNumber(val, divisor);
        },
      },
    });

    if (useDualAxis) {
      yAxes.push({
        type: "value",
        position: "right",
        axisLabel: { formatter: (val: number) => formatPercent(val) },
      });
    }

    // multiple panels if both annual+quarterly (keeps clean)
    // panel count = chartModel.length
    // we use grid + xAxisIndex + yAxisIndex
    const grids: any[] = [];
    const legends: any = { type: "scroll", bottom: 0 };

    chartModel.forEach((part, panelIndex) => {
      grids.push({
        left: 48,
        right: useDualAxis ? 56 : 24,
        top: panelIndex === 0 ? 28 : 220,
        height: chartModel.length === 2 ? 150 : 200,
      });

      xAxis.push({
        gridIndex: panelIndex,
        type: "category",
        data: part.x,
        axisLabel: { hideOverlap: true },
      });

      // series per metric per panel
      selectedMetrics.forEach((m) => {
        const rawVals = part.rows.map((r) => m.get(r));

        const vals =
          mode === "value"
            ? rawVals
            : rawVals.map((v, i) => {
                if (i === 0) return null;
                const prev = rawVals[i - 1];
                if (v == null || prev == null || prev === 0) return null;
                return (v - prev) / Math.abs(prev);
              });

        const unit = mode === "growth" ? "percent" : m.unit;
        const yAxisIndex = useDualAxis && unit === "percent" ? 1 : 0;

        allSeries.push({
          name: chartModel.length === 2 ? `${m.label} (${part.namePrefix})` : m.label,
          type: "line",
          smooth: true,
          symbol: "circle",
          symbolSize: 6,
          showSymbol: false,
          connectNulls: false,
          xAxisIndex: panelIndex,
          yAxisIndex,
          data: vals,
        });
      });
    });

    return {
      grid: grids,
      tooltip: {
        trigger: "axis",
        valueFormatter: (val: any) => {
          if (val == null || typeof val !== "number") return "—";
          // heuristic: if it looks like a percent (growth or margin)
          if (Math.abs(val) <= 2 && (mode === "growth" || useDualAxis)) return formatPercent(val);
          return formatScaledNumber(val, divisor);
        },
      },
      legend: legends,
      xAxis,
      yAxis: yAxes,
      series: allSeries,
      // small titles for multi-panel
      graphic:
        chartModel.length === 2
          ? [
              {
                type: "text",
                left: 48,
                top: 6,
                style: { text: chartModel[0].namePrefix, fill: "#334155", fontSize: 12, fontWeight: 600 },
              },
              {
                type: "text",
                left: 48,
                top: 198,
                style: { text: chartModel[1].namePrefix, fill: "#334155", fontSize: 12, fontWeight: 600 },
              },
            ]
          : [],
      // nice empty state
      ...(hasAny
        ? {}
        : {
            graphic: [
              {
                type: "text",
                left: "center",
                top: "middle",
                style: { text: "Add a metric to view trends", fill: "#64748b", fontSize: 12 },
              },
            ],
          }),
    };
  }, [selectedMetrics, chartModel, mode, divisor, useDualAxis]);

  const removeMetric = (id: string) => setSelected((prev) => prev.filter((x) => x !== id));
  const addMetric = (id: string) =>
    setSelected((prev) => {
      if (prev.includes(id)) return prev;
      // cap at 6 lines for readability
      if (prev.length >= 6) return prev;
      return [...prev, id];
    });

  // keep at least one period enabled
  useEffect(() => {
    if (!showAnnual && !showQuarterly) setShowAnnual(true);
  }, [showAnnual, showQuarterly]);

  if (loading) {
    return (
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="text-sm text-muted-foreground">Loading trends…</div>
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

  // if neither dataset exists, just hide the module
  if (!annualRows.length && !qRows.length) return null;

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">Trends</div>
          <div className="text-xs text-muted-foreground">
            Sources: {showAnnual ? `Annual ${annualSource}` : ""}
            {showAnnual && showQuarterly ? " • " : ""}
            {showQuarterly ? `Quarterly ${qSource}` : ""}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Period toggles */}
          <div className="flex items-center gap-2 rounded-lg border bg-white px-2 py-1 text-xs">
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={showAnnual}
                onChange={(e) => setShowAnnual(e.target.checked)}
              />
              Annual
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={showQuarterly}
                onChange={(e) => setShowQuarterly(e.target.checked)}
              />
              Quarterly
            </label>
          </div>

          {/* Value vs Growth */}
          <div className="flex items-center gap-1 rounded-lg border bg-white p-1 text-xs">
            <button
              type="button"
              onClick={() => setMode("value")}
              className={
                mode === "value"
                  ? "rounded-md bg-slate-900 px-2 py-1 text-white"
                  : "rounded-md px-2 py-1 text-slate-700 hover:bg-slate-50"
              }
            >
              Value
            </button>
            <button
              type="button"
              onClick={() => setMode("growth")}
              className={
                mode === "growth"
                  ? "rounded-md bg-slate-900 px-2 py-1 text-white"
                  : "rounded-md px-2 py-1 text-slate-700 hover:bg-slate-50"
              }
            >
              Growth %
            </button>
          </div>
        </div>
      </div>

      {/* Add metric + chips */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50"
          >
            Add metric
            <span className="text-xs text-muted-foreground">+ (max 6)</span>
          </button>

          {menuOpen && (
            <div
              className="absolute left-0 mt-2 w-[560px] rounded-xl border bg-white shadow-lg z-50"
              onMouseLeave={() => setMenuOpen(false)}
            >
              <div className="grid grid-cols-2">
                {/* Left: statement list */}
                <div className="border-r p-2">
                  {(Object.keys(grouped) as StatementType[]).map((g) => (
                    <button
                      key={g}
                      type="button"
                      className={statementHeaderClasses(activeGroup === g)}
                      onMouseEnter={() => setActiveGroup(g)}
                      onFocus={() => setActiveGroup(g)}
                    >
                      <span>{niceGroupName(g)}</span>
                      <span className={activeGroup === g ? "opacity-80" : "text-slate-400"}>
                        {grouped[g].length}
                      </span>
                    </button>
                  ))}
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    Hover a statement to view metrics.
                  </div>
                </div>

                {/* Right: metrics for active group */}
                <div className="p-2 max-h-[340px] overflow-auto">
                  {grouped[activeGroup].map((m) => {
                    const already = selected.includes(m.id);
                    return (
                      <div
                        key={m.id}
                        className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-slate-50"
                      >
                        <div className="min-w-0">
                          <div className="text-sm text-slate-900 truncate">{m.label}</div>
                          <div className="text-xs text-muted-foreground">
                            {m.unit === "money" ? "Value" : m.unit === "percent" ? "Percent" : "Ratio"}
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={already || selected.length >= 6}
                          onClick={() => addMetric(m.id)}
                          className={[
                            "ml-2 inline-flex h-7 w-7 items-center justify-center rounded-full border text-sm",
                            already || selected.length >= 6
                              ? "cursor-not-allowed opacity-40"
                              : "hover:bg-slate-100",
                          ].join(" ")}
                          aria-label={`Add ${m.label}`}
                          title={already ? "Already added" : "Add"}
                        >
                          +
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* chips */}
        <div className="flex flex-wrap gap-2">
          {selectedMetrics.map((m) => (
            <span
              key={m.id}
              className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1 text-sm"
            >
              <span className="max-w-[260px] truncate">{m.label}</span>
              <button
                type="button"
                onClick={() => removeMetric(m.id)}
                className="inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-slate-100 text-slate-600"
                aria-label={`Remove ${m.label}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <ReactECharts option={option} style={{ height: showAnnual && showQuarterly ? 380 : 320, width: "100%" }} opts={{ renderer: "canvas" }} />
      </div>

      <div className="mt-1 text-xs text-muted-foreground">
        Tip: Add a margin metric with a dollar metric — the chart will use a right-side % axis automatically.
      </div>
    </div>
  );
}

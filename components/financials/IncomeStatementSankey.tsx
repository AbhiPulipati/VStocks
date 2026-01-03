"use client";

import React, { useEffect, useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import type { UnitScale } from "@/lib/financials/incomeStatementRows";

type StatementType = "income" | "balance_sheet" | "cash_flow";
type PeriodType = "annual" | "quarterly";
type Tone = "neutral" | "good" | "bad";

type GridApiRow = {
  fiscalYear: number;
  quarter: number; // 0 annual, 1-4 quarterly
  fiscalDateEnding: string | null;
  reportedCurrency: string | null;
  payload: Record<string, any>;
};

type Props = {
  ticker: string;
  statementType: StatementType;
  periodType: PeriodType;
  fiscalYear: number | null; // required to choose a single report
  quarter?: number;
  units: UnitScale;
};

export default function IncomeStatementSankey({
  ticker,
  statementType,
  periodType,
  fiscalYear,
  quarter,
  units,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<GridApiRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Fetch cached reports from your DB via /api/financials/grid
  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (statementType !== "income") {
        setRows([]);
        return;
      }
      if (!fiscalYear) return;

      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        ticker,
        statementType,
        periodType,
      });

      if (periodType === "quarterly") params.set("fiscalYear", String(fiscalYear));

      try {
        const res = await fetch(`/api/financials/grid?${params.toString()}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error ?? "Failed to load sankey data");
        if (!cancelled) setRows(data.rows ?? []);
      } catch (e: any) {
        if (!cancelled) {
          setRows([]);
          setError(e?.message ?? "Failed to load sankey data");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [ticker, statementType, periodType, fiscalYear]);

  // Single report to visualize
  const report: GridApiRow | null = useMemo(() => {
  if (!rows.length) return null;

  if (periodType === "annual") {
    const match = rows.find((r) => r.fiscalYear === fiscalYear && r.quarter === 0);
    return match ?? rows[0] ?? null;
  }

  // ✅ QUARTERLY: pick selected quarter if provided
  if (!fiscalYear) return rows[0] ?? null;

  if (quarter != null) {
    const match = rows.find((r) => r.fiscalYear === fiscalYear && r.quarter === quarter);
    return match ?? rows[0] ?? null;
  }

  // fallback (most recent)
  return rows[0] ?? null;
}, [rows, periodType, fiscalYear, quarter]);

  const title = useMemo(() => {
    if (!report) return "";
    const periodLabel =
      report.quarter && report.quarter > 0 ? `Q${report.quarter} ${report.fiscalYear}` : `FY ${report.fiscalYear}`;
    const date = report.fiscalDateEnding ? ` (${report.fiscalDateEnding})` : "";
    return `${periodLabel}${date}`;
  }, [report]);

  const scaleDivisor = useMemo(() => {
    if (units === "thousands") return 1_000;
    if (units === "millions") return 1_000_000;
    return 1_000_000_000;
  }, [units]);

  const option = useMemo(() => {
    if (!report?.payload) return null;

    const v = computeIncomeValues(report.payload);

    // minimal: revenue split must exist
    if (v.revenue == null || v.cogs == null || v.grossProfit == null) return null;

    const haveMid = v.operatingExpenses != null && v.operatingIncome != null;
    const havePretax = v.incomeBeforeTax != null && v.operatingIncome != null;

    const otherNet = havePretax && v.otherNet != null ? v.otherNet : 0;
    const showOther = havePretax && Math.abs(otherNet) > 0;

    const tax = v.incomeTaxExpense;
    const hasTax = tax != null && tax !== 0;

    const net = v.reconciledNet ?? v.netIncomeFromContinuing ?? v.netIncome ?? null;
    const showNet = v.incomeBeforeTax != null && net != null;

    // NOTE: We intentionally keep "layout: none" and "draggable: true",
    // but we ALSO add invisible sinks to prevent ECharts from pushing terminal nodes to the last column.
    // A terminal node becomes non-terminal by pointing to an invisible sink (tiny epsilon flow, fully transparent),
    // which allows you to position it earlier like your reference screenshot.

    const POS: Record<string, { x: number; y: number; tone: Tone }> = {
      // Left
      Revenue: { x: 0.02, y: 0.52, tone: "neutral" },

      // Column 2
      COGS: { x: 0.28, y: 0.26, tone: "bad" },
      "Gross Profit": { x: 0.28, y: 0.72, tone: "good" },

      // Column 3
      "Operating Expenses": { x: 0.55, y: 0.62, tone: "bad" },
      "Operating Income": { x: 0.55, y: 0.78, tone: "good" },

      // Column 4
      "Income Before Tax": { x: 0.78, y: 0.78, tone: "good" },

      // Expense breakdown (stop near mid-right, not the far edge)
      "R&D": { x: 0.78, y: 0.52, tone: "bad" },
      "SG&A": { x: 0.78, y: 0.64, tone: "bad" },

      // Other net: sits low and feeds into pretax (positive) or receives from op income (negative)
      "Other income/(expense), net": { x: 0.42, y: 0.92, tone: "neutral" },

      // Right side
      "Net Income": { x: 0.94, y: 0.78, tone: "good" },

      // Tax nodes (only create one based on sign)
      "Income Tax Expense": { x: 0.94, y: 0.30, tone: "bad" },
      "Income Tax Benefit": { x: 0.78, y: 0.92, tone: "good" },

      // Sinks live at the far right but are fully invisible
      // (we create them dynamically so you never see them)
    };

    const nodes: any[] = [];
    const links: any[] = [];

    const hasNode = (name: string) => nodes.some((n) => n.name === name);

    const ensureNode = (name: string) => {
      // Conditionally suppress nodes
      if (name === "Other income/(expense), net" && !showOther) return;
      if (name === "Income Tax Expense" && !(hasTax && tax! > 0)) return;
      if (name === "Income Tax Benefit" && !(hasTax && tax! < 0)) return;

      const p = POS[name];
      if (!p) return;

      if (hasNode(name)) return;

      nodes.push({
        name,
        x: p.x,
        y: p.y,
        itemStyle: { color: nodeColor(p.tone, name) },
        label: { color: "#0f172a" },
      });
    };

    const addLink = (source: string, target: string, value: number, tone: Tone) => {
      if (!value || !Number.isFinite(value) || value <= 0) return;

      ensureNode(source);
      ensureNode(target);
      if (!hasNode(source) || !hasNode(target)) return;

      links.push({
        source,
        target,
        value,
        lineStyle: { color: linkColor(tone), opacity: 0.55 },
        emphasis: { disabled: true },
      });
    };

    // ---- Invisible sink helper ----
    // Adds: Node -> __sink (epsilon) with fully transparent link, and fully transparent sink node.
    // This prevents ECharts from treating Node as "terminal at last depth", so your POS map actually sticks.
    const EPS = 0.0001;

    const addInvisibleSink = (from: string) => {
      if (!hasNode(from)) return;

      const sinkName = `${from}__sink`;
      if (!hasNode(sinkName)) {
        // Put sink at the far right, aligned with the node so the invisible epsilon link is minimal
        const fromNode = nodes.find((n) => n.name === from);
        nodes.push({
          name: sinkName,
          x: 0.995,
          y: fromNode?.y ?? 0.5,
          itemStyle: { color: "transparent" },
          label: { show: false },
          tooltip: { show: false },
        });
      }

      links.push({
        source: from,
        target: sinkName,
        value: EPS,
        lineStyle: { color: "transparent", opacity: 0 },
        tooltip: { show: false },
        emphasis: { disabled: true },
      });
    };

    // ---- Invisible incoming anchor ("reverse sink") ----
// Makes a "source-only" node no longer depth-0 by giving it a tiny invisible incoming link
// ---- Invisible "push forward" helper ----
// Forces a source-only node to NOT snap to the far-left by giving it an invisible incoming edge
// from a deep node (e.g., Operating Income / Income Before Tax).
const addInvisiblePushForward = (from: string, to: string, anchorX?: number, anchorY?: number) => {
  if (!hasNode(from) || !hasNode(to)) return;

  const anchorName = `${to}__push_from_${from}`;

  if (!hasNode(anchorName)) {
    nodes.push({
      name: anchorName,
      x: anchorX ?? 0.70,
      y: anchorY ?? 0.50,
      itemStyle: { color: "transparent" },
      label: { show: false },
      tooltip: { show: false },
    });
  }

  // from -> anchor -> to (both invisible)
  links.push({
    source: from,
    target: anchorName,
    value: EPS,
    lineStyle: { color: "transparent", opacity: 0 },
    tooltip: { show: false },
    emphasis: { disabled: true },
  });

  links.push({
    source: anchorName,
    target: to,
    value: EPS,
    lineStyle: { color: "transparent", opacity: 0 },
    tooltip: { show: false },
    emphasis: { disabled: true },
  });
};

    // Build required nodes
    ensureNode("Revenue");
    ensureNode("COGS");
    ensureNode("Gross Profit");

    if (haveMid) {
      ensureNode("Operating Expenses");
      ensureNode("Operating Income");
      ensureNode("R&D");
      ensureNode("SG&A");
    }

    if (havePretax) ensureNode("Income Before Tax");
    if (showOther) ensureNode("Other income/(expense), net");
    if (showNet) ensureNode("Net Income");

    if (hasTax && tax! > 0) ensureNode("Income Tax Expense");
    if (hasTax && tax! < 0) ensureNode("Income Tax Benefit");

    // 1) Revenue -> COGS + Gross Profit
    addLink("Revenue", "COGS", Math.abs(v.cogs), "bad");
    addLink("Revenue", "Gross Profit", Math.abs(v.grossProfit), "good");

    // 2) Gross Profit -> OpEx + OpInc
    if (haveMid) {
      addLink("Gross Profit", "Operating Expenses", Math.abs(v.operatingExpenses!), "bad");
      addLink("Gross Profit", "Operating Income", Math.abs(v.operatingIncome!), "good");

      // 3) OpEx -> R&D + SG&A
      if (v.rd != null && Math.abs(v.rd) > 0) addLink("Operating Expenses", "R&D", Math.abs(v.rd), "bad");
      if (v.sga != null && Math.abs(v.sga) > 0) addLink("Operating Expenses", "SG&A", Math.abs(v.sga), "bad");
    }

    // 4) Other net behavior
    if (havePretax) {
      if (otherNet > 0) {
        addLink("Operating Income", "Income Before Tax", Math.abs(v.operatingIncome!), "good");
        addLink("Other income/(expense), net", "Income Before Tax", Math.abs(otherNet), "good");
      } else if (otherNet < 0) {
        addLink("Operating Income", "Other income/(expense), net", Math.abs(otherNet), "bad");
        addLink("Operating Income", "Income Before Tax", Math.abs(v.incomeBeforeTax!), "good");
      } else {
        addLink("Operating Income", "Income Before Tax", Math.abs(v.incomeBeforeTax!), "good");
      }
    }

    // 5) Tax in/out and Net
    if (showNet) {
      if (hasTax && tax! > 0) {
        addLink("Income Before Tax", "Income Tax Expense", Math.abs(tax!), "bad");
        addLink("Income Before Tax", "Net Income", Math.abs(net!), "good");
      } else if (hasTax && tax! < 0) {
        addLink("Income Before Tax", "Net Income", Math.abs(v.incomeBeforeTax!), "good");
        addLink("Income Tax Benefit", "Net Income", Math.abs(tax!), "good");
      } else {
        addLink("Income Before Tax", "Net Income", Math.abs(net!), "good");
      }
    }

    // ---- Add invisible sinks to make terminal nodes NOT get forced to the last column ----
    // These are exactly the nodes that "should stop" visually where YOU place them.
    addInvisibleSink("COGS");
    addInvisibleSink("R&D");
    addInvisibleSink("SG&A");
    if (hasTax && tax! > 0) addInvisibleSink("Income Tax Expense");
    if (hasTax && tax! < 0) addInvisibleSink("Income Tax Benefit");
    if (showOther) addInvisibleSink("Other income/(expense), net");
    // Net Income is the true terminal; no sink needed unless you see it being forced even farther.

    // ---- Reverse anchors to prevent "pure source" nodes from snapping to the far left ----

// If Other Net is POSITIVE, it's a source-only node (Other -> Pretax).
// Push it forward by giving it an invisible incoming chain from Operating Income.
if (showOther && otherNet > 0) {
  const p = POS["Other income/(expense), net"];
  // put the anchor slightly left of Pretax / mid-right (tweak as needed)
  addInvisiblePushForward("Operating Income", "Other income/(expense), net", p?.x ?? 0.42, p?.y ?? 0.92);
}

// Income Tax Benefit is also source-only (Benefit -> Net).
// Give it multiple push-forwards (same trick as "pushing COGS back", but inverted).

if (hasTax && tax! < 0) {
  const p = POS["Income Tax Benefit"];

  // Push 1: from Income Before Tax (upstream)
  addInvisiblePushForward(
    "Income Before Tax",
    "Income Tax Benefit",
    (p?.x ?? 0.78) - 0.04,
    p?.y ?? 0.92
  );

  // Push 2: from Operating Income (also upstream)
  // safe because Operating Income -> Pretax exists, and Benefit does not flow back to it
  addInvisiblePushForward(
    "Operating Income",
    "Income Tax Benefit",
    (p?.x ?? 0.78) - 0.08,
    (p?.y ?? 0.92) - 0.03
  );

  // Push 3: from Gross Profit (upstream)
  addInvisiblePushForward(
    "Gross Profit",
    "Income Tax Benefit",
    (p?.x ?? 0.78) - 0.12,
    (p?.y ?? 0.92) + 0.03
  );
}

    const fmt = (n: number) => formatScaled(n, scaleDivisor);

    return {
      tooltip: {
        trigger: "item",
        formatter: (params: any) => {
          // Hide tooltip for sinks
          if (typeof params?.name === "string" && params.name.endsWith("__sink")) return "";
          if (params.dataType === "node") return `${params.name}<br/>${fmt(params.value || 0)}`;
          if (params.dataType === "edge") {
            const s = params.data?.source;
            const t = params.data?.target;
            if (typeof t === "string" && t.endsWith("__sink")) return "";
            return `${s} → ${t}<br/>${fmt(params.data.value || 0)}`;
          }
          return "";
        },
      },
      series: [
        {
          type: "sankey",
          layout: "none",
          draggable: true, // ✅ manual drag is back
          nodeWidth: 18,
          nodeGap: 10,
          emphasis: { disabled: true },
          data: nodes,
          links,
          lineStyle: { curveness: 0.5 },
          label: { show: true, color: "#0f172a", fontSize: 12 },
        },
      ],
    };
  }, [report, scaleDivisor]);

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold">Income Statement Sankey</div>
        <div className="text-xs text-muted-foreground">{title}</div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading sankey…</div>
      ) : error ? (
        <div className="text-sm text-red-700">{error}</div>
      ) : !option ? (
        <div className="text-sm text-muted-foreground">
          Not enough data to render sankey for this period.
        </div>
      ) : (
        <div className="h-[420px] w-full">
          <ReactECharts option={option} style={{ height: "100%", width: "100%" }} />
        </div>
      )}
    </div>
  );
}

// -------------------- Calculations (match your grid rules) --------------------

function toNum(v: any): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s || s.toLowerCase() === "none") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function computeIncomeValues(payload: Record<string, any>) {
  const revenue = toNum(payload.totalRevenue);

  const cogs = toNum(payload.costOfRevenue) ?? toNum(payload.costofGoodsAndServicesSold);

  const grossProfit =
    toNum(payload.grossProfit) ?? (revenue != null && cogs != null ? revenue - cogs : null);

  const operatingExpenses = toNum(payload.operatingExpenses);
  const rd = toNum(payload.researchAndDevelopment);

  // SG&A = OpEx - R&D
  const sga = operatingExpenses != null && rd != null ? operatingExpenses - rd : null;

  const operatingIncome =
    toNum(payload.operatingIncome) ??
    (grossProfit != null && operatingExpenses != null ? grossProfit - operatingExpenses : null);

  const incomeBeforeTax = toNum(payload.incomeBeforeTax);

  // otherNet = Pretax - Operating Income (your rule)
  const otherNet =
    incomeBeforeTax != null && operatingIncome != null ? incomeBeforeTax - operatingIncome : null;

  const incomeTaxExpense = toNum(payload.incomeTaxExpense); // keep sign
  const netIncomeFromContinuing = toNum(payload.netIncomeFromContinuingOperations);
  const netIncome = toNum(payload.netIncome);

  // reconciliation target: Net = Pretax - Tax (tax sign respected)
  const targetNet =
    incomeBeforeTax != null && incomeTaxExpense != null ? incomeBeforeTax - incomeTaxExpense : null;

  const pickBestNet = () => {
    if (targetNet == null) return netIncomeFromContinuing ?? netIncome ?? null;

    const candidates: number[] = [];
    if (netIncomeFromContinuing != null) candidates.push(netIncomeFromContinuing);
    if (netIncome != null) candidates.push(netIncome);

    if (!candidates.length) return null;

    let best = candidates[0];
    let bestDiff = Math.abs(candidates[0] - targetNet);

    for (const c of candidates.slice(1)) {
      const diff = Math.abs(c - targetNet);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = c;
      }
    }
    return best;
  };

  const reconciledNet = pickBestNet();

  return {
    revenue,
    cogs,
    grossProfit,
    operatingExpenses,
    rd,
    sga,
    operatingIncome,
    incomeBeforeTax,
    otherNet,
    incomeTaxExpense,
    netIncomeFromContinuing,
    netIncome,
    reconciledNet,
  };
}

// -------------------- Formatting + colors --------------------

function formatScaled(value: number, divisor: number) {
  const scaled = value / divisor;
  const abs = Math.abs(scaled);
  const formatted = abs.toLocaleString(undefined, {
    maximumFractionDigits: abs >= 100 ? 0 : 1,
  });
  return scaled < 0 ? `(${formatted})` : formatted;
}

// Lighter (links)
function linkColor(tone: Tone) {
  if (tone === "good") return "#22c55e";
  if (tone === "bad") return "#ef4444";
  return "#94a3b8";
}

// Darker (nodes)
function nodeColor(tone: Tone, name: string) {
  if (tone === "good") return "#16a34a";
  if (tone === "bad") return "#dc2626";
  if (name.toLowerCase().includes("revenue")) return "#64748b";
  return "#64748b";
}
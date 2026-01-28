"use client";

import { useEffect, useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";

type EPSEntry = {
  actual: number;
  estimate: number;
  period: string;
  quarter: number;
  year: number;
  surprise: number;
  surprisePercent: number;
};

function formatQuarter(d: EPSEntry) {
  return `Q${d.quarter} ${d.year}`;
}

export default function EPSTrendSection({ ticker }: { ticker: string }) {
  const [view, setView] = useState<"bar" | "line">("bar");
  const [data, setData] = useState<EPSEntry[]>([]);
  const [loading, setLoading] = useState(false);

  /* ---------------------------
     Fetch EPS data
     --------------------------- */
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        const res = await fetch(
          `/api/analysis/eps-trend?ticker=${encodeURIComponent(ticker)}`
        );
        const json = await res.json();
        if (alive && json?.ok) {
          setData(json.data);
        }
      } catch {
        if (alive) setData([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [ticker]);

  /* ---------------------------
     Prepare chart data
     --------------------------- */
  const chartData = useMemo(() => {
    return [...data]
      .sort((a, b) => new Date(a.period).getTime() - new Date(b.period).getTime())
      .map((d) => ({
        label: formatQuarter(d),
        actual: d.actual,
        estimate: d.estimate,
        surprise: d.surprise,
        surprisePercent: d.surprisePercent,
        beat: d.actual >= d.estimate,
      }));
  }, [data]);

  /* ---------------------------
     ECharts option
     --------------------------- */
  const option = useMemo(() => {
    const labels = chartData.map(d => d.label);

    if (view === "bar") {
      return {
        animation: false,
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          formatter: (params: any) => {
            const d = params[0]?.data || params[1]?.data;
            const positive = d?.beat ?? true;
            return `
              <div style="font-size:12px;line-height:1.5">
                <b>${params[0]?.axisValue}</b><br/>
                Actual EPS: ${d?.actual ?? "-"}<br/>
                Estimate EPS: ${d?.estimate ?? "-"}<br/>
                <span style="font-weight:600;color:${positive ? "#16a34a" : "#dc2626"}">
                  Surprise: ${positive ? "+" : ""}${d?.surprise?.toFixed(2) ?? "-"}
                  (${positive ? "+" : ""}${d?.surprisePercent?.toFixed(2) ?? "-"}%)
                </span>
              </div>
            `;
          },
        },
        xAxis: {
          type: "category",
          data: labels,
          axisTick: { show: false },
          axisLine: { lineStyle: { color: "#cbd5f5" } },
        },
        yAxis: {
          type: "value",
          axisLabel: { fontSize: 11 },
          splitLine: { lineStyle: { color: "rgba(148,163,184,0.25)" } },
        },
        series: [
          {
            name: "Estimate",
            type: "bar",
            barGap: 0, // bars side by side
            barWidth: "40%",
            data: chartData.map(d => ({
              value: d.estimate,
              actual: d.actual,
              estimate: d.estimate,
              surprise: d.surprise,
              surprisePercent: d.surprisePercent,
              beat: d.beat,
              itemStyle: { color: "#94a3b8", borderRadius: [6,6,0,0] },
            })),
          },
          {
            name: "Actual",
            type: "bar",
            barGap: 0,
            barWidth: "40%",
            data: chartData.map(d => ({
              value: d.actual,
              actual: d.actual,
              estimate: d.estimate,
              surprise: d.surprise,
              surprisePercent: d.surprisePercent,
              beat: d.beat,
              itemStyle: {
                color: d.beat ? "#22c55e" : "#ef4444",
                borderRadius: [6,6,0,0],
              },
            })),
          },
        ],
      };
    } else {
      return {
        animation: false,
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "line" },
          formatter: (params: any) => {
            const d = params[0]?.data;
            const positive = d?.beat ?? true;
            return `
              <div style="font-size:12px;line-height:1.5">
                <b>${params[0]?.axisValue}</b><br/>
                Actual EPS: ${d?.actual ?? "-"}<br/>
                Estimate EPS: ${d?.estimate ?? "-"}<br/>
                <span style="font-weight:600;color:${positive ? "#16a34a" : "#dc2626"}">
                  Surprise: ${positive ? "+" : ""}${d?.surprise?.toFixed(2) ?? "-"}
                  (${positive ? "+" : ""}${d?.surprisePercent?.toFixed(2) ?? "-"}%)
                </span>
              </div>
            `;
          },
        },
        xAxis: {
          type: "category",
          data: labels,
          axisTick: { show: false },
          axisLine: { lineStyle: { color: "#cbd5f5" } },
        },
        yAxis: {
          type: "value",
          axisLabel: { fontSize: 11 },
          splitLine: { lineStyle: { color: "rgba(148,163,184,0.25)" } },
        },
        series: [
          {
            name: "Estimate",
            type: "line",
            smooth: true,
            symbol: "none",
            lineStyle: { color: "#94a3b8", width: 2, type: "dashed" },
            data: chartData.map(d => ({
              value: d.estimate,
              actual: d.actual,
              estimate: d.estimate,
              surprise: d.surprise,
              surprisePercent: d.surprisePercent,
              beat: d.beat,
            })),
          },
          {
            name: "Actual",
            type: "line",
            smooth: true,
            symbolSize: 8,
            lineStyle: { width: 3, color: "#22c55e" },
            data: chartData.map(d => ({
              value: d.actual,
              actual: d.actual,
              estimate: d.estimate,
              surprise: d.surprise,
              surprisePercent: d.surprisePercent,
              beat: d.beat,
              itemStyle: { color: d.beat ? "#22c55e" : "#ef4444" },
            })),
          },
        ],
      };
    }
  }, [chartData, view]);

  /* ---------------------------
     Render
     --------------------------- */
  if (loading && data.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="text-sm text-muted-foreground">Loading EPS trend…</div>
      </div>
    );
  }

  if (!loading && data.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="text-sm font-semibold text-foreground">EPS Trend</div>
        <div className="mt-2 text-sm text-muted-foreground">No EPS data available</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-foreground">EPS Trend</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Actual vs analyst estimates
          </div>
        </div>
        <div className="flex rounded-lg border border-border p-1 text-xs">
          <button
            onClick={() => setView("bar")}
            className={`px-3 py-1 rounded-md ${
              view === "bar" ? "bg-foreground text-background" : "text-muted-foreground"
            }`}
          >
            Bar
          </button>
          <button
            onClick={() => setView("line")}
            className={`px-3 py-1 rounded-md ${
              view === "line" ? "bg-foreground text-background" : "text-muted-foreground"
            }`}
          >
            Line
          </button>
        </div>
      </div>

      <ReactECharts
        option={option as any}
        style={{ height: "100%", width: "100%", minHeight: 320 }}
        opts={{ renderer: "canvas" }}
      />
    </div>
  );
}
"use client";

import { useEffect, useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";

type Bucket = "Strong Buy" | "Buy" | "Hold" | "Sell" | "Strong Sell";

type ApiResponse =
  | { ok: false; error: string }
  | {
      ok: true;
      ticker: string;
      latest: {
        period: string;
        counts: {
          strongBuy: number;
          buy: number;
          hold: number;
          sell: number;
          strongSell: number;
          total: number;
        };
        score: number; // [-2, 2]
        dominant: {
          bucket: Bucket;
          count: number;
          total: number;
          text: string; // "30/60 Buy"
        };
      };
      trend: Array<{
        period: string;
        score: number;
        total: number;
        dominantBucket: Bucket;
        dominantCount: number;
        strongBuy: number;
        buy: number;
        hold: number;
        sell: number;
        strongSell: number;
      }>;
    };

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function formatPeriod(p: string) {
  const d = new Date(p);
  if (Number.isNaN(d.getTime())) return p;
  // "Jan '25"
  const s = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  return s.replace(" ", " '");
}

function bucketToNeedleValue(bucket: Bucket) {
  // Place the needle at the bucket center for display emphasis (if you ever want it).
  // We still use weighted score for the actual value, but this helps mapping labels.
  switch (bucket) {
    case "Strong Sell":
      return -2;
    case "Sell":
      return -1;
    case "Hold":
      return 0;
    case "Buy":
      return 1;
    case "Strong Buy":
      return 2;
  }
}

function bucketColor(bucket: Bucket) {
  switch (bucket) {
    case "Strong Sell":
      return "text-red-500";
    case "Sell":
      return "text-red-400";
    case "Hold":
      return "text-slate-500";
    case "Buy":
      return "text-blue-500";
    case "Strong Buy":
      return "text-emerald-500";
  }
}

export default function AnalystRatingsSection({ ticker }: { ticker: string }) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
const [view, setView] = useState<"gauge" | "bars">("gauge");

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/analysis/analyst-ratings?ticker=${encodeURIComponent(ticker)}`);
        const json = (await res.json()) as ApiResponse;
        if (alive) setData(json);
      } catch (e: any) {
        if (alive) setData({ ok: false, error: e?.message || "Failed to load" });
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [ticker]);

  const gaugeOption = useMemo(() => {
    if (!data || !data.ok) return null;

    // Needle uses weighted score (more stable than "dominant bucket")
    const score = clamp(data.latest.score, -2, 2);
    const dom = data.latest.dominant.bucket;

    // This axis label formatter shows labels around the arc at -2,-1,0,1,2
    const labelMap: Record<string, string> = {
      "-2": "Strong sell",
      "-1": "Sell",
      "0": "Hold",
      "1": "Buy",
      "2": "Strong buy",
    };

    // Emphasize the dominant bucket by “brightening” that segment slightly:
    // The gauge axisLine color is segmented; we keep it simple and professional.
    return {
      animation: false,
      series: [
        {
          type: "gauge",
          startAngle: 180,
          endAngle: 0,
          min: -2,
          max: 2,
          splitNumber: 4,
          radius: "95%",
          center: ["50%", "56%"],

          axisLine: {
            roundCap: true,
            lineStyle: {
              width: 14,
              color: [
                [0.2, "#ef4444"], // strong sell
                [0.4, "#f59e0b"], // sell-ish
                [0.6, "#e5e7eb"], // hold/neutral
                [0.8, "#60a5fa"], // buy-ish
                [1.0, "#22c55e"], // strong buy
              ],
            },
          },

          // lots of small ticks like the image
          axisTick: {
            show: true,
            splitNumber: 6,
            length: 6,
            lineStyle: { color: "rgba(100,116,139,0.45)", width: 1 },
          },
          splitLine: {
            show: true,
            length: 14,
            lineStyle: { color: "rgba(100,116,139,0.55)", width: 2 },
          },

          axisLabel: {
            show: true,
            distance: 18,
            fontSize: 12,
            color: "rgba(100,116,139,0.75)",
            formatter: (v: number) => labelMap[String(v)] ?? "",
          },

          pointer: {
            length: "58%",
            width: 4,
          },
          itemStyle: {
            color: "#0f172a",
          },

          title: { show: false },
          detail: {
            show: false,
            valueAnimation: true,
            offsetCenter: [0, "18%"],
            fontSize: 34,
            fontWeight: 700,
            color: "#0f172a",
            formatter: () => {
              // show dominant count as the large number (like grade rating image)
              // If you prefer the score, swap to: Math.round(((score+2)/4)*100)
              return String(data.latest.dominant.count);
            },
          },

          data: [{ value: score, name: "Analyst Rating" }],
        },
      ],
      graphic: [
        // Big majority number (37)
        {
          type: "text",
          left: "center",
          top: "65%",
          style: {
            text: String(data.latest.dominant.count),
            fill: "#0f172a",
            fontSize: 38,
            fontWeight: 800,
          },
        },

        // "Analyst Rating"
        {
          type: "text",
          left: "center",
          top: "82%",
          style: {
            text: "Analyst Rating",
            fill: "rgba(100,116,139,0.8)",
            fontSize: 12,
            fontWeight: 600,
          },
        },

        // "Buy"
        {
          type: "text",
          left: "center",
          top: "89%",
          style: {
            text: dom,
            fill: "rgba(37,99,235,0.95)",
            fontSize: 18,
            fontWeight: 800,
          },
        },
      ],
    };
  }, [data]);

  const sparkOption = useMemo(() => {
    if (!data || !data.ok) return null;

    const points = (data.trend ?? []).map((x) => ({
      name: formatPeriod(x.period),
      value: clamp(x.score, -2, 2),
    }));

    return {
      animation: false,
      grid: { left: 6, right: 6, top: 6, bottom: 6, containLabel: false },
      xAxis: {
        type: "category",
        data: points.map((p) => p.name),
        boundaryGap: false,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        min: -2,
        max: 2,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
        splitLine: { show: false },
      },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "line" },
        formatter: (params: any) => {
          const p = params?.[0];
          if (!p) return "";

          // show dominant bucket for that period too
          const idx = p.dataIndex;
          const row = data.trend?.[idx];
          const domText = row
            ? `${row.dominantCount}/${row.total} ${row.dominantBucket}`
            : "";

          return `<div style="font-size:12px;line-height:1.4">
            <b>${p.axisValue}</b>
            <div style="margin-top:4px;">Sentiment: ${domText}</div>
          </div>`;
        },
      },
      series: [
        {
          type: "line",
          data: points.map((p) => p.value),
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 2, color: "#2563eb" },
          areaStyle: { opacity: 0.08 },
          markLine: {
            silent: true,
            symbol: "none",
            lineStyle: { color: "rgba(100,116,139,0.35)", width: 1 },
            data: [{ yAxis: 0 }],
          },
        },
      ],
    };
  }, [data]);

const stackedBarOption = useMemo(() => {
    if (!data || !data.ok) return null;

    const periods = data.trend.map((t) => formatPeriod(t.period));

    // Helper to generate the series with labels
    const createSeries = (name: string, key: keyof typeof data.trend[0], color: string) => ({
      name,
      type: "bar",
      stack: "total",
      data: data.trend.map((t) => {
        const val = (t[key] as number) || 0;
        const pct = t.total > 0 ? Math.round((val / t.total) * 100) : 0;
        return {
          value: val,
          // Store percentage in the data object for the label formatter
          pct: pct 
        };
      }),
      itemStyle: { color },
      label: {
        show: true,
        position: "inside",
        // Only show label if the bar segment is large enough to read (e.g. > 3 analysts)
        formatter: (params: any) => {
          return params.value > 3 ? `${params.value}\n(${params.data.pct}%)` : "";
        },
        fontSize: 9,
        fontWeight: "bold",
        color: "#000000ff",
      },
    });

    return {
      animation: true,
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: "rgba(255, 255, 255, 0.95)",
        borderWidth: 1,
        borderColor: "#e2e8f0",
        textStyle: { color: "#0f172a" },
        formatter: (params: any) => {
          let res = `<div style="font-weight: 600; margin-bottom: 4px;">${params[0].axisValue}</div>`;
          params.forEach((p: any) => {
            res += `<div style="display: flex; align-items: center; gap: 8px; font-size: 12px;">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background-color:${p.color};"></span>
              <span style="flex: 1;">${p.seriesName}:</span>
              <span style="font-weight: 700;">${p.value}</span>
              <span style="color: #64748b; font-size: 10px;">(${p.data.pct}%)</span>
            </div>`;
          });
          return res;
        }
      },
      legend: {
        bottom: 0,
        icon: "circle",
        textStyle: { color: "rgba(100,116,139,0.8)", fontSize: 11 },
      },
      grid: {
        left: 8,
        right: 8,
        top: 12,
        bottom: 40,
        containLabel: true,
      },
      xAxis: {
        type: "category",
        data: periods,
        axisLine: { lineStyle: { color: "rgba(100,116,139,0.4)" } },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        name: "Analysts",
        nameTextStyle: { fontSize: 10, color: "#64748b" },
        axisLine: { show: false },
        splitLine: { lineStyle: { color: "rgba(100,116,139,0.1)" } },
      },
      series: [
        createSeries("Strong Sell", "strongSell", "#ef4444"),        
        createSeries("Sell", "sell", "#f87171"),
        createSeries("Hold", "hold", "#eab308"),
        createSeries("Buy", "buy", "#4ade80"),
        createSeries("Strong Buy", "strongBuy", "#22c55e"),
      ],
    };
  }, [data]);

  if (loading && !data) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="text-sm text-muted-foreground">Loading analyst ratings…</div>
      </div>
    );
  }

  if (!data || !data.ok) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="text-sm font-semibold text-foreground">Analyst Ratings</div>
        <div className="mt-2 text-sm text-muted-foreground">
          {data && !data.ok ? data.error : "No data"}
        </div>
      </div>
    );
  }

  const c = data.latest.counts;

  // Determine max bucket to highlight below the gauge
  const buckets: Array<{ key: Bucket; value: number }> = [
    { key: "Strong Sell", value: c.strongSell },
    { key: "Sell", value: c.sell },
    { key: "Hold", value: c.hold },
    { key: "Buy", value: c.buy },
    { key: "Strong Buy", value: c.strongBuy },
  ];
  const maxVal = Math.max(...buckets.map((b) => b.value));
  const maxKey = buckets.find((b) => b.value === maxVal)?.key ?? data.latest.dominant.bucket;

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-foreground">Analyst Ratings</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Based on Finnhub recommendation trends
          </div>
        </div>
        <div className="flex items-center gap-2">
         <div className="flex items-center gap-2">
          <button
            onClick={() => setView("gauge")}
            className={`rounded-md px-2 py-1 text-xs font-medium ${
              view === "gauge"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            Gauge
          </button>

          <button
            onClick={() => setView("bars")}
            className={`rounded-md px-2 py-1 text-xs font-medium ${
              view === "bars"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            Bars
          </button>
        </div>
        </div>
      </div>

<div className="mt-4">
  {view === "gauge" ? (
    <>
      {/* Gauge */}
      <ReactECharts
  key="analyst-gauge"
  option={gaugeOption as any}
  style={{ height: 260, width: "100%" }}
  opts={{ renderer: "canvas" }}
/>

      {/* Bucket cards */}
      <div className="mt-2 grid grid-cols-5 gap-2">
        {buckets.map((b) => {
          const isMax = b.key === maxKey;
          return (
            <div
              key={b.key}
              className={`rounded-xl border p-3 text-center ${
                isMax ? "border-foreground/20 bg-foreground/5" : "border-border"
              }`}
            >
              <div className={`text-[11px] font-semibold ${bucketColor(b.key)}`}>
                {b.key}
              </div>
              <div className="mt-1 text-lg font-semibold text-foreground">
                {b.value}
              </div>
            </div>
          );
        })}
      </div>

      {/* Sparkline only in gauge view */}
      <div className="mt-4">
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">Sentiment trend (12m)</div>
          <div className="text-xs text-muted-foreground">
            Sentiment:{" "}
            <span className="font-semibold text-foreground">
              {data.latest.dominant.text}
            </span>
          </div>
        </div>

        <ReactECharts
          option={sparkOption as any}
          style={{ height: 56, width: "100%" }}
          opts={{ renderer: "canvas" }}
        />
      </div>
    </>
  ) : (
    <>
      {/* Bars ONLY */}
      <ReactECharts
  key="analyst-bars"
  option={stackedBarOption as any}
  style={{ height: 320, width: "100%" }}
  opts={{ renderer: "canvas" }}
/>

    </>
  )}
</div>

    </div>
  );
}
"use client";

import ReactECharts from "echarts-for-react";
import { useMemo, useState } from "react";

function fmtMoney(n: number, decimals = 2) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: decimals,
  }).format(n);
}

function fmtPct(n: number | null | undefined, decimals = 1) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(decimals)}%`;
}

function fmtMarketCap(n: number) {
  const abs = Math.abs(n);
  if (!Number.isFinite(n)) return "—";
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  return n.toFixed(0);
}

export default function ValuationBarChart(props: {
  fairValue: number;
  price: number;
  upsidePct: number;
  sharesOutstanding: number | null;
  marketCap: number | null;
}) {
  const { fairValue, price } = props;
  const upsidePct = Number.isFinite(props.upsidePct as any)
    ? (props.upsidePct as number)
    : 0;

  const diff = fairValue - price;
  const verdict =
    upsidePct > 15 ? "Undervalued" : upsidePct < -15 ? "Overvalued" : "Fair";

  const [mode, setMode] = useState<"price" | "mcap">("price");

  const fairMarketCap =
    props.sharesOutstanding != null
      ? fairValue * props.sharesOutstanding
      : null;

  const canShowMcap = props.marketCap != null && fairMarketCap != null;

  const { labels, values, isMcap, axisMax } = useMemo(() => {
    const isMcap = mode === "mcap";

    const labels = isMcap
      ? ["Current Market Cap", "Fair Value Market Cap"]
      : ["Current Price", "DCF Fair Value"];

    const values = isMcap
      ? [props.marketCap ?? 0, fairMarketCap ?? 0]
      : [price, fairValue];

    const maxVal = Math.max(...values);
    const axisMax = maxVal > 0 ? maxVal * 1.15 : 1;

    return { labels, values, isMcap, axisMax };
  }, [mode, props.marketCap, fairMarketCap, price, fairValue]);

  const option = useMemo(() => {
    return {
      grid: { left: 16, right: 16, top: 10, bottom: 10, containLabel: true },
      xAxis: {
        type: "value",
        min: 0,
        max: axisMax,
        axisLabel: {
          formatter: (v: number) => (isMcap ? fmtMarketCap(v) : fmtMoney(v, 0)),
        },
        splitLine: { show: true },
      },
      yAxis: {
        type: "category",
        data: labels,
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { fontSize: 12 },
      },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params: any) => {
          const p0 = params?.[0];
          if (!p0) return "";
          const name = p0.name;
          const val = Number(p0.value);

          const display = isMcap ? fmtMarketCap(val) : fmtMoney(val);

          return `
            <div style="font-size:12px;line-height:1.4">
              <div><b>${name}</b></div>
              <div>${display}${isMcap ? "" : ""}</div>
            </div>
          `;
        },
      },
      series: [
        {
          type: "bar",
          barWidth: 22,
          data: values.map((v) => ({ value: v })),
          itemStyle: { borderRadius: [8, 8, 8, 8] },
          label: {
            show: true,
            position: "right",
            formatter: (p: any) => {
              const v = Number(p.value);
              return isMcap ? fmtMarketCap(v) : fmtMoney(v);
            },
            fontWeight: 600,
          },
        },
      ],
    };
  }, [axisMax, isMcap, labels, values]);

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-muted-foreground">Valuation</div>
          <div className="text-xl font-semibold text-foreground">
            DCF Valuation
          </div>

          <div className="mt-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{verdict}</span>
            <span className="mx-2">•</span>
            <span>
              {diff >= 0 ? "+" : ""}
              {fmtMoney(diff, 2)} ({fmtPct(upsidePct)})
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          {/* subtle badge */}
          <div
            className={[
              "rounded-full border px-3 py-1 text-sm font-semibold",
              upsidePct >= 0
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-red-200 bg-red-50 text-red-700",
            ].join(" ")}
            title="(Fair Value − Price) / Price"
          >
            {fmtPct(upsidePct)}
          </div>

          {/* mode toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMode("price")}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                mode === "price"
                  ? "border-foreground/20 bg-foreground/5 text-foreground"
                  : "border-border text-muted-foreground"
              }`}
            >
              Price
            </button>
            <button
              onClick={() => setMode("mcap")}
              disabled={!canShowMcap}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                mode === "mcap"
                  ? "border-foreground/20 bg-foreground/5 text-foreground"
                  : "border-border text-muted-foreground"
              } ${!canShowMcap ? "opacity-50 cursor-not-allowed" : ""}`}
              title={
                !canShowMcap
                  ? "Market cap view requires marketCap + shares outstanding"
                  : ""
              }
            >
              Market Cap
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <ReactECharts option={option} style={{ height: 200, width: "100%" }} />
      </div>

      {mode === "mcap" && (
        <div className="mt-2 text-xs text-muted-foreground">
          Fair value market cap = fair value per share × shares outstanding.
        </div>
      )}
    </div>
  );
}
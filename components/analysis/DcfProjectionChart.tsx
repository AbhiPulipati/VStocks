"use client";

import { useMemo } from "react";
import ReactECharts from "echarts-for-react";

type HistoricalRow = {
  year: number;
  revenue: number;
  operatingIncome: number;
  fcf: number;
};

type ForecastRow = {
  year: number;
  revenue: number;
  operatingIncome: number;
  fcf: number;
};

function fmtCompact(n: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(n);
}

export default function DcfProjectionsChart(props: {
  historical: HistoricalRow[];
  forecast: ForecastRow[];
  terminalGrowthPct: number;
  height?: number;
}) {
  const { historical, forecast, terminalGrowthPct, height = 320 } = props;

  const option = useMemo(() => {
    const hist = (historical ?? []).slice().sort((a, b) => a.year - b.year);
    const fc = (forecast ?? []).slice().sort((a, b) => a.year - b.year);

    const lastFc = fc[fc.length - 1];
    const tg = (terminalGrowthPct ?? 0) / 100;

    // Add a "Terminal" point for display (1 extra step grown at terminal growth)
    const terminalPoint = lastFc
      ? {
          revenue: lastFc.revenue * (1 + tg),
          operatingIncome: lastFc.operatingIncome * (1 + tg),
          fcf: lastFc.fcf * (1 + tg),
        }
      : null;

    // Build a single category axis: historical years + forecast years + Terminal
    const categories: string[] = [];
    const revenueData: any[] = [];
    const opIncomeData: any[] = [];
    const fcfData: any[] = [];

    const pushPoint = (
      label: string,
      p: { revenue: number; operatingIncome: number; fcf: number },
      isForecast: boolean
    ) => {
      categories.push(label);

      const style = isForecast
        ? {
            lineStyle: { type: "dotted", width: 2 },
            symbol: "circle",
            symbolSize: 8,
          }
        : {
            lineStyle: { type: "solid", width: 3 },
            symbol: "circle",
            symbolSize: 8,
          };

      revenueData.push({ value: p.revenue, ...style });
      opIncomeData.push({ value: p.operatingIncome, ...style });
      fcfData.push({ value: p.fcf, ...style });
    };

    for (const p of hist) pushPoint(String(p.year), p, false);
    for (const p of fc) pushPoint(String(p.year), p, true);
    if (terminalPoint) pushPoint("Terminal", terminalPoint, true);

    const firstForecastIndex = hist.length; // where forecast begins on the axis

    return {
      animation: false,
      grid: { left: 16, right: 16, top: 16, bottom: 28, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "line" },
        formatter: (params: any) => {
          const title = params?.[0]?.axisValueLabel ?? "";
          const rows = (params ?? [])
            .map((p: any) => {
              const v = Number(p.data?.value ?? p.value);
              return `<div style="display:flex;justify-content:space-between;gap:16px"><span>${p.seriesName}</span><b>${fmtCompact(
                v
              )}</b></div>`;
            })
            .join("");

          return `<div style="font-size:12px;line-height:1.45;min-width:180px"><div style="margin-bottom:6px"><b>${title}</b></div>${rows}</div>`;
        },
      },
      xAxis: {
        type: "category",
        data: categories,
        boundaryGap: false,
        axisTick: { show: false },
        axisLine: { show: false },
      },
      yAxis: {
        type: "value",
        axisLabel: { formatter: (v: number) => fmtCompact(v) },
        splitLine: { show: true },
      },
      // Subtle shaded forecast region
      graphic:
        firstForecastIndex > 0
          ? [
              {
                type: "rect",
                left: `${
                  (firstForecastIndex / Math.max(1, categories.length - 1)) * 100
                }%`,
                top: 0,
                bottom: 0,
                right: 0,
                silent: true,
                style: { fill: "rgba(148,163,184,0.10)" },
              },
            ]
          : [],
      series: [
        { name: "Revenue", type: "line", smooth: true, data: revenueData, showSymbol: true },
        { name: "Operating Income", type: "line", smooth: true, data: opIncomeData, showSymbol: true },
        { name: "FCF", type: "line", smooth: true, data: fcfData, showSymbol: true },
      ],
    };
  }, [historical, forecast, terminalGrowthPct]);

  return (
    <ReactECharts
      option={option}
      style={{ height, width: "100%" }}
      opts={{ renderer: "canvas" }}
    />
  );
}
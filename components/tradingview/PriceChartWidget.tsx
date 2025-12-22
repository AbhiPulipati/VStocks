"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  symbol: string; // e.g. "NASDAQ:AAPL"
  height?: number; // widget height in px
  title?: string; // NEW: lets us render the header inside the client component
};

export default function SymbolOverviewWidget({
  symbol,
  height = 420,
  title = "Price Trend",
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [showVolume, setShowVolume] = useState(false);
  const [showMA, setShowMA] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    containerRef.current.innerHTML = "";

    const script = document.createElement("script");
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-symbol-overview.js";
    script.type = "text/javascript";
    script.async = true;

    const config = {
      lineWidth: 2,
      lineType: 0,
      chartType: "area",

      colorTheme: "light",
      isTransparent: false,

      locale: "en",
      chartOnly: false,
      scalePosition: "right",
      scaleMode: "Normal",

      fontFamily:
        "-apple-system, BlinkMacSystemFont, Trebuchet MS, Roboto, Ubuntu, sans-serif",
      fontSize: "10",
      headerFontSize: "medium",

      valuesTracking: "1",
      changeMode: "price-and-percent",

      fontColor: "rgb(106, 109, 120)",
      gridLineColor: "rgba(255, 255, 255, 0.06)",
      backgroundColor: "#ffffff",
      widgetFontColor: "#0F0F0F",
      upColor: "#22ab94",
      downColor: "#f7525f",
      borderUpColor: "#22ab94",
      borderDownColor: "#f7525f",
      wickUpColor: "#22ab94",
      wickDownColor: "#f7525f",
      volumeUpColor: "rgba(34, 171, 148, 0.5)",
      volumeDownColor: "rgba(247, 82, 95, 0.5)",

      autosize: false,
      width: "100%",
      height,

      dateFormat: "MMM dd, yyyy",
      timeHoursFormat: "12-hours",
      noTimeScale: false,

      dateRanges: ["1d|1", "1m|30", "3m|60", "12m|1D", "60m|1W", "ytd|1D", "all|1M"],

      hideDateRanges: false,
      hideMarketStatus: true,
      hideSymbolLogo: true,

      showVolume,
      showMA,

      symbols: [[symbol]],
    };

    script.innerHTML = JSON.stringify(config);
    containerRef.current.appendChild(script);

    return () => {
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, [symbol, height, showVolume, showMA]);

  return (
    <div className="w-full">
      {/* Header row: Title left, Toggles right (aligned) */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-black leading-none">{title}</h2>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowVolume((v) => !v)}
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition
              ${
                showVolume
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            aria-pressed={showVolume}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                showVolume ? "bg-white" : "bg-gray-300"
              }`}
            />
            Volume
          </button>

          <button
            type="button"
            onClick={() => setShowMA((v) => !v)}
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition
              ${
                showMA
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            aria-pressed={showMA}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                showMA ? "bg-white" : "bg-gray-300"
              }`}
            />
            MA
          </button>
        </div>
      </div>

      <div ref={containerRef} className="w-full" />
    </div>
  );
}
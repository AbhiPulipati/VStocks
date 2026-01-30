"use client";

import { useEffect, useRef } from "react";

type Props = {
  height?: number;
};

export default function TickerTape({ height = 46 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    containerRef.current.innerHTML = "";

    const script = document.createElement("script");
    script.type = "module";
    script.src = "https://widgets.tradingview-widget.com/w/en/tv-ticker-tape.js";
    script.async = true;
    containerRef.current.appendChild(script);

    const ticker = document.createElement("tv-ticker-tape");
    ticker.setAttribute(
      "symbols",
      "FOREXCOM:SPXUSD,FOREXCOM:NSXUSD,FOREXCOM:DJI,FX:EURUSD,BITSTAMP:BTCUSD,BITSTAMP:ETHUSD,CMCMARKETS:GOLD,AAPL,MSFT,AMZN,NVDA,GOOGL,TSLA,BRK.B,META,UNH,JPM,V,JNJ,PG,DIS,XOM"
    );
    ticker.setAttribute("line-chart-type", "Baseline");
    ticker.setAttribute("item-size", "compact");
    ticker.setAttribute("theme", "dark");
    ticker.setAttribute("scroll-speed", "5"); // default is 2, increase to 3–5 for faster
    ticker.style.height = `${height}px`;
    ticker.style.display = "block";

    containerRef.current.appendChild(ticker);

    return () => {
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, [height]); // ✅ always stable

  return <div ref={containerRef} className="w-full" />;
}

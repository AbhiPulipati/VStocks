"use client";

import { useState, useEffect } from "react";
import { 
  getPriorityValue, 
  getRatioGrade, 
  RatioConfig 
} from "../../lib/finnhub/ratiosConfig";

interface RatioCardProps {
  ratio: RatioConfig;
  data: Record<string, number>;
  isUniversal: boolean;
  showIndicators: boolean;
}

export function RatioCard({ ratio, data, isUniversal, showIndicators }: RatioCardProps) {
  const [selectedKey, setSelectedKey] = useState("");

  useEffect(() => {
    const best = getPriorityValue(ratio.variants, data);
    setSelectedKey(best?.key || "");
  }, [data, ratio]);

  const value = data[selectedKey];
  
  const grade = (showIndicators && isUniversal && ratio.benchmarkable) 
    ? getRatioGrade(value, ratio.benchmark) 
    : "neutral";

  const colorMap: Record<string, string> = {
    strong: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
    neutral: "text-amber-500 bg-amber-500/10 border-amber-500/20",
    weak: "text-red-500 bg-red-500/10 border-red-500/20",
  };

  return (
    <div className="rounded-xl border border-border bg-background p-4 flex flex-col justify-between min-h-[140px]">
      <div>
        <div className="flex justify-between items-start gap-2">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider truncate">
            {ratio.label}
          </span>
          {showIndicators && isUniversal && ratio.benchmarkable && value !== undefined && (
            <span className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase border ${colorMap[grade]}`}>
              {grade}
            </span>
          )}
        </div>
        
        <div className="mt-2 text-2xl font-semibold text-foreground">
          {value !== undefined ? (
            <>
              {value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              {ratio.id.toLowerCase().includes("growth") || ratio.id.toLowerCase().includes("margin") ? "%" : ""}
            </>
          ) : (
            <span className="text-muted-foreground/30">—</span>
          )}
        </div>
        
        <div className="mt-2 border-t border-border/50 pt-2">
          <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">
            {ratio.description}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="text-[9px] text-muted-foreground/50">
          {showIndicators && isUniversal && ratio.benchmark?.green && (
             `Target: >${Array.isArray(ratio.benchmark.green) ? ratio.benchmark.green[0] : ratio.benchmark.green}`
          )}
        </div>
        {ratio.variants && ratio.variants.length > 1 && (
          <select 
            value={selectedKey} 
            onChange={(e) => setSelectedKey(e.target.value)}
            className="bg-muted text-[10px] font-medium px-1.5 py-0.5 rounded hover:bg-secondary cursor-pointer outline-none border-none"
          >
            {ratio.variants.map((v) => (
              <option key={v.key} value={v.key}>{v.label}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, RotateCcw, Info, Eye, EyeOff } from "lucide-react";
import { 
  ratioCategories, 
  getPriorityValue, 
  getRatioGrade 
} from "../../lib/finnhub/ratiosConfig";
import { RatioCard } from "./RatioCard"; 

export default function RatiosSection({ ticker }: { ticker: string }) {
  const [data, setData] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [showIndicators, setShowIndicators] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/analysis/ratios?ticker=${encodeURIComponent(ticker)}`);
        const json = await res.json();
        if (alive && json?.ok) setData(json.metrics);
      } catch {
        if (alive) setData({});
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [ticker]);

  const toggleCategory = (id: string) => {
    setExpanded(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const getCategoryHealth = (cat: any) => {
    const results = cat.ratios
      .filter((r: any) => r.benchmarkable)
      .map((r: any) => {
        const bestVariant = getPriorityValue(r.variants, data);
        const val = data[bestVariant.key];
        return getRatioGrade(val, r.benchmark);
      });
    
    return {
      strong: results.filter((r: any) => r === "strong").length,
      neutral: results.filter((r: any) => r === "neutral").length,
      weak: results.filter((r: any) => r === "weak").length,
    };
  };

  if (loading && Object.keys(data).length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <div className="animate-pulse text-sm text-muted-foreground">Analyzing company ratios...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header Section */}
      <div className="flex items-center justify-between px-1">
        <div>
          <h2 className="text-xl font-bold text-foreground">Financial Ratios</h2>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowIndicators(!showIndicators)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium transition-all border ${
              showIndicators 
                ? "bg-background border-border text-muted-foreground hover:text-foreground" 
                : "bg-primary/10 border-primary/20 text-primary hover:bg-primary/20"
            }`}
          >
            {showIndicators ? <EyeOff size={12} /> : <Eye size={12} />}
            {showIndicators ? "Disable Indicators" : "Enable Indicators"}
          </button>

          <button 
            onClick={() => setExpanded([])}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-secondary text-[11px] font-medium hover:bg-secondary/80 transition-colors"
          >
            <RotateCcw size={12} /> Reset View
          </button>
        </div>
      </div>

      {/* Accordion Categories */}
      <div className="space-y-2">
        {ratioCategories.map((cat) => {
          const isExpanded = expanded.includes(cat.id);
          const health = getCategoryHealth(cat);
          const hasData = cat.ratios.some((r: any) => data[r.variants?.[0]?.key] !== undefined);

          return (
            <div key={cat.id} className="group border border-border rounded-xl bg-card overflow-hidden transition-all">
              <button 
                onClick={() => toggleCategory(cat.id)}
                className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`p-1 rounded-md transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                    <ChevronRight size={16} className="text-muted-foreground" />
                  </div>
                  <div className="text-left">
                    <span className="text-sm font-bold block">{cat.label}</span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-tight">
                      {cat.ratios.length} metrics
                    </span>
                  </div>
                </div>

                {!isExpanded && cat.universal && hasData && showIndicators && (
                    <div className="flex gap-4 text-[12px] font-black mr-2">
                        <span className="flex items-center gap-1.5 text-emerald-500">
                        {/* Increased dot size to h-2 w-2 */}
                        <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" /> 
                        {health.strong}
                        </span>
                        <span className="flex items-center gap-1.5 text-amber-500">
                        <span className="h-2 w-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" /> 
                        {health.neutral}
                        </span>
                        <span className="flex items-center gap-1.5 text-red-500">
                        <span className="h-2 w-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" /> 
                        {health.weak}
                        </span>
                    </div>
                    )}
              </button>

              {isExpanded && (
                <div className="p-4 pt-2 border-t border-border/40 bg-muted/10">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {cat.ratios.map((ratio: any) => (
                      <RatioCard 
                        key={ratio.id} 
                        ratio={ratio} 
                        data={data} 
                        isUniversal={cat.universal} 
                        showIndicators={showIndicators}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Conditional Disclaimer - only renders if indicators are on */}
      {showIndicators && (
        <div className="flex items-center gap-2 px-2 py-3 rounded-lg bg-blue-500/5 border border-blue-500/10 transition-all">
          <Info size={14} className="text-blue-500 shrink-0" />
          <p className="text-[10px] text-muted-foreground italic">
            Benchmarks are general financial guidelines and may not reflect industry-specific norms.
          </p>
        </div>
      )}
    </div>
  );
}
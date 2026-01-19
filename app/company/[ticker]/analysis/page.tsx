import ValuationSection from "@/components/analysis/ValuationSection";
import AnalystRatingsSection from "@/components/analysis/AnalystRatingsSection";

function EpsTrendPlaceholder() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="text-sm font-semibold text-foreground">EPS Trend</div>
      <div className="mt-1 text-xs text-muted-foreground">
        Placeholder — coming soon
      </div>

      <div className="mt-4 h-[260px] rounded-xl border border-dashed border-border flex items-center justify-center">
        <div className="text-sm text-muted-foreground">EPS trend chart placeholder</div>
      </div>
    </div>
  );
}

export default async function AnalysisPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = await params;
  const T = ticker.toUpperCase();

  return (
    <div className="p-4 space-y-4">
      {/* Top row: two half-width blocks */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AnalystRatingsSection ticker={T} />
        <EpsTrendPlaceholder />
      </div>

      {/* Rest of analysis */}
      <ValuationSection ticker={T} />
    </div>
  );
}
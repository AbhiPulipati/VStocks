import ValuationSection from "@/components/analysis/ValuationSection";
import AnalystRatingsSection from "@/components/analysis/AnalystRatingsSection";
import EPSTrendSection from "@/components/analysis/EPSTrendChart";
import RatiosSection from "@/components/analysis/RatiosSection";

export default async function AnalysisPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = await params;
  const T = ticker.toUpperCase();

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AnalystRatingsSection ticker={T} />
        <EPSTrendSection ticker={T} />
      </div>
      <ValuationSection ticker={T} />
      <RatiosSection ticker={T} />
    </div>
  );
}

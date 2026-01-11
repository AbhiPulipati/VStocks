import ValuationSection from "@/components/analysis/ValuationSection";

export default async function AnalysisPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = await params;

  return (
    <div className="p-4">
      <ValuationSection ticker={ticker.toUpperCase()} />
    </div>
  );
}
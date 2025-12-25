import FinancialsTester from "@/components/financials/FinancialsTester";

export default async function FinancialsPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = await params;

  return (
    <div className="p-4">
      <FinancialsTester ticker={ticker.toUpperCase()} />
    </div>
  );
}

import CompanySidebar from "@/components/ui/layout/sidebar";

export default async function CompanyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ ticker: string }>;
}) {
  const { ticker: rawTicker } = await params;
  const ticker = String(rawTicker ?? "").trim().toUpperCase();

  return (
    <div className="flex min-h-screen">
      {/* Left rail sidebar */}
      <CompanySidebar ticker={ticker} />

      {/* Main content */}
      <main className="flex-1 px-6 py-6 bg-gray-50">
        {children}
      </main>
    </div>
  );
}

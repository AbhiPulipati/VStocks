import Link from "next/link";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";

export default function Home() {
  const features = [
    {
      title: "Basic Information",
      description: "Stock price, company overview, and key metrics",
    },
    {
      title: "Financial Statements",
      description: "Income statement, balance sheet, and cash flow",
    },
    {
      title: "Financial Ratios",
      description: "Profitability, liquidity, and efficiency ratios",
    },
    {
      title: "Company Analysis",
      description: "Valuation, growth potential, and analyst insights",
    },
  ];

  const popularStocks = [
    { ticker: "AAPL", name: "Apple", logo: "/apple-logo.png" },
    { ticker: "MSFT", name: "Microsoft", logo: "/microsoft-logo.png" },
    { ticker: "GOOGL", name: "Alphabet", logo: "/google-logo.png" },
    { ticker: "AMZN", name: "Amazon", logo: "/amazon-logo.png" },
    { ticker: "TSLA", name: "Tesla", logo: "/tesla-logo.png" },
    { ticker: "META", name: "Meta", logo: "/meta-logo.png" },
    { ticker: "NVDA", name: "NVIDIA", logo: "/nvidia-logo.png" },
    { ticker: "BRK-B", name: "Berkshire Hathaway", logo: "/berkshire-logo.png" },
  ];

  return (
    <main className="flex flex-col items-center justify-start min-h-screen p-8 bg-white">
      {/* Hero Section */}
      <section className="text-center max-w-2xl mb-12">
        <h1 className="text-5xl font-bold mb-4 text-black">VStocks</h1>
        <p className="text-lg text-gray-700">
          Get a clear, beginner-friendly analysis of any public company with visual financial data and easy-to-understand summaries.
        </p>
      </section>

      {/* Features Grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 w-full max-w-6xl mb-16">
        {features.map((feature) => (
          <Card key={feature.title}>
            <CardContent className="p-6 flex flex-col items-center text-center">
              <h2 className="text-xl font-semibold text-black mb-2">{feature.title}</h2>
              <p className="text-gray-600">{feature.description}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* Popular Stocks Section */}
      <section className="w-full max-w-5xl mb-8">
        <h2 className="text-2xl font-semibold mb-6 text-center text-black">
          Try searching for popular stocks:
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-4 lg:grid-cols-8 gap-4 justify-center">
          {popularStocks.map((stock) => (
            <Link key={stock.ticker} href={`/company/${stock.ticker}`}>
              <Card className="hover:shadow-lg transition cursor-pointer h-36">
                <CardContent className="flex flex-col items-center justify-center p-4 h-full">
                  {/* Fixed-height container for logo */}
                  <div className="h-16 flex items-center justify-center">
                    <Image
                      src={stock.logo}
                      alt={`${stock.name} logo`}
                      width={48}
                      height={48}
                      className="object-contain"/>
                  </div>
                  {/* Ticker aligned consistently below */}
                  <p className={`font-medium text-black mt-2 ${stock.ticker === "NVDA" ? "mt-6" : stock.ticker === "BRK-B" ? "mt-10" : ""}`}>
                    {stock.ticker}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

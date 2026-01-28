// ratiosConfig.ts

export interface RatioVariant {
  key: string; 
  label: string; 
}

export interface RatioConfig {
  id: string;
  label: string;
  description: string;
  variants: RatioVariant[]; // Standardized to be required
  benchmark?: {
    green: number | [number, number] | Array<[number, number]>;
    yellow: number | [number, number] | Array<[number, number]>;
    red: number | [number, number] | Array<[number, number]>;
    note?: string;
  };
  benchmarkable?: boolean;
}

export interface RatioCategory {
  id: string;
  label: string;
  universal: boolean;
  ratios: RatioConfig[];
}

// --- HELPER FUNCTIONS ---

/**
 * Logic for Priority: TTM -> Quarterly -> Annual
 */
export const getPriorityValue = (variants: RatioVariant[], data: Record<string, number>): RatioVariant => {
  const priorityOrder = ["TTM", "Quarterly", "Annual"];
  
  for (const label of priorityOrder) {
    const variant = variants.find(v => v.label.includes(label));
    if (variant && data[variant.key] !== undefined) {
      return variant;
    }
  }
  return variants[0]; // Fallback to first variant if no priority matches found
};

/**
 * Grading logic to determine health status
 */
export const getRatioGrade = (value: number | undefined, benchmark: RatioConfig["benchmark"]) => {
  if (value === undefined || !benchmark) return "neutral";
  
  const check = (val: number, range: any): boolean => {
    if (Array.isArray(range)) {
      // Handle nested arrays for complex benchmarks like Payout Ratio
      if (Array.isArray(range[0])) {
        return range.some((subRange: [number, number]) => val >= subRange[0] && val <= subRange[1]);
      }
      // Handle simple [min, max]
      return val >= range[0] && val <= range[1];
    }
    // Handle single number (assumes "higher is better" for simplicity)
    return val >= range;
  };

  if (check(value, benchmark.green)) return "strong";
  if (check(value, benchmark.yellow)) return "neutral";
  return "weak";
};

// -------------------------
// Full ratio configuration
// -------------------------

export const ratioCategories: RatioCategory[] = [
  {
    id: "valuation",
    label: "Valuation",
    universal: true,
    ratios: [
      {
        id: "pe",
        label: "P/E Ratio",
        description:
          "Price-to-Earnings ratio. Shows how much investors pay per $1 of earnings. Context-dependent.",
        variants: [
          { key: "peTTM", label: "TTM" },
          { key: "peAnnual", label: "Annual" },
          { key: "forwardPE", label: "Forward" },
        ],
        benchmarkable: false,
      },
      {
        id: "peg",
        label: "PEG Ratio",
        description:
          "Price/Earnings-to-Growth ratio. Shows valuation adjusted for growth rate.",
        variants: [{ key: "pegTTM", label: "TTM" }],
        benchmarkable: false,
      },
      {
        id: "ps",
        label: "Price to Sales",
        description: "Shows how much investors pay per $1 of revenue.",
        variants: [{ key: "psTTM", label: "TTM" }, { key: "psAnnual", label: "Annual" }],
        benchmarkable: false,
      },
      {
        id: "pb",
        label: "Price to Book",
        description: "Shows how much investors pay per $1 of book value.",
        variants: [{ key: "pb", label: "Current" }],
        benchmarkable: false,
      },
      {
        id: "evEbitda",
        label: "EV / EBITDA",
        description: "Enterprise Value divided by EBITDA.",
        variants: [{ key: "evEbitdaTTM", label: "TTM" }],
        benchmarkable: false,
      },
      {
        id: "evRevenue",
        label: "EV / Revenue",
        description: "Enterprise Value divided by Revenue.",
        variants: [{ key: "evRevenueTTM", label: "TTM" }],
        benchmarkable: false,
      },
      {
        id: "evFreeCashFlow",
        label: "EV / Free Cash Flow",
        description:
          "Enterprise Value divided by Free Cash Flow. Informational only.",
        variants: [{ key: "currentEv/freeCashFlowTTM", label: "TTM" }],
        benchmarkable: false,
      },
    ],
  },
  {
    id: "profitability",
    label: "Profitability",
    universal: true,
    ratios: [
      {
        id: "grossMargin",
        label: "Gross Margin",
        description: "Gross profit divided by revenue.",
        variants: [
          { key: "grossMarginTTM", label: "TTM" },
          { key: "grossMarginAnnual", label: "Annual" },
          { key: "grossMargin5Y", label: "5Y Avg" },
        ],
        benchmarkable: true,
        benchmark: {
          green: 40,
          yellow: [20, 40],
          red: 20,
          note: "Margins vary by industry. These are conservative thresholds.",
        },
      },
      {
        id: "operatingMargin",
        label: "Operating Margin",
        description: "Operating income divided by revenue.",
        variants: [
          { key: "operatingMarginTTM", label: "TTM" },
          { key: "operatingMarginAnnual", label: "Annual" },
          { key: "operatingMargin5Y", label: "5Y Avg" },
        ],
        benchmarkable: true,
        benchmark: { green: 20, yellow: [10, 20], red: 10 },
      },
      {
        id: "netMargin",
        label: "Net Profit Margin",
        description: "Net income divided by revenue.",
        variants: [
          { key: "netProfitMarginTTM", label: "TTM" },
          { key: "netProfitMarginAnnual", label: "Annual" },
          { key: "netProfitMargin5Y", label: "5Y Avg" },
        ],
        benchmarkable: true,
        benchmark: { green: 15, yellow: [5, 15], red: 5 },
      },
      {
        id: "roe",
        label: "Return on Equity (ROE)",
        description: "Net income divided by shareholders' equity.",
        variants: [
          { key: "roeTTM", label: "TTM" },
          { key: "roeRfy", label: "Recent Fiscal Year" },
          { key: "roe5Y", label: "5Y Avg" },
        ],
        benchmarkable: true,
        benchmark: { green: 15, yellow: [8, 15], red: 8 },
      },
      {
        id: "roa",
        label: "Return on Assets (ROA)",
        description: "Net income divided by total assets.",
        variants: [
          { key: "roaTTM", label: "TTM" },
          { key: "roaRfy", label: "Recent Fiscal Year" },
          { key: "roa5Y", label: "5Y Avg" },
        ],
        benchmarkable: true,
        benchmark: { green: 10, yellow: [5, 10], red: 5 },
      },
      {
        id: "roi",
        label: "Return on Investment (ROI)",
        description: "Measures efficiency of invested capital.",
        variants: [
          { key: "roiTTM", label: "TTM" },
          { key: "roiAnnual", label: "Annual" },
          { key: "roi5Y", label: "5Y Avg" },
        ],
        benchmarkable: true,
        benchmark: { green: 10, yellow: [5, 10], red: 5 },
      },
    ],
  },
  {
    id: "liquidity",
    label: "Liquidity & Leverage",
    universal: true,
    ratios: [
      {
        id: "currentRatio",
        label: "Current Ratio",
        description: "Current assets divided by current liabilities.",
        variants: [
          { key: "currentRatioTTM", label: "TTM" },
          { key: "currentRatioAnnual", label: "Annual" },
          { key: "currentRatioQuarterly", label: "Quarterly" },
        ],
        benchmarkable: true,
        benchmark: { green: 1.5, yellow: [1, 1.5], red: 1 },
      },
      {
        id: "quickRatio",
        label: "Quick Ratio",
        description:
          "Current assets minus inventories divided by current liabilities.",
        variants: [
          { key: "quickRatioTTM", label: "TTM" },
          { key: "quickRatioAnnual", label: "Annual" },
          { key: "quickRatioQuarterly", label: "Quarterly" },
        ],
        benchmarkable: true,
        benchmark: { green: 1, yellow: [0.7, 1], red: 0.7 },
      },
      {
        id: "totalDebtEquity",
        label: "Total Debt / Equity",
        description: "Measures financial leverage.",
        variants: [
          { key: "totalDebt/totalEquityTTM", label: "TTM" },
          { key: "totalDebt/totalEquityAnnual", label: "Annual" },
          { key: "totalDebt/totalEquityQuarterly", label: "Quarterly" },
        ],
        benchmarkable: true,
        benchmark: { green: 1, yellow: [1, 2], red: 2 },
      },
      {
        id: "longTermDebtEquity",
        label: "Long-Term Debt / Equity",
        description: "Long-term debt relative to equity.",
        variants: [
          { key: "longTermDebt/equityTTM", label: "TTM" },
          { key: "longTermDebt/equityAnnual", label: "Annual" },
          { key: "longTermDebt/equityQuarterly", label: "Quarterly" },
        ],
        benchmarkable: true,
        benchmark: { green: 0.5, yellow: [0.5, 1.5], red: 1.5 },
      },
      {
        id: "interestCoverage",
        label: "Interest Coverage",
        description:
          "EBIT divided by interest expense. Measures debt servicing ability.",
        variants: [
          { key: "netInterestCoverageTTM", label: "TTM" },
          { key: "netInterestCoverageAnnual", label: "Annual" },
        ],
        benchmarkable: true,
        benchmark: { green: 5, yellow: [2, 5], red: 2 },
      },
    ],
  },
  {
    id: "efficiency",
    label: "Efficiency",
    universal: true,
    ratios: [
      {
        id: "assetTurnover",
        label: "Asset Turnover",
        description: "Revenue divided by total assets.",
        variants: [
          { key: "assetTurnoverTTM", label: "TTM" },
          { key: "assetTurnoverAnnual", label: "Annual" },
        ],
        benchmarkable: true,
        benchmark: { green: 1, yellow: [0.5, 1], red: 0.5 },
      },
      {
        id: "receivablesTurnover",
        label: "Receivables Turnover",
        description: "Revenue divided by accounts receivable.",
        variants: [
          { key: "receivablesTurnoverTTM", label: "TTM" },
          { key: "receivablesTurnoverAnnual", label: "Annual" },
        ],
        benchmarkable: true,
        benchmark: { green: 10, yellow: [5, 10], red: 5 },
      },
    ],
  },
  {
    id: "growth",
    label: "Growth",
    universal: true,
    ratios: [
      {
        id: "revenueGrowth",
        label: "Revenue Growth",
        description: "Year-over-year revenue growth.",
        variants: [
          { key: "revenueGrowthTTMYoy", label: "TTM YoY" },
          { key: "revenueGrowthQuarterlyYoy", label: "Quarterly YoY" },
          { key: "revenueGrowth3Y", label: "3Y CAGR" },
          { key: "revenueGrowth5Y", label: "5Y CAGR" },
        ],
        benchmarkable: true,
        benchmark: { green: 10, yellow: [5, 10], red: 5 },
      },
      {
        id: "epsGrowth",
        label: "EPS Growth",
        description: "Year-over-year EPS growth.",
        variants: [
          { key: "epsGrowthTTMYoy", label: "TTM YoY" },
          { key: "epsGrowthQuarterlyYoy", label: "Quarterly YoY" },
          { key: "epsGrowth3Y", label: "3Y CAGR" },
          { key: "epsGrowth5Y", label: "5Y CAGR" },
        ],
        benchmarkable: true,
        benchmark: { green: 15, yellow: [5, 15], red: 5 },
      },
    ],
  },
  {
    id: "capitalReturns",
    label: "Capital Returns & Cash Flow",
    universal: true,
    ratios: [
      {
        id: "dividendYield",
        label: "Dividend Yield",
        description: "Annual dividend divided by stock price.",
        variants: [{ key: "currentDividendYieldTTM", label: "TTM" }],
        benchmarkable: true,
        benchmark: { green: 2, yellow: [0.5, 2], red: 0.5, note: "Only if dividend exists" },
      },
      {
        id: "payoutRatio",
        label: "Payout Ratio",
        description: "Percentage of earnings paid as dividends.",
        variants: [{ key: "payoutRatioTTM", label: "TTM" }, { key: "payoutRatioAnnual", label: "Annual" }],
        benchmarkable: true,
        benchmark: { green: [20, 60], yellow: [[5, 20], [60, 80]], red: [[0, 5], [80, 100]], note: "Only if dividend exists" },
      },
      {
        id: "cashFlowPerShare",
        label: "Cash Flow per Share",
        description: "Cash generated per share. Signal only, no grading.",
        variants: [
          { key: "cashFlowPerShareTTM", label: "TTM" },
          { key: "cashFlowPerShareAnnual", label: "Annual" },
          { key: "cashFlowPerShareQuarterly", label: "Quarterly" },
        ],
        benchmarkable: false,
      },
    ],
  },
  {
    id: "other",
    label: "Other Company-Specific Ratios",
    universal: false,
    ratios: [
      {
        id: "inventoryTurnover",
        label: "Inventory Turnover",
        description: "Revenue divided by inventory. Measures efficiency of inventory use.",
        variants: [
          { key: "inventoryTurnoverTTM", label: "TTM" },
          { key: "inventoryTurnoverAnnual", label: "Annual" },
        ],
        benchmarkable: true,
        benchmark: { green: 10, yellow: [5, 10], red: 5 },
      },
      {
        id: "revenuePerEmployee",
        label: "Revenue per Employee",
        description: "Revenue divided by total employees.",
        variants: [
          { key: "revenueEmployeeTTM", label: "TTM" },
          { key: "revenueEmployeeAnnual", label: "Annual" },
        ],
        benchmarkable: false,
      },
      {
        id: "netIncomePerEmployee",
        label: "Net Income per Employee",
        description: "Net income divided by total employees.",
        variants: [
          { key: "netIncomeEmployeeTTM", label: "TTM" },
          { key: "netIncomeEmployeeAnnual", label: "Annual" },
        ],
        benchmarkable: false,
      },
      {
        id: "bookValuePerShare",
        label: "Book Value per Share",
        description: "Book value per share of equity.",
        variants: [
          { key: "bookValuePerShareTTM", label: "TTM" },
          { key: "bookValuePerShareAnnual", label: "Annual" },
          { key: "bookValuePerShareQuarterly", label: "Quarterly" },
        ],
        benchmarkable: false,
      },
      {
        id: "tangibleBookValuePerShare",
        label: "Tangible Book Value per Share",
        description: "Book value excluding intangibles per share.",
        variants: [
          { key: "tangibleBookValuePerShareTTM", label: "TTM" },
          { key: "tangibleBookValuePerShareAnnual", label: "Annual" },
          { key: "tangibleBookValuePerShareQuarterly", label: "Quarterly" },
        ],
        benchmarkable: false,
      },
      {
        id: "capexCAGR5Y",
        label: "CapEx CAGR (5Y)",
        description: "Compound annual growth of capital expenditures over 5 years.",
        variants: [{ key: "capexCagr5Y", label: "5Y" }],
        benchmarkable: false,
      },
      {
        id: "ebitdaCAGR5Y",
        label: "EBITDA CAGR (5Y)",
        description: "Compound annual growth of EBITDA over 5 years.",
        variants: [{ key: "ebitdaCagr5Y", label: "5Y" }],
        benchmarkable: false,
      },
      {
        id: "epsGrowth3Y",
        label: "EPS Growth (3Y)",
        description: "EPS compound growth over 3 years.",
        variants: [{ key: "epsGrowth3Y", label: "3Y" }],
        benchmarkable: false,
      },
      {
        id: "epsGrowth5Y",
        label: "EPS Growth (5Y)",
        description: "EPS compound growth over 5 years.",
        variants: [{ key: "epsGrowth5Y", label: "5Y" }],
        benchmarkable: false,
      },
    ],
  },
];
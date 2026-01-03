// lib/financials/incomeStatementRows.ts

export type UnitScale = "thousands" | "millions" | "billions";

export type IncomeRow =
  | {
      id: string;
      label: string;
      type: "value";
      keys?: string[]; // optional now (if compute is used)
      compute?: (payload: Record<string, any>) => number | null; // ✅ allow computed value rows
      bold?: boolean;
      indent?: number;
      isExpense?: boolean;
    }
  | {
  id: string;
  label: string;
  type: "group";
  bold?: boolean;
  indent?: number;
  isExpense?: boolean; // ✅ allow forcing parentheses for group totals (like Operating Expenses)
  compute?: (payload: Record<string, any>) => number | null;
  children: IncomeRow[];
};

function pickFirstNumber(payload: Record<string, any>, keys: string[]) {
  for (const k of keys) {
    const v = payload?.[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

function sumNumbers(payload: Record<string, any>, keys: string[]) {
  let sum = 0;
  let found = false;
  for (const k of keys) {
    const v = payload?.[k];
    if (typeof v === "number" && Number.isFinite(v)) {
      sum += v;
      found = true;
    }
  }
  return found ? sum : null;
}

/**
 * Your Income Statement plan (AlphaVantage).
 * Expandable groups:
 * - Operating Expenses -> (R&D, SG&A)
 * - Other income/(expense), net -> netInterestIncome (and its parts), nonInterestIncome, otherNonOperatingIncome
 */
export const incomeStatementRows: IncomeRow[] = [
  {
    id: "totalRevenue",
    label: "Total Revenue",
    type: "value",
    keys: ["totalRevenue"],
    bold: true,
  },
  {
    id: "costOfRevenue",
    label: "Cost of Revenue",
    type: "value",
    keys: ["costOfRevenue", "costofGoodsAndServicesSold"],
    isExpense: true,
  },
  {
    id: "grossProfit",
    label: "Gross Profit",
    type: "value",
    keys: ["grossProfit"],
    bold: true,
  },

  {
    id: "operatingExpensesGroup",
    label: "Operating Expenses",
    type: "group",
    bold: true,
    isExpense: true, // ✅ force negative formatting
    // show the official AV total on the group row
    compute: (p) => pickFirstNumber(p, ["operatingExpenses"]),
    children: [
      {
        id: "researchAndDevelopment",
        label: "Research & Development",
        type: "value",
        keys: ["researchAndDevelopment"],
        indent: 1,
        isExpense: true,
      },
      {
        id: "sellingGeneralAndAdministrative_calc",
        label: "Selling, General & Administrative",
        type: "value",
        indent: 1,
        isExpense: true,
        compute: (p) => {
            const opEx = pickFirstNumber(p, ["operatingExpenses"]);
            const rd = pickFirstNumber(p, ["researchAndDevelopment"]);

            // If we don't have the two needed inputs, don't show a value
            if (opEx == null || rd == null) return null;

            return opEx - rd;
        },
        },
    ],
  },

  {
    id: "operatingIncome",
    label: "Operating Income",
    type: "value",
    keys: ["operatingIncome"],
    bold: true,
  },

{
  id: "otherIncomeGroup",
  label: "Other income/(expense), net",
  type: "group",
  bold: true,

  // ✅ Other income/(expense), net = Income Before Tax - Operating Income
  compute: (p) => {
    const ibt = pickFirstNumber(p, ["incomeBeforeTax"]);
    const op = pickFirstNumber(p, ["operatingIncome"]);
    if (ibt == null || op == null) return null;
    return ibt - op;
  },

  children: [
    {
      id: "netInterestIncomeGroup",
      label: "Net Interest Income",
      type: "group",
      indent: 1,
      compute: (p) => pickFirstNumber(p, ["netInterestIncome"]),
      children: [
        {
          id: "interestIncome",
          label: "Interest Income",
          type: "value",
          keys: ["interestIncome"],
          indent: 2,
        },
        {
          id: "interestExpense",
          label: "Interest Expense",
          type: "value",
          keys: ["interestExpense"],
          indent: 2,
          isExpense: true,
        },
      ],
    },

    // ✅ Other Non-Operating Income = (Income Before Tax - Operating Income) - Net Interest Income
    {
      id: "otherNonOperatingIncome_calc",
      label: "Other Non-Operating Income",
      type: "value",
      indent: 1,
      compute: (p) => {
        const ibt = pickFirstNumber(p, ["incomeBeforeTax"]);
        const op = pickFirstNumber(p, ["operatingIncome"]);
        if (ibt == null || op == null) return null;

        const otherNet = ibt - op;
        const netInt = pickFirstNumber(p, ["netInterestIncome"]) ?? 0;

        return otherNet - netInt;
      },
    },
  ],
},

  {
    id: "incomeBeforeTax",
    label: "Income Before Tax",
    type: "value",
    keys: ["incomeBeforeTax"],
    bold: true,
  },
  {
    id: "incomeTaxExpense",
    label: "Income Tax Expense",
    type: "value",
    keys: ["incomeTaxExpense"],
  },
  {
    id: "netIncomeFromContinuingOperations",
    label: "Net Income From Continuing Operations",
    type: "value",
    keys: ["netIncomeFromContinuingOperations"],
    bold: true,
  },

  {
    id: "netIncome",
    label: "Net Income",
    type: "value",
    keys: ["netIncome"],
    bold: true,
  },

  {
    id: "ebit",
    label: "EBIT",
    type: "value",
    keys: ["ebit"],
    bold: true,
  },
  {
    id: "ebitda",
    label: "EBITDA",
    type: "value",
    keys: ["ebitda"],
    bold: true,
  },
];
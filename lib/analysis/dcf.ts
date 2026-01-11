export type DcfAssumptions = {
  horizonYears: number; // v1: 5
  revenueGrowthPct: number; // e.g. 8 = 8%
  operatingMarginPct: number; // e.g. 25 = 25%
  taxRatePct: number; // e.g. 18 = 18%
  fcfConversionPct: number; // FCF as % of NOPAT, e.g. 70
  discountRatePct: number; // e.g. 10
  terminalGrowthPct: number; // e.g. 2.5
};

export type DcfProjectionRow = {
  year: number; // 1..N
  revenue: number;
  operatingIncome: number;
  nopat: number;
  fcf: number;
  discountFactor: number;
  pvFcf: number;
};

export type DcfResult = {
  fairValuePerShare: number;
  enterpriseValue: number;
  equityValue: number;
  pvOfExplicitPeriod: number;
  pvOfTerminalValue: number;
  terminalValue: number;

  base: {
    baseYear: number;
    baseRevenue: number;
    baseOperatingMarginPct: number;
    baseTaxRatePct: number;
    baseFcf: number;
    baseFcfConversionPct: number;
  };

  assumptions: DcfAssumptions;
  projections: DcfProjectionRow[];
};

function pctToRate(pct: number) {
  return pct / 100;
}

export function runDcf(params: {
  baseYear: number;
  baseRevenue: number;
  baseOperatingMarginPct: number;
  baseTaxRatePct: number;
  baseFcfConversionPct: number;
  sharesOutstanding: number;
  netDebt: number; // ✅ positive means net debt, negative means net cash
  assumptions: DcfAssumptions;
}): DcfResult {
  const {
    baseYear,
    baseRevenue,
    baseOperatingMarginPct,
    baseTaxRatePct,
    baseFcfConversionPct,
    sharesOutstanding,
    netDebt,
    assumptions,
  } = params;

  const N = Math.max(1, Math.min(10, Math.floor(assumptions.horizonYears)));
  const gStart = pctToRate(assumptions.revenueGrowthPct);
  const gEnd = pctToRate(assumptions.terminalGrowthPct);
  const opm = pctToRate(assumptions.operatingMarginPct);
  const tax = pctToRate(assumptions.taxRatePct);
  const conv = pctToRate(assumptions.fcfConversionPct);
  const r = pctToRate(assumptions.discountRatePct);
  const tg = pctToRate(assumptions.terminalGrowthPct);

  // Guardrails
  if (sharesOutstanding <= 0) throw new Error("Invalid shares outstanding");
  if (!(r > tg)) throw new Error("Discount rate must be greater than terminal growth");

  let revenue = baseRevenue;

  const projections: DcfProjectionRow[] = [];
  let pvSum = 0;

    for (let t = 1; t <= N; t++) {
    // ✅ Fade growth from gStart → gEnd over the forecast horizon
    const frac = N === 1 ? 1 : (t - 1) / (N - 1);
    const g_t = gStart + (gEnd - gStart) * frac;
    revenue = revenue * (1 + g_t);
    const operatingIncome = revenue * opm;
    const nopat = operatingIncome * (1 - tax);
    const fcf = nopat * conv;

    const discountFactor = 1 / Math.pow(1 + r, t);
    const pvFcf = fcf * discountFactor;

    pvSum += pvFcf;

    projections.push({
      year: baseYear + t,
      revenue,
      operatingIncome,
      nopat,
      fcf,
      discountFactor,
      pvFcf,
    });
  }

  const fcfN = projections[projections.length - 1]?.fcf ?? 0;
  const terminalValue = (fcfN * (1 + tg)) / (r - tg);
  const pvOfTerminalValue = terminalValue / Math.pow(1 + r, N);

    const enterpriseValue = pvSum + pvOfTerminalValue;
  const equityValue = enterpriseValue - netDebt;
  const fairValuePerShare = equityValue / sharesOutstanding;

  return {
    fairValuePerShare,
    enterpriseValue,
    equityValue,
    pvOfExplicitPeriod: pvSum,
    pvOfTerminalValue,
    terminalValue,
    base: {
      baseYear,
      baseRevenue,
      baseOperatingMarginPct,
      baseTaxRatePct,
      baseFcf: fcfN / (conv || 1), // not perfect; mainly informational
      baseFcfConversionPct,
    },
    assumptions,
    projections,
  };
}
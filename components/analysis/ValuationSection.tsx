"use client";

import { useEffect, useMemo, useState } from "react";
import ValuationBarChart from "@/components/analysis/ValuationBarChart";
import DcfProjectionsChart from "@/components/analysis/DcfProjectionChart";

type Assumptions = {
  horizonYears: number;
  revenueGrowthPct: number;
  operatingMarginPct: number;
  taxRatePct: number;
  fcfConversionPct: number;
  discountRatePct: number;
  terminalGrowthPct: number;
};

type ApiResponse =
  | { ok: false; error: string }
  | {
      ok: true;
      ticker: string;
      market: {
        price: number;
        sharesOutstanding: number;
        beta: number | null;
        marketCap: number | null;
      };
      valuation: {
        fairValuePerShare: number;
        upsidePct: number;
        verdict: "Undervalued" | "Fair" | "Overvalued";
        assumptions: Assumptions;
        projections: Array<{
          year: number;
          revenue: number;
          operatingIncome: number;
          nopat: number;
          fcf: number;
          discountFactor: number;
          pvFcf: number;
        }>;
        historical: Array<{
        year: number;
        revenue: number;
        operatingIncome: number;
        fcf: number;
        }>;
      };
    };

function fmtMoney(n: number, decimals = 2) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: decimals,
  }).format(n);
}

function fmtCompact(n: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtPct(n: number, decimals = 1) {
  return `${n.toFixed(decimals)}%`;
}

export default function ValuationSection({ ticker }: { ticker: string }) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Assumptions | null>(null);
  const [posting, setPosting] = useState(false);
  const [projectionsView, setProjectionsView] = useState<"grid" | "chart">("chart");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/analysis/valuation?ticker=${ticker}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as ApiResponse;
      setData(json);
      if (json.ok) setEditing(json.valuation.assumptions);
    } catch (e: any) {
      setData({ ok: false, error: e?.message ?? "Failed to load valuation" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);

  const summary = useMemo(() => {
    if (!data || !data.ok) return null;
    const price = data.market.price;
    const fv = data.valuation.fairValuePerShare;
    const upside = data.valuation.upsidePct;
    return { price, fv, upside };
  }, [data]);

  async function applyAssumptions() {
    if (!editing) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/analysis/valuation?ticker=${ticker}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assumptions: editing }),
      });
      const json = (await res.json()) as ApiResponse;
      setData(json);
      if (json.ok) setEditing(json.valuation.assumptions);
      setDrawerOpen(false);
    } catch (e: any) {
      setData({ ok: false, error: e?.message ?? "Failed to apply assumptions" });
    } finally {
      setPosting(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="text-sm text-muted-foreground">Valuation</div>
        <div className="mt-2 text-foreground">Loading DCF…</div>
      </div>
    );
  }

  if (!data || !data.ok) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="text-sm text-muted-foreground">Valuation</div>
        <div className="mt-2 text-destructive">
          {data?.error ?? "Unknown error"}
        </div>
      </div>
    );
  }

  const price = data.market.price;
  const fv = data.valuation.fairValuePerShare;
  const upside = data.valuation.upsidePct;
  const verdict = data.valuation.verdict;

  // Fair band ±10%
  // Fair value uncertainty band (±10%)
const bandLow = fv * 0.9;
const bandHigh = fv * 1.1;

// ✅ Symmetric viewport around PRICE so price is always centered.
// Range size is the max distance from price to band edges.
const range = Math.max(
  Math.abs(price - bandLow),
  Math.abs(price - bandHigh),
  price * 0.05 // small minimum range so it doesn't collapse when values are close
);

const minVal = price - range;
const maxVal = price + range;

const scale = (v: number) => {
  if (maxVal === minVal) return 50;
  return ((v - minVal) / (maxVal - minVal)) * 100;
};


  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-muted-foreground">Valuation</div>
          <div className="text-xl font-semibold text-foreground">
            Discounted Cash Flow (DCF)
          </div>
        </div>

        <button
          onClick={() => setDrawerOpen(true)}
          className="rounded-xl border border-border bg-secondary px-3 py-2 text-sm text-secondary-foreground hover:bg-secondary/80"
        >
          Edit assumptions
        </button>
      </div>

        <ValuationBarChart
  fairValue={fv}
  price={price}
  upsidePct={upside}
  sharesOutstanding={data?.market?.sharesOutstanding ?? null}
  marketCap={data?.market?.marketCap ?? null}
/>


      {/* Assumptions quick view */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-3 text-sm text-foreground">Assumptions</div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Mini label="Revenue growth" value={fmtPct(data.valuation.assumptions.revenueGrowthPct)} />
          <Mini label="Op margin" value={fmtPct(data.valuation.assumptions.operatingMarginPct)} />
          <Mini label="Tax rate" value={fmtPct(data.valuation.assumptions.taxRatePct)} />
          <Mini label="FCF conv." value={fmtPct(data.valuation.assumptions.fcfConversionPct)} />
          <Mini label="Discount rate" value={fmtPct(data.valuation.assumptions.discountRatePct)} />
          <Mini label="Terminal growth" value={fmtPct(data.valuation.assumptions.terminalGrowthPct)} />
          <Mini label="Horizon" value={`${data.valuation.assumptions.horizonYears}y`} />
          <Mini
            label="Market cap"
            value={data.market.marketCap ? fmtCompact(data.market.marketCap) : "—"}
          />
        </div>
      </div>

      {/* Projection table */}
<details className="rounded-2xl border border-border bg-card p-5">
  <summary className="cursor-pointer text-sm text-foreground">
    View DCF projections
  </summary>

  <div className="mt-4 flex items-center justify-between gap-3">
    <div className="text-xs text-muted-foreground">
      Historical + forecasted financials used in the DCF
    </div>

    <div className="flex items-center gap-2">
      <button
        onClick={() => setProjectionsView("chart")}
        className={`rounded-full border px-3 py-1 text-xs font-semibold ${
          projectionsView === "chart"
            ? "border-foreground/20 bg-foreground/5 text-foreground"
            : "border-border text-muted-foreground"
        }`}
      >
        Chart
      </button>
      <button
        onClick={() => setProjectionsView("grid")}
        className={`rounded-full border px-3 py-1 text-xs font-semibold ${
          projectionsView === "grid"
            ? "border-foreground/20 bg-foreground/5 text-foreground"
            : "border-border text-muted-foreground"
        }`}
      >
        Grid
      </button>
    </div>
  </div>

  {projectionsView === "chart" ? (
    <div className="mt-4">
      <DcfProjectionsChart
        historical={data.valuation.historical}
        forecast={data.valuation.projections.map((p) => ({
          year: p.year,
          revenue: p.revenue,
          operatingIncome: p.operatingIncome,
          fcf: p.fcf,
        }))}
        terminalGrowthPct={data.valuation.assumptions.terminalGrowthPct}
      />
    </div>
  ) : (
    <div className="mt-4 overflow-x-auto">
      <table className="min-w-[800px] w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b border-border">
            <th className="py-2 text-left">Year</th>
            <th className="py-2 text-right">Revenue</th>
            <th className="py-2 text-right">Op Income</th>
            <th className="py-2 text-right">NOPAT</th>
            <th className="py-2 text-right">FCF</th>
            <th className="py-2 text-right">PV(FCF)</th>
          </tr>
        </thead>
        <tbody className="text-foreground">
          {data.valuation.projections.map((r) => (
            <tr key={r.year} className="border-b border-border/60">
              <td className="py-2">{r.year}</td>
              <td className="py-2 text-right">{fmtMoney(r.revenue, 0)}</td>
              <td className="py-2 text-right">{fmtMoney(r.operatingIncome, 0)}</td>
              <td className="py-2 text-right">{fmtMoney(r.nopat, 0)}</td>
              <td className="py-2 text-right">{fmtMoney(r.fcf, 0)}</td>
              <td className="py-2 text-right">{fmtMoney(r.pvFcf, 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )}
</details>

      {/* Drawer */}
      {drawerOpen && editing && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => !posting && setDrawerOpen(false)}
          />
          <div className="absolute right-0 top-0 h-full w-full max-w-lg border-l border-border bg-background p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm text-muted-foreground">DCF Assumptions</div>
                <div className="text-lg font-semibold text-foreground">{ticker}</div>
              </div>
              <button
                onClick={() => !posting && setDrawerOpen(false)}
                className="rounded-lg border border-border bg-secondary px-3 py-1 text-sm text-secondary-foreground hover:bg-secondary/80"
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <Field label="Revenue growth (%)" value={editing.revenueGrowthPct}
                onChange={(v) => setEditing({ ...editing, revenueGrowthPct: v })} />
              <Field label="Operating margin (%)" value={editing.operatingMarginPct}
                onChange={(v) => setEditing({ ...editing, operatingMarginPct: v })} />
              <Field label="Tax rate (%)" value={editing.taxRatePct}
                onChange={(v) => setEditing({ ...editing, taxRatePct: v })} />
              <Field label="FCF conversion (% of NOPAT)" value={editing.fcfConversionPct}
                onChange={(v) => setEditing({ ...editing, fcfConversionPct: v })} />
              <Field label="Discount rate (%)" value={editing.discountRatePct}
                onChange={(v) => setEditing({ ...editing, discountRatePct: v })} />
              <Field label="Terminal growth (%)" value={editing.terminalGrowthPct}
                onChange={(v) => setEditing({ ...editing, terminalGrowthPct: v })} />
              <Field label="Horizon years" value={editing.horizonYears}
                onChange={(v) => setEditing({ ...editing, horizonYears: Math.round(v) })} />
            </div>

            <div className="mt-6 flex gap-2">
              <button
                disabled={posting}
                onClick={applyAssumptions}
                className="flex-1 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {posting ? "Applying…" : "Apply"}
              </button>
              <button
                disabled={posting}
                onClick={() => {
                  load();
                  setDrawerOpen(false);
                }}
                className="rounded-xl border border-border bg-secondary px-4 py-2 text-sm text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
              >
                Reset
              </button>
            </div>

            <div className="mt-4 text-xs text-muted-foreground">
              Tip: Discount rate must be greater than terminal growth.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({
  label,
  value,
  pill,
}: {
  label: string;
  value: string;
  pill?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      {!pill ? (
        <div className="mt-1 text-lg font-semibold text-foreground">{value}</div>
      ) : (
        <div className="mt-2 inline-flex rounded-full border border-border bg-muted px-3 py-1 text-sm font-medium text-foreground">
          {value}
        </div>
      )}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}
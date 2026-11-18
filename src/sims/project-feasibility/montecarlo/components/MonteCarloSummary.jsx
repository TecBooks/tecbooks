import React from "react";
import { Alert, Chip } from "@mui/material";
import InfoTooltip from "@/components/global/InfoTooltip";
import { compactCurrency, pct } from "../format.js";

function Stat({ label, value, sub, tooltip, tone = "neutral" }) {
  const tones = {
    neutral: "border-slate-200 bg-slate-50/60",
    good: "border-emerald-200 bg-emerald-50",
    warn: "border-amber-200 bg-amber-50",
    bad: "border-red-200 bg-red-50",
  };
  return (
    <div className={`h-full rounded-xl border p-3 ${tones[tone]}`}>
      <p className="inline-flex items-center text-[15px] text-slate-500">
        {label}
        <InfoTooltip title={tooltip} />
      </p>
      <p className="mt-0.5 whitespace-nowrap text-[21px] font-semibold tabular-nums text-slate-900">{value}</p>
      {sub && <p className="text-[13px] text-slate-500">{sub}</p>}
    </div>
  );
}

/**
 * "Probability of feasibility instead of yes/no" (PDF §7, row D) next to
 * the single-number decision the Cash Flows tab gives today.
 */
function MonteCarloSummary({ result, currency }) {
  const { kpis, deterministic, meta } = result;
  const npv = kpis.npv;
  const irr = kpis.irr;
  const pf = result.probabilityFeasible;
  const ci = 1.96 * result.probabilityFeasibleSE;
  const lossCi = 1.96 * npv.probBelowThresholdSE;
  const tone = pf >= 0.75 ? "good" : pf >= 0.5 ? "warn" : "bad";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Probability of feasibility"
          value={pct(pf)}
          sub={`± ${pct(ci, 1)} (95% CI) · VNA > 0 and TIR > TREMA`}
          tone={tone}
          tooltip="Share of simulations where the project would be accepted with the same rule the Cash Flows tab uses (VNA > 0 and TIR > TREMA)."
        />
        <div className="flex h-full flex-col justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <p className="text-[15px] text-slate-500">Single-number model (today)</p>
          <Chip
            label={deterministic.accepted ? "Project Accepted" : "Project Rejected"}
            color={deterministic.accepted ? "success" : "error"}
            sx={{ fontWeight: 700, alignSelf: "flex-start" }}
          />
          <p className="text-[13px] text-slate-500">
            VNA {compactCurrency(deterministic.npv, currency)} · TIR{" "}
            {deterministic.irr === null ? "N/A" : pct(deterministic.irr)} · TREMA{" "}
            {pct(deterministic.trema)}
          </p>
        </div>
        <Stat
          label="Mean VNA"
          value={compactCurrency(npv.mean, currency)}
          sub={`σ ${compactCurrency(npv.std, currency)}`}
          tooltip="E[VNA] over every simulation. Because the model isn't linear, it generally differs from the VNA computed with the most likely inputs (Jensen's inequality)."
        />
        <Stat
          label="P(VNA < 0)"
          value={pct(npv.probBelowThreshold)}
          sub={`± ${pct(lossCi, 1)} (95% CI)`}
          tone={npv.probBelowThreshold > 0.25 ? "bad" : "neutral"}
          tooltip="Probability of destroying value. Its own error shrinks with √N."
        />
        <Stat
          label="VNA P5 · P50 · P95"
          value={compactCurrency(npv.p50, currency)}
          sub={`${compactCurrency(npv.p5, currency)} … ${compactCurrency(npv.p95, currency)}`}
          tooltip="Median, with the range that contains 90% of the simulations."
        />
        <Stat
          label="CVaR 5%"
          value={compactCurrency(npv.cvar5, currency)}
          sub={`VaR 5% = ${compactCurrency(npv.var5, currency)}`}
          tooltip="Average VNA of the worst 5% of simulations. VaR 5% is the threshold of that tail."
        />
        <Stat
          label="Median TIR"
          value={pct(irr.p50)}
          sub={`P5 ${pct(irr.p5)} · P95 ${pct(irr.p95)} · ${irr.nValid ?? 0}/${meta.valid} with a TIR`}
          tooltip="Simulations whose cash flow never changes sign have no TIR - they are excluded instead of inventing a number."
        />
        <Stat
          label="P(TIR < TREMA)"
          value={pct(irr.probBelowThreshold)}
          sub={`among simulations with a TIR`}
          tooltip="Compared against the base TREMA."
        />
      </div>

      <p className="text-[14px] text-slate-500">
        {meta.n.toLocaleString("en-US")} simulations · seed {meta.seed} ·{" "}
        {meta.correlated ? "with correlations" : "independent inputs"} · {meta.durationMs} ms
        {meta.failures > 0 && ` · ${meta.failures} simulations could not be evaluated`}
      </p>

      <Alert severity="warning" sx={{ fontSize: 15 }}>
        Monte Carlo only spreads the uncertainty you describe: if the ranges above are wrong, so
        are these probabilities. A probability is an estimate with its own error, not a prediction.
      </Alert>
    </div>
  );
}

export default MonteCarloSummary;

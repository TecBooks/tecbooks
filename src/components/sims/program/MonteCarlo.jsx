import React from "react";
import { Alert, Chip } from "@mui/material";
import CollapsibleSection from "@/components/global/CollapsibleSection";
import useMonteCarlo from "@/hooks/sims/project/useMonteCarlo";
import {
  DEFAULT_CORRELATIONS,
  FEASIBILITY_VARIABLES,
  baseTremaInputs,
  computeBaseTrema,
} from "@/sims/project-feasibility/montecarlo/feasibilityModel.js";
import MonteCarloInputs from "@/sims/project-feasibility/montecarlo/components/MonteCarloInputs.jsx";
import MonteCarloSummary from "@/sims/project-feasibility/montecarlo/components/MonteCarloSummary.jsx";
import {
  CashFlowBands,
  ConvergenceChart,
  NpvHistogram,
  NpvTornado,
} from "@/sims/project-feasibility/montecarlo/components/MonteCarloCharts.jsx";

const DEFAULT_RISK_PREMIUM = 0.1;
const DEFAULT_N = 2000;
const DEFAULT_SEED = 42;

const cloneDefaults = () => ({
  variables: FEASIBILITY_VARIABLES.map((v) => ({ ...v, params: { ...v.params } })),
  correlations: DEFAULT_CORRELATIONS.map((pair) => ({ ...pair })),
});

/**
 * POC - Risk analysis tab (Monte Carlo). Runs the SAME TREMA / TIR / VNA
 * model the Cash Flows tab uses N times with uncertain inputs, and shows
 * a probability of feasibility instead of a single accept/reject.
 * Read-only on the project: nothing is persisted, no edits slice touched.
 */
function MonteCarlo({ project, currency }) {
  const cbm = project.cbm;
  const loaded = React.useMemo(() => baseTremaInputs(cbm), [cbm]);
  const [{ variables, correlations }, setConfig] = React.useState(cloneDefaults);
  const [settings, setSettings] = React.useState({
    n: DEFAULT_N,
    seed: DEFAULT_SEED,
    riskPremium: DEFAULT_RISK_PREMIUM,
    ...loaded,
  });
  const [lastRunKey, setLastRunKey] = React.useState(null);
  const simulation = useMonteCarlo();
  const { reset } = simulation;

  // New project / currency -> new CBM: reload Premisas rates, drop results
  // that were computed in the old currency.
  React.useEffect(() => {
    setSettings((prev) => ({ ...prev, ...loaded }));
    reset();
    setLastRunKey(null);
  }, [cbm, loaded, reset]);

  const baseTrema = computeBaseTrema(settings);
  const configKey = JSON.stringify({ variables, correlations, settings });
  const stale = simulation.result && lastRunKey !== configKey;

  const handleRun = () => {
    setLastRunKey(configKey);
    simulation.run({
      cbm,
      baseTrema,
      variables,
      correlations,
      n: settings.n,
      seed: settings.seed,
    });
  };

  const handleRestoreDefaults = () => {
    setConfig(cloneDefaults());
    setSettings({ n: DEFAULT_N, seed: DEFAULT_SEED, riskPremium: DEFAULT_RISK_PREMIUM, ...loaded });
  };

  const { result } = simulation;

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <Chip label="POC" size="small" color="warning" sx={{ fontWeight: 700 }} />
        <p className="text-[16px] text-slate-600">
          Instead of one VNA, run the project's own cash flow model thousands of times with
          uncertain inputs and read the <b>probability</b> that it is feasible.
        </p>
      </div>

      <CollapsibleSection
        title="Uncertain inputs"
        tooltip="Each input is a range around the value in the uploaded workbook. Triangular and PERT only need min / most likely / max."
        defaultExpanded
      >
        <MonteCarloInputs
          variables={variables}
          onVariablesChange={(next) => setConfig((prev) => ({ ...prev, variables: next }))}
          correlations={correlations}
          onCorrelationsChange={(next) => setConfig((prev) => ({ ...prev, correlations: next }))}
          settings={settings}
          onSettingsChange={setSettings}
          baseTrema={baseTrema}
          status={simulation.status}
          progress={simulation.progress}
          onRun={handleRun}
          onCancel={simulation.cancel}
          onRestoreDefaults={handleRestoreDefaults}
        />
      </CollapsibleSection>

      {simulation.status === "error" && (
        <Alert severity="error" sx={{ mb: 2, fontSize: 16 }}>
          {simulation.error}
        </Alert>
      )}

      {result && (
        <>
          {stale && (
            <Alert severity="info" sx={{ mb: 2, fontSize: 16 }}>
              The inputs changed since this run - press “Run simulation” to update the results.
            </Alert>
          )}
          <CollapsibleSection title="Feasibility probability" defaultExpanded>
            <MonteCarloSummary result={result} currency={currency} />
          </CollapsibleSection>
          <CollapsibleSection title="VNA distribution" defaultExpanded>
            <NpvHistogram result={result} currency={currency} />
          </CollapsibleSection>
          <CollapsibleSection
            title="Sensitivity (tornado)"
            tooltip="Which input is worth getting better data for: the longer the bar, the more that input drives the VNA."
            defaultExpanded
          >
            {result.tornadoNpv.length > 0 ? (
              <NpvTornado result={result} />
            ) : (
              <Alert severity="info">Every input is fixed - nothing to rank.</Alert>
            )}
          </CollapsibleSection>
          <CollapsibleSection
            title="Net flow bands"
            tooltip="Same yearly series the TREMA / TIR / VNA panel discounts, shown as mean and P5-P95 across simulations."
          >
            <CashFlowBands result={result} currency={currency} />
          </CollapsibleSection>
          <CollapsibleSection
            title="Convergence"
            tooltip="How the estimate of P(VNA < 0) stabilises as N grows. The band is ±1.96·√(p(1−p)/N)."
          >
            <ConvergenceChart result={result} />
          </CollapsibleSection>
        </>
      )}
    </>
  );
}

export default MonteCarlo;

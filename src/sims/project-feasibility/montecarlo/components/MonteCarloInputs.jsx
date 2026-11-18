import React from "react";
import {
  Alert,
  Button,
  InputAdornment,
  LinearProgress,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
} from "@mui/material";
import InfoTooltip from "@/components/global/InfoTooltip";
import {
  DISTRIBUTIONS,
  centralValue,
  validateDistribution,
} from "../distributions.js";
import { MAX_SIMULATIONS, MIN_SIMULATIONS } from "../runMonteCarlo.js";

const PARAM_LABELS = {
  value: "Value",
  low: "Min",
  mode: "Most likely",
  high: "Max",
  mean: "Mean",
  std: "Std. dev.",
};

const toDisplay = (value) => (Number.isFinite(value) ? Number((value * 100).toFixed(4)) : "");
const fromDisplay = (text) => (text === "" ? NaN : Number(text) / 100);

/**
 * Parameters when switching distribution, centred on the variable's
 * current central value so a switch never jumps to an unrelated range.
 */
function paramsForDistribution(dist, variable) {
  const center = centralValue(variable.dist, variable.params);
  const spread = variable.kind === "factor" ? 0.1 : 0.02;
  switch (dist) {
    case "fixed":
      return { value: center };
    case "uniform":
      return { low: center - spread, high: center + spread };
    case "normal":
    case "lognormal":
      return { mean: center, std: spread / 2 };
    default:
      return { low: center - spread, mode: center, high: center + spread };
  }
}

function PercentInput({ label, value, onChange, suffix = "%", width = 110, helperText }) {
  return (
    <TextField
      label={label}
      type="number"
      size="small"
      value={toDisplay(value)}
      onChange={(event) => onChange(fromDisplay(event.target.value))}
      helperText={helperText}
      sx={{ width }}
      slotProps={{
        input: { endAdornment: <InputAdornment position="end">{suffix}</InputAdornment> },
      }}
    />
  );
}

function VariableRow({ variable, onChange }) {
  const error = validateDistribution(variable.dist, variable.params);
  const suffix = variable.kind === "factor" ? "%" : "pp";
  return (
    <TableRow>
      <TableCell sx={{ fontSize: 16, minWidth: 190 }}>
        <span className="inline-flex items-center font-medium text-slate-800">
          {variable.label}
          <InfoTooltip title={variable.description} />
        </span>
        <div className="text-[13px] text-slate-500">
          {variable.kind === "factor" ? "% of uploaded value" : "shift in percentage points"}
        </div>
      </TableCell>
      <TableCell>
        <Select
          size="small"
          value={variable.dist}
          onChange={(event) =>
            onChange({
              ...variable,
              dist: event.target.value,
              params: paramsForDistribution(event.target.value, variable),
            })
          }
          sx={{ minWidth: 130 }}
        >
          {Object.entries(DISTRIBUTIONS).map(([key, spec]) => (
            <MenuItem key={key} value={key}>
              {spec.label}
            </MenuItem>
          ))}
        </Select>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-start gap-2">
          {DISTRIBUTIONS[variable.dist].params.map((param) => (
            <PercentInput
              key={param}
              label={PARAM_LABELS[param]}
              suffix={suffix}
              value={variable.params[param]}
              onChange={(next) =>
                onChange({ ...variable, params: { ...variable.params, [param]: next } })
              }
            />
          ))}
        </div>
        {error && <div className="mt-1 text-[13px] text-red-600">{error}</div>}
      </TableCell>
    </TableRow>
  );
}

/**
 * Left side of the PDF's Figure 5: one row per uncertain input
 * (distribution + min / most likely / max), simulation settings,
 * optional correlations and the Run button.
 */
function MonteCarloInputs({
  variables,
  onVariablesChange,
  settings,
  onSettingsChange,
  correlations,
  onCorrelationsChange,
  baseTrema,
  status,
  progress,
  onRun,
  onCancel,
  onRestoreDefaults,
}) {
  const labelOf = (name) => variables.find((v) => v.name === name)?.label ?? name;
  const invalid = variables.some((v) => validateDistribution(v.dist, v.params));
  const nInvalid = !(settings.n >= MIN_SIMULATIONS && settings.n <= MAX_SIMULATIONS);
  const independent = correlations.every((pair) => !pair.rho);
  const running = status === "running";

  return (
    <div className="space-y-5">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 700, fontSize: 16 }}>Uncertain input</TableCell>
            <TableCell sx={{ fontWeight: 700, fontSize: 16 }}>Distribution</TableCell>
            <TableCell sx={{ fontWeight: 700, fontSize: 16 }}>Parameters</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {variables.map((variable) => (
            <VariableRow
              key={variable.name}
              variable={variable}
              onChange={(next) =>
                onVariablesChange(variables.map((v) => (v.name === next.name ? next : v)))
              }
            />
          ))}
        </TableBody>
      </Table>

      <div>
        <p className="mb-2 text-[16px] font-semibold text-slate-700">Base TREMA</p>
        <div className="flex flex-wrap items-center gap-3">
          <PercentInput
            label="Market rate"
            value={settings.marketRate}
            onChange={(marketRate) => onSettingsChange({ ...settings, marketRate })}
            width={140}
          />
          <PercentInput
            label="Inflation"
            value={settings.inflation}
            onChange={(inflation) => onSettingsChange({ ...settings, inflation })}
            width={140}
          />
          <PercentInput
            label="Risk premium"
            value={settings.riskPremium}
            onChange={(riskPremium) => onSettingsChange({ ...settings, riskPremium })}
            width={140}
          />
          <span className="text-[16px] text-slate-700">
            = <b>{Number.isFinite(baseTrema) ? `${(baseTrema * 100).toFixed(2)}%` : "—"}</b>
          </span>
        </div>
      </div>

      <div>
        <p className="mb-2 inline-flex items-center text-[16px] font-semibold text-slate-700">
          Correlations (rank, -0.95 to 0.95)
          <InfoTooltip title="If two inputs tend to move together (e.g. lower price with higher volume), sampling them independently under- or over-states the risk in the tails. 0 = independent." />
        </p>
        <div className="flex flex-wrap gap-3">
          {correlations.map((pair, index) => (
            <TextField
              key={`${pair.a}-${pair.b}`}
              label={`${labelOf(pair.a)} ↔ ${labelOf(pair.b)}`}
              type="number"
              size="small"
              value={pair.rho}
              onChange={(event) => {
                const rho = Math.max(-0.95, Math.min(0.95, Number(event.target.value) || 0));
                onCorrelationsChange(
                  correlations.map((p, i) => (i === index ? { ...p, rho } : p)),
                );
              }}
              slotProps={{ htmlInput: { step: 0.05, min: -0.95, max: 0.95 } }}
              sx={{ width: 260 }}
            />
          ))}
        </div>
        {independent && (
          <Alert severity="info" sx={{ mt: 1.5, fontSize: 15 }}>
            No correlations set - the inputs are assumed to be independent.
          </Alert>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <TextField
          label="Simulations (N)"
          type="number"
          size="small"
          value={settings.n}
          onChange={(event) => onSettingsChange({ ...settings, n: Number(event.target.value) })}
          error={nInvalid}
          helperText={nInvalid ? `${MIN_SIMULATIONS} - ${MAX_SIMULATIONS}` : " "}
          sx={{ width: 160 }}
        />
        <TextField
          label="Seed"
          type="number"
          size="small"
          value={settings.seed}
          onChange={(event) => onSettingsChange({ ...settings, seed: Number(event.target.value) })}
          helperText="Same seed = same results"
          sx={{ width: 170 }}
        />
        <div className="flex gap-2 pb-5">
          <Button
            variant="contained"
            onClick={onRun}
            disabled={running || invalid || nInvalid || !Number.isFinite(baseTrema)}
            sx={{ bgcolor: "#073a5a", fontSize: 16, textTransform: "none" }}
          >
            {running ? "Simulating…" : "Run simulation"}
          </Button>
          {running && (
            <Button variant="outlined" onClick={onCancel} sx={{ fontSize: 16, textTransform: "none" }}>
              Cancel
            </Button>
          )}
          <Button
            variant="text"
            onClick={onRestoreDefaults}
            disabled={running}
            sx={{ fontSize: 16, textTransform: "none" }}
          >
            Restore defaults
          </Button>
        </div>
      </div>
      {running && <LinearProgress variant="determinate" value={progress * 100} />}
    </div>
  );
}

export default MonteCarloInputs;

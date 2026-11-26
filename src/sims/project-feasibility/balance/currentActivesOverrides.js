// Current Actives fixed rows the user can override (marked `editable: true`
// in CurrentActives.jsx COST_ROWS). Stocks has no source in InputNovus - the
// 2,000,000 year-zero default is the reference workbook's "Acciones" (see
// computeCurrentActives.js) - so the user can set it to 0 or any amount.
// Saved in row_table under CURRENT_ACTIVES_OVERRIDES_KEY by
// useEffectiveBalanceTotals (useOverridesSync).
export const CURRENT_ACTIVES_EDITABLE_ROW_KEYS = ["stocks"];
export const CURRENT_ACTIVES_OVERRIDES_KEY = "currentActivesOverrides";

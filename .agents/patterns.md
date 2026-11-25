# Patterns

Project Feasibility V1: one user uploads year-0 InputNovus workbooks, grouped as a **program** (thin folder). Each Excel is one **actual operating business** → one `games` row + one `game_teams` row. Not a shop catalog, not a classroom lobby.

## Worker layers

```
routes → logger + session → controllers → usecases → services → models → env.DB / env.R2
```

Copy `worker/src/routes/programs.route.js` and `auth`. Pages and React components do **not** import axios. Feasibility HTTP lives in `src/sims/project-feasibility/api/`. Hooks call those functions.

## Identity and storage

- Session cookie is the auth source of truth: httpOnly JWT `session`, 7 days. `localStorage.tecbooks_user` is display-only and must not keep the UI “logged in” after the cookie dies.
- Worker session failures: `401 { "error": "session_invalid" }` from `session.middleware` only. Login 401s use other codes (`form_identifier_not_found`, `form_password_incorrect`).
- Client: shared axios lives in `src/utils/worker.util.js`. Its interceptor calls `logout` on `session_invalid` only — never on status 401 alone. TanStack skips retry/refetch for that code.

- Program: `feasibility_programs` (`name`, `created_by`).
- Child: `feasibility_projects` (`program_id`, `name`, `game_id`, `r2_key`). Not VAN `projects`.
- `games.class_id`: find-or-create class **"Project Feasibility"** under school slug **`general`**.
- Original Excel → R2 binding **`env.R2`**. Object key: `feasibility/{userId}/{programId}/{gameId}/{filename}`. Persist that string as `r2_key`. No R2 access key in `.env`; bucket name is `wrangler.jsonc` → `r2_buckets[].bucket_name`.
- Do **not** persist `derivedBase` or a `cbm_json` blob.
- `employees.schedule` is a schema default (`full-time` row in migrations). Not an Excel field.

## Catalog (list / sidebar / cards)

| | |
|---|---|
| HTTP | `GET /api/programs` (session cookie) |
| Shape | `{ id, name, createdAt, projects: [{ id, name, gameId, r2Key }] }` |
| Client | `listProgramsRequest` → TanStack `queryKey: ['programs']` (`ProgramsContext`, `useProgram`) |
| After POST | `invalidateQueries({ queryKey: ['programs'] })` |

Upload is multipart: `name`, `projects` (JSON, CBM **without** `derivedBase`), `files` (one Excel per project, same order). Parse stays on the client; the worker explodes the CBM into Novus tables.

## Tab data (financial statements)

**Do not** read `project.cbm` from the catalog GET. It is not there.

**Current (compat — see `technical-debt.md`):**

| | |
|---|---|
| HTTP | `GET /api/feasibility/:gameId` |
| Client | `useFeasibilityModel(project.gameId)` → `queryKey: ['feasibility-model', gameId]` |
| Where | `src/hooks/sims/project/useFeasibilityModel.js` |
| Wired in | `ProjectDashboard` TabContent attaches `{ ...project, cbm }` for Income / Outflows / Ratios / Flujo |

**New work:** add a tab-scoped GET + TanStack key (table above in `technical-debt.md`). Query Novus tables by `gameId` (`premises`, `expenses`, `game_team_employees`, `game_team_assets`, `boms`, `capacity`, purchase orders). Never hardcode `gameId = 1`. `enabled: Number.isInteger(gameId) && gameId > 0`.

## Years (horizon)

- Year zero and projection length are picked by the user at upload (`NewProgram` → "Year zero" picker, pre-selected by `parse/yearZero.js` `detectYearZero`; "Projection" picker, 2-10 years, default 10). Horizon = year zero .. +N (`horizonYears(yearZero, projectionYears)`). Size series by `timeline.years.length`, never by `HORIZON_LENGTH` (legacy 11).
- A project's years are `cbm.timeline.years` (`projectYears(cbm)` in `constants.js`). Every per-year series (`premises.*`, `capacity.line.*`, `acquisitionByYear`) is indexed from that year zero: `series[i]` ↔ `timeline.years[i]`. Map index→year with `yearMapFromSeries(series, years, timelineStart(cbm))`.
- **Do not** use `HORIZON_YEARS` / `HORIZON_START_YEAR` (legacy 2025 default) to label or index project data, and never `2025 + index` in the worker (assets carry `yearly: [{year, cost}]` from `cbm-to-game.mapper.js`).
- Sheet readers take a `report` (`parse/yearReport.js`): a year header that skips a year or lacks a horizon year → **error** (blocks upload); a blank cell under an existing year column → **warning**. Invalid files stay staged so the user can change year zero and re-parse (`StagingContext.setYearZero`).
- A row is a year header only if it has ≥2 year-like cells strictly increasing (`detectYearHeader`).

## Client folders

- Sim HTTP: `src/sims/project-feasibility/api/` (auth, programs). Other leftover sim HTTP still in `src/api/sims/<feature>/`.
- Sim hooks: `src/hooks/sims/project/`
- Worker feature: `worker/src/{routes,controllers,usecases,services,models,mappers}/`
- Redux in this sim: edit slices only (`src/store/costTable.store.js`), not the project document.
- Table/row formula help: `InfoTooltip` (`src/components/global/InfoTooltip.jsx`) next to `TableContainer` titles (`titleTooltip`) and row labels (`row.tooltip`). Same icon on `CollapsibleSection` via `tooltip`.

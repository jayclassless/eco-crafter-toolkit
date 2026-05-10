# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Requirements

- Changes to the project are not complete unless quality is verified. Run each of the following scripts in `package.json` in order. Review their entire output, and address any issues they surface.
  1. `typecheck`
  2. `knip`
  3. `format`
  4. `lint`
  5. `test`
- When implementing features and changes, keep in mind the following order of priorities:
  1. Correctness: It is absolutely critical that the data and mathematics presented to the user is correct. Flaws in calculations are not acceptable.
  2. Performance: Aim to make the UI as responsive and quick as possible for the users.
  3. Stability: Complex implementations are acceptable, but not if they're so fragile that any change is very risky.
- New and changed functionality should always be covered by unit tests.

## External references

- The Eco game files for several versions can be found in the `eco-game-files` directory — read it directly when dealing with data or asset extraction logic.

## Commands

Runtime is pinned via `mise.toml` (Node 24, aube, pnpm, hk, pkl, jd, jq). Always prefix aube commands with `mise exec --`. `aube run <script>` is required for non-default scripts (only `test`, `start`, `stop`, `restart` are bare shortcuts).

- `mise exec -- aube run dev` — Vite dev server on port 3000 (the user keeps this running; don't start it yourself)
- `mise exec -- aube run build` — `tsc --noEmit` gate, then `vite build`
- `mise exec -- aube run typecheck` — TypeScript check only
- `mise exec -- aube run lint` — oxlint
- `mise exec -- aube run knip` — unused-export/dependency check (config: `.knip.json`)
- `mise exec -- aube run format` — oxfmt (single quotes, no semi, 2-space)
- `mise exec -- aube test` — vitest run (jsdom, `src/**/*.test.{ts,tsx}`)
- `mise exec -- aube run test:coverage` — vitest with v8 coverage
- `mise exec -- aube run fullcheck` — lint + knip + typecheck + format + coverage
- Single test: `mise exec -- aube exec vitest run path/to/file.test.ts -t "name pattern"`

Git hooks are managed by [hk](https://hk.jdx.dev/) and installed automatically by mise's `postinstall` hook (`hk install --mise`). Pre-commit runs oxlint, oxfmt, and `tsc --noEmit`. Config lives in `hk.pkl`.

Data-extraction scripts (run against a local Eco install, not normal dev flow — see `README.md` for arg details):

- `mise exec -- aube exec tsx scripts/extract-eco-dataset.ts --eco-root ... --output ...` — generate a `DatasetJson`
- `mise exec -- aube exec tsx scripts/extract-eco-icons.ts --eco-root ... --output ... --asset-ripper ...` — extract sprite PNGs
- `mise exec -- aube exec tsx scripts/report-icon-coverage.ts ...` — audit-only icon coverage report

None of these scripts write into `public/` automatically; move files and update `public/data/datasets-manifest.json` by hand.

## Architecture

### Routing

The app is a SPA using `react-router-dom` v7 with `HashRouter` (so it can be served from any static host). Routes (`src/components/routing/AppRoutes.tsx`):

- `/` → `RootRedirect` picks an active dataset/build (from `uiStore` or first available) and redirects.
- `/game-news` → `GameNews` page (Steam news feed).
- `/:datasetId/calculator` → `BuildRedirect` picks/creates a build for that dataset.
- `/:datasetId/calculator/:buildId` → `PriceCalculator` (the main UI).
- Anything else → redirect to `/`.

The URL is the source of truth for active dataset+build. `PriceCalculator` validates the params on every render and self-redirects on stale ids; `uiStore`'s `activeDatasetId`/`activeBuildId` are persisted hints, not authoritative state.

### Data model: three TinyBase stores + a localized-name cache + a UI store

Persistent state lives in three TinyBase stores wired up by `src/stores/providers.tsx` (exposes `useStores()`), each backed by its own IndexedDB database:

- **`gameDataStore`** (`eco-crafter-game-data`) — immutable, per-dataset reference data: skills, talents, items, tags, recipes, recipe elements, plugin modules, modifiers. Populated by importing a `DatasetJson` (bundled under `public/data/eco-v*.json`, registered in `datasets-manifest.json`). Schema: `src/stores/game-data-store.ts`.
- **`buildStore`** (`eco-crafter-builds`) — user state scoped by `buildId`: selected skills/talents/crafting-tables/recipes, manual prices, margins, hidden-rows filters, `computedPrices` cache. Schema: `src/stores/build-store.ts`.
- **`uiStore`** (`eco-crafter-ui`) — UI preferences and hints: active dataset/build hint, search strings, theme mode/color, UI scale, detailed-view toggles, margin display mode, `lastNewsViewedAt` (drives the news badge), `hasSeenAboutDialog` (gates first-launch About dialog). Schema: `src/stores/ui-store.ts`.

Plus a separate, hand-rolled IndexedDB cache (NOT a TinyBase store):

- **`localized-name-store.ts`** (`eco-crafter-localized-names`) — per-`(datasetId, locale)` map of entity-id → localized display name. Big enough that putting it in TinyBase would bloat the game-data store; accessed via `loadIndex()` and the `useLocalizedName` hook. Prewarmed in `providers.tsx` for the active dataset before first render so names appear synchronously.

**Persister note (important):** `providers.tsx` calls `persister.load()` + `persister.startAutoSave()` but deliberately **does not** call `startAutoLoad()`. TinyBase's auto-load installs a 1Hz `setInterval` that re-reads IndexedDB and replays the entire store via `setContent` every tick. On the game-data store (~60k rows) that caused ~800ms main-thread blocks and dominated UI lag. This app is the sole writer to its DBs, so event-driven save + one-time load is sufficient. Don't re-enable auto-load without understanding that tradeoff.

### Splash loader / app-ready handoff

`index.html` ships a static splash screen with a progress bar. Two modules coordinate the handoff:

- `src/lib/loader-progress.ts` — weighted-milestone bar; each `markLoaderMilestone(name)` call advances the fill. Don't add new milestone names without also adjusting weights, or remove existing ones — the bar will look broken.
- `src/lib/app-ready.ts` — three independent gates (`markStoresReady`, `markThemeReady`, `markFirstRenderReady`). When all three fire, the splash fades out. `StoreProvider` and `ThemeProvider` and `AppInner` each own one gate; if you change initialization order, make sure the gate still fires on the error path too (otherwise the splash hangs forever).

### Dataset import / update flow

- First launch: `providers.tsx` detects an empty `gameDataStore` and calls `autoImportDefaultDataset` (`src/lib/auto-import-default-dataset.ts`), which fetches the `default`-flagged dataset from `datasets-manifest.json` and imports it.
- Background-check on every mount: `App.tsx` calls `findAvailableUpdates` against the manifest and, for each dataset already in the store with a newer manifest version, calls `showUpdateToast` (`src/lib/update-toast.tsx`). Clicking the toast runs `applyDatasetUpdate` (`src/lib/apply-dataset-update.ts`).
- Manual import / delete / switch lives in `src/components/settings/datasets/` (`DatasetsDialog`, `DownloadDatasetButton`, `UpdateDatasetButton`, `DeleteDatasetConfirmDialog`).
- Parser entry point: `src/lib/import-dataset.ts`.

### Price solver architecture

The price calculator is the app's core feature. It derives cost/sale prices for every craftable product given the user's selected skills, talents, crafting tables, plugin modules, manual prices, and margins.

Flow:

1. `PriceCalculator.tsx` listens to a curated set of `buildStore` tables (NOT all tables — filter-only tables like `hiddenSkills`/`hiddenCraftingTables` are intentionally excluded since they only affect which rows are shown) and calls `recalculate()`.
2. `usePriceSolver` debounces for 200ms, then lazily invokes a `getInput` thunk _inside the debounce_ — the snapshot build reads thousands of rows, so collapsing bursts of mutations into one snapshot matters. Don't move snapshot construction to the click path.
3. The built `SolverInput` is posted to `src/workers/price-solver.worker.ts` (a Web Worker; keeps the main thread free during iterative resolution).
4. The worker calls `solve()` in `src/lib/solver.ts`, which iteratively resolves recipes whose ingredient prices are all known, applies modifiers (`src/lib/dynamic-values.ts`) and margins (`src/lib/margins.ts`), and returns `SolverOutput`.
5. Results are pushed into an **out-of-React price signal** (`use-prices-signal`). Individual cells (`Products`, `Materials`) subscribe per-price, so a new solver result updates only the cells whose price actually changed. The `PriceCalculator` / `Products` / DataTable tree does **not** re-render on new solver results. Preserve this pattern when touching price display — dropping it will cause large table re-renders.

Types for the solver contract live in `src/types/solver.ts`; game-data types in `src/types/game-data.ts`; dataset import schema in `src/types/dataset-json.ts`.

### Components

- `src/components/routing/` — `AppRoutes` and the redirect components (`RootRedirect`, `BuildRedirect`).
- `src/components/price-calculator/` — the main UI. `PriceCalculator.tsx` is the route component; `NavBar.tsx` (with embedded `BuildSelector.tsx` and `NewsBadgeButton`) sits on top; the three columns are split into subdirectories:
  - `build-options/` — left column (`ConfigPanel` containing `SkillsPanel`, `CraftingTablesPanel`, `OptionsPanel` and their cells)
  - `products/` — Products column (`ProductsDataTable`, `RecipeDialog`, `AddRecipeDialog`, all cell components)
  - `materials/` — Materials column (`MaterialDialog`, price-mode popover, cells)
  - `UsedInRecipesTable.tsx` — shared table used inside dialogs
- `src/components/game-news/` — Steam news feed. `GameNews.tsx` is the `/game-news` route page; `NewsBadgeButton.tsx` lives in `NavBar` and shows an unread count derived from `uiStore.lastNewsViewedAt` via `useNewsBadgeCount`. Fetch logic in `src/lib/steam-news.ts` (shared by the badge hook and the page via an in-flight cache).
- `src/components/settings/` — sidebar (`SettingsSidebar`, `SidebarMenuView`), theme provider, UI settings view, `AboutDialog` (auto-shown on first launch, gated by `uiStore.hasSeenAboutDialog`), plus `datasets/` for the Datasets dialog (import/update/delete).
- `src/components/common/` — shared inputs and icons (`EcoIcon`, `ItemIcon`, `RecipeIcon`, `SkillIcon`, `NumericField`, `PriceField`, `GroupedAutoComplete`, etc.).

Path alias: `@/*` → `src/*` (both Vite and tsconfig). Prefer `@/` over relative imports across directories; same-directory siblings can stay relative.

### i18n and localized names

UI strings come from `src/i18n/messages/` (configured in `src/i18n/config.ts` + `index.ts`). Game entity names are localized _in the dataset JSON_ (`LocalizedName: { 'en-US': '...', 'fr-FR': '...' }`) and resolved via `useLocalizedName` against the `localized-name-store` IndexedDB cache. UI-chrome translations are independent of game-data translations (the latter come from Crowdin during dataset extraction).

## Conventions

- **One React component per module.** A file defines exactly one component. The `memo(Impl)` wrapper pattern (`function FooImpl(...) {} export const Foo = memo(FooImpl)`) counts as one component and is allowed — the `Impl` is not a separate component, just the unwrapped implementation. Shared types used by multiple components in a column go in a sibling `types.ts` (or a more specific name like `skills-types.ts` when a column has more than one type cluster).
- React 19, function components, hooks only. PrimeReact + PrimeFlex for UI; PrimeIcons for icons.
- oxfmt: single quotes, no semicolons, 2-space indent, ES5 trailing commas, sorted imports.
- Tests: vitest + @testing-library/react + jsdom + `fake-indexeddb` (see `src/test-setup.ts`). Coverage excludes `src/types/*`, `src/main.tsx`, and `**/__tests__/**`.
- Tests live in `__tests__/` directories alongside the code they cover, mirroring the source tree.
- Dataset extraction/import logic (`src/lib/import-dataset.ts`, `scripts/extract-eco-dataset.ts`) is regex-/template-based against Eco's auto-generated C#. It's brittle by design — see README for limitations before "fixing" parser edge cases.

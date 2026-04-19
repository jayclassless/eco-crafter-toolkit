# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Requirements

- Changes to the project are not complete unless it has been formatted and the typecheck, linting, and tests are successful.
- When implementing features and changes, keep in mind the following order of priorities:
  1. Correctness: It is absolutely critical that the data and mathematics presented to the user is correct. Flaws in calculations are not acceptable.
  2. Performance: Aim to make the UI as responsive and quick as possible for the users.
  3. Stability: Complex implementations are acceptable, but not if they're so fragile that any change is very risky.

## External references

- Eco Gnome source is cloned locally in the `eco-gnome-website` directory — read it directly instead of web searching for Eco game/recipe logic.
- The Eco game files for several versions can be found in the `eco-game-files` directory — read it directly when dealing with data or asset extraction logic.

## Commands

Runtime is pinned via `mise.toml` (Node 24, pnpm 10). Always prefix pnpm commands with `mise exec --`.

- `mise exec -- pnpm dev` — Vite dev server on port 3000 (the user usually has this running; don't start it yourself)
- `mise exec -- pnpm build` — `tsc --noEmit` gate, then `vite build`
- `mise exec -- pnpm typecheck` — TypeScript check only
- `mise exec -- pnpm lint` — oxlint
- `mise exec -- pnpm format` — oxfmt (single quotes, no semi, 2-space)
- `mise exec -- pnpm test` — vitest run (jsdom, `src/**/*.test.{ts,tsx}`)
- `mise exec -- pnpm test:coverage` — vitest with v8 coverage
- `mise exec -- pnpm fullcheck` — lint + typecheck + format + coverage
- Single test: `mise exec -- pnpm vitest run path/to/file.test.ts -t "name pattern"`

Data-extraction scripts (run against a local Eco install, not normal dev flow — see `README.md` for arg details):

- `mise exec -- pnpm tsx scripts/extract-eco-dataset.ts --eco-root ... --output ...` — generate a `DatasetJson`
- `mise exec -- pnpm tsx scripts/extract-eco-icons.ts --eco-root ... --output ... --asset-ripper ...` — extract sprite PNGs

Neither script writes into `public/` automatically; move files and update `public/data/datasets-manifest.json` by hand.

## Architecture

### Data model: two TinyBase stores + a UI store

All persistent state lives in three TinyBase stores, each backed by its own IndexedDB database (`src/stores/providers.tsx` wires them up and exposes `useStores()`):

- **`gameDataStore`** (`eco-crafter-game-data`) — immutable, per-dataset reference data: skills, talents, items, tags, recipes, recipe elements, plugin modules, modifiers. Populated by importing a `DatasetJson` (bundled under `public/data/eco-v*.json` and registered in `datasets-manifest.json`). Schema: `src/stores/game-data-store.ts`.
- **`buildStore`** (`eco-crafter-builds`) — user state scoped by `buildId`: selected skills/talents/crafting-tables/recipes, manual prices, margins, and a `computedPrices` cache. Schema: `src/stores/build-store.ts`.
- **`uiStore`** — ephemeral UI selections (active dataset/build, sidebar visibility).

**Persister note (important):** `providers.tsx` calls `persister.load()` + `persister.startAutoSave()` but deliberately **does not** call `startAutoLoad()`. TinyBase's auto-load installs a 1Hz `setInterval` that re-reads IndexedDB and replays the entire store via `setContent` every tick. On the game-data store (~60k rows) that caused ~800ms main-thread blocks and dominated UI lag. This app is the sole writer to its DBs, so event-driven save + one-time load is sufficient. Don't re-enable auto-load without understanding that tradeoff.

### Price solver architecture

The price calculator is the app's core feature. It derives cost/sale prices for every craftable product given the user's selected skills, talents, crafting tables, plugin modules, manual prices, and margins.

Flow:

1. `PriceCalculator.tsx` subscribes to any change in `buildStore` and calls `recalculate()` (`useBuild`, `useSolverSnapshot`, `usePriceSolver`).
2. `usePriceSolver` debounces for 200ms, then lazily invokes a `getInput` thunk _inside the debounce_ — the snapshot build reads thousands of rows, so collapsing bursts of mutations into one snapshot matters. Don't move snapshot construction to the click path.
3. The built `SolverInput` is posted to `src/workers/price-solver.worker.ts` (a Web Worker; keeps the main thread free during iterative resolution).
4. The worker calls `solve()` in `src/lib/solver.ts`, which iteratively resolves recipes whose ingredient prices are all known, applies modifiers (`src/lib/dynamic-values.ts`) and margins (`src/lib/margins.ts`), and returns `SolverOutput`.
5. Results are pushed into an **out-of-React price signal** (`use-prices-signal`). Individual cells (`Products`, `Materials`) subscribe per-price, so a new solver result updates only the cells whose price actually changed. The `PriceCalculator` / `Products` / DataTable tree does **not** re-render on new solver results. Preserve this pattern when touching price display — dropping it will cause large table re-renders.

Types for the solver contract live in `src/types/solver.ts`; game-data types in `src/types/game-data.ts`; dataset import schema in `src/types/dataset-json.ts`.

### Components

- `src/components/price-calculator/` — the main UI (ConfigPanel, Materials, Products, RecipeDialog, etc.)
- `src/components/dataset/` — first-run dataset picker and switcher
- `src/components/import/` — custom dataset import
- `src/components/settings/` — sidebar, theme (PrimeReact), purge-data dialog
- `src/components/common/` — shared inputs (`EcoIcon`, `NumericField`, `PriceField`, autocomplete)

Path alias: `@/*` → `src/*` (both Vite and tsconfig). Prefer `@/` over relative imports across directories.

### i18n and localized names

Strings come from `src/i18n/messages/`. Game entity names are localized _in the dataset JSON_ (`LocalizedName: { 'en-US': '...', 'fr-FR': '...' }`) and resolved via `use-localized-name` / `localized-name-store`. Adding a translation for UI chrome is separate from game-data translations (those come from Crowdin during dataset extraction).

## Conventions

- React 19, function components, hooks only. PrimeReact + PrimeFlex for UI.
- oxfmt: single quotes, no semicolons, 2-space indent, ES5 trailing commas, sorted imports.
- Tests: vitest + @testing-library/react + jsdom + `fake-indexeddb` (see `src/test-setup.ts`). Coverage excludes `src/types/*` and `__tests__/**`.
- Dataset extraction/import logic (`src/lib/import-dataset.ts`, `scripts/extract-eco-dataset.ts`) is regex-/template-based against Eco's auto-generated C#. It's brittle by design — see README for limitations before "fixing" parser edge cases.

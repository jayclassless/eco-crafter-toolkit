# eco-crafter-toolkit

## Development Tools

### Extracting a fresh dataset from an Eco server install

`scripts/extract-eco-dataset.ts` reads the auto-generated C# under
`<eco-root>/Eco_Data/Server/Mods/__core__/AutoGen/` and writes a `DatasetJson`
matching `src/types/dataset-json.ts`.

#### Prerequisites

- A local Eco server install (the directory containing `Eco_Data/`).
- `mise exec -- pnpm install` (the script's deps `tsx` and
  `@crowdin/crowdin-api-client` live in root `devDependencies`).
- Optional: a Crowdin API token for translations
  (https://crowdin.com/settings#api-key). Without it, only `en-US` is populated.

#### Usage

```sh
mise exec -- pnpm tsx scripts/extract-eco-dataset.ts \
  --eco-root /path/to/EcoServer \
  --output   /path/to/eco-vN.json \
  --version  1 \
  [--crowdin-token TOKEN | CROWDIN_API_TOKEN=TOKEN] \
  [--crowdin-project 300454] \
  [--compare public/data/eco-v12.json]
```

All of `--eco-root` and `--output` are required. The script
never writes to `public/data/` automatically and never edits
`datasets-manifest.json` — point `--output` wherever you want, then move and
register the file by hand.

#### Comparison output

When `--compare <existing-dataset.json>` is passed, the script prints an
entity-count table after writing:

```
[compare] vs public/data/eco-v12.json
  Entity       existing   generated    delta
  Skills             43          43        0
  Items            1441        1576     +135
  Tags              139         157      +18
  Recipes          1367        1080     -287
```

Use this to sanity-check the run before promoting the file. Drops are not
inherently wrong (the game removes content between versions) but warrant a
spot-check against the source `.cs` files.

#### Known limitations of the dataset extractor

- The parser is regex-based against the auto-generated C# templates. Hand-edited
  recipe files outside `AutoGen/` are not picked up.
- Talent levels/values come from `AutoGen/Benefit/*.cs` only — talents declared
  elsewhere will appear with `Value: 0, Level: 0`.
- Plugin module detection assumes the `EfficiencyModule` constructor signature
  used by the core templates.
- Crowdin string matching is by exact English source text. New strings without
  a Crowdin entry stay English-only.

### Extracting icons from an Eco game install

`scripts/extract-eco-icons.ts` drives [AssetRipper](https://github.com/AssetRipper/AssetRipper)
to dump sprite metadata from Eco's `icons_assets_all_*.bundle`, fetches the
underlying tileset PNGs via AssetRipper's dev HTTP API, then crops each
sprite into `items/`, `skills/`, `talents/`, or `misc/` under `--output`.

#### Prerequisites

- A local Eco install (the directory containing `Eco_Data/`). A full client
  install yields more icons than a server-only install.
- A built `AssetRipper.GUI.Free` binary (Linux build works).
- `mise exec -- pnpm install` (the script's only extra dep is `sharp`,
  already in `devDependencies`).

#### Usage

```sh
mise exec -- pnpm tsx scripts/extract-eco-icons.ts \
  --eco-root     /path/to/EcoServer \
  --output       /path/to/eco-icons \
  --asset-ripper /path/to/AssetRipper.GUI.Free \
  [--compare     public/data/eco-vN.json]
```

`--output` is the **root** icon directory; the script creates and writes
into four sub-directories matching `public/assets/eco-icons/`:
`items/`, `skills/`, `talents/`, `misc/`. `_FG` sprite variants are skipped.

The script never writes into `public/assets/eco-icons/` automatically —
point `--output` there explicitly to overwrite.

#### Compare-only mode

Pass `--compare` **without** `--eco-root`/`--asset-ripper` to skip
extraction and just audit an existing `--output` tree against a dataset:

```sh
mise exec -- pnpm tsx scripts/extract-eco-icons.ts \
  --output  public/assets/eco-icons \
  --compare public/data/eco-v12.json
```

The report enumerates Items / Skills / Talents / Tags coverage and prints
every missing entry name in full (sorted). Exit code is always 0 — this is
a report, not a gate.

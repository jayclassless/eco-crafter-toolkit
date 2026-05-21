# Utility Scripts

## Extracting a fresh dataset from an Eco server install

`scripts/extract-eco-dataset.ts` reads the auto-generated C# under
`<eco-root>/Eco_Data/Server/Mods/__core__/AutoGen/` and writes a `DatasetJson`
matching `src/types/dataset-json.ts`.

### Prerequisites

- A local Eco server install (the directory containing `Eco_Data/`).
- `mise exec -- aube install` (the script's deps `tsx` and `adm-zip` live in
  root `devDependencies`).
- Optional: a translations zip from Eco's translation platform, downloadable
  at https://localization.play.eco/download/eco/?format=zip:csv. Without it,
  only `en-US` is populated.

### Usage

```sh
mise exec -- aube exec tsx scripts/extract-eco-dataset.ts \
  --eco-root /path/to/EcoServer \
  --output   /path/to/eco-vN.json \
  [--version 1] \
  [--translations-zip /path/to/eco.zip] \
  [--compare public/data/eco-v12.json]
```

`--eco-root` and `--output` are required; everything else has defaults
(`--version` defaults to `1`). The translations zip is the file served by
https://localization.play.eco/download/eco/?format=zip:csv; the script
reads its `eco-game-<locale>.csv` and `eco-ecopedia-<locale>.csv` members
to populate non-English `LocalizedName` entries.

Environment variable fallbacks (used when the corresponding flag is omitted):

- `ECO_ROOT` → `--eco-root`
- `ECO_TRANSLATIONS_ZIP` → `--translations-zip`

The script never writes to `public/data/` automatically and never edits
`datasets-manifest.json` — point `--output` wherever you want, then move and
register the file by hand.

### Comparison output

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

After the count table, the script also prints per-entity **added** and
**missing** name lists for Skills, Items, Tags, and Recipes whenever the two
sets differ — useful for spotting renames or unintended drops.

Use this to sanity-check the run before promoting the file. Drops are not
inherently wrong (the game removes content between versions) but warrant a
spot-check against the source `.cs` files.

### Known limitations of the dataset extractor

- The parser is regex-based against the auto-generated C# templates. Hand-edited
  recipe files outside `AutoGen/` are not picked up.
- Talent levels/values come from `AutoGen/Benefit/*.cs` only — talents declared
  elsewhere will appear with `Value: 0, Level: 0`.
- Plugin module detection assumes the `EfficiencyModule` constructor signature
  used by the core templates.
- Translation matching is by exact English source text. Strings without a
  matching `source` row in the translations zip stay English-only.

## Extracting icons from an Eco game install

`scripts/extract-eco-icons.ts` drives [AssetRipper](https://github.com/AssetRipper/AssetRipper)
to dump sprite metadata from Eco's `icons_assets_all_*.bundle`, fetches the
underlying tileset PNGs via AssetRipper's dev HTTP API, then crops each
sprite into `items/`, `skills/`, `talents/`, or `misc/` under `--output`.

### Prerequisites

- A local Eco install (the directory containing `Eco_Data/`). A full client
  install yields more icons than a server-only install.
- A built `AssetRipper.GUI.Free` binary (Linux build works).
- `mise exec -- aube install` (the script's only extra dep is `sharp`,
  already in `devDependencies`).

### Usage

```sh
mise exec -- aube exec tsx scripts/extract-eco-icons.ts \
  --eco-root     /path/to/EcoServer \
  --output       /path/to/eco-icons \
  --asset-ripper /path/to/AssetRipper.GUI.Free \
  [--compare     public/data/eco-vN.json]
```

Environment variable fallbacks (used when the corresponding flag is omitted):

- `ECO_ROOT` → `--eco-root`
- `ASSET_RIPPER` → `--asset-ripper`

`--output` is the **root** icon directory; the script creates and writes
into four sub-directories matching `public/eco-icons/`:
`items/`, `skills/`, `talents/`, `misc/`. `_FG` sprite variants are skipped.

The script never writes into `public/eco-icons/` automatically —
point `--output` there explicitly to overwrite.

### Compare-only mode

Pass `--compare` **without** `--eco-root`/`--asset-ripper` to skip
extraction and just audit an existing `--output` tree against a dataset:

```sh
mise exec -- aube exec tsx scripts/extract-eco-icons.ts \
  --output  public/eco-icons \
  --compare public/data/eco-v12.json
```

The report enumerates Items / Skills / Talents / Tags coverage and prints
every missing entry name in full (sorted). Exit code is always 0 — this is
a report, not a gate.

## Auditing icon coverage across all bundled datasets

`scripts/report-icon-coverage.ts` cross-references every dataset listed in
`public/data/datasets-manifest.json` against the icons under
`public/eco-icons/`, then reports:

- **Unreferenced icons** — icon files on disk that no dataset references.
- **Missing icons** — names referenced by some dataset that have no PNG on disk.

Unlike `extract-eco-icons.ts --compare`, this script has no flags for input
paths — it always reads `public/data/datasets-manifest.json` and
`public/eco-icons/` from the repo root.

### Usage

```sh
mise exec -- aube exec tsx scripts/report-icon-coverage.ts \
  [--purge-unreferenced]
```

> ⚠️ `--purge-unreferenced` is **destructive**: it deletes every PNG from
> `public/eco-icons/` that isn't referenced by any dataset in the manifest.
> Run without the flag first to review the unreferenced list, and make sure
> the manifest contains every dataset you care about before purging.

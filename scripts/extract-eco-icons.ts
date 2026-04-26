#!/usr/bin/env tsx
/**
 * Extract Eco game icons from a local Eco install's Unity icon bundle.
 *
 * Usage:
 *   aube exec tsx scripts/extract-eco-icons.ts \
 *     --eco-root     /path/to/EcoServer \
 *     --output       public/eco-icons \
 *     --asset-ripper /path/to/AssetRipper.GUI.Free \
 *     [--compare     public/data/eco-vN.json]
 *
 * Environment variables (used when the corresponding flag is omitted):
 *   ECO_ROOT      -> --eco-root
 *   ASSET_RIPPER  -> --asset-ripper
 *
 * Pipeline:
 *
 *   1. Locate <eco-root>/Eco_Data/StreamingAssets/aa/StandaloneLinux64/
 *        icons_assets_all_*.bundle
 *   2. Spawn AssetRipper in headless mode, read its HTTP server URL from
 *      stdout (line "Now listening on: http://127.0.0.1:<port>").
 *   3. POST /LoadFile to load the bundle.
 *   4. Enumerate the "Sprite Data Storage" collection via /Bundles/View +
 *      /Collections/View HTML and fetch each tileset PNG directly via
 *      GET /Assets/Image?Path=...&Extension=png.
 *   5. Enumerate all sprites from the cab-* collection via /Assets/Json.
 *      The Linux PrimaryContent export is incomplete (often missing >60%
 *      of sprites), so we pull metadata entirely through the API.
 *   6. For every sprite (skipping *_FG — the app doesn't use foreground
 *      variants) look at m_Rect + m_RD.m_Texture.m_PathID, map to a
 *      tileset, flip Y, and crop via sharp into one of four sub-dirs
 *      matching the existing public/eco-icons/ layout:
 *
 *        *Item.png          -> items/
 *        *Skill.png         -> skills/
 *        *TalentGroup.png   -> talents/
 *        everything else    -> misc/
 *
 * --compare mode: load a dataset JSON and report how many Items / Skills /
 * Talents / Tags have a matching icon in --output (across all sub-dirs).
 * Can be used without --eco-root/--asset-ripper to audit an existing tree.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import * as readline from 'node:readline'

// Node built-in `undici` is exposed for global dispatcher tweaks; use it
// via a dynamic import so we don't need the external type package.
import sharp from 'sharp'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import type { DatasetJson } from '../src/types/dataset-json'

// All AR fetches (LoadFile, /Assets/Image, /Assets/Json, /Bundles/View)
// return promptly, so the default Node fetch timeouts are fine.

// ---------------------------------------------------------------------------
// CLI

interface Args {
  ecoRoot?: string
  output: string
  assetRipper?: string
  compare?: string
}

async function parseArgs(): Promise<Args> {
  const parsed = await yargs(hideBin(process.argv))
    .scriptName('extract-eco-icons')
    .usage('$0 --output <dir> [options]')
    .option('eco-root', {
      type: 'string',
      describe: 'Path to Eco server install (env: ECO_ROOT)',
      default: process.env.ECO_ROOT,
      defaultDescription: '$ECO_ROOT',
    })
    .option('output', {
      type: 'string',
      describe: 'Output directory for extracted icons',
      demandOption: true,
    })
    .option('asset-ripper', {
      type: 'string',
      describe: 'Path to AssetRipper.GUI.Free binary (env: ASSET_RIPPER)',
      default: process.env.ASSET_RIPPER,
      defaultDescription: '$ASSET_RIPPER',
    })
    .option('compare', {
      type: 'string',
      describe: 'Compare mode: dataset JSON to audit coverage against',
    })
    .strict()
    .help()
    .parse()

  const out: Args = {
    ecoRoot: parsed.ecoRoot,
    output: parsed.output,
    assetRipper: parsed.assetRipper,
    compare: parsed.compare,
  }
  const hasExtractArgs = Boolean(out.ecoRoot || out.assetRipper)
  if (hasExtractArgs) {
    if (!out.ecoRoot) throw new Error('--eco-root is required when extracting (or set ECO_ROOT)')
    if (!out.assetRipper) {
      throw new Error('--asset-ripper is required when extracting (or set ASSET_RIPPER)')
    }
  } else if (!out.compare) {
    throw new Error('provide --eco-root + --asset-ripper to extract, and/or --compare to audit')
  }
  return out
}

// ---------------------------------------------------------------------------
// Categorization

type Category = 'items' | 'skills' | 'talents' | 'misc'
const CATEGORIES: readonly Category[] = ['items', 'skills', 'talents', 'misc']

function categorize(spriteName: string): Category {
  if (spriteName.endsWith('Item')) return 'items'
  if (spriteName.endsWith('Skill')) return 'skills'
  if (spriteName.endsWith('TalentGroup')) return 'talents'
  return 'misc'
}

// ---------------------------------------------------------------------------
// AssetRipper driver

async function startAssetRipper(assetRipperPath: string): Promise<{
  serverUrl: string
  proc: ChildProcess
}> {
  const proc = spawn(assetRipperPath, ['--headless'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  proc.stderr?.on('data', (d) => process.stderr.write(`[AssetRipper] ${d}`))

  const rl = readline.createInterface({ input: proc.stdout!, crlfDelay: Infinity })

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('AssetRipper did not report a listening URL within 30s'))
    }, 30_000)

    proc.on('exit', (code) => {
      clearTimeout(timeout)
      reject(new Error(`AssetRipper exited early with code ${code}`))
    })

    rl.on('line', (line) => {
      process.stdout.write(`[AssetRipper] ${line}\n`)
      const m = line.match(/Now listening on: (http:\/\/127\.0\.0\.1:\d+)/)
      if (m) {
        clearTimeout(timeout)
        rl.close()
        resolve({ serverUrl: m[1], proc })
      }
    })
  })
}

async function postForm(url: string, form: Record<string, string>): Promise<Response> {
  const body = new URLSearchParams(form).toString()
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    redirect: 'manual',
  })
  await res.arrayBuffer().catch(() => undefined)
  if (res.status >= 400) {
    throw new Error(`POST ${url} -> ${res.status} ${res.statusText}`)
  }
  return res
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ---------------------------------------------------------------------------
// Tileset fetch (via direct /Assets/Image)

interface Tileset {
  name: string
  file: string
  width: number
  height: number
  /** pathID of the Texture2D referenced by sprites that belong to this atlas */
  texturePathID: string
}

/**
 * Scrape /Bundles/View -> find "Sprite Data Storage" collection link ->
 * scrape its /Collections/View for asset links+names -> download each PNG
 * via /Assets/Image.
 */
/**
 * Pull the first `m_PathID` value nested under `"<fieldName>":` from a raw
 * JSON blob, as a decimal string. We can't JSON.parse because Unity pathIDs
 * are Int64s that exceed `Number.MAX_SAFE_INTEGER`.
 */
function extractFirstPathID(raw: string, fieldName: string): string | undefined {
  const re = new RegExp(`"${fieldName}"\\s*:\\s*\\{[^}]*"m_PathID"\\s*:\\s*(-?\\d+)`)
  return re.exec(raw)?.[1]
}

async function walkBundleForSpriteStorages(serverUrl: string, root: string): Promise<string[]> {
  // BFS walk of the bundle tree, visiting each node once. We only descend
  // into paths that are strict extensions of `root` so the "Parent" link
  // on each Bundles/View page can't send us back up to the global root
  // (which would trigger unbounded recursion / OOM).
  const out: string[] = []
  const visited = new Set<string>()
  const queue: string[] = [root]
  while (queue.length > 0) {
    const bundlePath = queue.shift() as string
    if (visited.has(bundlePath)) continue
    visited.add(bundlePath)
    const url = `${serverUrl}/Bundles/View?Path=${encodeURIComponent(bundlePath)}`
    const res = await fetch(url)
    if (!res.ok) continue
    const html = await res.text()
    for (const m of html.matchAll(/href="(\/Collections\/View\?Path=[^"]+)"[^>]*>([^<]+)/g)) {
      if (m[2].trim() === 'Sprite Data Storage') out.push(m[1])
    }
    // Enqueue sub-bundles: their path JSON should have a strictly longer
    // "P" array than `bundlePath`'s (we don't parse it; just skip anything
    // we've seen and anything equal to root).
    for (const m of html.matchAll(/href="(\/Bundles\/View\?Path=[^"]+)"/g)) {
      const sub = decodeURIComponent(m[1].split('Path=')[1])
      if (visited.has(sub)) continue
      // Heuristic: ignore the global root once we've descended past it.
      if (sub === root && bundlePath !== root) continue
      queue.push(sub)
    }
  }
  return out
}

async function fetchTilesets(serverUrl: string, cacheDir: string): Promise<Tileset[]> {
  const storageHrefs = await walkBundleForSpriteStorages(serverUrl, '{"P":[]}')
  const uniq = Array.from(new Set(storageHrefs))
  console.log(`Found ${uniq.length} Sprite Data Storage collection(s)`)

  await fs.mkdir(cacheDir, { recursive: true })
  const tilesets: Tileset[] = []
  const seenNames = new Set<string>()
  for (const collectionHref of uniq) {
    const collectionHtml = await (await fetch(`${serverUrl}${collectionHref}`)).text()
    const assetMatches = [
      ...collectionHtml.matchAll(/href="(\/Assets\/View\?Path=[^"]+)"[^>]*>([^<]+)/g),
    ]
    for (const [, href, rawName] of assetMatches) {
      const name = rawName.trim()
      if (name === 'GameBundle' || name.startsWith('cab-')) continue
      const pathQ = href.split('Path=')[1]
      if (!pathQ) continue
      // Names can collide across bundles; dedupe via a unique filename.
      let safeName = name
      let n = 1
      while (seenNames.has(safeName)) safeName = `${name}__${n++}`
      seenNames.add(safeName)
      console.log(`Fetching tileset ${safeName} ...`)
      // First the metadata JSON so we can map sprite.m_RD.m_Texture
      // pathIDs to this atlas.
      const jsonRes = await fetch(`${serverUrl}/Assets/Json?Path=${pathQ}`)
      if (!jsonRes.ok) {
        console.warn(`  skip ${safeName}: json HTTP ${jsonRes.status}`)
        continue
      }
      // JSON.parse would clip Int64 pathIDs beyond Number.MAX_SAFE_INTEGER,
      // so read the raw text and pull the first Texture.m_PathID ourselves.
      const rawJson = await jsonRes.text()
      const texturePathID = extractFirstPathID(rawJson, 'Texture')
      if (!texturePathID || texturePathID === '0') {
        console.warn(`  skip ${safeName}: no Texture pathID`)
        continue
      }
      const imgRes = await fetch(`${serverUrl}/Assets/Image?Path=${pathQ}&Extension=png`)
      if (!imgRes.ok) {
        console.warn(`  skip ${safeName}: image HTTP ${imgRes.status}`)
        continue
      }
      const buf = Buffer.from(await imgRes.arrayBuffer())
      const file = path.join(cacheDir, `${safeName}.png`)
      await fs.writeFile(file, buf)
      const img = await sharp(file).metadata()
      if (typeof img.width !== 'number' || typeof img.height !== 'number') {
        console.warn(`  skip ${safeName}: no dimensions`)
        continue
      }
      tilesets.push({
        name: safeName,
        file,
        width: img.width,
        height: img.height,
        texturePathID,
      })
      console.log(`  ${safeName}: ${img.width}x${img.height} (pathID ${texturePathID})`)
    }
  }
  // Prefer the biggest tilesets first so fit-checks resolve there before
  // tiny UI textures that also happen to contain matching coordinates.
  tilesets.sort((a, b) => b.width * b.height - a.width * a.height)
  return tilesets
}

// ---------------------------------------------------------------------------
// Sprite metadata fetch (via AR API)

interface SpriteRect {
  m_X: number
  m_Y: number
  m_Width: number
  m_Height: number
}

interface SpriteInfo {
  name: string
  rect: SpriteRect
  texturePathID: string | undefined
  /** Raw JSON text (for pathID extraction via regex) */
  raw: string
}

/**
 * Enumerate all sprites in the bundle's cab-* collection via the AR web API.
 * The Linux PrimaryContent export is incomplete (often missing >60% of
 * sprites), so we fetch metadata directly from the API instead.
 */
async function fetchSpriteMetadata(serverUrl: string): Promise<SpriteInfo[]> {
  // Walk bundle tree to find the cab-* collection (contains individual sprites)
  const visited = new Set<string>()
  const queue = ['{"P":[]}']
  const cabHrefs: string[] = []

  while (queue.length > 0) {
    const bp = queue.shift()!
    if (visited.has(bp)) continue
    visited.add(bp)
    const url = `${serverUrl}/Bundles/View?Path=${encodeURIComponent(bp)}`
    const res = await fetch(url)
    if (!res.ok) continue
    const html = await res.text()
    for (const m of html.matchAll(/href="(\/Collections\/View\?Path=[^"]+)"[^>]*>([^<]+)/g)) {
      const name = m[2].trim()
      if (name.startsWith('cab-')) cabHrefs.push(m[1])
    }
    for (const m of html.matchAll(/href="(\/Bundles\/View\?Path=[^"]+)"/g)) {
      const sub = decodeURIComponent(m[1].split('Path=')[1])
      if (!visited.has(sub)) queue.push(sub)
    }
  }

  if (cabHrefs.length === 0) {
    console.warn('No cab-* collections found in bundle')
    return []
  }

  // Enumerate all asset paths from cab-* collections
  const assetEntries: { pathQ: string; name: string }[] = []
  for (const href of cabHrefs) {
    const collHtml = await (await fetch(`${serverUrl}${href}`)).text()
    for (const m of collHtml.matchAll(/href="(\/Assets\/View\?Path=[^"]+)"[^>]*>([^<]+)/g)) {
      const name = m[2].trim()
      if (name === 'GameBundle' || name.startsWith('cab-')) continue
      // Skip _FG foreground variants
      if (name.endsWith('_FG')) continue
      const pathQ = m[1].split('Path=')[1]
      if (pathQ) assetEntries.push({ pathQ, name })
    }
  }

  console.log(`Found ${assetEntries.length} sprite assets in cab-* collection(s)`)

  // Fetch JSON metadata for each sprite in parallel
  const sprites: SpriteInfo[] = []
  const concurrency = 20
  let idx = 0
  let fetched = 0

  async function worker() {
    while (true) {
      const i = idx++
      if (i >= assetEntries.length) return
      const { pathQ, name } = assetEntries[i]
      try {
        const jsonRes = await fetch(`${serverUrl}/Assets/Json?Path=${pathQ}`)
        if (!jsonRes.ok) continue
        const raw = await jsonRes.text()
        const data = JSON.parse(raw) as { m_Rect?: SpriteRect }
        const rect = data.m_Rect
        if (!rect || rect.m_Width === 0 || rect.m_Height === 0) continue
        const texturePathID = extractFirstPathID(raw, 'm_Texture')
        sprites.push({ name, rect, texturePathID, raw })
      } catch {
        // Skip non-sprite assets (materials, shaders, etc.)
      }
      if (++fetched % 500 === 0) {
        console.log(`  Fetched metadata: ${fetched} / ${assetEntries.length}`)
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker))
  console.log(`  ${sprites.length} sprites with valid m_Rect`)
  return sprites
}

// ---------------------------------------------------------------------------
// Sprite cropping

function pickTileset(
  texturePathID: string | undefined,
  rect: SpriteRect,
  byPathID: Map<string, Tileset>,
  tilesets: Tileset[]
): Tileset | undefined {
  if (texturePathID) {
    const hit = byPathID.get(texturePathID)
    if (hit) return hit
  }
  // Fallback: first tileset whose dims contain the rect.
  const right = rect.m_X + rect.m_Width
  const top = rect.m_Y + rect.m_Height
  for (const t of tilesets) {
    if (right <= t.width && top <= t.height) return t
  }
  return undefined
}

async function extractSprites(
  sprites: SpriteInfo[],
  tilesets: Tileset[],
  outputRoot: string
): Promise<{ ok: number; failed: string[] }> {
  await Promise.all(CATEGORIES.map((c) => fs.mkdir(path.join(outputRoot, c), { recursive: true })))
  const byPathID = new Map<string, Tileset>()
  for (const t of tilesets) byPathID.set(t.texturePathID, t)

  const failed: string[] = []
  let ok = 0
  let done = 0

  const concurrency = 20
  let idx = 0
  async function worker() {
    while (true) {
      const i = idx++
      if (i >= sprites.length) return
      const sprite = sprites[i]
      try {
        const tileset = pickTileset(sprite.texturePathID, sprite.rect, byPathID, tilesets)
        if (!tileset) {
          throw new Error(`no tileset fits rect ${JSON.stringify(sprite.rect)}`)
        }
        const left = Math.round(sprite.rect.m_X)
        const width = Math.round(sprite.rect.m_Width)
        const height = Math.round(sprite.rect.m_Height)
        const top = Math.round(tileset.height - sprite.rect.m_Y - sprite.rect.m_Height)
        const category = categorize(sprite.name)
        const outFile = path.join(outputRoot, category, `${sprite.name}.png`)
        await sharp(tileset.file).extract({ left, top, width, height }).toFile(outFile)
        ok++
      } catch (e) {
        failed.push(`${sprite.name}: ${(e as Error).message}`)
      }
      if (++done % 500 === 0) {
        console.log(`  Cropped: ${done} / ${sprites.length}`)
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker))
  return { ok, failed }
}

// ---------------------------------------------------------------------------
// Bundle discovery

async function findIconBundle(ecoRoot: string): Promise<string> {
  const dir = path.join(ecoRoot, 'Eco_Data', 'StreamingAssets', 'aa', 'StandaloneLinux64')
  const entries = await fs.readdir(dir)
  const matches = entries.filter((n) => n.startsWith('icons_assets_all_') && n.endsWith('.bundle'))
  if (matches.length === 0) {
    throw new Error(`no icons_assets_all_*.bundle found in ${dir}`)
  }
  if (matches.length > 1) {
    throw new Error(`multiple icons bundles found in ${dir}: ${matches.join(', ')}`)
  }
  return path.join(dir, matches[0])
}

// ---------------------------------------------------------------------------
// Extraction flow

async function runExtraction(args: Args & { ecoRoot: string; assetRipper: string }): Promise<void> {
  const bundlePath = await findIconBundle(args.ecoRoot)
  console.log(`Bundle: ${bundlePath}`)

  const tilesetDir = path.join(args.output, '.tilesets')
  await fs.mkdir(tilesetDir, { recursive: true })

  let proc: ChildProcess | undefined
  try {
    const started = await startAssetRipper(args.assetRipper)
    proc = started.proc
    const { serverUrl } = started
    console.log(`AssetRipper listening on ${serverUrl}`)
    await sleep(2000)

    await postForm(`${serverUrl}/LoadFile`, { path: bundlePath })
    await sleep(2000)

    const tilesets = await fetchTilesets(serverUrl, tilesetDir)
    if (tilesets.length === 0) {
      throw new Error('no tilesets fetched from AssetRipper')
    }

    const sprites = await fetchSpriteMetadata(serverUrl)

    const { ok, failed } = await extractSprites(sprites, tilesets, args.output)
    console.log(`Cropped ${ok} sprites into ${args.output}`)
    if (failed.length > 0) {
      console.warn(`${failed.length} sprites failed:`)
      for (const f of failed) console.warn(`  ${f}`)
    }
  } finally {
    if (proc && !proc.killed) proc.kill()
    await fs.rm(tilesetDir, { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------------------
// Compare mode

async function collectIconNames(outputRoot: string): Promise<Set<string>> {
  const found = new Set<string>()
  for (const sub of CATEGORIES) {
    const dir = path.join(outputRoot, sub)
    let entries: string[]
    try {
      entries = await fs.readdir(dir)
    } catch {
      continue
    }
    for (const e of entries) {
      if (e.endsWith('.png') && !e.endsWith('_FG.png')) {
        found.add(e.slice(0, -'.png'.length))
      }
    }
  }
  return found
}

function pct(numer: number, denom: number): string {
  if (denom === 0) return '100.00%'
  return `${((numer / denom) * 100).toFixed(2)}%`
}

function reportCategory(label: string, names: string[], icons: Set<string>): void {
  const unique = Array.from(new Set(names)).sort()
  const missing = unique.filter((n) => !icons.has(n))
  const present = unique.length - missing.length
  const pad = label.padEnd(9)
  console.log(`${pad} ${present} / ${unique.length}  (${pct(present, unique.length)})`)
  if (missing.length > 0) {
    console.log(`  missing:`)
    for (const m of missing) console.log(`    ${m}`)
  }
}

async function runCompare(outputRoot: string, datasetPath: string): Promise<void> {
  const text = await fs.readFile(datasetPath, 'utf8')
  const dataset = JSON.parse(text) as DatasetJson
  const icons = await collectIconNames(outputRoot)

  console.log(`\nCoverage report (dataset: ${datasetPath}, icons: ${outputRoot}):`)
  reportCategory(
    'Items:',
    dataset.Items.map((i) => i.Name),
    icons
  )
  reportCategory(
    'Skills:',
    dataset.Skills.map((s) => s.Name),
    icons
  )
  reportCategory(
    'Talents:',
    dataset.Skills.flatMap((s) => s.Talents.map((t) => t.TalentGroupName)),
    icons
  )
  reportCategory(
    'Tags:',
    dataset.Tags.map((t) => t.Name),
    icons
  )
}

// ---------------------------------------------------------------------------
// Main

async function main(): Promise<void> {
  const args = await parseArgs()

  if (args.ecoRoot && args.assetRipper) {
    await fs.mkdir(args.output, { recursive: true })
    await runExtraction(args as Args & { ecoRoot: string; assetRipper: string })
  }

  if (args.compare) {
    await runCompare(args.output, args.compare)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

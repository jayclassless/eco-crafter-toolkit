import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import type { DatasetJson } from '../src/types/dataset-json'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ICONS_ROOT = path.join(ROOT, 'public/eco-icons')
const DATA_DIR = path.join(ROOT, 'public/data')
const MANIFEST_PATH = path.join(DATA_DIR, 'datasets-manifest.json')

const CATEGORIES = ['items', 'skills', 'talents', 'misc'] as const

const CATEGORY_SUFFIXES: [string, string][] = [
  ['Item', 'items'],
  ['Skill', 'skills'],
  ['TalentGroup', 'talents'],
]

interface ManifestEntry {
  id: string
  file: string
}

interface Manifest {
  datasets: ManifestEntry[]
}

function iconCategory(name: string): string {
  for (const [suffix, dir] of CATEGORY_SUFFIXES) {
    if (name.endsWith(suffix)) return dir
  }
  return 'misc'
}

/** Scan all icon subdirectories and return a map of category -> set of base names (without .png). */
async function collectIcons(): Promise<Map<string, Set<string>>> {
  const result = new Map<string, Set<string>>()
  for (const cat of CATEGORIES) {
    const dir = path.join(ICONS_ROOT, cat)
    const names = new Set<string>()
    let entries: string[]
    try {
      entries = await fs.readdir(dir)
    } catch {
      result.set(cat, names)
      continue
    }
    for (const e of entries) {
      if (e.endsWith('.png')) {
        names.add(e.slice(0, -'.png'.length))
      }
    }
    result.set(cat, names)
  }
  return result
}

/** Extract all entity names from a dataset that are expected to have icons. */
function datasetNames(ds: DatasetJson): Set<string> {
  const names = new Set<string>()
  for (const item of ds.Items) names.add(item.Name)
  for (const skill of ds.Skills) {
    names.add(skill.Name)
    for (const talent of skill.Talents) names.add(talent.TalentGroupName)
  }
  for (const tag of ds.Tags) names.add(tag.Name)
  return names
}

function printSection(label: string, items: string[]): void {
  console.log(`${label} (${items.length}):`)
  if (items.length === 0) {
    console.log('  (none)')
  } else {
    for (const item of items) console.log(`  ${item}`)
  }
}

async function main(): Promise<void> {
  const argv = await yargs(hideBin(process.argv))
    .scriptName('report-icon-coverage')
    .usage('$0 [options]')
    .option('purge-unreferenced', {
      type: 'boolean',
      default: false,
      describe: 'Delete icon files that are not referenced by any dataset',
    })
    .strict()
    .help()
    .parse()
  const purge = argv.purgeUnreferenced

  // Load manifest and all datasets
  const manifest: Manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8'))
  const allReferenced = new Set<string>()

  for (const entry of manifest.datasets) {
    const dsPath = path.join(DATA_DIR, entry.file)
    const ds: DatasetJson = JSON.parse(await fs.readFile(dsPath, 'utf8'))
    for (const name of datasetNames(ds)) allReferenced.add(name)
  }

  // Collect icons on disk
  const iconsByCategory = await collectIcons()

  // Build flat set of all icon base names and maps for paths
  const allIcons = new Set<string>()
  const iconRelPaths = new Map<string, string>()
  for (const [cat, names] of iconsByCategory) {
    for (const name of names) {
      allIcons.add(name)
      iconRelPaths.set(name, `${cat}/${name}.png`)
    }
  }

  // Unreferenced icons (on disk but not in any dataset)
  const unreferenced = [...allIcons]
    .filter((n) => !allReferenced.has(n))
    .map((n) => iconRelPaths.get(n)!)
    .sort()

  // Missing icons (in dataset but no file on disk)
  // Check using the same category logic as EcoIcon.tsx
  const missing: string[] = []
  for (const name of allReferenced) {
    const cat = iconCategory(name)
    const catIcons = iconsByCategory.get(cat)
    if (!catIcons || !catIcons.has(name)) {
      missing.push(`${cat}/${name}.png`)
    }
  }
  missing.sort()

  // Report
  console.log(`Datasets: ${manifest.datasets.map((d) => d.id).join(', ')}`)
  console.log(`Referenced names: ${allReferenced.size}`)
  console.log(`Icon files on disk: ${allIcons.size}`)
  console.log()

  printSection('Unreferenced icons', unreferenced)
  console.log()
  printSection('Missing icons', missing)

  // Purge
  if (purge && unreferenced.length > 0) {
    console.log()
    console.log(`Deleting ${unreferenced.length} unreferenced icon files...`)
    for (const rel of unreferenced) {
      await fs.unlink(path.join(ICONS_ROOT, rel))
    }
    console.log('Done.')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

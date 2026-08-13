import { type AutoCompleteCompleteEvent } from 'primereact/autocomplete'
import { Button } from 'primereact/button'
import { Column } from 'primereact/column'
import { DataTable } from 'primereact/datatable'
import { Dialog } from 'primereact/dialog'
import { Panel } from 'primereact/panel'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CraftingTableIcon } from '@/components/common/CraftingTableIcon'
import {
  GroupedAutoComplete,
  type GroupedAutoCompleteGroup,
} from '@/components/common/GroupedAutoComplete'
import { NumericField } from '@/components/common/NumericField'
import { useCraftingTableManagement } from '@/hooks/use-crafting-table-management'
import { useLocalization } from '@/hooks/use-localization'
import { useLocalizedName } from '@/hooks/use-localized-name'
import { useStoreRevision } from '@/hooks/use-store-revision'
import { craftingTableModules } from '@/lib/game-data-indexes'
import {
  deriveTableModuleSlots,
  MODULE_SLOT_CELLS,
  MODULE_SLOT_ORDER,
  type SlotSelection,
} from '@/lib/module-slots'
import { useStores } from '@/stores/providers'

import type { ModuleSlotRow } from './crafting-table-modules-types'
import { CraftingTableModulesCell } from './CraftingTableModulesCell'

const BUILD_TABLES = ['userCraftingTables'] as const

interface Props {
  buildId: string
  datasetId: string
}

interface TableOption {
  id: string
  name: string
  rawName: string
}

type TableGroup = GroupedAutoCompleteGroup<TableOption>

interface UserTableRow {
  id: string
  craftingTableId: string
  name: string
  rawName: string
  /** Slots this table exposes, derived from the modules it accepts. */
  slots: ModuleSlotRow[]
  /** Installed module id per slot. */
  selectedModules: SlotSelection
  costPerMinute: number
}

export function CraftingTablesPanel({ buildId, datasetId }: Props) {
  const { t } = useTranslation()
  const { gameDataStore, buildStore } = useStores()
  const { getName } = useLocalizedName(datasetId)
  const { compare } = useLocalization()
  const tableMgmt = useCraftingTableManagement(buildId, datasetId)
  const [suggestions, setSuggestions] = useState<TableGroup[]>([])
  const [pendingDeleteTableId, setPendingDeleteTableId] = useState<string | null>(null)
  const [pendingDeleteRecipeCount, setPendingDeleteRecipeCount] = useState(0)
  useStoreRevision(buildStore, BUILD_TABLES)

  const getUserTables = useCallback((): UserTableRow[] => {
    const rows: UserTableRow[] = []
    for (const rowId of buildStore.getRowIds('userCraftingTables')) {
      const row = buildStore.getRow('userCraftingTables', rowId)
      if (row.buildId !== buildId) continue

      const ctId = row.craftingTableId as string
      const ctRow = gameDataStore.getRow('craftingTables', ctId)
      const name = getName('craftingTable', ctId)

      // Slot rows come straight out of the shared index — the table→slot wiring
      // lives in the game's compiled code, so it is inferred from the modules
      // the table accepts. A legacy dataset normalizes every module to
      // Specialty, so a legacy table derives exactly one Specialty row and the
      // popover shows the single dropdown it always did.
      const slots = deriveTableModuleSlots(
        craftingTableModules(gameDataStore, datasetId, ctId).map((m) => ({
          ...m,
          name: getName('pluginModule', m.id) || m.name,
          rawName: m.name,
        }))
      ).map((s) => ({
        ...s,
        candidates: s.candidates
          .map(({ id, name, rawName }) => ({ id, name, rawName }))
          .sort((a, b) => compare(a.name, b.name)),
      }))

      const selectedModules: SlotSelection = {}
      for (const slot of MODULE_SLOT_ORDER) {
        const id = row[MODULE_SLOT_CELLS[slot]] as string
        if (id) selectedModules[slot] = id
      }

      rows.push({
        id: rowId,
        craftingTableId: ctId,
        name,
        rawName: ctRow.name as string,
        slots,
        selectedModules,
        costPerMinute: row.costPerMinute as number,
      })
    }
    rows.sort((a, b) => compare(a.name, b.name))
    return rows
  }, [buildId, buildStore, datasetId, gameDataStore, getName, compare])

  const tables = getUserTables()

  const searchTables = (event: AutoCompleteCompleteEvent) => {
    const query = event.query.toLowerCase()
    const existing = new Set(tables.map((t) => t.craftingTableId))

    // Build a map from raw skill name to row ID for profession name resolution
    const skillIdByName = new Map<string, string>()
    for (const rowId of gameDataStore.getRowIds('skills')) {
      const skill = gameDataStore.getRow('skills', rowId)
      if (skill.datasetId !== datasetId) continue
      skillIdByName.set(skill.name as string, rowId)
    }

    // Build crafting table -> professions map from recipes
    // Key by raw profession name, store label for display
    const profLabels = new Map<string, string>()
    const tableProfessions = new Map<string, Set<string>>()
    for (const rowId of gameDataStore.getRowIds('recipes')) {
      const recipe = gameDataStore.getRow('recipes', rowId)
      if (recipe.datasetId !== datasetId) continue
      const ctId = recipe.craftingTableId as string
      const skillId = recipe.skillId as string
      if (!ctId || !skillId) continue

      const skill = gameDataStore.getRow('skills', skillId)
      const profRaw = (skill.profession as string) || (skill.name as string)
      if (!profLabels.has(profRaw)) {
        const profRowId = skillIdByName.get(profRaw)
        profLabels.set(profRaw, profRowId ? getName('skill', profRowId) : profRaw)
      }

      let profs = tableProfessions.get(ctId)
      if (!profs) {
        profs = new Set()
        tableProfessions.set(ctId, profs)
      }
      profs.add(profRaw)
    }

    // Collect matching tables
    const matchingTables: TableOption[] = []
    for (const rowId of gameDataStore.getRowIds('craftingTables')) {
      const ct = gameDataStore.getRow('craftingTables', rowId)
      if (ct.datasetId !== datasetId) continue
      if (existing.has(rowId)) continue

      const name = getName('craftingTable', rowId)
      if (name.toLowerCase().includes(query)) {
        matchingTables.push({ id: rowId, name, rawName: ct.name as string })
      }
    }

    // Group by profession, duplicating tables that belong to multiple
    const grouped = new Map<string, { label: string; rawName: string; items: TableOption[] }>()
    for (const table of matchingTables) {
      const profs = tableProfessions.get(table.id)
      const rawNames = profs && profs.size > 0 ? [...profs] : ['_Other']
      for (const rawName of rawNames) {
        if (!grouped.has(rawName)) {
          grouped.set(rawName, {
            label:
              profLabels.get(rawName) ??
              (rawName === '_Other' ? t('common.otherProfession') : rawName),
            rawName,
            items: [],
          })
        }
        grouped.get(rawName)!.items.push(table)
      }
    }

    const groups: TableGroup[] = [...grouped.values()]
      .sort((a, b) => compare(a.label, b.label))
      .map(({ label, rawName, items }) => ({
        profession: label,
        professionRawName: rawName,
        items: items.sort((a, b) => compare(a.name, b.name)),
      }))

    setSuggestions(groups)
  }

  const moduleTemplate = (row: UserTableRow) => (
    <CraftingTableModulesCell
      slots={row.slots}
      selected={row.selectedModules}
      onSelect={(slot, moduleId) => tableMgmt.setSlotModule(row.id, slot, moduleId)}
      idPrefix={`uct-${row.id}`}
    />
  )

  const costTemplate = (row: UserTableRow) => (
    <NumericField
      value={row.costPerMinute}
      onChange={(v) => tableMgmt.setCostPerMinute(row.id, v ?? 0)}
      maxFractionDigits={2}
      min={0}
      style={{ width: '4rem' }}
    />
  )

  const requestDelete = (userTableId: string) => {
    const dependents = tableMgmt.getRecipesUsingTable(userTableId)
    if (dependents.length === 0) {
      tableMgmt.removeTableWithRecipes(userTableId)
      return
    }
    setPendingDeleteRecipeCount(dependents.length)
    setPendingDeleteTableId(userTableId)
  }

  const cancelDelete = () => {
    setPendingDeleteTableId(null)
    setPendingDeleteRecipeCount(0)
  }

  const confirmDelete = () => {
    if (pendingDeleteTableId) tableMgmt.removeTableWithRecipes(pendingDeleteTableId)
    cancelDelete()
  }

  const deleteTemplate = (row: UserTableRow) => (
    <Button
      icon="pi pi-trash"
      severity="danger"
      text
      size="small"
      onClick={() => requestDelete(row.id)}
    />
  )

  return (
    <Panel
      header={t('priceCalculator.config.craftingTablesCount', { count: tables.length })}
      toggleable
    >
      <GroupedAutoComplete
        placeholder={t('priceCalculator.config.addTable')}
        suggestions={suggestions}
        completeMethod={searchTables}
        onSelect={(item) => tableMgmt.addTable(item.id)}
      />
      {tables.length > 0 && (
        <DataTable value={tables} size="small">
          <Column
            header={t('priceCalculator.config.craftingTables')}
            body={(row: UserTableRow) => (
              <div className="flex align-items-center gap-2">
                <CraftingTableIcon table={{ name: row.rawName }} />
                <span>{row.name}</span>
              </div>
            )}
          />
          <Column
            header={t('priceCalculator.config.upgrade')}
            body={moduleTemplate}
            style={{ width: '9rem' }}
          />
          <Column
            header={t('priceCalculator.config.costPerMinute')}
            body={costTemplate}
            style={{ width: '5rem' }}
          />
          <Column body={deleteTemplate} style={{ width: '3rem' }} />
        </DataTable>
      )}
      <Dialog
        header={t('priceCalculator.config.deleteTableTitle')}
        visible={pendingDeleteTableId !== null}
        onHide={cancelDelete}
        footer={
          <div className="flex justify-content-end gap-2">
            <Button label={t('priceCalculator.config.cancel')} text onClick={cancelDelete} />
            <Button
              label={t('priceCalculator.config.deleteTable')}
              severity="danger"
              icon="pi pi-trash"
              onClick={confirmDelete}
            />
          </div>
        }
      >
        <p>{t('priceCalculator.config.deleteTableMessage', { count: pendingDeleteRecipeCount })}</p>
      </Dialog>
    </Panel>
  )
}

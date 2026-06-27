import { Button } from 'primereact/button'
import { Checkbox, type CheckboxChangeEvent } from 'primereact/checkbox'
import { Column } from 'primereact/column'
import { DataTable } from 'primereact/datatable'
import { Dialog } from 'primereact/dialog'
import { Dropdown, type DropdownChangeEvent } from 'primereact/dropdown'
import { Panel } from 'primereact/panel'
import { RadioButton } from 'primereact/radiobutton'
import { Tooltip } from 'primereact/tooltip'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { NumericField } from '@/components/common/NumericField'
import { MarginNameCell } from '@/components/price-calculator/build-options/MarginNameCell'
import { MarginPercentCell } from '@/components/price-calculator/build-options/MarginPercentCell'
import { useMarginManagement } from '@/hooks/use-margin-management'
import { useSettings } from '@/hooks/use-settings'
import {
  useCellInTableRevision,
  useStoreRevision,
  useTableRowIdsRevision,
} from '@/hooks/use-store-revision'
import { useStores } from '@/stores/providers'

const SETTINGS_TABLES = ['userSettings', 'builds'] as const

interface Props {
  buildId: string
}

interface MarginRow {
  id: string
  isDefault: boolean
}

interface UserSettings {
  id: string
  buildId: string
  marginType: string
  calorieCost: number
  applyMarginBetweenSkills: boolean
  allowMultipleTalentPicks: boolean
  defaultShareForSecondaryItems: number
}

export function OptionsPanel({ buildId }: Props) {
  const { t } = useTranslation()
  const { buildStore } = useStores()
  const marginMgmt = useMarginManagement(buildId)
  const settingsMgmt = useSettings(buildId)
  const [marginToDelete, setMarginToDelete] = useState<string | null>(null)
  const [affectedRecipeCount, setAffectedRecipeCount] = useState(0)
  // Re-render the panel on margin add/remove and default changes, and on any
  // settings change — but NOT on `userMargins.name`/`.percent` cell edits.
  // Those are owned by the self-subscribing MarginNameCell / MarginPercentCell,
  // so typing a margin name no longer round-trips through the panel and rebuilds
  // the whole DataTable on every keystroke.
  useTableRowIdsRevision(buildStore, ['userMargins'])
  useCellInTableRevision(buildStore, 'userMargins', 'isDefault')
  useStoreRevision(buildStore, SETTINGS_TABLES)

  const getSettings = useCallback((): UserSettings | null => {
    for (const rowId of buildStore.getRowIds('userSettings')) {
      const row = buildStore.getRow('userSettings', rowId)
      if (row.buildId === buildId) {
        return {
          id: rowId,
          buildId: row.buildId as string,
          marginType: row.marginType as string,
          calorieCost: row.calorieCost as number,
          applyMarginBetweenSkills: row.applyMarginBetweenSkills as boolean,
          allowMultipleTalentPicks: row.allowMultipleTalentPicks === true,
          defaultShareForSecondaryItems: (row.defaultShareForSecondaryItems as number) ?? 20,
        }
      }
    }
    return null
  }, [buildId, buildStore])

  // Only the fields the panel itself renders (the default radio + delete
  // enablement). `name`/`percent` are read directly by their self-subscribing
  // cells, so they're intentionally absent here — the panel doesn't re-render
  // when they change.
  const getMargins = useCallback((): MarginRow[] => {
    const rows: MarginRow[] = []
    for (const rowId of buildStore.getRowIds('userMargins')) {
      const row = buildStore.getRow('userMargins', rowId)
      if (row.buildId === buildId) {
        rows.push({ id: rowId, isDefault: row.isDefault as boolean })
      }
    }
    return rows
  }, [buildId, buildStore])

  // Stable handlers so the memoized name/percent cells bail when the panel
  // re-renders for unrelated reasons. `marginMgmt` is itself memoized per build.
  const handleMarginName = useCallback(
    (id: string, value: string) => marginMgmt.updateMargin(id, 'name', value),
    [marginMgmt]
  )
  const handleMarginPercent = useCallback(
    (id: string, value: number) => marginMgmt.updateMargin(id, 'percent', value),
    [marginMgmt]
  )

  const settings = getSettings()
  const margins = getMargins()

  const marginTypeOptions = useMemo(
    () => [
      { label: t('priceCalculator.config.marginTypeMarkup'), value: 'markup' },
      { label: t('priceCalculator.config.marginTypeGrossMargin'), value: 'grossMargin' },
    ],
    [t]
  )

  if (!settings) return null

  const setSetting = settingsMgmt.setSetting

  const requestDeleteMargin = (id: string) => {
    if (margins.length <= 1) return
    const count = marginMgmt.countAffectedRecipes(id)
    if (count > 0) {
      setAffectedRecipeCount(count)
      setMarginToDelete(id)
    } else {
      marginMgmt.deleteMargin(id)
    }
  }

  const confirmDeleteMargin = (id: string) => {
    marginMgmt.deleteMargin(id)
    setMarginToDelete(null)
  }

  const marginNameTemplate = (row: MarginRow) => (
    <MarginNameCell marginId={row.id} buildStore={buildStore} onChange={handleMarginName} />
  )

  const marginPercentTemplate = (row: MarginRow) => (
    <MarginPercentCell marginId={row.id} buildStore={buildStore} onChange={handleMarginPercent} />
  )

  const marginDefaultTemplate = (row: MarginRow) => (
    <RadioButton checked={row.isDefault} onChange={() => marginMgmt.setDefaultMargin(row.id)} />
  )

  const marginDeleteTemplate = (row: MarginRow) => (
    <Button
      icon="pi pi-trash"
      severity="danger"
      text
      size="small"
      disabled={row.isDefault || margins.length <= 1}
      onClick={() => requestDeleteMargin(row.id)}
    />
  )

  return (
    <Panel header={t('priceCalculator.config.options')} toggleable>
      <div className="flex flex-column gap-3">
        {/* Margins table */}
        <div>
          <div className="flex align-items-center justify-content-between mb-1">
            <label className="text-sm font-semibold">{t('priceCalculator.config.margins')}</label>
            <Button
              icon="pi pi-plus"
              label={t('priceCalculator.config.addMargin')}
              size="small"
              text
              onClick={() => marginMgmt.createMargin()}
            />
          </div>
          {margins.length > 0 && (
            <DataTable
              value={margins}
              dataKey="id"
              size="small"
              tableStyle={{ width: '100%', tableLayout: 'fixed' }}
            >
              <Column header={t('priceCalculator.config.marginName')} body={marginNameTemplate} />
              <Column
                header={t('priceCalculator.config.marginPercent')}
                body={marginPercentTemplate}
                style={{ width: '5rem' }}
              />
              <Column body={marginDefaultTemplate} style={{ width: '3rem' }} />
              <Column body={marginDeleteTemplate} style={{ width: '3rem' }} />
            </DataTable>
          )}
        </div>

        {/* Margin type */}
        <div>
          <label className="block mb-1 text-sm">
            {t('priceCalculator.config.marginType')}
            <i className="pi pi-info-circle ml-1 text-xs margin-type-tooltip" />
          </label>
          <Tooltip target=".margin-type-tooltip" position="right">
            <div>
              <p>
                <strong>{t('priceCalculator.config.marginTypeMarkup')}:</strong>{' '}
                {t('priceCalculator.config.marginTypeMarkupTooltip')}
              </p>
              <p className="mt-1">
                <strong>{t('priceCalculator.config.marginTypeGrossMargin')}:</strong>{' '}
                {t('priceCalculator.config.marginTypeGrossMarginTooltip')}
              </p>
            </div>
          </Tooltip>
          <Dropdown
            value={settings.marginType}
            options={marginTypeOptions}
            onChange={(e: DropdownChangeEvent) => setSetting('marginType', e.value)}
            className="w-full"
          />
        </div>

        {/* Apply margin between skills */}
        <div className="flex align-items-center gap-2">
          <Checkbox
            inputId="marginBetweenSkills"
            checked={settings.applyMarginBetweenSkills}
            onChange={(e: CheckboxChangeEvent) =>
              setSetting('applyMarginBetweenSkills', e.checked ?? false)
            }
          />
          <label htmlFor="marginBetweenSkills" className="text-sm">
            {t('priceCalculator.config.applyMarginBetweenSkills')}
            <i className="pi pi-info-circle ml-1 text-xs margin-between-tooltip" />
          </label>
          <Tooltip
            target=".margin-between-tooltip"
            content={t('priceCalculator.config.applyMarginBetweenSkillsTooltip')}
            position="right"
          />
        </div>

        {/* Calorie cost */}
        <div>
          <label className="block mb-1 text-sm">
            {t('priceCalculator.config.calorieCost')}
            <i className="pi pi-info-circle ml-1 text-xs calorie-tooltip" />
          </label>
          <Tooltip
            target=".calorie-tooltip"
            content={t('priceCalculator.config.calorieCostTooltip')}
            position="right"
          />
          <NumericField
            value={settings.calorieCost}
            onChange={(v) => setSetting('calorieCost', v ?? 0)}
            min={0}
            className="w-full"
          />
        </div>

        {/* Default share for secondary items */}
        <div>
          <label className="block mb-1 text-sm">
            {t('priceCalculator.config.defaultShareForSecondaryItems')}
            <i className="pi pi-info-circle ml-1 text-xs default-share-tooltip" />
          </label>
          <Tooltip
            target=".default-share-tooltip"
            content={t('priceCalculator.config.defaultShareForSecondaryItemsTooltip')}
            position="right"
          />
          <NumericField
            value={settings.defaultShareForSecondaryItems}
            onChange={(v) => setSetting('defaultShareForSecondaryItems', v ?? 0)}
            min={0}
            max={100}
            suffix="%"
            className="w-full"
          />
        </div>

        {/* Allow multiple talent picks */}
        <div className="flex align-items-center gap-2">
          <Checkbox
            inputId="allowMultipleTalentPicks"
            checked={settings.allowMultipleTalentPicks}
            onChange={(e: CheckboxChangeEvent) =>
              setSetting('allowMultipleTalentPicks', e.checked ?? false)
            }
          />
          <label htmlFor="allowMultipleTalentPicks" className="text-sm">
            {t('priceCalculator.config.allowMultipleTalentPicks')}
            <i className="pi pi-info-circle ml-1 text-xs allow-multiple-talents-tooltip" />
          </label>
          <Tooltip
            target=".allow-multiple-talents-tooltip"
            content={t('priceCalculator.config.allowMultipleTalentPicksTooltip')}
            position="right"
          />
        </div>

        <Dialog
          header={t('priceCalculator.config.deleteMarginTitle')}
          visible={marginToDelete !== null}
          onHide={() => setMarginToDelete(null)}
          footer={
            <div className="flex justify-content-end gap-2">
              <Button
                label={t('priceCalculator.config.cancel')}
                text
                onClick={() => setMarginToDelete(null)}
              />
              <Button
                label={t('common.ok')}
                severity="danger"
                onClick={() => {
                  if (marginToDelete) confirmDeleteMargin(marginToDelete)
                }}
              />
            </div>
          }
        >
          <p>{t('priceCalculator.config.deleteMarginMessage', { count: affectedRecipeCount })}</p>
        </Dialog>
      </div>
    </Panel>
  )
}

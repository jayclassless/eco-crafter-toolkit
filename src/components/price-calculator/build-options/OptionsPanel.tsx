import { Button } from 'primereact/button'
import { Checkbox, type CheckboxChangeEvent } from 'primereact/checkbox'
import { Column } from 'primereact/column'
import { DataTable } from 'primereact/datatable'
import { Dialog } from 'primereact/dialog'
import { Dropdown, type DropdownChangeEvent } from 'primereact/dropdown'
import { InputText } from 'primereact/inputtext'
import { Panel } from 'primereact/panel'
import { RadioButton } from 'primereact/radiobutton'
import { Tooltip } from 'primereact/tooltip'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { NumericField } from '@/components/common/NumericField'
import { useMarginManagement } from '@/hooks/use-margin-management'
import { useSettings } from '@/hooks/use-settings'
import { useStoreRevision } from '@/hooks/use-store-revision'
import { useStores } from '@/stores/providers'

const BUILD_TABLES = ['userMargins', 'userSettings', 'builds'] as const

interface Props {
  buildId: string
}

interface MarginRow {
  id: string
  name: string
  percent: number
  isDefault: boolean
}

interface UserSettings {
  id: string
  buildId: string
  marginType: string
  calorieCost: number
  applyMarginBetweenSkills: boolean
  defaultShareForSecondaryItems: number
}

export function OptionsPanel({ buildId }: Props) {
  const { t } = useTranslation()
  const { buildStore } = useStores()
  const marginMgmt = useMarginManagement(buildId)
  const settingsMgmt = useSettings(buildId)
  const [marginToDelete, setMarginToDelete] = useState<string | null>(null)
  const [affectedRecipeCount, setAffectedRecipeCount] = useState(0)
  useStoreRevision(buildStore, BUILD_TABLES)

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
          defaultShareForSecondaryItems: (row.defaultShareForSecondaryItems as number) ?? 20,
        }
      }
    }
    return null
  }, [buildId, buildStore])

  const getMargins = useCallback((): MarginRow[] => {
    const rows: MarginRow[] = []
    for (const rowId of buildStore.getRowIds('userMargins')) {
      const row = buildStore.getRow('userMargins', rowId)
      if (row.buildId === buildId) {
        rows.push({
          id: rowId,
          name: row.name as string,
          percent: row.percent as number,
          isDefault: row.isDefault as boolean,
        })
      }
    }
    return rows
  }, [buildId, buildStore])

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
    <InputText
      value={row.name}
      onChange={(e) => marginMgmt.updateMargin(row.id, 'name', e.target.value)}
      className="w-full"
    />
  )

  const marginPercentTemplate = (row: MarginRow) => (
    <NumericField
      value={row.percent}
      onChange={(v) => marginMgmt.updateMargin(row.id, 'percent', v ?? 0)}
      min={0}
      max={999}
      className="w-full"
    />
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

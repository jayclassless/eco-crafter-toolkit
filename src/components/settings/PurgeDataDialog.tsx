import { Button } from 'primereact/button'
import { Checkbox } from 'primereact/checkbox'
import { Dialog } from 'primereact/dialog'
import { Toast } from 'primereact/toast'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { purgeData } from '@/lib/purge-data'
import { useStores } from '@/stores/providers'

interface Props {
  visible: boolean
  onHide: () => void
}

type Dataset = { id: string; name: string }

export function PurgeDataDialog({ visible, onHide }: Props) {
  const { t } = useTranslation()
  const { gameDataStore, buildStore, uiStore, gameDataPersister, buildPersister, uiPersister } =
    useStores()

  // Live snapshot of datasets and builds (re-reads on any mutation while dialog is open)
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [totalBuildCount, setTotalBuildCount] = useState(0)
  const [buildsByDataset, setBuildsByDataset] = useState<Record<string, number>>({})

  const refreshSnapshot = useCallback(() => {
    const dsList: Dataset[] = gameDataStore.getRowIds('datasets').map((id) => ({
      id,
      name: (gameDataStore.getCell('datasets', id, 'name') as string) ?? id,
    }))
    setDatasets(dsList)

    const buildIds = buildStore.getRowIds('builds')
    setTotalBuildCount(buildIds.length)

    const byDataset: Record<string, number> = {}
    for (const buildId of buildIds) {
      const datasetId = buildStore.getCell('builds', buildId, 'datasetId') as string
      byDataset[datasetId] = (byDataset[datasetId] ?? 0) + 1
    }
    setBuildsByDataset(byDataset)
  }, [gameDataStore, buildStore])

  // Re-read on open; also subscribe while visible so late mutations stay in sync
  useEffect(() => {
    if (!visible) return
    refreshSnapshot()
    const dsListener = gameDataStore.addTableListener('datasets', refreshSnapshot)
    const buildListener = buildStore.addTableListener('builds', refreshSnapshot)
    return () => {
      gameDataStore.delListener(dsListener)
      buildStore.delListener(buildListener)
    }
  }, [visible, gameDataStore, buildStore, refreshSnapshot])

  // Selection state
  const [selectedDatasetIds, setSelectedDatasetIds] = useState<Set<string>>(new Set())
  const [purgeAllBuilds, setPurgeAllBuilds] = useState(false)
  const [isPurging, setIsPurging] = useState(false)
  const toastRef = useRef<Toast>(null)

  // Reset state whenever the dialog opens
  useEffect(() => {
    if (visible) {
      setSelectedDatasetIds(new Set())
      setPurgeAllBuilds(false)
      setIsPurging(false)
    }
  }, [visible])

  const allDatasetsSelected = useMemo(
    () => datasets.length > 0 && selectedDatasetIds.size === datasets.length,
    [datasets, selectedDatasetIds]
  )

  const toggleDataset = (id: string) => {
    setSelectedDatasetIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAllDatasets = () => {
    setSelectedDatasetIds((prev) =>
      prev.size === datasets.length ? new Set() : new Set(datasets.map((d) => d.id))
    )
  }

  const canContinue = selectedDatasetIds.size > 0 || purgeAllBuilds

  const [phase, setPhase] = useState<'select' | 'confirm'>('select')

  // Reset phase when dialog opens (state already reset above)
  useEffect(() => {
    if (visible) setPhase('select')
  }, [visible])

  const selectedDatasets = useMemo(
    () => datasets.filter((d) => selectedDatasetIds.has(d.id)),
    [datasets, selectedDatasetIds]
  )
  const effectiveBuildCount = useMemo(() => {
    if (purgeAllBuilds) return totalBuildCount
    let n = 0
    for (const id of selectedDatasetIds) n += buildsByDataset[id] ?? 0
    return n
  }, [purgeAllBuilds, totalBuildCount, selectedDatasetIds, buildsByDataset])

  const handlePurge = async () => {
    setIsPurging(true)
    try {
      await purgeData(
        {
          datasetIds: Array.from(selectedDatasetIds),
          purgeAllBuilds,
        },
        { gameDataStore, buildStore, uiStore },
        { gameData: gameDataPersister, build: buildPersister, ui: uiPersister }
      )
      window.location.reload()
    } catch {
      toastRef.current?.show({
        severity: 'error',
        summary: t('settings.purge.errorSummary'),
        detail: t('settings.purge.errorDetail'),
        life: 5000,
      })
      setIsPurging(false)
    }
  }

  return (
    <Dialog
      header={
        phase === 'select' ? t('settings.purge.dialogTitle') : t('settings.purge.confirmTitle')
      }
      visible={visible}
      onHide={isPurging ? () => {} : onHide}
      closable={!isPurging}
      closeOnEscape={!isPurging}
      style={{ width: '32rem' }}
      modal
    >
      <Toast ref={toastRef} />
      <div className="flex flex-column gap-4">
        {phase === 'select' ? (
          <>
            {/* Datasets section */}
            <div>
              <h4 className="mt-0 mb-2">{t('settings.purge.datasetsSection')}</h4>
              {datasets.length === 0 ? (
                <p className="text-color-secondary m-0">{t('settings.purge.noDatasets')}</p>
              ) : (
                <>
                  <div className="flex align-items-center gap-2 mb-2">
                    <Checkbox
                      inputId="purge-all-datasets"
                      checked={allDatasetsSelected}
                      onChange={toggleAllDatasets}
                    />
                    <label htmlFor="purge-all-datasets" className="cursor-pointer">
                      {t('settings.purge.selectAllDatasets')}
                    </label>
                  </div>
                  <ul className="list-none p-0 m-0 flex flex-column gap-2 pl-3">
                    {datasets.map((d) => {
                      const checked = selectedDatasetIds.has(d.id)
                      const tied = buildsByDataset[d.id] ?? 0
                      return (
                        <li key={d.id} className="flex flex-column gap-1">
                          <div className="flex align-items-center gap-2">
                            <Checkbox
                              inputId={`purge-ds-${d.id}`}
                              checked={checked}
                              onChange={() => toggleDataset(d.id)}
                            />
                            <label htmlFor={`purge-ds-${d.id}`} className="cursor-pointer">
                              {d.name}
                            </label>
                          </div>
                          {checked && tied > 0 && (
                            <small className="text-color-secondary pl-4">
                              {tied === 1
                                ? t('settings.purge.tiedBuildsWarningOne')
                                : t('settings.purge.tiedBuildsWarningMany', { count: tied })}
                            </small>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}
            </div>

            {/* Builds section */}
            <div>
              <h4 className="mt-0 mb-2">{t('settings.purge.buildsSection')}</h4>
              <div className="flex align-items-center gap-2">
                <Checkbox
                  inputId="purge-all-builds"
                  checked={purgeAllBuilds}
                  disabled={totalBuildCount === 0}
                  onChange={() => setPurgeAllBuilds((v) => !v)}
                />
                <label htmlFor="purge-all-builds" className="cursor-pointer">
                  {totalBuildCount === 1
                    ? t('settings.purge.purgeAllBuildsOne')
                    : t('settings.purge.purgeAllBuildsMany', { count: totalBuildCount })}
                </label>
              </div>
            </div>

            {/* Phase 1 footer */}
            <div className="flex justify-content-end gap-2 mt-2">
              <Button label={t('settings.purge.cancel')} outlined onClick={onHide} />
              <Button
                label={t('settings.purge.continue')}
                disabled={!canContinue}
                onClick={() => setPhase('confirm')}
              />
            </div>
          </>
        ) : (
          <>
            {/* Phase 2 body */}
            <div className="flex align-items-start gap-2">
              <i
                className="pi pi-exclamation-triangle text-xl"
                style={{ color: 'var(--red-500)' }}
              />
              <strong>{t('settings.purge.cannotBeUndone')}</strong>
            </div>
            <ul className="pl-4 m-0 flex flex-column gap-1">
              {selectedDatasets.length > 0 && (
                <li>
                  {selectedDatasets.length === 1
                    ? t('settings.purge.summaryDatasetOne', {
                        names: selectedDatasets.map((d) => d.name).join(', '),
                      })
                    : t('settings.purge.summaryDatasets', {
                        count: selectedDatasets.length,
                        names: selectedDatasets.map((d) => d.name).join(', '),
                      })}
                </li>
              )}
              {effectiveBuildCount > 0 && (
                <li>
                  {effectiveBuildCount === 1
                    ? t('settings.purge.summaryBuildsOne')
                    : t('settings.purge.summaryBuildsMany', { count: effectiveBuildCount })}
                </li>
              )}
            </ul>

            {/* Phase 2 footer */}
            <div className="flex justify-content-end gap-2 mt-2">
              <Button
                label={t('settings.purge.back')}
                outlined
                disabled={isPurging}
                onClick={() => setPhase('select')}
              />
              <Button
                label={t('settings.purge.purge')}
                severity="danger"
                loading={isPurging}
                onClick={handlePurge}
              />
            </div>
          </>
        )}
      </div>
    </Dialog>
  )
}

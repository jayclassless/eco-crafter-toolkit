import { Button } from 'primereact/button'
import { FileUpload, type FileUploadHandlerEvent } from 'primereact/fileupload'
import { Message } from 'primereact/message'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { useGameData } from '@/hooks/use-game-data'
import { validateDatasetJson, parseDataset } from '@/lib/import-dataset'
import type { DatasetJson } from '@/types/dataset-json'

interface ManifestEntry {
  id: string
  name: string
  file: string
  revision: number
}

interface Props {
  onComplete: () => void
}

export function DatasetSetup({ onComplete }: Props) {
  const { t } = useTranslation()
  const { importDataset } = useGameData()
  const [manifest, setManifest] = useState<ManifestEntry[]>([])
  const [loading, setLoading] = useState<string | null>(null)
  const [errors, setErrors] = useState<string[]>([])

  useEffect(() => {
    fetch('/data/datasets-manifest.json')
      .then((r) => r.json())
      .then((data) => setManifest(data.datasets ?? []))
      .catch(() => setManifest([]))
  }, [])

  const installBundled = async (entry: ManifestEntry) => {
    setLoading(entry.id)
    setErrors([])
    try {
      const response = await fetch(`/data/${entry.file}`)
      const json: DatasetJson = await response.json()
      const validation = validateDatasetJson(json)
      if (!validation.valid) {
        setErrors(validation.errors)
        return
      }
      const parsed = parseDataset(json, entry.id)
      await importDataset(parsed, entry.name, entry.id, entry.revision)
      onComplete()
    } finally {
      setLoading(null)
    }
  }

  const handleUpload = async (event: FileUploadHandlerEvent) => {
    setErrors([])
    const file = event.files[0]
    try {
      const text = await file.text()
      const json: DatasetJson = JSON.parse(text)
      const validation = validateDatasetJson(json)
      if (!validation.valid) {
        setErrors(validation.errors)
        return
      }
      const parsed = parseDataset(json, '')
      await importDataset(parsed, file.name.replace('.json', ''))
      onComplete()
    } catch {
      setErrors([t('dataset.importer.parseError')])
    }
  }

  return (
    <div
      className="flex flex-column align-items-center justify-content-center"
      style={{ minHeight: '80vh' }}
    >
      <h1>{t('dataset.selector.noDatasets')}</h1>

      {manifest.length > 0 && (
        <div className="mt-4">
          <h3>{t('dataset.selector.bundledDatasets')}</h3>
          <div className="flex gap-2 mt-2">
            {manifest.map((entry) => (
              <Button
                key={entry.id}
                label={entry.name}
                loading={loading === entry.id}
                onClick={() => installBundled(entry)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="mt-4">
        <h3>{t('dataset.importer.title')}</h3>
        <FileUpload
          mode="basic"
          accept=".json"
          customUpload
          uploadHandler={handleUpload}
          chooseLabel={t('dataset.importer.upload')}
          auto
        />
      </div>

      {errors.length > 0 && (
        <div className="mt-3">
          {errors.map((err, i) => (
            <Message key={i} severity="error" text={err} className="mb-1 w-full" />
          ))}
        </div>
      )}
    </div>
  )
}

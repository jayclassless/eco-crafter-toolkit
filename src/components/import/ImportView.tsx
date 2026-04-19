import { Button } from 'primereact/button'
import { FileUpload, type FileUploadHandlerEvent } from 'primereact/fileupload'
import { InputText } from 'primereact/inputtext'
import { Message } from 'primereact/message'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useGameData } from '@/hooks/use-game-data'
import { validateDatasetJson, parseDataset } from '@/lib/import-dataset'
import type { DatasetJson } from '@/types/dataset-json'

interface Props {
  onDone: () => void
}

export function ImportView({ onDone }: Props) {
  const { t } = useTranslation()
  const { importDataset } = useGameData()
  const [name, setName] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [parsedJson, setParsedJson] = useState<DatasetJson | null>(null)
  const [fileName, setFileName] = useState('')

  const handleSelect = async (event: FileUploadHandlerEvent) => {
    setErrors([])
    setParsedJson(null)
    const file = event.files[0]
    setFileName(file.name)
    setName(file.name.replace('.json', ''))

    try {
      const text = await file.text()
      const json: DatasetJson = JSON.parse(text)
      const validation = validateDatasetJson(json)
      if (!validation.valid) {
        setErrors(validation.errors)
        return
      }
      setParsedJson(json)
    } catch {
      setErrors([t('dataset.importer.parseError')])
    }
  }

  const handleImport = async () => {
    if (!parsedJson || !name.trim()) return
    const parsed = parseDataset(parsedJson, '')
    await importDataset(parsed, name.trim())
    onDone()
  }

  return (
    <div
      className="flex flex-column align-items-center p-4"
      style={{ maxWidth: '600px', margin: '0 auto' }}
    >
      <h1>{t('dataset.importer.title')}</h1>

      <div className="w-full mt-3">
        <FileUpload
          mode="basic"
          accept=".json"
          customUpload
          uploadHandler={handleSelect}
          chooseLabel={t('dataset.importer.upload')}
          auto
          className="w-full"
        />
      </div>

      {fileName && (
        <div className="w-full mt-3">
          <label className="block mb-1">{t('dataset.importer.name')}</label>
          <InputText value={name} onChange={(e) => setName(e.target.value)} className="w-full" />
        </div>
      )}

      {errors.length > 0 && (
        <div className="w-full mt-3">
          <h4>{t('dataset.importer.validationErrors')}</h4>
          {errors.map((err, i) => (
            <Message key={i} severity="error" text={err} className="mb-1 w-full" />
          ))}
        </div>
      )}

      {parsedJson && (
        <Button
          label={t('dataset.importer.import')}
          icon="pi pi-download"
          onClick={handleImport}
          className="mt-3"
          disabled={!name.trim()}
        />
      )}

      <Button
        label={t('common.back')}
        icon="pi pi-arrow-left"
        text
        onClick={onDone}
        className="mt-2"
      />
    </div>
  )
}

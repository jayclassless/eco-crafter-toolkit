import { Button } from 'primereact/button'
import { SelectButton, type SelectButtonChangeEvent } from 'primereact/selectbutton'
import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { useStores } from '@/stores/providers'

const THEME_COLORS = [
  { value: 'amber', hex: '#f59e0b' },
  { value: 'blue', hex: '#3b82f6' },
  { value: 'cyan', hex: '#06b6d4' },
  { value: 'green', hex: '#22c55e' },
  { value: 'indigo', hex: '#6366f1' },
  { value: 'pink', hex: '#ec4899' },
  { value: 'purple', hex: '#a855f7' },
  { value: 'teal', hex: '#14b8a6' },
] as const

const SCALE_MIN = 12
const SCALE_MAX = 18

export function UiSettingsView() {
  const { t } = useTranslation()
  const { uiStore } = useStores()

  const [themeMode, setThemeMode] = useState('auto')
  const [themeColor, setThemeColor] = useState('blue')
  const [uiScale, setUiScale] = useState(14)

  const syncFromStore = useCallback(() => {
    setThemeMode(uiStore.getCell('uiState', 'main', 'themeMode') as string)
    setThemeColor(uiStore.getCell('uiState', 'main', 'themeColor') as string)
    setUiScale(uiStore.getCell('uiState', 'main', 'uiScale') as number)
  }, [uiStore])

  useEffect(() => {
    syncFromStore()
    const listenerId = uiStore.addRowListener('uiState', 'main', () => {
      syncFromStore()
    })
    return () => {
      uiStore.delListener(listenerId)
    }
  }, [uiStore, syncFromStore])

  const modeOptions = [
    { icon: 'pi pi-sun', value: 'light', title: t('settings.light') },
    { icon: 'pi pi-moon', value: 'dark', title: t('settings.dark') },
    { icon: 'pi pi-desktop', value: 'auto', title: t('settings.auto') },
  ]

  return (
    <div className="flex flex-column gap-4">
      <div>
        <label className="block mb-2 text-sm font-semibold text-color-secondary">
          {t('settings.mode')}
        </label>
        <SelectButton
          value={themeMode}
          options={modeOptions}
          optionLabel="title"
          onChange={(e: SelectButtonChangeEvent) => {
            if (e.value) uiStore.setCell('uiState', 'main', 'themeMode', e.value)
          }}
          itemTemplate={(option) => (
            <span title={option.title}>
              <i className={option.icon} />
            </span>
          )}
          className="w-full settings-mode-selector"
        />
      </div>

      <div>
        <label className="block mb-2 text-sm font-semibold text-color-secondary">
          {t('settings.themeColor')}
        </label>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '12px',
          }}
        >
          {THEME_COLORS.map((c) => (
            <div
              key={c.value}
              onClick={() => uiStore.setCell('uiState', 'main', 'themeColor', c.value)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: c.hex,
                  outline: themeColor === c.value ? `2px solid ${c.hex}` : 'none',
                  outlineOffset: '3px',
                  transition: 'outline 0.15s',
                }}
              />
              <span
                className="text-xs"
                style={{
                  color:
                    themeColor === c.value ? 'var(--text-color)' : 'var(--text-color-secondary)',
                  fontWeight: themeColor === c.value ? 600 : 400,
                }}
              >
                {t(`settings.colors.${c.value}`)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className="block mb-2 text-sm font-semibold text-color-secondary">
          {t('settings.uiScale')}
        </label>
        <div className="flex align-items-center gap-2">
          <Button
            icon="pi pi-minus"
            outlined
            size="small"
            className="flex-1"
            disabled={uiScale <= SCALE_MIN}
            onClick={() => uiStore.setCell('uiState', 'main', 'uiScale', uiScale - 1)}
          />
          <Button
            icon="pi pi-plus"
            outlined
            size="small"
            className="flex-1"
            disabled={uiScale >= SCALE_MAX}
            onClick={() => uiStore.setCell('uiState', 'main', 'uiScale', uiScale + 1)}
          />
        </div>
      </div>
    </div>
  )
}

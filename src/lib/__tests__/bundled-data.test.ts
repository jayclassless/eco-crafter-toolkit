import { readFileSync } from 'fs'
import { resolve } from 'path'

import { describe, it, expect } from 'vitest'

import { validateDatasetJson } from '../import-dataset'

describe('bundled eco-v12 dataset', () => {
  it('passes validation', () => {
    const raw = readFileSync(resolve(__dirname, '../../../public/data/eco-v12.json'), 'utf-8')
    const data = JSON.parse(raw)
    const result = validateDatasetJson(data)

    if (!result.valid) {
      console.error('Validation errors:', result.errors.slice(0, 10))
    }
    expect(result.valid).toBe(true)
  })
})

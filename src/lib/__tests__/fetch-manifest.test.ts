import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchDatasetManifest } from '../fetch-manifest'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchDatasetManifest', () => {
  it('fetches and returns the manifest JSON', async () => {
    const manifest = {
      datasets: [{ id: 'eco-v13', name: 'Eco v13', file: 'v13.json', revision: 1, updatedAt: 'x' }],
    }
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => manifest }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchDatasetManifest()
    expect(result).toEqual(manifest)
    expect(fetchMock).toHaveBeenCalledWith('/data/datasets-manifest.json')
  })

  it('throws when the fetch is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, json: async () => ({}) }))
    )
    await expect(fetchDatasetManifest()).rejects.toThrow(/Failed to fetch dataset manifest/)
  })
})

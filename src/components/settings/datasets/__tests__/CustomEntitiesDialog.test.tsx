import { fireEvent, render, screen } from '@testing-library/react'
import type { IndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'
import { __resetLocalizedNameStore } from '@/stores/localized-name-store'
import { StoreContext } from '@/stores/providers'
import { createUIStore } from '@/stores/ui-store'

import { CustomEntitiesDialog } from '../CustomEntitiesDialog'

import '@/i18n'

const DS = 'ds1'

function stubPersister(): IndexedDbPersister {
  return { save: async () => {}, schedule: async () => {} } as unknown as IndexedDbPersister
}

function makeStores() {
  const gameDataStore = createGameDataStore()
  const buildStore = createBuildStore()
  const uiStore = createUIStore()
  gameDataStore.setRow('datasets', DS, {
    id: DS,
    name: 'Test',
    version: 1,
    bundledId: '',
    installedRevision: 0,
    importedAt: '',
    updatedAt: '',
    isCustom: false,
  })
  return { gameDataStore, buildStore, uiStore }
}

function renderDialog(visible = true) {
  const stores = makeStores()
  return render(
    <StoreContext.Provider
      value={{
        ...stores,
        gameDataPersister: stubPersister(),
        buildPersister: stubPersister(),
        uiPersister: stubPersister(),
      }}
    >
      <CustomEntitiesDialog visible={visible} onHide={() => {}} datasetId={DS} />
    </StoreContext.Provider>
  )
}

async function deleteDb(): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('eco-crafter-localized-names')
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}

beforeEach(async () => {
  await __resetLocalizedNameStore()
  await deleteDb()
})

afterEach(async () => {
  await __resetLocalizedNameStore()
})

describe('CustomEntitiesDialog', () => {
  it('renders both tabs and defaults to the Items tab', () => {
    renderDialog()
    expect(screen.getByText(/^items$/i)).toBeInTheDocument()
    expect(screen.getByText(/^recipes$/i)).toBeInTheDocument()
    // The Items tab's empty-state shows when no custom items exist.
    expect(screen.getByText(/no custom items yet/i)).toBeInTheDocument()
  })

  it('switches to the Recipes tab when its tab header is clicked', () => {
    renderDialog()
    fireEvent.click(screen.getByText(/^recipes$/i))
    expect(screen.getByText(/no custom recipes yet/i)).toBeInTheDocument()
  })

  it('renders nothing when not visible', () => {
    renderDialog(false)
    // The Dialog is not in the DOM until visible.
    expect(screen.queryByText(/no custom items yet/i)).toBeNull()
  })
})

import { createContext, useContext } from 'react'

export interface DependencyGraphContextValue {
  datasetId: string
  onOpenRecipe?: (recipeId: string) => void
  onOpenMaterial?: (itemId: string) => void
  onSelectRecipe: (nodeId: string, recipeId: string) => void
  onSelectTagItem: (nodeId: string, itemId: string) => void
}

export const DependencyGraphContext = createContext<DependencyGraphContextValue | null>(null)

export function useDependencyGraphContext(): DependencyGraphContextValue {
  const v = useContext(DependencyGraphContext)
  if (!v)
    throw new Error('useDependencyGraphContext must be used within DependencyGraphContext.Provider')
  return v
}

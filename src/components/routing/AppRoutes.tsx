import { Navigate, Route, Routes } from 'react-router-dom'

import { BiomeResources } from '@/components/biome-resources/BiomeResources'
import { CropTracker } from '@/components/crop-tracker/CropTracker'
import { GameNews } from '@/components/game-news/GameNews'
import { PriceCalculator } from '@/components/price-calculator/PriceCalculator'

import { BuildRedirect } from './BuildRedirect'
import { CropsRedirect } from './CropsRedirect'
import { RootRedirect } from './RootRedirect'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/game-news" element={<GameNews />} />
      <Route path="/:datasetId/calculator" element={<BuildRedirect />} />
      <Route path="/:datasetId/calculator/:buildId" element={<PriceCalculator />} />
      <Route path="/:datasetId/crops" element={<CropsRedirect />} />
      <Route path="/:datasetId/crops/:buildId" element={<CropTracker />} />
      <Route path="/:datasetId/resources" element={<BiomeResources />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

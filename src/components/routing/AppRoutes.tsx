import { Navigate, Route, Routes } from 'react-router-dom'

import { PriceCalculator } from '@/components/price-calculator/PriceCalculator'

import { BuildRedirect } from './BuildRedirect'
import { RootRedirect } from './RootRedirect'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/:datasetId/calculator" element={<BuildRedirect />} />
      <Route path="/:datasetId/calculator/:buildId" element={<PriceCalculator />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

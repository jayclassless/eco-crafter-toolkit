/**
 * Drives the percentage indicator inside the static splash from index.html.
 * The boot path doesn't expose any streaming progress sources, so this is
 * weighted-milestone based: each milestone contributes a fixed fraction of
 * the bar, and a rAF tween smooths the bar between milestones. The single
 * dominant step (gameData persister load) is opaque, so during that phase
 * the target advances on a wall-clock asymptote that's capped below the
 * milestone's full slot — a real signal can always overtake the estimate.
 *
 * Snapping to 100% on `reveal()` (from app-ready.ts) covers both normal
 * completion and the watchdog force-reveal path.
 */

export type LoaderMilestone =
  | 'bundle'
  | 'i18n'
  | 'storeProviderMounted'
  | 'persistersSmall'
  | 'persisterGameData'
  | 'localizedNames'
  | 'theme'
  | 'firstRender'

// Weights are tuned from a 5-run dev-server profile. Medians (ms from
// navigationStart): bundle 231, storeProviderMounted 241, persistersSmall
// 282, persisterGameData 832, firstRender 835. The gameData phase is the
// dominant cost (~570 ms of ~835 ms total). Theme load was a dev outlier
// (~3.3 s due to Vite asset queueing behind module fetches) — weighted for
// the production case where it lands concurrently with the rest.
const WEIGHTS: Record<LoaderMilestone, number> = {
  bundle: 10,
  i18n: 1,
  storeProviderMounted: 2,
  persistersSmall: 4,
  persisterGameData: 70,
  localizedNames: 3,
  theme: 5,
  firstRender: 5,
}

// Linear ramp: the estimator reaches its capped slot at t=GAMEDATA_EXPECTED_MS
// and stays saturated past that. Set slightly under the typical phase length
// (~570 ms profiled) so the bar gets close to the cap on most machines —
// fast machines that finish gameData early will see the bar near saturation
// rather than mid-ramp. Slow machines see the bar saturate and idle, which
// is preferable to the bar appearing stuck partway up.
const GAMEDATA_EXPECTED_MS = 350
// Cap below 1.0 so the estimator never quite reaches the gameData
// milestone's full slot — a real signal always provides the final delta.
const GAMEDATA_CAP = 0.95

const fired = new Set<LoaderMilestone>()
let revealed = false
let displayed = 0
let rafId: number | null = null
let smallPersistersFiredAt = 0

function firedSum(): number {
  let total = 0
  for (const id of fired) total += WEIGHTS[id]
  return total
}

function gameDataEstimate(): number {
  if (!fired.has('persistersSmall') || fired.has('persisterGameData')) return 0
  const elapsed = performance.now() - smallPersistersFiredAt
  const fraction = Math.min(1, elapsed / GAMEDATA_EXPECTED_MS)
  return WEIGHTS.persisterGameData * GAMEDATA_CAP * fraction
}

function target(): number {
  return Math.min(100, firedSum() + gameDataEstimate())
}

function writeDom(percent: number): void {
  if (typeof document === 'undefined') return
  const fill = document.getElementById('app-loader-progress-fill')
  const text = document.getElementById('app-loader-progress-text')
  if (fill) fill.style.transform = `scaleX(${percent / 100})`
  if (text) text.textContent = `${Math.floor(percent)}%`
}

function tick(): void {
  rafId = null
  // Write-through: the bar always shows the current target. The estimator's
  // own linear ramp provides the smooth motion during the gameData phase;
  // tweening on top of that just made the bar lag behind reality and look
  // "stuck" before the snap. Inter-milestone jumps are small (1–5 points)
  // so the lack of tweening reads as crisp, not jumpy.
  displayed = revealed ? 100 : target()
  writeDom(displayed)
  if (revealed) return
  // Keep ticking only while the estimator is moving the target.
  if (fired.has('persistersSmall') && !fired.has('persisterGameData')) {
    scheduleTick()
  }
}

function scheduleTick(): void {
  if (rafId !== null) return
  if (typeof requestAnimationFrame === 'undefined') return
  rafId = requestAnimationFrame(tick)
}

export function markLoaderMilestone(id: LoaderMilestone): void {
  if (revealed || fired.has(id)) return
  fired.add(id)
  if (id === 'persistersSmall') smallPersistersFiredAt = performance.now()
  scheduleTick()
}

export function snapLoaderTo100(): void {
  if (revealed) return
  revealed = true
  if (rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  displayed = 100
  writeDom(100)
}

/**
 * Test-only: reset all module state between tests.
 */
export function __resetLoaderProgress(): void {
  fired.clear()
  revealed = false
  displayed = 0
  smallPersistersFiredAt = 0
  if (rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
    cancelAnimationFrame(rafId)
  }
  rafId = null
}

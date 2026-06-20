/**
 * Production planner — given a starting inventory of items and a target
 * product, work out how many of the target can be crafted (or whether a
 * desired quantity is reachable), the whole-number sequence of crafts to get
 * there, any leftover intermediates, and what raw materials are missing.
 *
 * Pure module: no React, no stores. Quantities are post-modifier, post-round
 * per-craft amounts (see `recipe-quantities.ts`), expressed as positive
 * numbers (ingredients consumed, products produced).
 */

export interface PlannerRecipe {
  recipeId: string
  /** Per-craft consumption. `itemId` may be a tag id; the planner resolves it. */
  ingredients: { itemId: string; qty: number }[]
  /** Per-craft output (includes co-products). `qty` > 0. */
  products: { itemId: string; qty: number }[]
}

export interface PlannerInput {
  targetItemId: string
  /** null => maximize how many can be produced. */
  desiredQuantity: number | null
  inventory: Record<string, number>
  /** Build-chosen recipe producing `itemId`, or null when it's a raw input. */
  recipeForItem: (itemId: string) => PlannerRecipe | null
  tagMembers: (tagId: string) => string[] | null
  isTag: (id: string) => boolean
}

export interface PlannerStepIO {
  itemId: string
  qty: number
}

export interface PlannerStep {
  recipeId: string
  /** The item this step is crafted to produce toward the goal. */
  itemId: string
  crafts: number
  consumes: PlannerStepIO[]
  produces: PlannerStepIO[]
}

export interface PlannerQuantity {
  itemId: string
  qty: number
}

export interface PlannerResult {
  /** Target items obtainable (== desired when feasible, else the max). */
  producible: number
  /** Desired-quantity mode: was the desired quantity reachable? */
  feasible: boolean
  /** Crafting steps in execution order: leaves first, target last. */
  steps: PlannerStep[]
  /** Raw-material shortfall for the requested quantity. */
  missing: PlannerQuantity[]
  /** Surplus created by crafting (co-products + whole-craft overflow). */
  leftovers: PlannerQuantity[]
  /** A dependency cycle was detected — the graph cannot be planned. */
  cyclic: boolean
}

/** Safety cap so a recipe that needs no raw inputs (infinitely craftable)
 * can't spin the maximize search forever. */
const MAX_PRODUCIBLE = 1_000_000
const EPSILON = 1e-9

interface SimulationOutput {
  crafts: Map<string, number>
  /** recipeId -> the item it was crafted to produce (for step labels). */
  craftedFor: Map<string, string>
  missing: Map<string, number>
  /** Final available stock per item (mutated copy of inventory). */
  avail: Map<string, number>
}

/**
 * Decide which concrete item a tag ingredient resolves to. Chosen once from
 * the *initial* inventory so the choice is stable across simulate() calls
 * (keeping feasibility monotonic). A tag resolves to a concrete member only
 * when a member is in stock or craftable; otherwise it stays the tag itself:
 *   1. The tag itself, when the user stocked it directly — consumed as a raw
 *      pool straight from inventory (no member crafting).
 *   2. A member already in stock.
 *   3. A craftable member.
 *   4. The tag itself — a leaf with no stock/recipe, surfaced in "missing" as
 *      the tag rather than an arbitrary member.
 */
function makeTagResolver(input: PlannerInput): (id: string) => string {
  const cache = new Map<string, string>()
  return (id: string): string => {
    if (!input.isTag(id)) return id
    const cached = cache.get(id)
    if (cached !== undefined) return cached

    let chosen = id // the tag itself: stocked pool, or unsatisfiable -> "missing"
    if ((input.inventory[id] ?? 0) <= 0) {
      const members = input.tagMembers(id) ?? []
      const inStock = members.find((m) => (input.inventory[m] ?? 0) > 0)
      const craftable = members.find((m) => input.recipeForItem(m) != null)
      chosen = inStock ?? craftable ?? id
    }
    cache.set(id, chosen)
    return chosen
  }
}

/**
 * Build the item dependency graph reachable from the target and return a
 * topological order with every consumer before the item it consumes. Returns
 * null when a cycle is detected.
 */
function topoOrder(input: PlannerInput, resolve: (id: string) => string): string[] | null {
  // edges: item -> resolved ingredient (consumer points at its dependency)
  const deps = new Map<string, string[]>()
  const nodes = new Set<string>()

  const stack = [input.targetItemId]
  while (stack.length > 0) {
    const item = stack.pop() as string
    if (nodes.has(item)) continue
    nodes.add(item)
    const recipe = input.recipeForItem(item)
    if (!recipe) {
      deps.set(item, [])
      continue
    }
    const children: string[] = []
    for (const ing of recipe.ingredients) {
      const child = resolve(ing.itemId)
      children.push(child)
      if (!nodes.has(child)) stack.push(child)
    }
    deps.set(item, children)
  }

  // Kahn's algorithm. in-degree = number of consumers (incoming edges).
  const inDegree = new Map<string, number>()
  for (const node of nodes) inDegree.set(node, 0)
  for (const children of deps.values()) {
    for (const child of children) {
      inDegree.set(child, (inDegree.get(child) ?? 0) + 1)
    }
  }

  const queue: string[] = []
  for (const [node, deg] of inDegree) {
    if (deg === 0) queue.push(node)
  }

  const order: string[] = []
  while (queue.length > 0) {
    const node = queue.shift() as string
    order.push(node)
    for (const child of deps.get(node) ?? []) {
      const next = (inDegree.get(child) ?? 0) - 1
      inDegree.set(child, next)
      if (next === 0) queue.push(child)
    }
  }

  if (order.length !== nodes.size) return null // cycle
  return order
}

/** Run one demand-propagation pass for N target items. */
function simulate(
  n: number,
  order: string[],
  input: PlannerInput,
  resolve: (id: string) => string
): SimulationOutput {
  const demand = new Map<string, number>()
  const avail = new Map<string, number>(Object.entries(input.inventory))
  const crafts = new Map<string, number>()
  const craftedFor = new Map<string, string>()
  const missing = new Map<string, number>()

  demand.set(input.targetItemId, n)

  for (const item of order) {
    const d = demand.get(item) ?? 0
    if (d <= 0) continue

    const have = avail.get(item) ?? 0
    const used = Math.min(d, have)
    if (used > 0) avail.set(item, have - used)
    const remaining = d - used
    if (remaining <= EPSILON) continue

    const recipe = input.recipeForItem(item)
    const yieldQty = recipe?.products.find((p) => p.itemId === item)?.qty ?? 0
    if (!recipe || yieldQty <= 0) {
      missing.set(item, (missing.get(item) ?? 0) + remaining)
      continue
    }

    const nCraft = Math.ceil(remaining / yieldQty - EPSILON)
    crafts.set(recipe.recipeId, (crafts.get(recipe.recipeId) ?? 0) + nCraft)
    craftedFor.set(recipe.recipeId, item)

    for (const ing of recipe.ingredients) {
      const consumedId = resolve(ing.itemId)
      demand.set(consumedId, (demand.get(consumedId) ?? 0) + nCraft * ing.qty)
    }
    for (const p of recipe.products) {
      const produced = nCraft * p.qty
      if (p.itemId === item) {
        // overflow beyond what this demand needed becomes surplus stock
        avail.set(item, (avail.get(item) ?? 0) + (produced - remaining))
      } else {
        avail.set(p.itemId, (avail.get(p.itemId) ?? 0) + produced)
      }
    }
  }

  return { crafts, craftedFor, missing, avail }
}

function hasMissing(sim: SimulationOutput): boolean {
  for (const qty of sim.missing.values()) {
    if (qty > EPSILON) return true
  }
  return false
}

/** Largest integer N in [0, hiCap] for which N target items are feasible. */
function maxFeasible(
  order: string[],
  input: PlannerInput,
  resolve: (id: string) => string
): number {
  if (hasMissing(simulate(1, order, input, resolve))) return 0

  // Exponential search for an infeasible upper bound.
  let lo = 1
  let hi = 2
  while (hi <= MAX_PRODUCIBLE && !hasMissing(simulate(hi, order, input, resolve))) {
    lo = hi
    hi *= 2
  }
  if (hi > MAX_PRODUCIBLE) {
    // Effectively unbounded (no raw inputs constrain it).
    return MAX_PRODUCIBLE
  }

  // Binary search the boundary in (lo, hi): lo feasible, hi infeasible.
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2)
    if (hasMissing(simulate(mid, order, input, resolve))) hi = mid
    else lo = mid
  }
  return lo
}

function toQuantities(map: Map<string, number>, floor = false): PlannerQuantity[] {
  const out: PlannerQuantity[] = []
  for (const [itemId, qty] of map) {
    if (qty > EPSILON) out.push({ itemId, qty: floor ? Math.floor(qty + EPSILON) : qty })
  }
  return out
}

/** Build the ordered step list from a simulation. */
function buildSteps(
  sim: SimulationOutput,
  order: string[],
  input: PlannerInput,
  resolve: (id: string) => string
): PlannerStep[] {
  const steps: PlannerStep[] = []
  const emitted = new Set<string>()
  // Reverse topo order => deepest dependencies (leaves) first, target last.
  for (let i = order.length - 1; i >= 0; i--) {
    const item = order[i]
    const recipe = input.recipeForItem(item)
    if (!recipe) continue
    const crafts = sim.crafts.get(recipe.recipeId) ?? 0
    if (crafts <= 0 || emitted.has(recipe.recipeId)) continue
    emitted.add(recipe.recipeId)
    steps.push({
      recipeId: recipe.recipeId,
      itemId: sim.craftedFor.get(recipe.recipeId) ?? item,
      crafts,
      consumes: recipe.ingredients.map((ing) => ({
        itemId: resolve(ing.itemId),
        qty: ing.qty * crafts,
      })),
      produces: recipe.products.map((p) => ({ itemId: p.itemId, qty: p.qty * crafts })),
    })
  }
  return steps
}

/** Surplus stock created by crafting (final avail minus initial inventory). */
function buildLeftovers(sim: SimulationOutput, input: PlannerInput): PlannerQuantity[] {
  const out: PlannerQuantity[] = []
  for (const [itemId, qty] of sim.avail) {
    const surplus = qty - (input.inventory[itemId] ?? 0)
    if (surplus > EPSILON) out.push({ itemId, qty: surplus })
  }
  return out
}

export function planProduction(input: PlannerInput): PlannerResult {
  const resolve = makeTagResolver(input)
  const order = topoOrder(input, resolve)

  if (order === null) {
    return { producible: 0, feasible: false, steps: [], missing: [], leftovers: [], cyclic: true }
  }

  const desired = input.desiredQuantity

  if (desired != null && desired > 0) {
    const sim = simulate(desired, order, input, resolve)
    if (!hasMissing(sim)) {
      return {
        producible: desired,
        feasible: true,
        steps: buildSteps(sim, order, input, resolve),
        missing: [],
        leftovers: buildLeftovers(sim, input),
        cyclic: false,
      }
    }
    // Infeasible: report the shortfall to reach desired, plus the best plan we
    // can actually execute.
    const best = maxFeasible(order, input, resolve)
    const bestSim = simulate(best, order, input, resolve)
    return {
      producible: best,
      feasible: false,
      steps: buildSteps(bestSim, order, input, resolve),
      missing: toQuantities(sim.missing),
      leftovers: buildLeftovers(bestSim, input),
      cyclic: false,
    }
  }

  // Maximize mode.
  const best = maxFeasible(order, input, resolve)
  const sim = simulate(Math.max(best, 1), order, input, resolve)
  if (best === 0) {
    return {
      producible: 0,
      feasible: false,
      steps: [],
      missing: toQuantities(sim.missing),
      leftovers: [],
      cyclic: false,
    }
  }
  return {
    producible: best,
    feasible: true,
    steps: buildSteps(sim, order, input, resolve),
    missing: [],
    leftovers: buildLeftovers(sim, input),
    cyclic: false,
  }
}

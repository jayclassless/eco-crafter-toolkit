import i18n from 'i18next'
import { describe, expect, it, vi } from 'vitest'

import {
  DuplicateItemNameError,
  ItemInUseError,
  ValidationError,
  type ValidationCode,
} from '@/lib/custom-entities'
import '@/i18n'

import { validationErrorMessage } from '../validation-error-message'

// Exhaustive by construction: `Record<ValidationCode, true>` fails to compile
// the moment a code is added to the union without being listed here, which is
// what keeps the catalog check below honest.
const ALL_CODES: Record<ValidationCode, true> = {
  itemNameRequired: true,
  itemNotFound: true,
  duplicateItemName: true,
  itemInUse: true,
  recipeNotFound: true,
  nameRequired: true,
  craftingTableRequired: true,
  skillRequired: true,
  laborNonNegative: true,
  craftTimeNonNegative: true,
  skillLevelNonNegative: true,
  ingredientRequired: true,
  productRequired: true,
  ingredientItemRequired: true,
  ingredientQty: true,
  duplicateIngredient: true,
  productItemRequired: true,
  productQty: true,
  duplicateProduct: true,
}

describe('validationErrorMessage', () => {
  it('renders catalog copy for a validation code, not the developer message', () => {
    const message = validationErrorMessage(new ValidationError('ingredientQty'), i18n.t)
    expect(message).toBe('Ingredient quantity must be positive.')
    expect(message).not.toContain('ingredientQty')
  })

  it('interpolates params carried by the error', () => {
    expect(validationErrorMessage(new DuplicateItemNameError('Wood'), i18n.t)).toBe(
      'An item named "Wood" already exists in this dataset.'
    )
  })

  it('maps the typed error subclasses to their codes', () => {
    expect(new ItemInUseError('item-1').code).toBe('itemInUse')
    expect(validationErrorMessage(new ItemInUseError('item-1'), i18n.t)).toBe(
      'This item is used by one or more recipes and cannot be deleted.'
    )
  })

  it('falls back to a generic message for non-validation errors', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const boom = new Error('IndexedDB transaction aborted')
    expect(validationErrorMessage(boom, i18n.t)).toBe('Something went wrong. Please try again.')
    expect(spy).toHaveBeenCalledWith('[custom-entities] unexpected error', boom)
    // Non-Error throws take the same path rather than being stringified.
    expect(validationErrorMessage('nope', i18n.t)).toBe('Something went wrong. Please try again.')
    spy.mockRestore()
  })

  it('has catalog copy for every validation code', () => {
    const missing = Object.keys(ALL_CODES).filter((code) => {
      const key = `settings.customEntities.errors.${code}`
      return i18n.t(key) === key
    })
    expect(missing).toEqual([])
  })
})

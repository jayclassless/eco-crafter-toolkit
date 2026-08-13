import type { TFunction } from 'i18next'

import { ValidationError } from '@/lib/custom-entities'

/**
 * Turn an error thrown by `custom-entities` into translated copy for display.
 *
 * `ValidationError.code` is by construction the leaf key under
 * `settings.customEntities.errors`, so the mapping needs no lookup table — but
 * that also means a new code without a matching catalog key renders as the raw
 * key. Anything else (an IndexedDB failure, a bug) is not user-actionable, so
 * it becomes a generic message and goes to the console for debugging rather
 * than putting an untranslated engine string on screen.
 */
export function validationErrorMessage(error: unknown, t: TFunction): string {
  if (error instanceof ValidationError) {
    return t(`settings.customEntities.errors.${error.code}`, error.params)
  }
  console.error('[custom-entities] unexpected error', error)
  return t('settings.customEntities.errors.unexpected')
}

export const PLACEHOLDER_BRAND_NAME = 'Mi marca'

export function isPlaceholderName(name: string | null | undefined) {
  return !name || name.trim() === PLACEHOLDER_BRAND_NAME
}

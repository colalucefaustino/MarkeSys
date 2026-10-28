// Marca de ejemplo para el recorrido guiado. Se puede recorrer completa sin gastar IA,
// y no se puede modificar (proxy.ts bloquea las escrituras con este id).

export const DEMO_BRAND_ID = '0e5a1d00-de30-4000-8000-00000000c0fe'
/** Subir este número cuando cambie el contenido de la marca demo: se vuelve a cargar sola. */
export const DEMO_VERSION = 2

export const isDemoBrand = (brandId: string | null | undefined) => brandId === DEMO_BRAND_ID

export const DEMO_READONLY_MESSAGE = 'Es la marca de ejemplo y no se puede modificar. Probá con tu negocio para usar todo.'

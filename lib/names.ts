// Nombres legibles para competidores y dominios.
// Los dominios con tildes o eñes viajan en "punycode" (ej. xn--aroweb-vwa); acá se traducen
// a texto normal. Funciona igual en el servidor y en el navegador.

const BASE = 36
const T_MIN = 1
const T_MAX = 26
const SKEW = 38
const DAMP = 700

function adapt(delta: number, numPoints: number, first: boolean) {
  delta = first ? Math.floor(delta / DAMP) : delta >> 1
  delta += Math.floor(delta / numPoints)
  let k = 0
  while (delta > ((BASE - T_MIN) * T_MAX) >> 1) {
    delta = Math.floor(delta / (BASE - T_MIN))
    k += BASE
  }
  return k + Math.floor(((BASE - T_MIN + 1) * delta) / (delta + SKEW))
}

const digit = (c: number) => (c - 48 < 10 ? c - 22 : c - 65 < 26 ? c - 65 : c - 97 < 26 ? c - 97 : BASE)

/** Decodifica una etiqueta punycode (sin el prefijo xn--). Devuelve null si no es válida. */
function decodeLabel(input: string): string | null {
  const out: number[] = []
  let n = 128
  let i = 0
  let bias = 72
  const basic = input.lastIndexOf('-')
  for (let j = 0; j < Math.max(0, basic); j++) out.push(input.charCodeAt(j))
  for (let idx = basic > 0 ? basic + 1 : 0; idx < input.length; ) {
    const oldi = i
    for (let w = 1, k = BASE; ; k += BASE) {
      if (idx >= input.length) return null
      const d = digit(input.charCodeAt(idx++))
      if (d >= BASE) return null
      i += d * w
      const t = k <= bias ? T_MIN : k >= bias + T_MAX ? T_MAX : k - bias
      if (d < t) break
      w *= BASE - t
    }
    bias = adapt(i - oldi, out.length + 1, oldi === 0)
    n += Math.floor(i / (out.length + 1))
    i %= out.length + 1
    out.splice(i++, 0, n)
  }
  return String.fromCodePoint(...out)
}

/** "xn--aroweb-vwa.com.ar" → "aroweb con su tilde/eñe original.com.ar" */
export function decodeDomain(domain: string): string {
  return domain
    .split('.')
    .map((label) => (label.toLowerCase().startsWith('xn--') ? (decodeLabel(label.slice(4)) || label) : label))
    .join('.')
}

/** Nombre para mostrar: decodifica punycode y, si es un dominio pelado, lo hace legible. */
export function prettyName(name: string): string {
  const raw = String(name ?? '').trim()
  if (!raw) return raw
  const decoded = decodeDomain(raw)
  // Un nombre sacado de un dominio ("mi-tienda" o "mitienda") se muestra con espacios.
  if (/^[a-z0-9ñáéíóúü-]+$/i.test(decoded) && decoded === decoded.toLowerCase()) {
    const words = decoded.replace(/-/g, ' ')
    return words.charAt(0).toUpperCase() + words.slice(1)
  }
  return decoded
}

export const sameName = (a: string, b: string) => {
  const k = (s: string) => prettyName(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ]/g, '')
  return k(a) === k(b)
}

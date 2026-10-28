import { NextResponse, type NextRequest } from 'next/server'
import { DEMO_BRAND_ID, DEMO_READONLY_MESSAGE } from '@/lib/demo/constants'

// La marca de ejemplo es de solo lectura: cualquier escritura a la API que la mencione
// (en la URL o en el cuerpo) se corta acá, antes de tocar la base o gastar IA.
export async function proxy(request: NextRequest) {
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') return NextResponse.next()

  const inUrl = request.nextUrl.href.includes(DEMO_BRAND_ID)
  let inBody = false
  if (!inUrl) {
    const type = request.headers.get('content-type') ?? ''
    if (type.includes('json') || type.includes('text')) {
      inBody = (await request.clone().text()).includes(DEMO_BRAND_ID)
    }
  }
  if (inUrl || inBody) {
    return NextResponse.json({ error: DEMO_READONLY_MESSAGE, demo: true }, { status: 403 })
  }
  return NextResponse.next()
}

export const config = {
  matcher: '/api/:path*',
}

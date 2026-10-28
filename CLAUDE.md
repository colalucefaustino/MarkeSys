# MarkeSys

Director de marketing con IA para comercios y pymes de retail argentinas. Diagnostica cómo encuentran a la marca (Google, Maps, redes, asistentes de IA) y qué valoran sus clientes, recomienda un nicho y arma un plan de contenido con el porqué de cada pieza. El contenido es una herramienta integrada; la propuesta de valor es la estrategia.

Leé `docs/HANDOFF.md` antes de cambiar algo: tiene el estado real, decisiones y pendientes. `docs/SPEC.md` es el spec funcional completo (si difiere del código, manda `HANDOFF.md`).

## Reglas del producto
- Español rioplatense (voseo), Argentina, pesos, búsquedas con `gl=ar`.
- **Experiencia guiada:** el dueño no sabe de marketing ni de IA. El Copiloto hace una pregunta por vez, con 2 a 4 opciones, y explica para qué pide cada dato.
- **Cero invención:** cada dato lleva origen `confirmado | inferido | externo | pendiente`. Nada de cifras, fechas comerciales, descuentos o beneficios que no estén en los datos. Lo que falta va a `missing_inputs`.
- **El cliente aprueba cada etapa** (checkpoints CP1–CP5) antes de avanzar.
- Sin login (es un MVP). Supabase solo desde el servidor con service role.

## Stack
Next.js 16 (App Router) + React 19 + TypeScript, Tailwind v4 + shadcn/ui, AI SDK (`ai`), Supabase, deploy en Vercel (cada push a `main` publica).
- IA: `lib/ai.ts` elige proveedor por variable de entorno: `ANTHROPIC_API_KEY` → Claude; `GOOGLE_GENERATIVE_AI_API_KEY` → Gemini (lo que se usa hoy); `AI_PROVIDER=gateway` → AI Gateway de Vercel. Usar siempre `MODEL_MAIN` / `MODEL_FAST`, nunca un modelo hardcodeado.
- Agentes en segundo plano con `after()` y progreso en `agent_runs` (`lib/agents/runs.ts`).

## Comandos
- `npm install` · `npm run dev` · `npm run build`
- Variables: copiar `.env.example` a `.env.local` y completar. Nunca commitear claves.
- Diagnóstico en producción: `/api/health` (qué claves ve) y `/api/health?probar` (prueba IA y base).

## Diseño
Paleta MarkeSys en `app/globals.css`: fondo crema `#FBF1E4`, superficies `#FFFBF5`, bordes `#F3E2CC`, acento naranja `#F28C38`, texto tinta `#3B2A1F`. Tipografía Outfit. Logo en `public/markesys-mark.png` (M tinta, S naranja con flecha).

## Antes de cerrar un cambio
`npx tsc --noEmit` y `npm run build` sin errores. Mensajes de commit en español.

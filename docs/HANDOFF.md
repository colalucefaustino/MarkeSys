# Vitrina — Documento de traspaso (handoff)

Director de marketing con IA para retail argentino. Este documento resume todo lo que existe, cómo está diseñado, cómo se conecta y qué falta, para continuar en otro chat sin perder contexto.

Documentos que viajan con el proyecto:
- `docs/SPEC_ORIGINAL.md`: el spec original (fuente de verdad de producto, agentes, prompts, esquemas y fases).
- `docs/HANDOFF.md`: este archivo (estado real de la implementación).

Idioma de la app y del equipo: español rioplatense (voseo). Contexto: Argentina, pesos argentinos, búsquedas con `gl=ar`.

---

## 1. Decisiones tomadas con el cliente

| Tema | Decisión |
|---|---|
| Base de datos y archivos | Supabase (Postgres + Storage con 5 buckets), tal como pide el spec |
| LLM | Originalmente Vercel AI Gateway, pero pide tarjeta de crédito. **Cambiado a Google Gemini** (capa gratuita en Google AI Studio, sin tarjeta) con `@ai-sdk/google`. El AI Gateway queda como fallback si falta la clave |
| Login | **Eliminado por completo.** La app abre directo en el producto |
| Marca | Negocio real. No hay marca demo ni seed. El usuario carga todo desde la app (desde el Copiloto) |
| Fechas comerciales | Se buscan con fuente real (tabla `commercial_dates` exige `source_url`). El planificador no inventa fechas |
| País | Argentina (voseo, `gl=ar`, pesos) |
| Estilo visual | Limpio y moderno, claro |
| Alcance de la primera entrega | Fases 1 a 5 del §16 del spec |
| Servicios externos con clave | Apify (Instagram/TikTok), ElevenLabs (voz), Serper (Google web y Maps), Gemini (LLM) |
| Voz | Funciona con el navegador aunque no haya ElevenLabs; con ElevenLabs suena mejor |

---

## 2. Stack técnico

- Next.js 16 (App Router, Turbopack), React 19.2, TypeScript
- Tailwind CSS v4 + shadcn/ui (componentes en `components/ui/`)
- Iconos: `lucide-react`. Fuente: Inter (`--font-inter`)
- Toasts: `sonner` (`<Toaster position="top-center" />`)
- Supabase: `@supabase/supabase-js` y `@supabase/ssr`
  - Servidor: `db()` en `lib/supabase/server.ts` (service role, bypass de RLS)
  - Navegador: `createClient()` en `lib/supabase/client.ts` (solo para subir archivos con URL firmada)
- IA: AI SDK (`ai`) + `@ai-sdk/google`. Modelos en `lib/ai.ts`
- Voz: ElevenLabs (TTS y transcripción) con fallback a Web Speech del navegador
- Búsquedas externas: Serper, Apify
- Agentes en segundo plano: `after()` de `next/server` (`maxDuration = 300`)

### Variables de entorno (ya cargadas en el proyecto)

| Variable | Uso |
|---|---|
| `GOOGLE_GENERATIVE_AI_API_KEY` | LLM (Gemini). Si falta, cae al AI Gateway |
| `GEMINI_MODEL_MAIN` / `GEMINI_MODEL_FAST` | Opcionales. Default `gemini-3.5-flash` y `gemini-3.5-flash-lite` |
| `CLAUDE_MODEL_MAIN` / `CLAUDE_MODEL_FAST` | Opcionales, solo para el fallback al Gateway |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase |
| `SERPER_API_KEY` | Google web y Maps |
| `APIFY_TOKEN` | Instagram y TikTok |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | Voz |
| `DEMO_USER_EMAIL`, `DEMO_USER_PASSWORD`, `AUTH_SECRET` | **Ya no se usan** (del login eliminado). Se pueden borrar |

---

## 3. Diseño y UX

### Dirección visual
Claro, limpio y moderno. Solo tema claro (`color-scheme: light` en `:root` y en `viewport`). Tarjetas blancas sobre fondo gris azulado muy suave, un único color de acento (índigo), bordes finos, radios generosos.

### Tokens (en `app/globals.css`, formato oklch)

| Token | Valor | Uso |
|---|---|---|
| `--background` | `oklch(0.985 0.003 255)` | Fondo de la app |
| `--foreground` | `oklch(0.21 0.02 265)` | Texto |
| `--card` / `--popover` | `oklch(1 0 0)` | Tarjetas, topbar, popovers |
| `--primary` | `oklch(0.52 0.19 268)` | Acento índigo (botones, links, foco) |
| `--accent` | `oklch(0.95 0.025 268)` | Fondo suave del ítem activo |
| `--accent-foreground` | `oklch(0.35 0.12 268)` | Texto del ítem activo |
| `--muted` / `--muted-foreground` | `oklch(0.96 0.006 260)` / `oklch(0.5 0.02 262)` | Fondos y textos secundarios |
| `--border` | `oklch(0.92 0.008 260)` | Bordes |
| `--success` | `oklch(0.62 0.15 150)` | Aprobado, origen confirmado |
| `--warning` | `oklch(0.78 0.15 85)` | Esperando aprobación |
| `--info` | `oklch(0.6 0.15 245)` | En curso |
| `--stale` | `oklch(0.7 0.17 55)` | Desactualizada |
| `--destructive` | `oklch(0.577 0.22 27)` | Errores |
| `--radius` | `0.75rem` | Radio base |

Tokens extra registrados en `@theme inline`: `--color-success`, `--color-warning`, `--color-info`, `--color-stale` (se usan como `bg-success`, `text-warning`, etc.). Sidebar con sus propios tokens (`--sidebar-*`) iguales al esquema principal.

### Layout general (`app/marca/[brandId]/layout.tsx`)
```
┌───────────────────────────── Topbar (h-14) ─────────────────────────────┐
│ Logo | Selector de marca |  Marca · Diagnóstico · Estrategia · Plan · Contenido  | Visibilidad NN/100 │
├──────────┬──────────────────────────────────────────┬───────────────────┤
│ Sidebar  │              Contenido de la pestaña      │ Copiloto lateral  │
│ (w-60)   │                                          │ (solo si la       │
│          │                                          │  pestaña no es    │
│          │                                          │  Copiloto)        │
└──────────┴──────────────────────────────────────────┴───────────────────┘
```
- Desktop: sidebar fija de 240 px. Móvil (`< md`): `MobileNav` horizontal con scroll (pastillas redondeadas).
- Topbar: logo (link a `/`), selector de marca (`BrandSwitcher`), stepper de 5 etapas (visible desde `lg`) y, si existe, la píldora "Visibilidad NN/100".
- Copiloto lateral (`components/shell/side-copilot.tsx`): el mismo chat del Copiloto, acompañando a las demás pestañas.

### Sidebar y estados de pestaña
Grupos y pestañas (definidos en `lib/tabs.ts`):

| Grupo | Pestañas |
|---|---|
| (sin título) | Copiloto |
| Diagnóstico | Marca, Visibilidad digital, Percepción |
| Estrategia | Nicho y posicionamiento |
| Plan | Calendario |
| Herramientas | Contenido, Medios, Ads (Meta), Dashboard |

Indicador a la derecha de cada ítem:
- Candado: bloqueada (el tooltip `title` explica por qué)
- Punto azul (`info`): en curso
- Punto amarillo (`warning`): esperando tu aprobación
- Punto naranja (`stale`): desactualizada
- Check verde en círculo: aprobada

### Reglas de bloqueo (`getBrandState` en `lib/tabs.ts`)
- Copiloto, Marca, Medios, Dashboard: siempre abiertas
- Visibilidad y Percepción: requieren Ficha aprobada (CP1)
- Nicho y posicionamiento: requiere Visibilidad aprobada y Percepción aprobada (o salteada vía CP3 `salteado`)
- Calendario: requiere estrategia aprobada
- Contenido: requiere al menos un ítem del calendario aprobado o producido
- Ads (Meta): requiere calendario aprobado

### Etapas del stepper
`Marca → Diagnóstico → Estrategia → Plan → Contenido`. Mapeo de `brands.stage`: `arranque`/`onboarding` = Marca, `diagnostico`, `estrategia`, `plan`, `ejecucion` = Contenido.

### UX del Copiloto (experiencia guiada)
- El dueño no sabe de marketing ni IA: el Copiloto lleva la charla.
- Una sola pregunta por mensaje, corta, voseo, sin jerga. Siempre con 2 a 4 respuestas rápidas (chips) vía la herramienta `ask_choice`.
- Explica para qué pide cada dato.
- Objetivos: no pregunta en abstracto, propone 2 o 3 con fecha (`propose_objectives`) según stock, temporada y la fecha de hoy.
- Respuestas pensadas para voz: frases naturales, sin listas largas, sin markdown ni símbolos.
- Nunca avanza de etapa sin `request_approval`.
- Nombre y ciudad se piden en el propio Copiloto (arranque con "Contanos de tu negocio"); no hay formulario de alta de marca.

### Procedencia de datos
Cada campo de la Ficha tiene un origen, mostrado con `components/shared/provenance-badge.tsx`: `confirmado` (lo dijo el dueño), `inferido` (deducido de archivos o web, pide confirmación), `externo`, `pendiente`.

### Accesibilidad aplicada
Landmarks con `aria-label` (`nav` "Secciones", `ol` "Etapa del proyecto"), `aria-current` en ítem activo y etapa actual, textos `sr-only` para los estados, `lang="es"`.

---

## 4. Flujo de entrada (sin login)

1. `app/page.tsx` (server, `force-dynamic`): busca la marca modificada más recientemente. Si no hay ninguna, crea una con nombre placeholder `"Mi marca"` (`lib/brand-constants.ts`) y redirige a `/marca/[id]/copiloto`.
2. El Copiloto detecta el nombre placeholder y arranca la conversación pidiendo nombre y ciudad (`POST /api/brands/[brandId]/start`).
3. Se pueden tener varias marcas: el `BrandSwitcher` de la topbar cambia y crea marcas.

---

## 5. Estructura del proyecto

```
app/
  page.tsx                          Redirige a la marca más reciente (o crea una)
  layout.tsx                        Inter, metadata, Toaster, suppressHydrationWarning en <body>
  globals.css                       Tokens de diseño
  marca/[brandId]/
    layout.tsx                      Shell: Topbar + Sidebar + contenido + copiloto lateral
    page.tsx                        Redirige a /copiloto
    [tab]/page.tsx                  Renderiza la pestaña vía TabRouter
  api/                            (ver §7)
components/
  brand/brand-context.tsx           Provider con el overview de la marca (SWR) + acciones
  brand/chat-context.tsx            Provider del chat (useChat) compartido entre Copiloto y lateral
  copilot/chat-view.tsx             Vista del chat, chips, tarjetas, voz
  copilot/upload-card.tsx           Tarjeta de carga de archivo dentro del chat
  copilot/objectives-card.tsx       Tarjeta con objetivos propuestos (elegir/editar)
  shell/{sidebar,topbar,side-copilot,brand-switcher}.tsx
  shared/provenance-badge.tsx
  shared/run-progress.tsx           Progreso en vivo de un agente
  tabs/{tab-router,copiloto-tab,marca-tab,medios-tab,visibilidad-tab}.tsx
  visibilidad/{queries-panel,results-view}.tsx
  logo.tsx
lib/
  ai.ts                             MODEL_MAIN / MODEL_FAST, todayAR(), todayISO()
  tabs.ts                           Pestañas, etapas, getBrandState (bloqueos y estados)
  dossier.ts                        Expediente: secciones versionadas, procedencia, stale en cascada
  checklist.ts                      Checklist de carga (obligatorio / recomendado / opcional)
  overview.ts                       Datos agregados que consume la UI
  upload.ts                         Subida directa a Storage con URL firmada
  brand-constants.ts                Nombre placeholder
  schemas/ficha.ts                  Zod de la Ficha de marca
  copilot/{system-prompt,tools}.ts  Prompt y herramientas del Copiloto
  agents/{runs,start,a1,a2}.ts      Ejecución de agentes en segundo plano
  media/parse.ts                    Lectura de catálogos, stock, ventas, reseñas
  voice/use-voice.ts                Hook de voz (grabar, transcribir, hablar)
  supabase/{client,server}.ts
docs/
  SPEC_ORIGINAL.md
  HANDOFF.md
```

---

## 6. Datos (Supabase)

Proyecto Supabase conectado desde la integración de v0. La migración `001_init` ya está aplicada (tablas del §7 del spec). **El SQL no está guardado como archivo en el repo**: copiarlo del spec o pedirle al nuevo chat que lo exporte desde la base si hace falta versionarlo.

- Tablas: `brands`, `dossier_sections`, `field_provenance`, `media`, `products`, `brand_channels`, `competitors`, `objectives`, `messages`, `agent_runs`, `visibility_queries`, `visibility_results`, `reviews`, `campaigns`, `plan_items`, `scripts`, `skills`, `edits`, `content_pieces`, `ads_campaigns`, `sales_monthly`, `sales_products`, `insights`, `approvals`, `commercial_dates`.
- **RLS activado en todas las tablas sin políticas.** Solo se accede desde el servidor con la service role; la anon key pública no puede leer nada. Es una desviación consciente del spec (que dejaba RLS apagado).
- Storage: `brand-files` (privado), `media-public` (público), `voice-messages` (privado), `tts-cache` (privado), `generated-assets` (público).
- El Expediente (`dossier_sections`) es versionado por sección: `ficha`, `visibilidad`, `percepcion`, `estrategia`, `calendario`. Estados: `draft`, `pending_approval`, `approved`, `stale`. Cambiar una sección aguas arriba marca como `stale` las dependientes (`DEPENDENTS` en `lib/dossier.ts`).
- `commercial_dates`: se había investigado con fuentes reales para Argentina, pero **no se verificó si quedó cargada**. Revisar con un `select count(*)` antes de la fase del Calendario.

---

## 7. API

| Ruta | Métodos | Función |
|---|---|---|
| `/api/brands` | GET, POST | Listar y crear marcas |
| `/api/brands/[brandId]` | GET, PATCH, DELETE | Marca individual |
| `/api/brands/[brandId]/overview` | GET | Estado completo para la UI (SWR) |
| `/api/brands/[brandId]/start` | POST | Arranque del Copiloto (max 300 s) |
| `/api/chat` | POST | Chat del Copiloto con herramientas, streaming (max 120 s) |
| `/api/dossier/field` | POST | Editar un campo de la Ficha (con procedencia) |
| `/api/approvals` | POST | Registrar aprobación en un checkpoint |
| `/api/media` | GET, POST, DELETE | Medios cargados (POST dispara parseo, max 120 s) |
| `/api/media/sign` | POST | URL firmada de subida a Storage |
| `/api/reviews` | POST | Cargar reseñas pegadas |
| `/api/agents/run` | POST | Ejecutar un agente (max 300 s) |
| `/api/agents/runs/[runId]` | GET | Progreso de un agente |
| `/api/visibility/queries` | GET, POST, PATCH, DELETE | Búsquedas a medir (CP2a) |
| `/api/competitors` | PATCH, DELETE | Competidores detectados |
| `/api/voice/status` | GET | Si hay ElevenLabs disponible |
| `/api/voice/transcribe` | POST | Audio a texto |
| `/api/voice/speak` | POST | Texto a audio (cache en `tts-cache`) |

---

## 8. Copiloto: herramientas y prompt

Prompt en `lib/copilot/system-prompt.ts` (recibe Expediente, checklist, medios, pestaña actual y fecha de hoy en Argentina). Herramientas en `lib/copilot/tools.ts`:

- Con interfaz en el chat (sin `execute`, resuelve el cliente): `ask_choice`, `request_upload`, `propose_objectives`, `open_tab`
- Con efecto en servidor: `save_field`, `save_products`, `save_channel`, `save_objectives`, `save_product_flags`, `save_competitor`, `run_agent` (A1, A2), `request_approval` (CP1, CP2a, CP2), `get_dossier`

`save_field` también sincroniza `brands.size_segment`, `brands.city` y `brands.name` cuando corresponde.

### Checklist de carga (`lib/checklist.ts`)
- Obligatorios: nombre y ciudad, productos, tamaño del negocio, precios en publicaciones, objetivo con fecha, piezas por semana
- Recomendados: stock, manual de marca o logo, Instagram o TikTok, competidores, reseñas, historial de ventas
- Opcional: restricciones

---

## 9. Agentes

| Agente | Estado | Qué hace |
|---|---|---|
| A1 | Hecho | Lee y consolida fuentes (web del cliente y archivos cargados) y arma el borrador de la Ficha |
| A2 | Hecho | Visibilidad digital: genera búsquedas, las mide en 5 canales (`llm`, `google_web`, `google_maps`, `instagram`, `tiktok`), detecta competidores y calcula `puntaje_global` |
| A3 a A8 | Pendientes | Percepción, estrategia, calendario, guiones, edición de video, contenido, ads, etc. (ver spec) |

Los agentes corren con `after()` y reportan progreso en `agent_runs.progress` (`RunProgress` en `lib/agents/runs.ts`). La UI consulta `/api/agents/runs/[runId]`. A2 exige Ficha aprobada.

---

## 10. Voz

- Hook `lib/voice/use-voice.ts` (grabar, transcribir, hablar). Estado del servicio en `/api/voice/status`.
- Con ElevenLabs: transcripción y TTS por API, audios de respuesta cacheados en `tts-cache`.
- Sin ElevenLabs: fallback al reconocimiento y la síntesis del navegador.
- Las respuestas del Copiloto se escriben para ser habladas.

---

## 11. Estado por fase

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Base de datos, buckets, layout con sidebar y estados | Hecha (sin login) |
| 2 | Arranque, A1 (ingesta) y Medios | Hecha |
| 3 | Copiloto guiado con herramientas y voz | Hecha |
| 4 | Pestaña Marca (Ficha) y CP1 | Hecha |
| 5 | A2 Visibilidad digital y CP2 | Hecha |
| 6 en adelante | Percepción, Nicho y posicionamiento, Calendario, Contenido, Ads (Meta), Dashboard | **Pendiente** |

Las pestañas Percepción, Estrategia, Calendario, Contenido, Ads y Dashboard figuran en la sidebar y respetan sus reglas de bloqueo, pero su contenido todavía no está construido. Verificar en `components/tabs/tab-router.tsx` qué muestra cada una.

---

## 12. Historial de problemas resueltos

- Error `Cannot write to a CLOSED writable stream` en `/api/chat`: corregido en `app/api/chat/route.ts` (manejo del stream al cerrarse la conexión).
- Error de hidratación por atributo inyectado en `<body>` (extensiones del navegador): `suppressHydrationWarning` en `app/layout.tsx`.
- 404 en la preview: se ajustó `next.config.mjs` y se corrigieron rutas.
- Login: eliminado (`proxy.ts`, `lib/auth.ts`, `/login`, `/api/auth/*`, formulario y botón de salir).
- Alta de marca: ya no es un diálogo al entrar; el usuario carga todo desde el Copiloto, adentro de la app.
- AI Gateway pedía tarjeta de crédito: reemplazado por Gemini (`@ai-sdk/google`), probado con salida estructurada en ambos modelos.

## 13. Pendientes y cosas a tener en cuenta

1. Construir las pestañas y agentes de las fases siguientes (ver spec §16).
2. Verificar que `commercial_dates` tenga datos con `source_url`; si no, cargarlas con fuente antes del Calendario.
3. Versionar el SQL de la migración en `supabase/migrations/`.
4. Borrar variables sin uso: `DEMO_USER_EMAIL`, `DEMO_USER_PASSWORD`, `AUTH_SECRET`.
5. Sin login y con service role en el servidor, **cualquiera con la URL puede usar la app**. Si se publica, agregar protección (Vercel Deployment Protection o auth) antes de compartirla.
6. La capa gratuita de Gemini tiene límites de cuota: si aparecen errores 429, bajar frecuencia o pasar a `gemini-3.5-flash-lite` en `GEMINI_MODEL_MAIN`.
7. Los modelos Gemini se configuran por variable de entorno; verificar nombres vigentes en Google AI Studio si algún día fallan.

---

## 14. Prompt listo para pegar en el chat nuevo

> Estoy continuando un proyecto llamado Vitrina (director de marketing con IA para retail argentino). Adjunto el proyecto (ZIP o repo) con `docs/HANDOFF.md` (estado real) y `docs/SPEC_ORIGINAL.md` (spec original). Leé primero `docs/HANDOFF.md` completo y luego las secciones del spec que correspondan. Reglas: español rioplatense (voseo), Argentina, diseño claro y moderno con los tokens de `app/globals.css`, sin login, Supabase con service role solo en servidor, LLM con Gemini vía `lib/ai.ts` (sin AI Gateway), sin inventar datos ni fechas, y preguntame antes de asumir. Las fases 1 a 5 están hechas. Quiero continuar con la fase 6: pestaña Percepción (A3) y su checkpoint, respetando las reglas de bloqueo de `lib/tabs.ts`. Antes de escribir código, revisá `lib/dossier.ts`, `lib/agents/start.ts` y `components/tabs/visibilidad-tab.tsx` para seguir los mismos patrones.

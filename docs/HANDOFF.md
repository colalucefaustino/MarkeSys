# MarkeSys — Documento de traspaso

Director de marketing con IA para retail argentino (antes se llamaba "Vitrina"). Este documento resume el estado real del código, las decisiones tomadas y lo pendiente. `docs/SPEC.md` es el spec funcional completo; si algo difiere, manda este archivo.

Última actualización: 28/10/2026, después de la hackathon Shippear (24/10/2026).

---

## 1. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Nombre y marca | **MarkeSys**. Paleta crema/naranja/tinta, tipografía Outfit, logo `public/markesys-mark.png` |
| Propuesta de valor | Estrategia (visibilidad, percepción, nicho, plan). El contenido es una herramienta integrada, no el foco |
| LLM | `lib/ai.ts`: Claude si hay `ANTHROPIC_API_KEY`; Gemini si hay `GOOGLE_GENERATIVE_AI_API_KEY` (**lo que se usa hoy**, capa gratuita); `AI_PROVIDER=gateway` fuerza el AI Gateway de Vercel. Modelos configurables: `GEMINI_MODEL_MAIN/FAST`, `CLAUDE_MODEL_MAIN/FAST`, `GATEWAY_MODEL_MAIN/FAST` |
| Login | Eliminado. La app abre directo en el producto |
| Base y archivos | Supabase (Postgres + Storage), solo desde el servidor con service role. Acepta `SUPABASE_SERVICE_ROLE_KEY` o `SUPABASE_SECRET_KEY` |
| Percepción | **Opcional**: Nicho y posicionamiento se desbloquea con Visibilidad aprobada. Se puede saltear siempre |
| Agentes colgados | Si un agente queda en `running` más de 4 minutos, se marca como fallido y se puede reintentar |
| Ads | Simulado en el cliente (sin Meta Marketing API) |
| País | Argentina (voseo, `gl=ar`, pesos) |

## 2. Despliegue

- Repo: `colalucefaustino/markesys`, rama `main`. Vercel publica cada push.
- Variables en Vercel: `GOOGLE_GENERATIVE_AI_API_KEY`, las de Supabase (creadas por la integración), `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `SERPER_API_KEY`, `APIFY_TOKEN`. Plantilla en `.env.example`. `ELEVENLABSKEY` sobra y se puede borrar.
- Diagnóstico: `/api/health` muestra versión, proveedor de IA y qué variables ve (solo nombres). `/api/health?probar` hace una llamada real a cada modelo y a la base.
- Problema conocido: **la capa gratuita de Gemini tiene ~20 pedidos por día por modelo y por proyecto**. Visibilidad consume muchos. Si aparece "You exceeded your current quota": esperar al día siguiente, usar `GEMINI_MODEL_MAIN=gemini-3.5-flash-lite`, una clave de otro proyecto de Google, activar facturación en AI Studio o pasar a `AI_PROVIDER=gateway` (hay $5/mes de crédito gratis en la cuenta de Vercel, solo para algunos modelos).

## 3. Diseño y UX

- Tokens en `app/globals.css` (hex): fondo `#FBF1E4`, tarjetas `#FFFBF5`, bordes `#F3E2CC`, primario `#F28C38`, acento suave `#FDE3CB`/`#8F3E0B`, texto `#3B2A1F`, secundario `#7A6656`. Estados: `success`, `warning`, `info`, `stale`. Solo tema claro.
- Layout: topbar (logo, selector de marca, stepper de 5 etapas, puntaje de visibilidad) + sidebar agrupada (Copiloto · Diagnóstico: Marca, Visibilidad, Percepción · Estrategia: Nicho y posicionamiento · Plan: Calendario · Herramientas: Contenido, Medios, Ads, Dashboard) + contenido + Copiloto lateral.
- Experiencia guiada: una pregunta por mensaje, 2 a 4 chips, explicar para qué se pide cada dato, objetivos propuestos con fecha, respuestas escritas para ser habladas.
- Componentes compartidos de las pestañas nuevas: `components/tabs/shared.tsx` (`useActions`, `PageHead`, `Empty`, `ApproveBar`, `postJSON`, `money`, `fmtDate`).

## 4. Flujo de entrada (sin login)

1. `app/page.tsx` (server, `force-dynamic`): busca la marca modificada más recientemente. Si no hay ninguna, crea una con nombre placeholder `"Mi marca"` (`lib/brand-constants.ts`) y redirige a `/marca/[id]/copiloto`.
2. El Copiloto detecta el nombre placeholder y arranca la conversación pidiendo nombre y ciudad (`POST /api/brands/[brandId]/start`).
3. Se pueden tener varias marcas: el `BrandSwitcher` de la topbar cambia y crea marcas.

## 5. Estructura del proyecto

```
app/
  page.tsx                          Redirige a la marca más reciente (o crea una)
  layout.tsx                        Outfit, metadata, Toaster, suppressHydrationWarning en <body>
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
  SPEC.md
  HANDOFF.md
```
- Nuevos: `components/tabs/{percepcion,estrategia,calendario,contenido,ads,dashboard}-tab.tsx`, `components/tabs/shared.tsx`, `lib/agents/strategy.ts` (A3, A4, A5 y guiones), `app/api/{calendar/item,content/script,sales,insights,health}/route.ts`.

## 6. Datos (Supabase)

Proyecto Supabase conectado desde Vercel (Storage). Es una base nueva, creada después de la hackathon corriendo la migración. El SQL está en `supabase/migrations/001_init.sql` (tablas + buckets). Para empezar de cero: `truncate table brands cascade;`.

- Tablas: `brands`, `dossier_sections`, `field_provenance`, `media`, `products`, `brand_channels`, `competitors`, `objectives`, `messages`, `agent_runs`, `visibility_queries`, `visibility_results`, `reviews`, `campaigns`, `plan_items`, `scripts`, `skills`, `edits`, `content_pieces`, `ads_campaigns`, `sales_monthly`, `sales_products`, `insights`, `approvals`, `commercial_dates`.
- RLS: la migración no lo activa (como pide el spec para el MVP). Todo el acceso a datos pasa por el servidor con la service role; el navegador solo usa la anon key para subir archivos con URL firmada. Activar RLS es parte del pendiente de seguridad.
- Storage: `brand-files` (privado), `media-public` (público), `voice-messages` (privado), `tts-cache` (privado), `generated-assets` (público).
- El Expediente (`dossier_sections`) es versionado por sección: `ficha`, `visibilidad`, `percepcion`, `estrategia`, `calendario`. Estados: `draft`, `pending_approval`, `approved`, `stale`. Cambiar una sección aguas arriba marca como `stale` las dependientes (`DEPENDENTS` en `lib/dossier.ts`).
- `commercial_dates`: vacía en la base actual. Cargarla con `source_url` real.

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
| `/api/calendar/item` | PATCH, POST | Editar un ítem del calendario / aprobar todos los propuestos |
| `/api/content/script` | POST | Guion de una pieza aprobada |
| `/api/sales` | GET, POST | Ventas agregadas / cargar ventas de ejemplo (`is_demo`) |
| `/api/insights` | POST | 3 hallazgos de ventas con IA |
| `/api/health` | GET | Diagnóstico de configuración (`?probar` hace llamadas reales) |

## 8. Copiloto: herramientas y prompt

Prompt en `lib/copilot/system-prompt.ts` (recibe Expediente, checklist, medios, pestaña actual y fecha de hoy en Argentina). Herramientas en `lib/copilot/tools.ts`:

- Con interfaz en el chat (sin `execute`, resuelve el cliente): `ask_choice`, `request_upload`, `propose_objectives`, `open_tab`
- Con efecto en servidor: `save_field`, `save_products`, `save_channel`, `save_objectives`, `save_product_flags`, `save_competitor`, `run_agent` (A1 a A5), `request_approval` (CP1, CP2a, CP2, CP3, CP4, CP5), `get_dossier`

`save_field` también sincroniza `brands.size_segment`, `brands.city` y `brands.name` cuando corresponde.

### Checklist de carga (`lib/checklist.ts`)
- Obligatorios: nombre y ciudad, productos, tamaño del negocio, precios en publicaciones, objetivo con fecha, piezas por semana
- Recomendados: stock, manual de marca o logo, Instagram o TikTok, competidores, reseñas, historial de ventas
- Opcional: restricciones

## 9. Agentes

| Agente | Archivo | Qué hace | Guarda en |
|---|---|---|---|
| A1 | `lib/agents/a1.ts` | Lee web y archivos, arma el borrador de la Ficha | `dossier_sections.ficha`, `products`, `brand_channels` |
| A2 | `lib/agents/a2.ts` | Visibilidad: genera búsquedas (fase `generate`) y las mide (fase `execute`) en IA (búsqueda web del proveedor), Google, Maps, Instagram, TikTok | `visibility_*`, `competitors`, sección `visibilidad` |
| A3 | `lib/agents/strategy.ts` | Percepción: temas de reseñas y brechas con preguntas | sección `percepcion` (`respuestas` las completa el dueño) |
| A4 | `lib/agents/strategy.ts` | Nichos según tamaño (descubrir/validar/profundizar, fase `nichos`) y posicionamiento del nicho elegido (fase `posicionamiento`) | sección `estrategia` |
| A5 | `lib/agents/strategy.ts` | Calendario: horizonte = hasta el objetivo más lejano, piezas por semana de la Ficha, fechas solo de `commercial_dates` | sección `calendario` (`campanas`, `items` con `status`) |
| Guion | `writeScript` en `strategy.ts` | Guion de una pieza (sincrónico) | `items[].script` |
| Ventas | `/api/insights` | 3 hallazgos sobre los agregados | `insights` |

El calendario guarda campañas e ítems dentro de `dossier_sections.calendario.data` (no usa las tablas `campaigns`/`plan_items` del spec).

## 10. Voz

- Hook `lib/voice/use-voice.ts` (grabar, transcribir, hablar). Estado del servicio en `/api/voice/status`.
- Con ElevenLabs: transcripción y TTS por API, audios de respuesta cacheados en `tts-cache`.
- Sin ElevenLabs: fallback al reconocimiento y la síntesis del navegador.
- Las respuestas del Copiloto se escriben para ser habladas.

## 11. Estado

| Área | Estado |
|---|---|
| Copiloto guiado, voz, carga de archivos, Ficha (CP1) | Hecho |
| Visibilidad digital (CP2) | Hecho (consume mucho cupo de IA) |
| Percepción (CP3, opcional) | Hecho |
| Nicho y posicionamiento (CP4) | Hecho |
| Calendario (CP5) | Hecho |
| Contenido | Guiones con IA y piezas PNG con plantilla. Sin edición real de video (A8) ni provider `workflow` |
| Medios | Hecho (incluye subir skill de edición) |
| Ads (Meta) | Simulado, sin persistencia |
| Dashboard | Hecho (ventas desde Excel o de ejemplo + hallazgos con IA) |

## 12. Pendientes

1. **Cupo de IA**: definir proveedor estable (facturación en Gemini o AI Gateway) antes de que lo use alguien más.
2. Cargar `commercial_dates` con fuente real; sin datos, el calendario no menciona fechas comerciales.
3. A8: transcribir grabaciones (ElevenLabs) y generar plan de edición + SRT siguiendo la skill subida.
4. Ads: persistir en `ads_campaigns` y preparar la interfaz para Meta Marketing API.
5. Seguridad: sin login y con service role, cualquiera con la URL usa la app. Agregar Vercel Deployment Protection o auth antes de compartirla.
6. Actualizar Next.js: el build avisa de una actualización de seguridad.
7. `lib/agents/a2.ts` es el agente más caro: evaluar cachear resultados o bajar la cantidad de búsquedas.

## 13. Mockups y material fuera del repo

- Prototipo navegable (artifact de Claude) "MarkeSys Demo": mismo recorrido con datos de ejemplo, el Copiloto usa Claude. Útil para demos sin depender de Vercel.
- Logo e imagen de LinkedIn: hechos aparte (ícono naranja estilo iOS con M crema y S tinta; slogan "Tu director de marketing con IA: te dice cómo te encuentran hoy y hacia dónde llevar tu marca.").

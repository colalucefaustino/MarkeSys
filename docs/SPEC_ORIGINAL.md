# SPEC v0 · v2 — Vitrina: director de marketing con IA para retail

> Documento para el agente de desarrollo v0. Construir EXACTAMENTE lo descrito. Donde dice **VERIFICAR**, consultar la doc oficial del proveedor antes de codear; no adivinar endpoints. UI en español rioplatense (voseo). `APP_NAME = "Vitrina"` (provisorio).

---

## 0. Reglas para v0
1. Stack fijo: Next.js 15 (App Router, TS) + Tailwind + shadcn/ui + Vercel AI SDK + Supabase. Deploy en Vercel.
2. Toda llamada a LLM, voz o API externa ocurre en el servidor (route handlers). Nunca exponer claves al cliente.
3. Toda salida de agente se valida con Zod (`generateObject`). Si falla: 1 reintento con el error en el prompt; si vuelve a fallar, guardar error en `agent_runs` y mostrar fallback. Nunca pantalla en blanco.
4. **Ningún agente inventa datos.** Cada dato lleva origen `confirmado | inferido | externo | pendiente` (§8).
5. **Nada avanza de etapa sin aprobación del cliente** (checkpoints, §10).
6. **Experiencia guiada siempre** (§5): el usuario no sabe de marketing ni de IA. La app le dice qué hacer en cada momento.
7. `DEMO_MODE=true`: si una API externa falla, usar el último resultado exitoso o el seed de demo.

---

## 1. Producto

**Qué es:** plataforma que actúa como director de marketing para comercios minoristas. Diagnostica cómo encuentran a la marca (IA, Google, redes), cómo la perciben sus clientes, define o profundiza su nicho y arma un plan con el porqué de cada acción. La producción de contenido está integrada, pero **no es la propuesta de valor**.

**Propuesta de valor (lo que se muestra en el pitch):** diagnóstico de visibilidad + percepción + nicho + plan. Frase: *"Otras herramientas te arman la marca; Vitrina te dice hacia dónde llevarla y cómo te encuentran hoy."*

**Problema:** pymes de retail sin equipo de marketing, con la información de su marca dispersa, que no saben cuál es su nicho y son invisibles en buscadores, redes e IA. Empresas grandes que tienen nicho pero no lo conocen en profundidad.

**Qué NO hacemos:** no diseñamos identidad de marca nueva ni generamos manual de marca. Tomamos la marca que existe (PDF, logo, web). Si no hay, deducimos lo básico (colores, tono) y lo marcamos `inferido` para que el cliente confirme.

### 1.1 Segmentos por tamaño (cambian el comportamiento de los agentes)
| Segmento | Definición | Foco |
|---|---|---|
| `micro` | 1–5 personas, sin marketing | Encontrar nicho, acciones básicas de visibilidad, plan chico y sostenible |
| `pyme` | 6–50 personas, marketing parcial | Validar o ajustar el nicho, diferenciarse de competidores locales |
| `grande` | 50+ o varias sucursales, equipo de marketing | Profundizar en el nicho actual: sub-segmentos, conversaciones, presencia frente a competidores |

El Copiloto define el segmento preguntando cuántas personas trabajan y si alguien hace marketing. Se guarda en `brands.size_segment`.

---

## 2. Stack, dependencias y variables de entorno

### 2.1 Dependencias
```
next react react-dom typescript tailwindcss
ai @ai-sdk/anthropic zod
@supabase/supabase-js @supabase/ssr
xlsx papaparse        # Excel/CSV
cheerio               # limpieza HTML de la web del cliente
p-limit               # concurrencia
recharts              # gráficos
html-to-image         # exportar piezas a PNG
jose                  # cookie de sesión demo
shadcn/ui: tabs card button dialog badge table textarea input sheet progress tooltip toast select switch dropdown-menu
```

### 2.2 Variables de entorno
```
ANTHROPIC_API_KEY=
CLAUDE_MODEL_MAIN=claude-sonnet-5-5
CLAUDE_MODEL_FAST=claude-haiku-5-5
SERPER_API_KEY=
APIFY_TOKEN=
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=                 # voz en español latinoamericano (elegir en la biblioteca de voces)
ELEVENLABS_TTS_MODEL=eleven_multilingual_v2   # VERIFICAR nombre vigente
ELEVENLABS_STT_MODEL=scribe_v1                # VERIFICAR nombre vigente
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DEMO_USER_EMAIL=
DEMO_USER_PASSWORD=
AUTH_SECRET=
CONTENT_PROVIDER=template            # template | workflow
CONTENT_WORKFLOW_URL=
CONTENT_API_KEY=
ADS_MODE=simulado                    # simulado | meta (meta = fuera de alcance del MVP)
DEMO_MODE=true
```

---

## 3. Autenticación (demo, sin base de datos)
- Una cuenta genérica: `DEMO_USER_EMAIL` + `DEMO_USER_PASSWORD`. No se guarda en Supabase.
- `/login`: email + contraseña → server action compara con env → cookie `session` (JWT con `jose`, httpOnly, secure, 7 días).
- `middleware.ts`: toda ruta salvo `/login` y assets exige cookie válida.
- Botón "Salir" borra la cookie.
- Supabase se usa desde el servidor con `SUPABASE_SERVICE_ROLE_KEY` (RLS desactivado en el MVP; dejar TODO para migrar a Supabase Auth).

---

## 4. Navegación y layout

### 4.1 Rutas
```
/login
/                          → lista de marcas + "Nueva marca"
/marca/[brandId]           → redirect a /marca/[brandId]/copiloto
/marca/[brandId]/[tab]
tab ∈ copiloto | marca | visibilidad | percepcion | estrategia | calendario | contenido | medios | ads | dashboard
```

### 4.2 Sidebar agrupada (el orden comunica la propuesta de valor)
```
0  Copiloto
── DIAGNÓSTICO ──
1  Marca
2  Visibilidad digital
3  Percepción
── ESTRATEGIA ──
4  Nicho y posicionamiento
── PLAN ──
5  Calendario
── HERRAMIENTAS ──   (tipografía y espaciado más chicos)
6  Contenido
7  Medios
8  Ads (Meta)
9  Dashboard
```
- Todas las pestañas se ven desde el inicio. Las bloqueadas muestran candado y un tooltip con el motivo y qué falta.
- Badge de estado por pestaña: `bloqueada` (gris), `en curso` (azul), `esperando tu aprobación` (amarillo), `aprobada` (verde), `desactualizada` (naranja).

| Pestaña | Se desbloquea cuando |
|---|---|
| Copiloto, Marca, Medios, Dashboard | siempre |
| Visibilidad, Percepción | Ficha aprobada (CP1) |
| Nicho y posicionamiento | CP2 y CP3 aprobados (CP3 se puede saltear) |
| Calendario | CP4 aprobado |
| Contenido | al menos 1 ítem del calendario aprobado |
| Ads | CP5 aprobado |

### 4.3 Layout de `/marca/[brandId]/*`
```
┌──────────────────────────────────────────────────────────────────┐
│ Topbar: logo · nombre de marca · segmento · stepper de etapas · Salir │
├───────────┬──────────────────────────────────┬───────────────────┤
│ Sidebar   │ Contenido de la pestaña          │ Panel Copiloto    │
│ agrupada  │                                  │ (colapsable)      │
└───────────┴──────────────────────────────────┴───────────────────┘
```
- Stepper: Marca → Diagnóstico → Estrategia → Plan → Contenido.
- En la pestaña Copiloto el chat ocupa el centro; el panel derecho muestra checklist + Ficha en vivo.
- En las demás pestañas el Copiloto vive en el panel derecho (Sheet en mobile), conoce la pestaña activa y comenta cada resultado.

---

## 5. Experiencia guiada (obligatorio en toda la app)

### 5.1 Principios
1. **La app siempre dice cuál es el próximo paso.** Cada pantalla tiene un único botón principal y un texto de una línea que explica qué pasa al tocarlo.
2. **El Copiloto lleva la conversación.** Una pregunta por mensaje, corta, sin jerga. Siempre ofrece 2–4 respuestas sugeridas (chips) para tocar en vez de escribir.
3. **Nunca preguntar en abstracto.** No "¿cuáles son tus objetivos?", sino "Te propongo estos 3 objetivos según tu stock y la temporada, ¿cuál te sirve?".
4. **Explicar para qué se pide cada cosa** ("Tu Instagram lo uso para medir si te encuentran en redes").
5. **Confirmar en vez de suponer.** Lo deducido se muestra en amarillo con botón "Confirmar".
6. **Voz como opción de primera clase** en todo el Copiloto (§6).
7. **Estados vacíos que guían:** cada pestaña sin datos explica qué va a aparecer y ofrece el botón para lograrlo.

### 5.2 Arranque: la pestaña Copiloto empieza vacía y pide la información
Cuando la marca es nueva (`brands.stage='arranque'`), la pestaña Copiloto **no muestra el chat activo**. Muestra un panel de arranque que deja claro que es lo primero que hay que hacer.

```
┌──────────────────────────────────────────────────────────────┐
│ [avatar] "Antes de charlar, pasame todo lo que tengas de tu   │
│ negocio. Cuanto más me des, menos te pregunto."               │
│                                                                │
│ PASO 1 DE 2 · CARGÁ TU INFORMACIÓN                            │
│                                                                │
│ Lo básico (obligatorio)                                        │
│  [Nombre del negocio] [Ciudad]                                 │
│  [Link de tu web o tienda online]   ó   [Subir catálogo/stock] │
│  ☐ No tengo web ni catálogo (te pregunto por tus productos)    │
│                                                                │
│ Suma mucho (opcional) — cada tarjeta dice para qué se usa      │
│  [Manual de marca o logo]  "Uso tus colores y tu tono"         │
│  [Instagram / TikTok]      "Mido si te encuentran en redes"    │
│  [Fotos de productos]      "Las uso en los diseños"            │
│  [Historial de ventas]     "Armo tu tablero de ventas"         │
│  [Reseñas de clientes]     "Veo qué valoran de vos"            │
│  [Competidores]            "Te comparo con ellos"              │
│                                                                │
│ [ Empezar con el Copiloto ]   o   [🎙 Prefiero contarlo hablando] │
│ Chat abajo deshabilitado: "Primero cargá tu información arriba"│
└──────────────────────────────────────────────────────────────┘
```

**Reglas del arranque:**
- "Empezar" se habilita con nombre + ciudad + (web **o** catálogo **o** casilla "No tengo").
- Cada tarjeta muestra su estado: `vacía` → `subiendo` → `leyendo` → `listo` (con un resumen de una línea de lo extraído) o `error` (con qué hacer, ej. "No encontré columna de precios: subí otro archivo o seguimos sin precios").
- Archivos aceptados: catálogo/stock `.xlsx .xls .csv .pdf`; manual `.pdf .png .jpg`; logo `.png .jpg .svg`; fotos `image/*` (múltiples); ventas `.xlsx .csv`; reseñas texto pegado o `.txt .csv`.
- "Prefiero contarlo hablando": abre el chat con el micrófono activo (§6) y el Copiloto pide los datos básicos por voz.
- Al tocar "Empezar": se ejecuta A1 sobre todas las fuentes (tarjeta de progreso por fuente), `brands.stage='onboarding'`, se activa el chat y el Copiloto abre con:
  1. Resumen en 2–3 líneas de lo que entendió, aclarando que es deducido.
  2. La primera pregunta de lo que falta.
- Lo que no se cargó se puede sumar después desde el chat (`request_upload`) o desde Medios.

### 5.3 Preguntas guiadas que hace el Copiloto (solo las que falten)
| Dato | Cómo lo pregunta | Obligatorio |
|---|---|---|
| Tamaño | "¿Cuántas personas trabajan y alguien se ocupa del marketing?" (opciones) → guarda segmento | sí |
| Productos (si no hubo web ni catálogo) | "Contame tus 3 a 5 productos principales con precio aproximado, o subí fotos" | sí |
| Precios en publicaciones | "Cuando publiquemos un producto, ¿querés que aparezca su precio?" Siempre / Nunca / Solo en promos / Solo en historias | sí |
| Beneficios comunicables | "¿Qué beneficios ofrecés hoy?" (cuotas, envío, retiro) | no |
| Objetivos | Propone 2–3 objetivos concretos con fecha (según stock, temporada, fecha actual); el usuario elige o ajusta | sí |
| Piezas por semana | "¿Cuántas publicaciones por semana podés sostener?" 2 / 3 / 5 | sí |
| Restricciones | "¿Hay algo que nunca quieras publicar?" (acepta "nada") | no |
| Competidores | "¿Qué marcas sentís que son tu competencia? Si no sabés, las detecto yo" | no |
| Redes | "¿Cuál es tu Instagram?" | no |

Al completar los obligatorios: resumen de 2 líneas + chip "Revisar mi Ficha" → pestaña Marca.

---

## 6. Voz (funcional en el MVP)

### 6.1 Hablarle al Copiloto (voz a texto)
- Botón de micrófono en el input del chat (tab Copiloto, panel lateral y arranque).
- Tocar = empezar a grabar; tocar de nuevo = terminar (o fin automático por silencio de 2 s). Máximo 60 s. Indicador visual de grabación con nivel de audio.
- Grabación en el navegador con `MediaRecorder` (`audio/webm;codecs=opus`; Safari: `audio/mp4`).
- `POST /api/voice/transcribe` (multipart) → ElevenLabs Speech to Text (`ELEVENLABS_STT_MODEL`, idioma español; VERIFICAR endpoint y parámetros) → `{ text }`.
- El texto aparece en el input. Si "Modo conversación" está activo se envía solo; si no, el usuario lo revisa y envía.
- Se guarda el audio en Storage (`voice-messages`) y `messages.audio_url`.
- **Fallback:** si falla la API o no hay clave, usar Web Speech API (`SpeechRecognition`, `lang='es-AR'`) cuando exista; si no, toast "No pude usar el micrófono, escribime".
- Permisos: pedir micrófono recién al primer toque; si lo niegan, mensaje con cómo habilitarlo.

### 6.2 Escuchar las respuestas (texto a voz)
- Cada mensaje del Copiloto tiene botón "▶ Escuchar".
- `POST /api/voice/speak { text }` → ElevenLabs Text to Speech (`ELEVENLABS_VOICE_ID`, `ELEVENLABS_TTS_MODEL`; VERIFICAR endpoint) → audio mp3 en streaming.
- Antes de enviar: quitar markdown, emojis y URLs; máximo 800 caracteres.
- Cache: hash SHA-256 del texto → bucket `tts-cache`; si existe, servir el archivo.
- **Fallback:** `speechSynthesis` del navegador con voz `es-AR` o `es-*`.

### 6.3 Modo conversación
- Switch en el encabezado del chat: "Modo conversación".
- Activo: cada respuesta se reproduce sola y, al terminar el audio, el micrófono se vuelve a abrir. Así se charla sin tocar la pantalla.
- Botón para interrumpir el audio. Se desactiva al cambiar de pestaña.

---

## 7. Base de datos (Supabase / Postgres)

Migración `supabase/migrations/001_init.sql`:
```sql
create extension if not exists "pgcrypto";

create table brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  size_segment text check (size_segment in ('micro','pyme','grande')),
  stage text not null default 'arranque'
    check (stage in ('arranque','onboarding','diagnostico','estrategia','plan','ejecucion')),
  website_url text,
  no_web_no_catalog boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Secciones del Expediente, versionadas
create table dossier_sections (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade,
  section text not null check (section in ('ficha','visibilidad','percepcion','estrategia','calendario')),
  version int not null default 1,
  status text not null default 'draft' check (status in ('draft','pending_approval','approved','stale')),
  data jsonb not null default '{}',
  agent_run_id uuid,
  approved_at timestamptz,
  created_at timestamptz default now(),
  unique (brand_id, section, version)
);

create table field_provenance (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade,
  section text not null,
  path text not null,
  origin text not null check (origin in ('confirmado','inferido','externo','pendiente')),
  source_ref text,                -- id de media, mensaje, URL o búsqueda
  updated_at timestamptz default now(),
  unique (brand_id, section, path)
);

-- Biblioteca de medios (todo archivo que sube el cliente)
create table media (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade,
  kind text not null check (kind in ('catalogo','stock','ventas','branding','logo','fotos','videos','grabacion','skill','resenas','otro')),
  storage_path text not null,
  original_name text,
  mime text,
  size_bytes bigint,
  duration_s numeric,
  plan_item_id uuid,              -- para grabaciones
  parse_status text default 'pending' check (parse_status in ('pending','parsing','parsed','failed')),
  parse_summary text,             -- una línea para mostrar
  parsed jsonb,
  created_at timestamptz default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade,
  sku text, name text not null, category text, price numeric, stock int,
  attributes jsonb default '{}',  -- talles, colores, materiales
  image_media_id uuid references media(id),
  source text check (source in ('catalogo','stock','web','foto','chat')),
  is_star boolean default false, push boolean default false, excluded boolean default false,
  stock_class text check (stock_class in ('sobrestock','normal','bajo','sin_dato')),
  created_at timestamptz default now()
);

create table brand_channels (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade,
  type text check (type in ('web','ecommerce','instagram','tiktok','facebook','google_business','whatsapp','marketplace','local')),
  handle_or_url text,
  origin text check (origin in ('confirmado','inferido'))
);

create table competitors (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade,
  name text not null, url text, instagram text,
  source text check (source in ('cliente','detectado')),
  detected_in jsonb default '[]',
  confirmed boolean default false
);

create table objectives (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade,
  type text check (type in ('ventas','awareness','lanzamiento','liquidar_stock','fidelizacion','apertura_local','posicionamiento','otro')),
  description text not null,
  metric text, target_value numeric, deadline date not null,
  priority int default 1,
  proposed_by text check (proposed_by in ('copiloto','cliente')),
  origin text default 'confirmado'
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade,
  role text check (role in ('user','assistant','system','tool')),
  content jsonb not null,         -- UIMessage del AI SDK (parts)
  audio_url text,                 -- si el usuario habló
  input_mode text default 'texto' check (input_mode in ('texto','voz','chip')),
  tab text,
  created_at timestamptz default now()
);

create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade,
  agent text not null check (agent in ('A1','A2','A3','A4','A5','A6','A7','A8')),
  status text not null default 'queued' check (status in ('queued','running','done','failed')),
  input jsonb, output jsonb, error text,
  progress jsonb default '[]',    -- [{step, status}] para la UI
  started_at timestamptz, finished_at timestamptz
);

create table visibility_queries (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade,
  run_id uuid references agent_runs(id) on delete cascade,
  text text not null,
  kind text check (kind in ('generica','nicho','atributo','marca','cliente')),
  approved boolean default false,
  origin text check (origin in ('agente','cliente'))
);

create table visibility_results (
  id uuid primary key default gen_random_uuid(),
  query_id uuid references visibility_queries(id) on delete cascade,
  channel text check (channel in ('llm','google_web','google_maps','instagram','tiktok')),
  status text default 'ok' check (status in ('ok','failed','skipped')),
  appears boolean, position int,
  mentions jsonb default '[]',    -- [{name, position}]
  sources jsonb default '[]',     -- [{url, title, domain}]
  raw jsonb,
  created_at timestamptz default now()
);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade,
  source text check (source in ('pegado','archivo','google_maps','instagram')),
  author text, text text not null, rating numeric, review_date date, url text
);

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade,
  objective_id uuid references objectives(id),
  name text not null, goal text, key_message text,
  start_date date, end_date date, channels text[], product_ids uuid[],
  kpi_targets jsonb default '{}',
  color_index int default 0,
  status text default 'propuesta' check (status in ('propuesta','aprobada','descartada'))
);

create table plan_items (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete cascade,   -- null = acción de visibilidad
  scheduled_date date not null,
  period_label text,
  channel text,
  format text check (format in ('post','carrusel','historia','reel','video','whatsapp','email','accion_seo','accion_geo','accion_local','otro')),
  idea text, copy text,
  show_price boolean default false,
  promo_is_proposal boolean default false,
  rationale text not null,
  visual_prompt text,
  product_ids uuid[],
  status text default 'propuesta' check (status in ('propuesta','aprobada','descartada','producida'))
);

create table scripts (
  id uuid primary key default gen_random_uuid(),
  plan_item_id uuid references plan_items(id) on delete cascade,
  data jsonb not null,            -- ver A6 guion
  version int default 1,
  created_at timestamptz default now()
);

create table skills (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade,
  name text not null,
  content text not null,          -- SKILL.md completo
  purpose text default 'edicion_video',
  active boolean default true,
  created_at timestamptz default now()
);

create table edits (
  id uuid primary key default gen_random_uuid(),
  plan_item_id uuid references plan_items(id) on delete cascade,
  recording_media_id uuid references media(id),
  skill_id uuid references skills(id),
  transcript jsonb,               -- palabras con tiempos (STT)
  srt text,                       -- subtítulos generados
  plan jsonb,                     -- plan de edición (A8)
  output_media_id uuid references media(id),   -- video final (fase 2)
  status text default 'pendiente' check (status in ('pendiente','transcribiendo','planificando','lista','aprobada','error')),
  created_at timestamptz default now()
);

create table content_pieces (
  id uuid primary key default gen_random_uuid(),
  plan_item_id uuid references plan_items(id) on delete cascade,
  provider text check (provider in ('template','workflow')),
  status text default 'generando' check (status in ('generando','lista','aprobada','rechazada','error')),
  asset_url text, html text, brief jsonb, feedback text, photo_media_id uuid references media(id),
  created_at timestamptz default now()
);

create table ads_campaigns (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete cascade,
  mode text default 'simulado' check (mode in ('simulado','meta')),
  status text default 'borrador' check (status in ('borrador','activa','pausada')),
  objective text check (objective in ('ventas','alcance','trafico','mensajes')),
  daily_budget numeric default 3000,
  audience jsonb default '{}',    -- ubicación, radio, edades, intereses
  creative_piece_ids uuid[],
  metrics jsonb default '{}',     -- {spend, impressions, clicks, purchases, updated_at}
  updated_at timestamptz default now()
);

create table sales_monthly (
  brand_id uuid references brands(id) on delete cascade,
  month text not null,            -- 'AAAA-MM'
  total numeric not null, orders int,
  source_media_id uuid references media(id),
  is_demo boolean default false,
  primary key (brand_id, month)
);

create table sales_products (
  brand_id uuid references brands(id) on delete cascade,
  product text not null, total numeric not null, units int,
  source_media_id uuid references media(id),
  is_demo boolean default false,
  primary key (brand_id, product)
);

create table insights (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade,
  kind text check (kind in ('ventas','visibilidad','campanas')),
  data jsonb not null,
  created_at timestamptz default now()
);

create table approvals (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade,
  checkpoint text check (checkpoint in ('CP1','CP2a','CP2','CP3','CP4a','CP4','CP5','CP6')),
  section text,
  decision text check (decision in ('aprobado','editado','rechazado','salteado')),
  diff jsonb, comment text,
  created_at timestamptz default now()
);

-- Fechas comerciales: las carga el equipo con fuente. A5 no inventa fechas.
create table commercial_dates (
  id uuid primary key default gen_random_uuid(),
  name text not null, date_start date not null, date_end date,
  country text default 'AR', categories text[], source_url text not null
);
```

**Storage buckets:** `brand-files` (privado: catálogos, PDFs, ventas, skills), `media-public` (fotos, logos, videos para previsualizar), `voice-messages` (privado), `tts-cache` (privado), `generated-assets` (público). Archivos privados con signed URLs.

**Seed (`supabase/seed.sql`):** 1 marca demo completa con todas las secciones aprobadas, resultados de visibilidad, percepción, estrategia, calendario, 2 piezas, ventas de 6 meses (`is_demo=true`) y `commercial_dates` con `source_url` real.

---

## 8. Expediente de Marca y regla anti-invención
`getDossier(brandId)` devuelve: `brand`, última versión `approved` (o `draft`) de cada sección, `products`, `competitors`, `objectives`, `channels`, `media` (resúmenes), `skills` activas y `provenance`.

- `confirmado`: lo dijo o aprobó el cliente. `inferido`: deducido de un archivo o la web (UI amarillo + "Confirmar"). `externo`: búsqueda o LLM, siempre con `source_ref`. `pendiente`: falta; la UI dice "Falta este dato" y el Copiloto lo pide.
- Todo schema de salida de agente incluye `missing_inputs: string[]` y `assumptions: string[]`. Si `missing_inputs` no está vacío, el Copiloto lo pide antes de dar el resultado por final.
- Aprobar una sección marca sus paths como `confirmado`.
- Editar una sección aprobada crea versión `draft` y marca como `stale` las dependientes: `ficha → [visibilidad, percepcion, estrategia, calendario]`, `visibilidad → [estrategia, calendario]`, `percepcion → [estrategia]`, `estrategia → [calendario]`.

---

## 9. Agentes

Convenciones: `generateObject` con Zod (A0 usa `streamText` + tools). Modelo `CLAUDE_MODEL_MAIN` salvo aclaración. Entrada común `{ dossier, size_segment, tab }`. Salida común `{ ..., missing_inputs, assumptions }`. Cada agente escribe `agent_runs.progress` para la UI.

### A0 — Copiloto (orquestador, la única voz con el cliente)
`POST /api/chat` con `streamText` + tools; front con `useChat`. El system prompt se arma con: etapa, pestaña activa, checklist, resumen del Expediente con procedencia, medios cargados.

**Tools:**
| Tool | Parámetros | Efecto en la UI |
|---|---|---|
| `ask_choice` | `question, options[], multi` | Chips de respuesta |
| `request_upload` | `kind, reason` | Tarjeta de carga dentro del chat |
| `save_field` | `section, path, value, origin` | Escribe Expediente + procedencia |
| `propose_objectives` | `objectives[{description,type,deadline,metric?,target?}]` | Tarjetas de objetivos para elegir/editar |
| `save_objectives` | `objectives[]` | Inserta en `objectives` |
| `save_product_flags` | `product_ids[], flag` | Estrella / impulsar / excluir |
| `save_competitor` | `name, url?, instagram?` | Inserta competidor |
| `run_agent` | `agent, params?` | Encola ejecución |
| `open_tab` | `tab` | Navega |
| `request_approval` | `checkpoint` | Tarjeta de aprobación con link a la pestaña |
| `get_dossier` | — | Expediente actualizado |

**System prompt A0:**
```
Sos el Copiloto de marketing de Vitrina. Acompañás a {brand.name} ({size_segment}, {city}) en 5 etapas: Marca → Diagnóstico → Estrategia → Plan → Contenido. Etapa actual: {stage}. Pestaña: {tab}.

EXPERIENCIA GUIADA
- El dueño no sabe de marketing ni de IA. Vos llevás la conversación.
- Una sola pregunta por mensaje, corta, en rioplatense, cálido y claro. Sin jerga.
- Siempre ofrecé 2 a 4 respuestas con ask_choice.
- Explicá para qué pedís cada dato.
- No preguntes objetivos en abstracto: proponé 2 o 3 con fecha usando propose_objectives, basados en stock, temporada y fecha de hoy ({today}).
- Para precios preguntá: "Cuando publiquemos un producto, ¿querés que aparezca su precio?".
- Restricciones son opcionales.
- Tus respuestas pueden escucharse en voz alta: escribí frases que suenen naturales habladas, sin listas largas ni símbolos.

NO INVENTAR
- Usá solo datos del Expediente. Si falta algo, pedilo.
- Lo deducido de archivos o de la web se guarda como "inferido" y se confirma.
- Explicá cada resultado de un agente con su evidencia en 3 a 5 líneas y llevá al cliente a la pestaña.
- Nunca avances de etapa sin request_approval.
- Respetá las restricciones del Expediente.
- Adaptá la profundidad: micro = simple; grande = analítico.

CHECKLIST: {checklist_json}
EXPEDIENTE: {dossier_summary}
MEDIOS: {media_summary}
```

**Checklist** (servidor; se muestra en panel y va al prompt):
| Requisito | Obligatorio |
|---|---|
| Nombre y ciudad | sí |
| Productos (catálogo, web o contados en el chat) | sí |
| Tamaño | sí |
| Precios en publicaciones | sí |
| Objetivos con fecha (al menos 1) | sí |
| Piezas por semana | sí |
| Stock | recomendado |
| Manual de marca o logo | recomendado |
| Instagram / TikTok | recomendado |
| Competidores | recomendado |
| Reseñas | recomendado |
| Historial de ventas | recomendado |
| Restricciones | opcional |

### A1 — Identidad de Marca (ingesta)
**Trigger:** "Empezar" del arranque (todas las fuentes) y cada archivo o link nuevo.
1. **Web** (`parseUrl`): fetch server-side (timeout 10 s). Shopify: intentar `/products.json` (VERIFICAR). Si no: cheerio → texto limpio (máx 15k caracteres) + `<meta>` + links a redes → Claude extrae productos, precios, textos de marca, tono, canales, handles. Todo `inferido`, `source_ref=url`. Si falla: el Copiloto pide el catálogo.
2. **Catálogo / stock Excel o CSV:** SheetJS → `CLAUDE_MODEL_FAST` devuelve el mapeo de columnas (no los valores) → código crea `products`. Mostrar al cliente el mapeo detectado para confirmar.
3. **Catálogo PDF / manual de marca PDF / imágenes:** se envían a Claude como documento/imagen → productos, o `colores[{hex,uso}]`, `tipografias[]`, `tono`, `usos_prohibidos[]`. `inferido`.
4. **Logo:** colores dominantes calculados por código (canvas/sharp) + Claude confirma usos. `inferido`.
5. **Fotos de productos:** Claude visión → nombre tentativo, categoría y atributos; vincular a productos existentes si coincide.
6. **Reseñas pegadas:** split por línea → `reviews`.
7. **Ventas:** ver A7.
8. **Consolidar** la Ficha.

**Ficha (schema):**
```ts
Ficha = {
  marca: { nombre, ciudad, rubro, historia?, diferencial?, canales_venta: string[] },
  tamano: { segmento, empleados?, sucursales?, equipo_marketing: boolean },
  productos_resumen: { total, categorias: string[], rango_precio: {min,max}, estrella_ids, impulsar_ids, excluidos_ids },
  precios_en_publicaciones: 'siempre'|'nunca'|'solo_promos'|'solo_historias',
  posicionamiento_precio: 'economico'|'medio'|'premium', compite_por: string, beneficios_comunicables: string[],
  comunicacion: { trato: 'vos'|'usted', tono: string[], frases_si: string[], frases_no: string[], referencias: string[] },
  publico: { actual, deseado?, preocupaciones_compra: string[] },
  identidad_visual: { colores: {hex,uso}[], tipografias: string[], logo_media_id?, estilo? },
  capacidad: { piezas_por_semana: number, formatos_posibles: string[] },
  restricciones: string[],
  missing_inputs: string[], assumptions: string[]
}
```
**CP1:** pestaña Marca, Ficha editable con procedencia → "Aprobar Ficha".

### A2 — Visibilidad digital (protagonista de la demo)
**Trigger:** CP1 aprobado. El Copiloto anuncia las búsquedas.
1. **Generar 10–12 búsquedas** de 4 tipos (`generica`, `nicho`, `atributo`, `marca`), con la ciudad. `grande`: sumar sub-segmentos y comparativas.
2. **CP2a:** el cliente ve la lista, puede sacar, editar o sumar, y toca "Ejecutar búsquedas" (un toque, botón principal).
3. **Ejecutar por canal** (paralelo, `p-limit(4)`, timeout 60 s por canal; un canal que falla no corta el resto):
| Canal | Cómo | Mide |
|---|---|---|
| `llm` | Claude con la herramienta de búsqueda web vía AI SDK (VERIFICAR nombre en `@ai-sdk/anthropic`). Prompt: responder a un comprador con recomendaciones y fuentes | aparece, posición, marcas mencionadas, fuentes |
| `google_web` | Serper `POST https://google.serper.dev/search`, header `X-API-KEY`, `{q, gl:'ar', hl:'es'}` | posición orgánica de dominio/redes; competidores top 10 |
| `google_maps` | Serper places (VERIFICAR endpoint) | aparece la ficha, posición, rating, cantidad de reseñas |
| `instagram` | Apify, actor de perfiles y hashtags (VERIFICAR actor ID). Solo perfiles públicos; cache 24 h | seguidores, posts/semana, engagement promedio, hashtags |
| `tiktok` | Apify (VERIFICAR actor ID), solo si hay handle | idem |
- "Aparece" se decide **por código** (nombre, dominio, handles normalizados sin tildes), no por el LLM.
4. **Análisis** sobre lo guardado:
```ts
Visibilidad = {
  fecha, puntaje_global /* código */, 
  por_canal: { canal, puntaje, con_aparicion, total, estado: 'ok'|'failed'|'skipped' }[],
  sin_nombre: { con_aparicion, total },   // búsquedas que no usan el nombre de la marca
  ranking_competidores: { nombre, apariciones, canales }[],
  fuentes_frecuentes: { dominio, veces }[],
  redes: { red, seguidores?, posts_por_semana?, engagement?, vs_competidores }[],
  acciones: { accion, canal, evidencia, prioridad: 'alta'|'media'|'baja', esfuerzo: 'bajo'|'medio'|'alto' }[],
  missing_inputs, assumptions
}
```
- Puntaje por canal = Σ(aparece ? (pos ≤3: 1; 4–10: 0,6; >10: 0,3) : 0) / total × 100. Global = promedio de canales `ok`.
- Cada acción cita su evidencia. Competidores detectados → `competitors` con `source='detectado'`; el Copiloto pregunta si los reconoce.
**CP2:** "Entendido, aprobar diagnóstico".

### A3 — Percepción
**Trigger:** CP1 aprobado; corre en paralelo a A2.
- Fuentes de reseñas (prioridad): pegadas/subidas en el arranque o la pestaña → Google Maps (Serper o Apify, VERIFICAR) → comentarios de Instagram (Apify, opcional).
- Extraer temas (`CLAUDE_MODEL_FAST`), comparar 3 columnas (lo que dice el dueño / lo que valoran los clientes / lo que muestra la comunicación) y generar una pregunta por brecha.
```ts
Percepcion = {
  cantidad_resenas, suficiente /* false si < 5 */,
  temas: { tema, menciones, sentimiento: 'positivo'|'negativo'|'mixto', ejemplo /* textual ≤25 palabras */, review_ids }[],
  brechas: { dueno_dice, clientes_valoran, comunicacion_muestra, tipo: 'coincide'|'brecha', pregunta, opciones: string[] }[],
  missing_inputs, assumptions
}
```
**CP3:** el cliente responde cada brecha (chips) y se derivan `atributos_a_reforzar`. Sin reseñas: "Saltear".

### A4 — Estratega (nicho y posicionamiento), adaptado por tamaño
| Segmento | Modo por defecto | Qué hace |
|---|---|---|
| micro | `descubrir` | 3 nichos posibles, recomienda 1 |
| pyme | `validar` | nicho actual vs 2 alternativas |
| grande | `profundizar` | sub-segmentos, motivaciones y objeciones, preguntas frecuentes (con fuente), conversaciones y hashtags, presencia frente a competidores, nichos adyacentes |
El cliente puede cambiar el modo.
```ts
Estrategia = {
  modo,
  nichos: { nombre, descripcion, persona, porcentaje_catalogo /* código */, product_ids, competencia: 'alta'|'media'|'baja', evidencia: {dato, fuente}[], riesgos: string[], recomendado: boolean }[],
  investigacion_nicho?: { sub_segmentos, motivaciones, objeciones, preguntas_frecuentes: {pregunta, fuente}[], conversaciones_redes: {tema, hashtags, fuente}[], share_of_voice /* código */, nichos_adyacentes },
  nicho_elegido?, propuesta_valor?, mensajes_clave? /* 3 */, tono?: { descripcion, frases_si, frases_no }, persona_principal?,
  missing_inputs, assumptions
}
```
- Dos llamadas: (1) nichos → **CP4a** el cliente elige; (2) posicionamiento → **CP4** aprueba o edita.
- No inventar tamaños de mercado. No prometer beneficios que no estén en la Ficha.

### A5 — Planificador (calendario adaptado a objetivos)
**Trigger:** CP4 aprobado (antes, el Copiloto confirma objetivos y piezas por semana).
- **Horizonte (código):** desde el próximo lunes hasta el deadline más lejano de los objetivos. Granularidad: ≤6 semanas día/semana; 6 semanas–4 meses semana; >4 meses mes con fases.
- **Volumen:** nunca más de `piezas_por_semana` (las acciones de visibilidad no cuentan).
- **Stock (código):** `sobrestock` si ≥ p75 y no es estrella; `bajo` si ≤ p25 o < 5; `sin_dato` si no hay stock. Excluidos nunca; bajo no se empuja.
- **Fechas comerciales:** solo de `commercial_dates` dentro del horizonte.
- Campañas (al menos 1 por objetivo) e ítems con `rationale` obligatorio. Incluye acciones de A2 (`accion_geo/seo/local`) en las primeras semanas.
- `show_price` según `precios_en_publicaciones`. Promo no confirmada → `promo_is_proposal=true` (badge "Propuesta").
```ts
Plan = {
  horizonte: { inicio, fin, granularidad, fases? },
  campanas: { nombre, objective_id, objetivo, mensaje_clave, product_ids, canales, inicio, fin, kpi_objetivo: {metrica, valor, unidad}[] }[],
  items: { campana_idx /* -1 = acción */, fecha, periodo_label, canal, formato, idea, copy, show_price, promo_is_proposal, rationale, visual_prompt?, product_ids }[],
  missing_inputs, assumptions
}
```
**CP5:** por ítem (aprobar / editar / descartar / "otra idea") y global ("Aprobar calendario").

### A6 — Contenido (guiones y piezas)
**Guion** (por ítem aprobado, botón "Escribir guion"):
```ts
Guion = { gancho, escenas: { tiempo, que_grabar, texto_en_pantalla, voz }[], cta, duracion_seg, copy_publicacion, consejos: string[] }
```
Pensado para grabar con celular, respetando tono, trato, precios y restricciones.

**Pieza gráfica** (post, carrusel, historia):
- Brief: `{ copy, cta, formato '1:1'|'9:16'|'4:5', colores, tipografias, logo, foto (de Medios), show_price, precio?, tono, restricciones }`.
- Provider `template` (default): 3 layouts React (producto destacado, promo, frase de marca) con foto real de Medios, colores y tipografías de la Ficha → PNG con `html-to-image` → `generated-assets`.
- Provider `workflow`: `POST CONTENT_WORKFLOW_URL` (contrato a definir; VERIFICAR). Si falla → `template`.
- El texto siempre se superpone por HTML/CSS; nunca se le pide texto a un modelo de imagen.
**CP6:** aprobar / pedir otra versión / descargar.

### A7 — Analista de ventas (Dashboard)
- Ingesta: Excel/CSV → SheetJS → `CLAUDE_MODEL_FAST` mapea columnas (fecha, monto o precio×cantidad, producto) → **código** agrega en `sales_monthly` y `sales_products`. Fechas: Date de Excel, `dd/mm/aaaa`, `aaaa-mm-dd`.
- KPIs por código: ventas del último mes, variación vs mes anterior, ticket promedio, producto que más factura, evolución mensual.
- "Analizar con el Copiloto": Claude recibe **solo los agregados** y devuelve `{ hallazgos: {titulo, dato, accion}[3] }` → `insights`.

### A8 — Editor de video con skill del cliente
- **Skill:** el cliente sube su `SKILL.md` en Contenido o Medios → `skills` (activa). Se inyecta completa en el prompt de edición con la instrucción "seguila al pie de la letra".
- **Flujo por grabación:**
  1. Subida del video (Storage, máx 200 MB) asociada al `plan_item`.
  2. Extraer audio y transcribir con ElevenLabs STT con tiempos por palabra (VERIFICAR parámetro de timestamps) → `edits.transcript`.
  3. Generar `edits.srt` por código desde los tiempos.
  4. Claude (skill + guion + transcripción + branding) devuelve el plan:
```ts
PlanEdicion = { resumen, formato: '9:16'|'1:1'|'4:5', cortes: {desde, hasta, accion}[], textos_en_pantalla: {tiempo, texto}[], subtitulos: { estilo }, musica, color, verificar: string[] }
```
  5. La UI muestra video + plan + subtítulos descargables (.srt).
- **Render del video final:** fuera del MVP (fase 2: FFmpeg en un worker o el workflow de contenido). En el MVP se entrega plan + SRT.

### Ads (sin agente, gestión)
- Por cada campaña aprobada se crea un `ads_campaigns` en modo `simulado`.
- Acciones: activar/pausar, cambiar presupuesto diario, objetivo, audiencia (ciudad + radio, edades, intereses), asignar piezas aprobadas como creatividades.
- Métricas simuladas determinísticas a partir del presupuesto, rotuladas "Datos simulados".
- Modo `meta` (fase 2): Facebook Login + Marketing API con permiso `ads_management` (requiere revisión de app de Meta). Dejar la interfaz `AdsProvider` lista (`listCampaigns`, `setStatus`, `setBudget`, `getInsights`).

---

## 10. Flujo, conexiones y checkpoints

```
ARRANQUE (carga de información) ──Empezar──> A1 ingesta ──> Copiloto pregunta lo que falta
        │
        ▼
A1 Ficha ──CP1──┬──> A2 Visibilidad ──CP2a (búsquedas)──CP2──┐
                └──> A3 Percepción ──────────────────CP3─────┤
                                                              ▼
                                         A4 Estrategia ──CP4a (nicho)──CP4
                                                              │
                                    Copiloto confirma objetivos y piezas/semana
                                                              ▼
                                         A5 Calendario ──CP5
                                                              ▼
                       A6 Guiones y piezas ──CP6      A8 Edición de grabaciones
                                                              ▼
                                         Ads (campañas aprobadas)
Medios y Dashboard (A7) disponibles en cualquier momento.
```

| Desde | Hacia | Datos |
|---|---|---|
| A1 | A2 | rubro, ciudad, productos estrella, diferencial, público, handles, competidores |
| A1 | A3 | lo que dice el dueño, textos de la web, reseñas |
| A2 | A4 | competidores, fuentes, hashtags, presencia, puntajes |
| A3 | A4 | temas, brechas, respuestas, atributos a reforzar |
| A2 | A5 | acciones priorizadas |
| A4 | A5 | nicho, propuesta de valor, mensajes, tono, persona |
| A1 | A5 | productos y stock, precios, restricciones, capacidad, objetivos |
| A5 | A6/A8 | ítem aprobado |
| A1 + Medios | A6/A8 | identidad visual, logo, fotos, skill |
| A5 + A6 | Ads | campañas y piezas aprobadas |
| A7 | Copiloto, A5 | productos que más venden (sugerencias en replanificación) |

**Reglas:** aprobar CPn → `status='approved'`, registro en `approvals`, `brands.stage` avanza, pestañas siguientes se desbloquean y el Copiloto anuncia el próximo paso. Un agente no corre si sus entradas no están aprobadas (409 con motivo).

---

## 11. API (route handlers)
| Método y ruta | Descripción |
|---|---|
| `POST /api/auth/login` · `POST /api/auth/logout` | sesión demo |
| `GET/POST /api/brands` | listar / crear marca (stage `arranque`) |
| `PATCH /api/brands/[id]` | nombre, ciudad, web, casilla "no tengo" |
| `POST /api/brands/[id]/start` | cierra el arranque y dispara A1 sobre todas las fuentes |
| `GET /api/brands/[id]/dossier` | Expediente |
| `PATCH /api/brands/[id]/sections/[section]` | edición manual (marca `confirmado`, propaga `stale`) |
| `POST /api/brands/[id]/approve` | `{checkpoint, decision, diff?, comment?}` |
| `POST /api/brands/[id]/media` | upload multipart `{kind, plan_item_id?}` → Storage → `media` → parseo según kind |
| `GET /api/brands/[id]/media` · `DELETE /api/media/[id]` | biblioteca |
| `POST /api/brands/[id]/reviews` | reseñas pegadas |
| `POST /api/chat` | Copiloto (stream) — body `{brandId, tab, inputMode}` |
| `POST /api/voice/transcribe` | audio → texto |
| `POST /api/voice/speak` | texto → audio (cache) |
| `POST /api/agents/[agent]/run` | `{brandId, params}` → `agent_runs` |
| `GET /api/agents/runs/[runId]` | estado y progreso (polling 1,5 s o Realtime) |
| `PATCH /api/brands/[id]/visibility/queries` | editar/aprobar búsquedas |
| `PATCH /api/plan-items/[id]` · `POST /api/plan-items/[id]/regenerate` | calendario |
| `POST /api/plan-items/[id]/script` | A6 guion |
| `POST /api/plan-items/[id]/produce` | A6 pieza |
| `POST /api/plan-items/[id]/edit` | A8 sobre la grabación asociada |
| `PATCH /api/content/[id]` | aprobar / feedback |
| `POST /api/brands/[id]/skills` · `PATCH /api/skills/[id]` | skill de edición |
| `GET/PATCH /api/brands/[id]/ads` | campañas de anuncios |
| `GET /api/brands/[id]/sales` · `POST /api/brands/[id]/insights` | dashboard |

Ejecución de agentes en el handler con `export const maxDuration = 300`; progreso en `agent_runs`.

---

## 12. Pantallas

**/login:** card centrada, email + contraseña, error inline.

**/ (marcas):** tarjetas (nombre, segmento, etapa, puntaje de visibilidad si existe) + "Nueva marca" (dialog: nombre) → abre el arranque.

**0 Copiloto**
- Estado `arranque`: panel de §5.2, chat deshabilitado.
- Estado activo: chat centrado. Mensajes con partes: texto, chips (`ask_choice`), tarjetas de carga (`request_upload`), tarjetas de objetivos (`propose_objectives`), progreso de agentes, tarjetas de aprobación. Cada mensaje del Copiloto con "▶ Escuchar". Input con micrófono. Switch "Modo conversación". Panel derecho: checklist (obligatorio / recomendado / opcional con botón de carga) + Ficha en vivo.

**1 Marca:** Ficha por secciones en cards editables; cada campo con punto de procedencia (verde confirmado, amarillo inferido + "Confirmar", azul externo con link, gris pendiente) y ayuda debajo del nombre del campo:
- "Precios en publicaciones": *Cuando publiquemos un producto, ¿aparece su precio?*
- "Objetivos": *Te los propone el Copiloto según tu stock y la temporada.*
- "Tamaño": *Lo define el Copiloto con tus respuestas.*
- "Restricciones": *Opcional.*
Tabla de productos con filtros, toggles estrella/impulsar/excluir y clase de stock. Paleta y tipografías renderizadas. Barra fija "Aprobar Ficha" (deshabilitada si faltan obligatorios, con la lista).

**2 Visibilidad digital:** (a) lista de búsquedas editable + "Ejecutar búsquedas"; (b) progreso por canal; (c) resultados: puntaje grande, frase "aparecés en X de Y búsquedas que no usan tu nombre", barras por canal, quién aparece en tu lugar, fuentes frecuentes, redes vs competidores, tabla búsqueda × canal expandible (respuesta y fuentes), acciones con evidencia. Aviso: "Foto del {fecha}; las respuestas cambian".

**3 Percepción:** pegar reseñas / subir archivo / "Buscar en Google Maps". Temas con conteo y ejemplo. Tabla de 3 columnas (verde coincide, amarillo brecha) con pregunta y chips. Aviso si < 5 reseñas.

**4 Nicho y posicionamiento:** selector de modo (preseleccionado por tamaño). Tarjetas de nicho (recomendada destacada, % de catálogo, competencia, evidencia con fuente, riesgos, persona, "Elegir"). Modo profundizar: secciones de investigación. Luego posicionamiento editable + "Aprobar estrategia".

**5 Calendario:** objetivos con fecha y horizonte calculado arriba; clasificación de stock en chips. Vistas: Calendario mensual (navegable), Campañas (línea de tiempo), Lista por semana. Cada ítem abre un panel con formato, canal, texto, productos, badge de precio, badge "Propuesta", **"¿Por qué?"**, y acciones aprobar / descartar / otra idea. En cada ítem con contenido listo: ícono y botón "Descargar". "Aprobar calendario".

**6 Contenido:** card de skill de edición (subir / reemplazar). Grilla de ítems aprobados: "Escribir guion" → guion; reels e historias: "Subir grabación" → video + "Editar con mi skill" → plan + "Descargar subtítulos (.srt)"; posts: "Diseñar pieza" → vista previa con foto de Medios → aprobar / otra versión / descargar PNG.

**7 Medios:** categorías con botón de carga y para qué sirve cada una (fotos, logo, manual, catálogo/stock, ventas, videos, skill). Grilla con miniaturas, tipo, resumen de lo extraído, dónde se usa y borrar (con confirmación en la UI).

**8 Ads (Meta):** banner "Datos simulados"; botón "Conectar cuenta de Meta" (deshabilitado en modo simulado, con tooltip). Tabla: campaña, estado (botón activar/pausar), objetivo, presupuesto diario editable, piezas, gasto 7 d, impresiones, CTR, CPC, compras, fila de totales.

**9 Dashboard:** estado vacío con "Subir ventas" + "Usar ventas de ejemplo". Con datos: 4 tarjetas (último mes, variación, ticket promedio, más vendido), barras por mes, productos que más facturan, "Analizar con el Copiloto" → 3 hallazgos con acción. Si hay campañas: avance meta vs real. Banner si `is_demo`.

**Componentes compartidos:** `ProvenanceDot`, `ApprovalBar`, `AgentProgressCard`, `StaleBanner`, `LockedTab`, `UploadCard` (estados vacía/subiendo/leyendo/listo/error), `MicButton`, `SpeakButton`, `ChoiceChips`, `EmptyState`.

---

## 13. Integraciones externas (resumen)
| Servicio | Uso | Notas |
|---|---|---|
| Claude (AI SDK `@ai-sdk/anthropic`) | todos los agentes, visión, PDFs, búsqueda web | `CLAUDE_MODEL_MAIN` / `FAST` |
| Serper | Google web y Maps | VERIFICAR endpoint de places/reviews |
| Apify | Instagram, TikTok, reseñas de Maps | VERIFICAR actor IDs; solo datos públicos; cache 24 h |
| ElevenLabs | voz a texto (chat y grabaciones) y texto a voz | VERIFICAR endpoints, modelos y timestamps |
| Supabase | Postgres + Storage (+ Realtime opcional) | RLS off en MVP |
| Workflow de contenido | piezas (opcional) | contrato a definir |
| Meta Marketing API | Ads reales | fase 2 |

---

## 14. Errores y modo demo
- Cada canal de A2 es independiente. Archivo no legible → `parse_status='failed'` + mensaje con qué hacer.
- Voz: fallback al navegador; si tampoco, texto.
- `DEMO_MODE=true`: atajo oculto (Ctrl+Shift+D) en la marca demo que carga resultados guardados al instante.
- Costos: máximo 12 búsquedas por ejecución; cache de Apify y de TTS.

---

## 15. Carpetas sugeridas
```
app/
  login/page.tsx · page.tsx
  marca/[brandId]/layout.tsx           # topbar + sidebar agrupada + panel copiloto
  marca/[brandId]/[tab]/page.tsx
  api/... (§11)
lib/
  supabase/{server,client}.ts · auth.ts · dossier.ts · checklist.ts · scoring.ts
  agents/{a0-copiloto,a1-identidad,a2-visibilidad,a3-percepcion,a4-estratega,a5-planificador,a6-contenido,a7-ventas,a8-editor}.ts
  agents/prompts/*.ts · schemas/*.ts
  integrations/{claude,serper,apify,elevenlabs,content-provider,ads-provider,parse-file,parse-url}.ts
components/
  arranque/* copiloto/* voice/* tabs/* shared/*
middleware.ts
supabase/migrations/001_init.sql · supabase/seed.sql
```

---

## 16. Orden de construcción (prioridad = recorrido de la demo)
1. Auth demo + layout con sidebar agrupada y estados + schema + seed.
2. **Arranque** (panel de carga) + A1 (web, Excel, PDF de marca) + Medios básico.
3. **Copiloto** guiado (tools `ask_choice`, `request_upload`, `save_field`, `propose_objectives`) + **voz** (transcribe, speak, modo conversación).
4. Pestaña Marca + CP1.
5. **A2 Visibilidad** (LLM + Serper web/maps primero; Apify después) + CP2.
6. A3 Percepción + CP3.
7. A4 Estrategia + CP4.
8. A5 Calendario + CP5.
9. A6 guiones y piezas `template`.
10. A7 Dashboard. 11. A8 edición con skill. 12. Ads simulado. 13. Provider `workflow`.

## 17. Fuera de alcance del MVP
Publicación automática en redes, Ads reales con Meta, render final de video, conexión con Tienda Nube/Shopify/Meta para métricas, posventa por WhatsApp, multiusuario real, pagos, RLS.

## 18. Pendientes del equipo
- Negocio real (o demo) para el recorrido del pitch, con su web y PDF de marca.
- Voz de ElevenLabs en español a usar (`ELEVENLABS_VOICE_ID`).
- Cargar `commercial_dates` con fuente oficial.
- IDs de actores de Apify y endpoints de Serper y ElevenLabs marcados VERIFICAR.
- Contrato del workflow de contenido (si se usa).
- El `SKILL.md` de edición para cargar en la demo.

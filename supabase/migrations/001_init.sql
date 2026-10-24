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

-- Storage buckets
insert into storage.buckets (id, name, public) values
  ('brand-files','brand-files',false),
  ('media-public','media-public',true),
  ('voice-messages','voice-messages',false),
  ('tts-cache','tts-cache',false),
  ('generated-assets','generated-assets',true)
on conflict (id) do nothing;

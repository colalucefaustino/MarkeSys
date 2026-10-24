import { tool } from 'ai'
import { z } from 'zod'
import { db } from '@/lib/supabase/server'
import { getDossier, dossierSummary, saveField, ensureDraft } from '@/lib/dossier'
import { computeChecklist } from '@/lib/checklist'
import { TAB_KEYS } from '@/lib/tabs'
import { startAgent } from '@/lib/agents/start'

const Value = z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.array(z.number())])

const ObjectiveInput = z.object({
  description: z.string().describe('Objetivo concreto, en una frase'),
  type: z.enum([
    'ventas',
    'awareness',
    'lanzamiento',
    'liquidar_stock',
    'fidelizacion',
    'apertura_local',
    'posicionamiento',
    'otro',
  ]),
  deadline: z.string().describe('Fecha límite YYYY-MM-DD'),
  metric: z.string().optional(),
  target: z.number().optional(),
})

export function copilotTools(brandId: string) {
  return {
    ask_choice: tool({
      description:
        'Muestra chips de respuesta. Usala para toda pregunta al dueño. La respuesta llega como resultado de la herramienta.',
      inputSchema: z.object({
        question: z.string().describe('La pregunta corta y cálida'),
        options: z.array(z.string()).min(2).max(5),
        multi: z.boolean().default(false),
      }),
    }),

    request_upload: tool({
      description: 'Muestra una tarjeta de carga de archivo dentro del chat.',
      inputSchema: z.object({
        kind: z.enum(['catalogo', 'stock', 'ventas', 'branding', 'logo', 'fotos', 'resenas']),
        reason: z.string().describe('Para qué se usa, en una frase'),
      }),
    }),

    propose_objectives: tool({
      description:
        'Propone 2 o 3 objetivos con fecha para que el dueño elija o edite. El resultado trae los elegidos.',
      inputSchema: z.object({ objectives: z.array(ObjectiveInput).min(2).max(4) }),
    }),

    open_tab: tool({
      description: 'Navega a una pestaña de la app.',
      inputSchema: z.object({ tab: z.enum(TAB_KEYS as [string, ...string[]]) }),
    }),

    save_field: tool({
      description:
        'Guarda un dato en el Expediente (sección ficha). path con puntos, por ejemplo tamano.segmento, precios_en_publicaciones, capacidad.piezas_por_semana, restricciones, beneficios_comunicables, marca.rubro.',
      inputSchema: z.object({
        section: z.literal('ficha').default('ficha'),
        path: z.string(),
        value: Value,
        origin: z.enum(['confirmado', 'inferido']).default('confirmado'),
      }),
      execute: async ({ path, value, origin }) => {
        await saveField(brandId, 'ficha', path, value, origin, 'chat')
        if (path === 'tamano.segmento' && ['micro', 'pyme', 'grande'].includes(String(value))) {
          await db().from('brands').update({ size_segment: value }).eq('id', brandId)
        }
        if (path === 'marca.ciudad' && typeof value === 'string') {
          await db().from('brands').update({ city: value }).eq('id', brandId)
        }
        if (path === 'marca.nombre' && typeof value === 'string') {
          await db().from('brands').update({ name: value }).eq('id', brandId)
        }
        return { saved: path }
      },
    }),

    save_products: tool({
      description: 'Guarda productos que el dueño contó en el chat (origen chat).',
      inputSchema: z.object({
        products: z.array(z.object({ name: z.string(), price: z.number().optional(), category: z.string().optional() })).min(1),
      }),
      execute: async ({ products }) => {
        await db()
          .from('products')
          .insert(products.map((p) => ({ brand_id: brandId, name: p.name, price: p.price ?? null, category: p.category ?? null, source: 'chat' })))
        return { saved: products.length }
      },
    }),

    save_channel: tool({
      description: 'Guarda un canal de la marca (instagram, tiktok, facebook, whatsapp, web, etc.).',
      inputSchema: z.object({
        type: z.enum(['web', 'ecommerce', 'instagram', 'tiktok', 'facebook', 'google_business', 'whatsapp', 'marketplace', 'local']),
        handle_or_url: z.string(),
      }),
      execute: async ({ type, handle_or_url }) => {
        await db().from('brand_channels').delete().eq('brand_id', brandId).eq('type', type)
        await db()
          .from('brand_channels')
          .insert({ brand_id: brandId, type, handle_or_url: handle_or_url.replace(/^@/, ''), origin: 'confirmado' })
        return { saved: type }
      },
    }),

    save_objectives: tool({
      description: 'Inserta los objetivos que el dueño eligió.',
      inputSchema: z.object({ objectives: z.array(ObjectiveInput).min(1) }),
      execute: async ({ objectives }) => {
        const rows = objectives.map((o, i) => ({
          brand_id: brandId,
          type: o.type,
          description: o.description,
          deadline: o.deadline,
          metric: o.metric ?? null,
          target_value: o.target ?? null,
          priority: i + 1,
          proposed_by: 'copiloto',
          origin: 'confirmado',
        }))
        await db().from('objectives').insert(rows)
        return { saved: rows.length }
      },
    }),

    save_product_flags: tool({
      description: 'Marca productos como estrella, a impulsar o excluidos.',
      inputSchema: z.object({
        product_ids: z.array(z.string()).min(1),
        flag: z.enum(['star', 'push', 'excluded']),
      }),
      execute: async ({ product_ids, flag }) => {
        const col = flag === 'star' ? 'is_star' : flag === 'push' ? 'push' : 'excluded'
        await db().from('products').update({ [col]: true }).in('id', product_ids).eq('brand_id', brandId)
        return { updated: product_ids.length }
      },
    }),

    save_competitor: tool({
      description: 'Guarda un competidor que mencionó el dueño.',
      inputSchema: z.object({
        name: z.string(),
        url: z.string().optional(),
        instagram: z.string().optional(),
      }),
      execute: async ({ name, url, instagram }) => {
        await db().from('competitors').insert({
          brand_id: brandId,
          name,
          url: url ?? null,
          instagram: instagram?.replace(/^@/, '') ?? null,
          source: 'cliente',
          confirmed: true,
        })
        return { saved: name }
      },
    }),

    run_agent: tool({
      description:
        'Encola un agente. A1 = leer y consolidar las fuentes cargadas (web, archivos). A2 = visibilidad digital (solo con la Ficha aprobada). A3 = percepción a partir de reseñas. A4 = nichos (params.phase=nichos) o posicionamiento (params.phase=posicionamiento, params.nicho). A5 = calendario (requiere estrategia aprobada).',
      inputSchema: z.object({ agent: z.enum(['A1', 'A2', 'A3', 'A4', 'A5']), params: z.record(z.string(), z.string()).optional() }),
      execute: async ({ agent, params }) => {
        const res = await startAgent(brandId, agent, params ?? {})
        return res
      },
    }),

    request_approval: tool({
      description:
        'Muestra una tarjeta de aprobación con link a la pestaña. CP1 = Ficha (pestaña marca). CP2a = búsquedas de visibilidad (pestaña visibilidad).',
      inputSchema: z.object({ checkpoint: z.enum(['CP1', 'CP2a', 'CP2', 'CP3', 'CP4', 'CP5']) }),
      execute: async ({ checkpoint }) => {
        const map = {
          CP1: { tab: 'marca', label: 'Revisá y aprobá tu Ficha de marca', section: 'ficha' as const },
          CP2a: { tab: 'visibilidad', label: 'Revisá las búsquedas que vamos a medir', section: 'visibilidad' as const },
          CP2: { tab: 'visibilidad', label: 'Revisá y aprobá tu diagnóstico de visibilidad', section: 'visibilidad' as const },
          CP3: { tab: 'percepcion', label: 'Respondé las brechas y aprobá tu percepción', section: 'percepcion' as const },
          CP4: { tab: 'estrategia', label: 'Elegí tu nicho y aprobá el posicionamiento', section: 'estrategia' as const },
          CP5: { tab: 'calendario', label: 'Revisá y aprobá tu calendario', section: 'calendario' as const },
        }[checkpoint]
        if (checkpoint === 'CP1') {
          const row = await ensureDraft(brandId, 'ficha')
          if (row.status === 'draft') await db().from('dossier_sections').update({ status: 'pending_approval' }).eq('id', row.id)
        }
        return { checkpoint, tab: map.tab, label: map.label }
      },
    }),

    get_dossier: tool({
      description: 'Devuelve el Expediente actualizado y el checklist.',
      inputSchema: z.object({}),
      execute: async () => {
        const d = await getDossier(brandId)
        return { dossier: dossierSummary(d), checklist: computeChecklist(d) }
      },
    }),
  }
}

import { z } from 'zod'

export const FichaSchema = z.object({
  marca: z.object({
    nombre: z.string(),
    ciudad: z.string().optional(),
    rubro: z.string().optional(),
    historia: z.string().optional(),
    diferencial: z.string().optional(),
    canales_venta: z.array(z.string()).default([]),
  }),
  tamano: z
    .object({
      segmento: z.enum(['micro', 'pyme', 'grande']).optional(),
      empleados: z.number().optional(),
      sucursales: z.number().optional(),
      equipo_marketing: z.boolean().optional(),
    })
    .default({}),
  productos_resumen: z
    .object({
      total: z.number().default(0),
      categorias: z.array(z.string()).default([]),
      rango_precio: z.object({ min: z.number(), max: z.number() }).optional(),
    })
    .default({ total: 0, categorias: [] }),
  precios_en_publicaciones: z.enum(['siempre', 'nunca', 'solo_promos', 'solo_historias']).optional(),
  posicionamiento_precio: z.enum(['economico', 'medio', 'premium']).optional(),
  compite_por: z.string().optional(),
  beneficios_comunicables: z.array(z.string()).default([]),
  comunicacion: z
    .object({
      trato: z.enum(['vos', 'usted']).optional(),
      tono: z.array(z.string()).default([]),
      frases_si: z.array(z.string()).default([]),
      frases_no: z.array(z.string()).default([]),
      referencias: z.array(z.string()).default([]),
    })
    .default({ tono: [], frases_si: [], frases_no: [], referencias: [] }),
  publico: z
    .object({
      actual: z.string().optional(),
      deseado: z.string().optional(),
      preocupaciones_compra: z.array(z.string()).default([]),
    })
    .default({ preocupaciones_compra: [] }),
  identidad_visual: z
    .object({
      colores: z.array(z.object({ hex: z.string(), uso: z.string() })).default([]),
      tipografias: z.array(z.string()).default([]),
      logo_media_id: z.string().optional(),
      estilo: z.string().optional(),
    })
    .default({ colores: [], tipografias: [] }),
  capacidad: z
    .object({
      piezas_por_semana: z.number().optional(),
      formatos_posibles: z.array(z.string()).default([]),
    })
    .default({ formatos_posibles: [] }),
  restricciones: z.array(z.string()).default([]),
  missing_inputs: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
})

export type Ficha = z.infer<typeof FichaSchema>

export type Origin = 'confirmado' | 'inferido' | 'externo' | 'pendiente'

export type Segment = 'micro' | 'pyme' | 'grande'

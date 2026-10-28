import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import type { UIMessage } from 'ai'
import { db } from '@/lib/supabase/server'
import { getOverview } from '@/lib/overview'
import { BrandProvider } from '@/components/brand/brand-context'
import { ChatProvider } from '@/components/brand/chat-context'
import { Topbar } from '@/components/shell/topbar'
import { Sidebar, MobileNav } from '@/components/shell/sidebar'
import { SideCopilot } from '@/components/shell/side-copilot'
import { DemoTour } from '@/components/demo/demo-tour'
import { isDemoBrand } from '@/lib/demo/constants'

export const dynamic = 'force-dynamic'

export default async function BrandLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ brandId: string }>
}) {
  const { brandId } = await params
  const [overview, history] = await Promise.all([
    getOverview(brandId),
    db().from('messages').select('content').eq('brand_id', brandId).order('created_at', { ascending: true }).limit(200),
  ])
  if (!overview) notFound()
  const initialMessages = (history.data ?? []).map((r) => r.content as UIMessage).filter((m) => m?.parts)

  return (
    <BrandProvider brandId={brandId} initial={overview}>
      <ChatProvider initialMessages={initialMessages}>
        <div className="flex h-svh flex-col">
          <Topbar />
          <MobileNav />
          <div className="flex min-h-0 flex-1">
            <Sidebar />
            <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
            <SideCopilot />
          </div>
        </div>
        {isDemoBrand(brandId) && (
          <Suspense>
            <DemoTour />
          </Suspense>
        )}
      </ChatProvider>
    </BrandProvider>
  )
}

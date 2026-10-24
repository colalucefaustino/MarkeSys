import { notFound } from 'next/navigation'
import { TAB_KEYS, type TabKey } from '@/lib/tabs'
import { TabRouter } from '@/components/tabs/tab-router'

export default async function TabPage({ params }: { params: Promise<{ brandId: string; tab: string }> }) {
  const { tab } = await params
  if (!TAB_KEYS.includes(tab as TabKey)) notFound()
  return <TabRouter tab={tab as TabKey} />
}

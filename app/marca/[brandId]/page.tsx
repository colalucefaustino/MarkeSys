import { redirect } from 'next/navigation'

export default async function BrandIndex({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params
  redirect(`/marca/${brandId}/copiloto`)
}

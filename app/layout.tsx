import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Outfit } from 'next/font/google'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit' })

export const metadata: Metadata = {
  title: 'MarkeSys | Tu director de marketing con IA',
  description:
    'MarkeSys te dice hacia dónde llevar tu marca y cómo te encuentran hoy en IA, Google y redes.',
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#FFFBF5',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className={outfit.variable}>
      <body className="antialiased" suppressHydrationWarning>
        {children}
        <Toaster position="top-center" />
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}

'use client'

import { usePathname } from 'next/navigation'
import { PanelRightClose, PanelRightOpen, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { ChatView } from '@/components/copilot/chat-view'
import { cn } from '@/lib/utils'

export function SideCopilot() {
  const pathname = usePathname()
  const tab = pathname.split('/')[3] ?? 'copiloto'
  const [open, setOpen] = useState(true)
  if (tab === 'copiloto') return null

  return (
    <>
      <aside
        className={cn(
          'hidden shrink-0 flex-col border-l bg-background transition-[width] xl:flex',
          open ? 'w-[380px]' : 'w-12',
        )}
        aria-label="Marky"
      >
        <div className="flex h-12 items-center justify-between border-b bg-card px-3">
          {open && (
            <span className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="size-4 text-primary" /> Marky
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto size-8"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Cerrar Marky' : 'Abrir Marky'}
          >
            {open ? <PanelRightClose /> : <PanelRightOpen />}
          </Button>
        </div>
        {open && <ChatView placeholder="Preguntale o pedile algo…" />}
      </aside>

      <div className="xl:hidden">
        <Sheet>
          <SheetTrigger
            render={
              <Button className="fixed bottom-4 right-4 z-30 rounded-full shadow-lg" size="lg">
                <Sparkles /> Marky
              </Button>
            }
          />
          <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
            <SheetHeader className="border-b">
              <SheetTitle>Marky</SheetTitle>
              <SheetDescription className="sr-only">Chat con Marky</SheetDescription>
            </SheetHeader>
            <ChatView />
          </SheetContent>
        </Sheet>
      </div>
    </>
  )
}

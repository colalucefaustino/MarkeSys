import { cn } from '@/lib/utils'

export function Logo({ size = 'md', className }: { size?: 'md' | 'lg'; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/markesys-mark.png"
        alt=""
        aria-hidden="true"
        className={cn('w-auto object-contain', size === 'lg' ? 'h-10' : 'h-7')}
      />
      <span className={cn('font-bold tracking-tight', size === 'lg' ? 'text-2xl' : 'text-lg')}>
        <span className="text-foreground">Marke</span>
        <span className="text-[#E8681A]">Sys</span>
      </span>
    </div>
  )
}

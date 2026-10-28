'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowUp, AudioLines, Check, Loader2, Mic, Square, Volume2 } from 'lucide-react'
import type { UIMessage } from 'ai'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useCopilot, messageSpeechText } from '@/components/brand/chat-context'
import { useBrand } from '@/components/brand/brand-context'
import { UploadCard } from '@/components/copilot/upload-card'
import { ObjectivesCard } from '@/components/copilot/objectives-card'

function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i) => (
        <p key={i} className={cn(line.trim() === '' && 'h-2', i > 0 && 'mt-1')}>
          {line.split(/(\*\*[^*]+\*\*)/g).map((chunk, j) =>
            chunk.startsWith('**') && chunk.endsWith('**') ? (
              <strong key={j}>{chunk.slice(2, -2)}</strong>
            ) : (
              <span key={j}>{chunk}</span>
            ),
          )}
        </p>
      ))}
    </>
  )
}

function Chips({
  options,
  multi,
  disabled,
  onPick,
}: {
  options: string[]
  multi?: boolean
  disabled?: boolean
  onPick: (values: string[]) => void
}) {
  const [sel, setSel] = useState<string[]>([])
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {options.map((o) => {
        const on = sel.includes(o)
        return (
          <button
            key={o}
            type="button"
            disabled={disabled}
            onClick={() => {
              if (!multi) return onPick([o])
              setSel((s) => (s.includes(o) ? s.filter((x) => x !== o) : [...s, o]))
            }}
            className={cn(
              'rounded-full border bg-card px-3 py-1.5 text-sm transition-colors hover:bg-accent disabled:opacity-50',
              on && 'border-primary bg-accent text-accent-foreground',
            )}
          >
            {on && <Check className="mr-1 inline size-3.5" />}
            {o}
          </button>
        )
      })}
      {multi && (
        <Button size="sm" disabled={disabled || !sel.length} onClick={() => onPick(sel)}>
          Listo
        </Button>
      )}
    </div>
  )
}

function ToolPart({ part, isLast }: { part: any; isLast: boolean }) {
  const { answerTool, busy } = useCopilot()
  const { brandId } = useBrand()
  const name = String(part.type).replace('tool-', '')
  const answered = part.state === 'output-available'

  if (name === 'ask_choice') {
    const input = part.input ?? {}
    if (!input.question) return null
    if (answered) {
      const chosen = part.output?.choice as string[] | undefined
      return chosen?.length ? (
        <p className="mt-1 text-xs text-muted-foreground">Elegiste: {chosen.join(', ')}</p>
      ) : null
    }
    if (part.state !== 'input-available') return null
    return (
      <Chips
        options={input.options ?? []}
        multi={input.multi}
        disabled={busy}
        onPick={(values) => answerTool('ask_choice', part.toolCallId, { choice: values })}
      />
    )
  }

  if (name === 'request_upload') {
    const input = part.input ?? {}
    if (answered) {
      const out = part.output as { uploaded?: boolean; names?: string[]; skipped?: boolean }
      return (
        <p className="mt-1 text-xs text-muted-foreground">
          {out?.uploaded ? `Subiste: ${out.names?.join(', ')}` : 'Lo dejamos para después'}
        </p>
      )
    }
    if (part.state !== 'input-available' || !input.kind) return null
    return (
      <div className="mt-2">
        <UploadCard
          kind={input.kind}
          reason={input.reason ?? ''}
          onDone={(names) => answerTool('request_upload', part.toolCallId, { uploaded: true, names })}
          onSkip={() => answerTool('request_upload', part.toolCallId, { skipped: true })}
        />
      </div>
    )
  }

  if (name === 'propose_objectives') {
    const input = part.input ?? {}
    if (answered) return <p className="mt-1 text-xs text-muted-foreground">Objetivos confirmados</p>
    if (part.state !== 'input-available' || !Array.isArray(input.objectives)) return null
    return (
      <div className="mt-2">
        <ObjectivesCard
          objectives={input.objectives}
          onConfirm={(selected) => answerTool('propose_objectives', part.toolCallId, { selected })}
        />
      </div>
    )
  }

  if (name === 'request_approval' && answered) {
    const out = part.output as { tab?: string; label?: string } | undefined
    const tab = part.input?.tab ?? out?.tab
    if (!tab) return null
    return (
      <Button size="sm" variant="outline" className="mt-2" nativeButton={false} render={<Link href={`/marca/${brandId}/${tab}`} />}>
        Revisar y aprobar
      </Button>
    )
  }

  if (name === 'run_agent' && !answered && isLast) {
    return (
      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" /> Poniendo a trabajar al agente…
      </p>
    )
  }

  return null
}

/** Pregunta fija del Copiloto: botones que guardan la respuesta sin pasar por la IA. */
function ScriptedCard() {
  const { scriptedStep: step, answerScripted, answeringScripted, busy } = useCopilot()
  if (!step) return null
  return (
    <div className="flex flex-col items-start">
      <div className="max-w-[92%] rounded-2xl rounded-bl-md border bg-card px-3.5 py-2 text-sm leading-relaxed">
        <p>{step.question}</p>
        <p className="mt-1 text-xs text-muted-foreground">{step.why}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {step.options.map((o, i) => (
            <button
              key={o.label}
              type="button"
              disabled={answeringScripted || busy}
              onClick={() => void answerScripted(step, i)}
              className="rounded-full border bg-card px-3 py-1.5 text-sm transition-colors hover:bg-accent disabled:opacity-50"
            >
              {o.label}
            </button>
          ))}
          {answeringScripted && <Loader2 className="size-4 self-center animate-spin text-muted-foreground" aria-label="Guardando" />}
        </div>
      </div>
    </div>
  )
}

function Bubble({ m, isLast }: { m: UIMessage; isLast: boolean }) {
  const { listen, voice } = useCopilot()
  const isUser = m.role === 'user'
  const speech = isUser ? '' : messageSpeechText(m)

  if (isUser) {
    const text = (m.parts as any[]).filter((p) => p.type === 'text').map((p) => p.text).join('\n')
    if (!text) return null
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm text-primary-foreground">
          <RichText text={text} />
        </div>
      </div>
    )
  }

  const hasContent = (m.parts as any[]).some(
    (p) => (p.type === 'text' && p.text) || ['tool-ask_choice', 'tool-request_upload', 'tool-propose_objectives', 'tool-request_approval'].includes(p.type),
  )
  if (!hasContent) return null

  return (
    <div className="group flex flex-col items-start">
      <div className="max-w-[92%] rounded-2xl rounded-bl-md border bg-card px-3.5 py-2 text-sm leading-relaxed">
        {(m.parts as any[]).map((p, i) =>
          p.type === 'text' ? (
            p.text ? <RichText key={i} text={p.text} /> : null
          ) : String(p.type).startsWith('tool-') ? (
            <ToolPart key={i} part={p} isLast={isLast} />
          ) : null,
        )}
      </div>
      {speech && (
        <button
          type="button"
          onClick={() => (voice.speaking ? voice.stopSpeaking() : listen(speech))}
          className="mt-1 flex items-center gap-1 rounded px-1 text-xs text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Volume2 className="size-3.5" /> Escuchar
        </button>
      )}
    </div>
  )
}

export function ChatView({
  placeholder = 'Escribile al Copiloto…',
  disabled,
  className,
  emptyHint,
}: {
  placeholder?: string
  disabled?: boolean
  className?: string
  emptyHint?: string
}) {
  const { messages, busy, send, stop, voice, conversation, setConversation, scriptedStep } = useCopilot()
  const [input, setInput] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, busy, scriptedStep])

  function submit() {
    if (!input.trim() || busy || disabled) return
    send(input, 'texto')
    setInput('')
  }

  async function onMic() {
    if (voice.recording) return voice.stopRecording()
    voice.stopSpeaking()
    const r = await voice.record()
    if (!r?.text) return
    if (conversation) send(r.text, 'voz')
    else setInput((cur) => (cur ? `${cur} ${r.text}` : r.text))
  }

  async function toggleConversation() {
    if (conversation) return setConversation(false)
    setConversation(true)
    voice.stopSpeaking()
    const r = await voice.record()
    if (r?.text) send(r.text, 'voz')
    else setConversation(false)
  }

  const lastAssistantIdx = messages.map((m) => m.role).lastIndexOf('assistant')
  // Si la IA dejó una pregunta con botones sin responder, la pregunta fija espera.
  const pendingTool =
    lastAssistantIdx >= 0 &&
    (messages[lastAssistantIdx].parts as any[]).some(
      (p) => ['tool-ask_choice', 'tool-request_upload', 'tool-propose_objectives'].includes(p.type) && p.state === 'input-available',
    )
  const state = voice.recording ? 'Escuchando…' : voice.transcribing ? 'Transcribiendo…' : voice.speaking ? 'Hablando…' : busy ? 'Pensando…' : null

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <div className="flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          {messages.length === 0 && emptyHint && <p className="text-center text-sm text-muted-foreground">{emptyHint}</p>}
          {messages.map((m, i) => (
            <Bubble key={m.id} m={m} isLast={i === lastAssistantIdx} />
          ))}
          {!busy && !pendingTool && <ScriptedCard />}
          {busy && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Pensando…
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <div className="border-t bg-card px-3 py-3">
        <div className="mx-auto max-w-2xl">
          {(conversation || state) && (
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                {conversation && <AudioLines className="size-3.5 text-primary" />}
                {conversation ? `Modo conversación${state ? ` · ${state}` : ''}` : state}
              </span>
              {conversation && (
                <button type="button" className="underline-offset-2 hover:underline" onClick={() => setConversation(false)}>
                  Salir
                </button>
              )}
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              disabled={disabled}
              rows={1}
              placeholder={placeholder}
              aria-label="Mensaje al Copiloto"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  if (e.nativeEvent.isComposing || e.keyCode === 229) return
                  e.preventDefault()
                  submit()
                }
              }}
              className="field-sizing-content max-h-32 min-h-10 flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
            />
            <Button
              type="button"
              size="icon"
              variant={voice.recording ? 'destructive' : 'outline'}
              onClick={onMic}
              disabled={disabled || voice.transcribing}
              aria-label={voice.recording ? 'Detener grabación' : 'Hablar'}
              className="relative shrink-0"
            >
              {voice.recording && (
                <span
                  className="absolute inset-0 rounded-md bg-destructive/30"
                  style={{ transform: `scale(${1 + voice.level * 0.6})` }}
                />
              )}
              {voice.recording ? <Square className="relative" /> : voice.transcribing ? <Loader2 className="animate-spin" /> : <Mic />}
            </Button>
            <Button
              type="button"
              size="icon"
              variant={conversation ? 'default' : 'outline'}
              onClick={toggleConversation}
              disabled={disabled}
              aria-label={conversation ? 'Salir del modo conversación' : 'Modo conversación'}
              aria-pressed={conversation}
              className="shrink-0"
            >
              <AudioLines />
            </Button>
            {busy ? (
              <Button type="button" size="icon" onClick={stop} aria-label="Detener" className="shrink-0">
                <Square />
              </Button>
            ) : (
              <Button type="button" size="icon" onClick={submit} disabled={!input.trim() || disabled} aria-label="Enviar" className="shrink-0">
                <ArrowUp />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from 'ai'
import { toast } from 'sonner'
import { useVoice } from '@/lib/voice/use-voice'
import { useBrand } from '@/components/brand/brand-context'
import { answerFromTyped, type ScriptedAnswer, type ScriptedStep } from '@/lib/copilot/scripted-shared'

type InputMode = 'texto' | 'voz' | 'chip'

interface ChatCtx {
  messages: UIMessage[]
  status: 'submitted' | 'streaming' | 'ready' | 'error'
  busy: boolean
  send: (text: string, mode?: InputMode) => void
  answerTool: (tool: string, toolCallId: string, output: unknown, mode?: InputMode) => void
  stop: () => void
  voice: ReturnType<typeof useVoice>
  conversation: boolean
  setConversation: (v: boolean) => void
  listen: (text: string) => void
  /** Próxima pregunta fija (con botones, sin IA), o null. */
  scriptedStep: ScriptedStep | null
  answerScripted: (step: ScriptedStep, answer: ScriptedAnswer) => Promise<void>
  answerTyped: (text: string) => boolean
  answeringScripted: boolean
  scriptedHint: string | null
}

const Ctx = createContext<ChatCtx | null>(null)

export function messageSpeechText(m: UIMessage) {
  const bits: string[] = []
  for (const p of m.parts as any[]) {
    if (p.type === 'text' && p.text) bits.push(p.text)
    if (p.type === 'tool-ask_choice' && p.input?.question) bits.push(p.input.question)
  }
  return bits.join(' ').trim()
}

export function ChatProvider({ initialMessages, children }: { initialMessages: UIMessage[]; children: ReactNode }) {
  const { brandId, refresh, data } = useBrand()
  const router = useRouter()
  const pathname = usePathname()
  const tab = pathname.split('/')[3] ?? 'copiloto'

  const tabRef = useRef(tab)
  tabRef.current = tab
  const modeRef = useRef<InputMode>('texto')
  const [conversation, setConversationState] = useState(false)
  const conversationRef = useRef(false)
  const voice = useVoice(brandId)

  const chat = useChat({
    id: brandId,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: () => ({ brandId, tab: tabRef.current, inputMode: modeRef.current }),
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onToolCall: ({ toolCall }) => {
      if (toolCall.dynamic) return
      if (toolCall.toolName === 'open_tab') {
        const t = (toolCall.input as { tab: string }).tab
        router.push(`/marca/${brandId}/${t}`)
        chat.addToolOutput({ tool: 'open_tab', toolCallId: toolCall.toolCallId, output: { ok: true } })
      }
    },
    onFinish: () => {
      void refresh()
    },
    onError: () => toast.error('Marky no pudo responder. Probá de nuevo en un momento.'),
  })

  const send = useCallback(
    (text: string, mode: InputMode = 'texto') => {
      const t = text.trim()
      if (!t) return
      modeRef.current = mode
      void chat.sendMessage({ text: t })
    },
    [chat],
  )

  const answerTool = useCallback(
    (tool: string, toolCallId: string, output: unknown, mode: InputMode = 'chip') => {
      modeRef.current = mode
      chat.addToolOutput({ tool, toolCallId, output } as any)
    },
    [chat],
  )

  const setConversation = useCallback(
    (v: boolean) => {
      conversationRef.current = v
      setConversationState(v)
      if (!v) {
        voice.stopSpeaking()
        voice.stopRecording()
      }
    },
    [voice],
  )

  // Preguntas fijas: se guardan sin IA. Mientras se guarda la respuesta y se actualiza
  // la lista, la tarjeta no se muestra (si no, la misma pregunta parpadea un instante).
  const [dismissed, setDismissed] = useState<string[]>([])
  const [answeredIds, setAnsweredIds] = useState<string[]>([])
  const [answeringScripted, setAnsweringScripted] = useState(false)
  const [scriptedHint, setScriptedHint] = useState<string | null>(null)
  const scriptedStep = answeringScripted
    ? null
    : ((data.scripted ?? []).find((st) => !dismissed.includes(st.id) && !answeredIds.includes(st.id)) ?? null)

  const answerScripted = useCallback(
    async (step: ScriptedStep, answer: ScriptedAnswer) => {
      setScriptedHint(null)
      if (step.handoff) {
        setDismissed((d) => [...d, step.id])
        send(step.handoff.send, 'chip')
        return
      }
      const now = Date.now()
      const ids: [string, string] = [`fija-${step.id}-q-${now}`, `fija-${step.id}-a-${now}`]
      const label =
        answer.action === 'confirm'
          ? 'Sí, es así'
          : answer.action === 'skip'
            ? (step.skipLabel ?? 'Saltear')
            : [...(answer.values ?? []), ...(answer.text?.trim() ? [answer.text.trim()] : [])].join(', ')
      const optimistic: UIMessage[] = [
        { id: ids[0], role: 'assistant', parts: [{ type: 'text', text: `${step.question}\n${step.why}` }] },
        { id: ids[1], role: 'user', parts: [{ type: 'text', text: label }] },
      ]
      setAnsweringScripted(true)
      chat.setMessages((prev) => [...prev, ...optimistic])
      try {
        const res = await fetch('/api/copilot/answer', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ brandId, stepId: step.id, ...answer, messageIds: ids }),
        })
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'No pude guardar tu respuesta.')
        setAnsweredIds((a) => [...a, step.id])
        await refresh()
      } catch (e) {
        chat.setMessages((prev) => prev.filter((m) => !ids.includes(m.id)))
        toast.error(e instanceof Error ? e.message : 'No pude guardar tu respuesta. Probá de nuevo.')
      } finally {
        setAnsweringScripted(false)
      }
    },
    [brandId, chat, refresh, send],
  )

  /** Si hay una pregunta fija abierta, lo que el dueño escribe la responde. Devuelve true si lo tomó. */
  const answerTyped = useCallback(
    (text: string) => {
      const step = scriptedStep
      if (!step || step.handoff) return false
      const a = answerFromTyped(step, text)
      if (!a) {
        setScriptedHint('Para esta pregunta tocá una de las opciones.')
        return true
      }
      void answerScripted(step, a)
      return true
    },
    [scriptedStep, answerScripted],
  )

  const listen = useCallback(
    (text: string) => {
      void voice.speak(text)
    },
    [voice],
  )

  const messagesRef = useRef(chat.messages)
  messagesRef.current = chat.messages

  const converse = useCallback(async () => {
    const last = [...messagesRef.current].reverse().find((m) => m.role === 'assistant')
    const text = last ? messageSpeechText(last) : ''
    if (text) await voice.speak(text)
    if (!conversationRef.current) return
    const result = await voice.record()
    if (!conversationRef.current) return
    if (result?.text) send(result.text, 'voz')
    else setConversation(false)
  }, [voice, send, setConversation])

  const prevStatus = useRef(chat.status)
  useEffect(() => {
    if (prevStatus.current !== 'ready' && chat.status === 'ready' && conversationRef.current) void converse()
    prevStatus.current = chat.status
  }, [chat.status, converse])

  useEffect(() => {
    if (tab && conversationRef.current) setConversation(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  return (
    <Ctx.Provider
      value={{
        messages: chat.messages,
        status: chat.status,
        busy: chat.status === 'submitted' || chat.status === 'streaming',
        send,
        answerTool,
        stop: chat.stop,
        voice,
        conversation,
        setConversation,
        listen,
        scriptedStep,
        answerScripted,
        answerTyped,
        answeringScripted,
        scriptedHint,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useCopilot() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useCopilot fuera de ChatProvider')
  return ctx
}

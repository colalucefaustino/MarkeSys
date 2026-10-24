'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from 'ai'
import { toast } from 'sonner'
import { useVoice } from '@/lib/voice/use-voice'
import { useBrand } from '@/components/brand/brand-context'

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
  const { brandId, refresh } = useBrand()
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
    onError: () => toast.error('El Copiloto no pudo responder. Probá de nuevo en un momento.'),
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

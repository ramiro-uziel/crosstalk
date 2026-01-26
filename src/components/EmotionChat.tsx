import { useState, useEffect, useRef } from 'react'
import { Send, X, Sparkles } from 'lucide-react'
import type { ChatMessage } from '../types/chat'

interface EmotionChatProps {
  emotion: string
  emotionColor: string
  isOpen: boolean
  onClose: () => void
}

export function EmotionChat({ emotion, emotionColor, isOpen, onClose }: EmotionChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const emotionTitle = emotion.charAt(0).toUpperCase() + emotion.slice(1)

  useEffect(() => {
    if (isOpen) {
      loadMessages()
    }
  }, [isOpen, emotion])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const loadMessages = async () => {
    try {
      const response = await fetch(`/api/chat/emotion?emotion=${encodeURIComponent(emotion)}`)
      const data = await response.json()
      setMessages(data.messages || [])
    } catch (error) {
      console.error('Failed to load messages:', error)
    }
  }

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return

    const userMessage = input.trim()
    setInput('')
    setIsLoading(true)

    setMessages(prev => [
      ...prev,
      {
        id: Date.now(),
        role: 'user',
        content: userMessage,
        timestamp: new Date().toISOString(),
        emotion,
      },
    ])

    try {
      const response = await fetch('/api/chat/emotion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, emotion }),
      })

      const data = await response.json()

      setMessages(prev => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'assistant',
          content: data.response,
          timestamp: new Date().toISOString(),
          emotion,
        },
      ])
    } catch (error) {
      console.error('Failed to send message:', error)
      setMessages(prev => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'assistant',
          content: 'Sorry, I encountered an error processing your message.',
          timestamp: new Date().toISOString(),
          emotion,
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed left-4 bottom-4 w-[380px] h-[500px] bg-black border rounded-lg flex flex-col z-[1100]"
      style={{ borderColor: `${emotionColor}50` }}
      onClick={e => {
        e.stopPropagation()
        e.nativeEvent.stopImmediatePropagation()
      }}
    >
      <div
        className="p-4 border-b flex items-center justify-between"
        style={{ borderColor: `${emotionColor}30` }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{
              background: emotionColor,
              boxShadow: `0 0 10px ${emotionColor}`,
            }}
          />
          <h2
            className="text-lg font-semibold"
            style={{ color: emotionColor }}
          >
            {emotionTitle}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 mt-8">
            <Sparkles
              className="w-12 h-12 mx-auto mb-4"
              style={{ color: `${emotionColor}40` }}
            />
            <p>Chat with {emotionTitle}</p>
            <p className="text-sm mt-2">Discuss music that embodies this emotion</p>
          </div>
        )}

        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-3 ${
                msg.role === 'user'
                  ? 'text-white'
                  : 'bg-white/5 text-gray-200 border border-white/10'
              }`}
              style={
                msg.role === 'user'
                  ? {
                      background: `${emotionColor}30`,
                      border: `1px solid ${emotionColor}50`,
                    }
                  : undefined
              }
            >
              <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white/5 border border-white/10 rounded-lg p-3">
              <div className="flex gap-1">
                <div
                  className="w-2 h-2 rounded-full animate-pulse"
                  style={{ background: emotionColor }}
                />
                <div
                  className="w-2 h-2 rounded-full animate-pulse"
                  style={{ background: emotionColor, animationDelay: '75ms' }}
                />
                <div
                  className="w-2 h-2 rounded-full animate-pulse"
                  style={{ background: emotionColor, animationDelay: '150ms' }}
                />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div
        className="p-4 border-t"
        style={{ borderColor: `${emotionColor}30` }}
      >
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={`Ask ${emotionTitle}...`}
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-500 resize-none focus:outline-none"
            style={{ borderColor: input ? `${emotionColor}50` : undefined }}
            rows={2}
            disabled={isLoading}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className="px-4 text-white rounded-lg transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: emotionColor,
              opacity: !input.trim() || isLoading ? 0.5 : 1,
            }}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

import { useState, useEffect, useRef } from 'react'
import { Send, X, Sparkles } from 'lucide-react'
import type { ChatMessage } from '../types/chat'

interface NucleusChatProps {
  nucleusName: string
  isOpen: boolean
  onClose: () => void
}

export function NucleusChat({ nucleusName, isOpen, onClose }: NucleusChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      loadMessages()
    }
  }, [isOpen])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const loadMessages = async () => {
    try {
      const response = await fetch('/api/chat')
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
        nucleus_name: nucleusName,
      },
    ])

    try {
      const response = await fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage }),
      })

      const data = await response.json()

      setMessages(prev => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'assistant',
          content: data.response,
          timestamp: new Date().toISOString(),
          nucleus_name: nucleusName,
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
          nucleus_name: nucleusName,
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
    <div className="fixed right-0 top-0 w-[400px] h-screen bg-black border-l border-white/10 flex flex-col z-50">
      <div className="p-4 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-cyan-400" />
          <h2 className="text-lg font-semibold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
            {nucleusName}
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
            <Sparkles className="w-12 h-12 mx-auto mb-4 text-cyan-400/30" />
            <p>Ask me about your music collection</p>
            <p className="text-sm mt-2">or request recommendations</p>
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
                  ? 'bg-cyan-500/20 text-cyan-100 border border-cyan-500/30'
                  : 'bg-white/5 text-gray-200 border border-white/10'
              }`}
            >
              <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white/5 border border-white/10 rounded-lg p-3">
              <div className="flex gap-1">
                <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse delay-75" />
                <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse delay-150" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-white/10">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask the Nucleus..."
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-500 resize-none focus:outline-none focus:border-cyan-500/50"
            rows={2}
            disabled={isLoading}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className="px-4 bg-cyan-500 hover:bg-cyan-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

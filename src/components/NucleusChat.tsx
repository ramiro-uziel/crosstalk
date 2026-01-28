import { useState, useEffect, useRef, forwardRef } from 'react'
import { Send, X, RotateCcw } from 'lucide-react'
import type { ChatMessage } from '../types/chat'

interface NucleusChatProps {
  nucleusName: string
  isOpen: boolean
  onClose: () => void
  sidebarCollapsed?: boolean
}

export const NucleusChat = forwardRef<HTMLDivElement, NucleusChatProps>(function NucleusChat({ nucleusName, isOpen, onClose, sidebarCollapsed }, ref) {
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
          content: 'something went wrong on my end. try again.',
          timestamp: new Date().toISOString(),
          nucleus_name: nucleusName,
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const resetConversation = async () => {
    try {
      await fetch('/api/chat', { method: 'DELETE' })
      setMessages([])
    } catch (error) {
      console.error('Failed to reset conversation:', error)
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
    <div ref={ref} className="nucleus-chat-popup" style={sidebarCollapsed ? { right: '40px' } : undefined}>
      {/* Scanline overlay */}
      <div className="nucleus-chat-scanlines" />

      {/* Header */}
      <div className="nucleus-chat-header">
        <div className="nucleus-chat-header-left">
          <div className="nucleus-chat-icon" />
          <h2 className="nucleus-chat-title">{nucleusName}</h2>
        </div>
        <div className="nucleus-chat-header-right">
          <button onClick={resetConversation} className="nucleus-chat-reset-btn" title="Reset conversation">
            <RotateCcw className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="nucleus-chat-close-btn">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="nucleus-chat-divider" />

      {/* Messages */}
      <div className="nucleus-chat-messages">
        {messages.length === 0 && (
          <div className="nucleus-chat-empty">
            <p>Type a question about this nucleus...</p>
          </div>
        )}

        {messages.map(msg => (
          <div
            key={msg.id}
            className={`nucleus-chat-msg ${msg.role === 'user' ? 'nucleus-chat-msg-user' : 'nucleus-chat-msg-assistant'}`}
          >
            <p className="nucleus-chat-msg-text">{msg.content}</p>
          </div>
        ))}

        {isLoading && (
          <div className="nucleus-chat-msg nucleus-chat-msg-assistant">
            <div className="nucleus-chat-loading">
              <div className="nucleus-chat-dot" />
              <div className="nucleus-chat-dot" />
              <div className="nucleus-chat-dot" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="nucleus-chat-input-area">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Ask the Nucleus..."
          className="nucleus-chat-input"
          rows={2}
          disabled={isLoading}
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || isLoading}
          className="nucleus-chat-send"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
})

import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Music } from 'lucide-react'
import { authClient } from '../lib/auth-client'

export const Route = createFileRoute('/login')({ component: LoginPage })

function LoginPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSpotifyLogin = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const { error: authError } = await authClient.signInWithSpotify()

      if (authError) {
        setError(authError.message)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to login')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-purple-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-cyan-500 to-purple-500 rounded-full mb-4">
            <Music className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent mb-2">
            Welcome to Crosstalk
          </h1>
          <p className="text-gray-400">
            Create your musical nucleus from your Spotify favorites
          </p>
        </div>

        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8">
          <div className="space-y-4">
            <div className="text-sm text-gray-300 space-y-2">
              <p className="flex items-start gap-2">
                <span className="text-cyan-400">•</span>
                <span>Connect your Spotify account</span>
              </p>
              <p className="flex items-start gap-2">
                <span className="text-cyan-400">•</span>
                <span>We'll analyze your top 15 most played tracks</span>
              </p>
              <p className="flex items-start gap-2">
                <span className="text-cyan-400">•</span>
                <span>Watch them orbit in your emotional galaxy</span>
              </p>
            </div>

            <button
              onClick={handleSpotifyLogin}
              disabled={isLoading}
              className="w-full bg-[#1DB954] hover:bg-[#1ed760] disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-3"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                  </svg>
                  Continue with Spotify
                </>
              )}
            </button>

            {error && (
              <div className="text-red-400 text-sm text-center p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                {error}
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-gray-500 text-sm mt-6">
          We only access your public profile and listening history
        </p>
      </div>
    </div>
  )
}

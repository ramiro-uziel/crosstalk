import { createFileRoute } from '@tanstack/react-router'
import { supabase } from '../../../lib/supabase'

export const Route = createFileRoute('/api/auth/callback')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const code = url.searchParams.get('code')

        if (code) {
          await supabase.auth.exchangeCodeForSession(code)
        }

        // Redirect to home page after authentication
        return new Response(null, {
          status: 302,
          headers: {
            Location: '/',
          },
        })
      },
    },
  },
})

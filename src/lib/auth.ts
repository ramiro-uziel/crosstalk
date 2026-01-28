import { supabase } from './supabase'

// Authentication helper functions using Supabase Auth
export const auth = {
  // Sign in with Spotify
  signInWithSpotify: async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'spotify',
      options: {
        scopes: 'user-read-email user-read-private user-top-read playlist-read-private',
        redirectTo: `${window.location.origin}/api/auth/callback`,
      },
    })
    return { data, error }
  },

  // Get current session
  getSession: async () => {
    const { data, error } = await supabase.auth.getSession()
    return { session: data.session, error }
  },

  // Get current user
  getUser: async () => {
    const { data, error } = await supabase.auth.getUser()
    return { user: data.user, error }
  },

  // Sign out
  signOut: async () => {
    const { error } = await supabase.auth.signOut()
    return { error }
  },

  // Listen to auth changes
  onAuthStateChange: (callback: (event: string, session: any) => void) => {
    return supabase.auth.onAuthStateChange(callback)
  },
}

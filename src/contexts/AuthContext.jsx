import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id, session.user.email)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id, session.user.email)
      else { setProfile(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId, email) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (data) {
      setProfile(data)
    } else {
      // No profile yet — create a minimal one on first login
      const name = email ? email.split('@')[0] : 'User'
      const { data: newProfile } = await supabase
        .from('profiles')
        .upsert({
          id: userId,
          email: email || '',
          full_name: name,
          role: 'athlete',
        }, { onConflict: 'id' })
        .select()
        .single()
      setProfile(newProfile)
    }
    setLoading(false)
  }

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  const isCEO = profile?.role === 'ceo'
  const isManagement = profile?.role === 'management' || isCEO
  const canSeeFinancials = isCEO

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signOut, isCEO, isManagement, canSeeFinancials }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

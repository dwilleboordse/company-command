import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getProfileAccess, withVerifiedProfileAccess } from '../lib/roleAccess'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const profileRequest = useRef(0)
  const profileUserId = useRef(null)

  async function fetchProfile(userId, email) {
    const request = ++profileRequest.current
    if (profileUserId.current !== userId) {
      profileUserId.current = userId
      setProfile(null)
      setLoading(true)
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (request !== profileRequest.current) return

    if (data?.is_active === false) {
      setProfile(null)
      setLoading(false)
      await supabase.auth.signOut()
      return
    }

    if (data) {
      const verified = await withVerifiedProfileAccess(data, supabase)
      if (request !== profileRequest.current) return
      setProfile(verified)
    } else if (error?.code === 'PGRST116') {
      // No profile yet — create a minimal one on first login
      const name = email ? email.split('@')[0] : 'User'
      const { data: newProfile } = await supabase
        .from('profiles')
        .upsert({
          id: userId,
          email: email || '',
          full_name: name,
          role: 'athlete',
          is_active: true,
        }, { onConflict: 'id' })
        .select()
        .single()
      const verified = await withVerifiedProfileAccess(newProfile, supabase)
      if (request !== profileRequest.current) return
      setProfile(verified)
    } else {
      setProfile(null)
    }
    setLoading(false)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id, session.user.email)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id, session.user.email)
      else { profileRequest.current += 1; profileUserId.current = null; setProfile(null); setLoading(false) }
    })

    return () => { profileRequest.current += 1; subscription.unsubscribe() }
  }, [])

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  const access = getProfileAccess(profile)

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signOut, ...access }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

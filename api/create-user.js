// api/create-user.js
// Vercel serverless function — runs server-side only
// Service role key is never exposed to the browser

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.VITE_SUPABASE_URL

  if (!serviceKey || !supabaseUrl) {
    return res.status(500).json({ error: 'Server misconfigured. Add SUPABASE_SERVICE_ROLE_KEY to Vercel environment variables.' })
  }

  const { email, password, full_name, role, position, department } = req.body

  if (!email || !password || !full_name) {
    return res.status(400).json({ error: 'email, password, and full_name are required.' })
  }

  try {
    // Create user via Supabase Admin API (server-side only)
    const createRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true, // auto-confirm, no email needed
        user_metadata: { full_name, role: role || 'athlete' },
      }),
    })

    const userData = await createRes.json()

    if (!createRes.ok) {
      return res.status(400).json({ error: userData.message || userData.msg || 'Failed to create auth user.' })
    }

    const userId = userData.id

    // Small delay to let the trigger create the profile row
    await new Promise(r => setTimeout(r, 800))

    // Update profile with position, department, correct role
    const profileRes = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        full_name,
        role: role || 'athlete',
        position: position || null,
        department: department || null,
        updated_at: new Date().toISOString(),
      }),
    })

    if (!profileRes.ok) {
      // User was created, profile update failed — not fatal
      console.error('Profile update failed for user', userId)
    }

    return res.status(200).json({ success: true, userId })

  } catch (err) {
    console.error('create-user error:', err)
    return res.status(500).json({ error: 'Internal server error.' })
  }
}

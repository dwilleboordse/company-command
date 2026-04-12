export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.VITE_SUPABASE_URL

  if (!serviceKey || !supabaseUrl) {
    return res.status(500).json({ error: 'Missing SUPABASE_SERVICE_ROLE_KEY in Vercel environment variables.' })
  }

  const { email, password, full_name, role, position, department } = req.body
  if (!email || !password || !full_name) {
    return res.status(400).json({ error: 'Email, password, and full name are required.' })
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${serviceKey}`,
    'apikey': serviceKey,
  }

  // Step 1: Create auth user
  const authRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    }),
  })

  const authData = await authRes.json()
  if (!authRes.ok) {
    return res.status(400).json({ error: authData.message || authData.msg || JSON.stringify(authData) })
  }

  const userId = authData.id

  // Step 2: Insert profile directly — no trigger needed
  const profileRes = await fetch(`${supabaseUrl}/rest/v1/profiles`, {
    method: 'POST',
    headers: { ...headers, 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify({
      id: userId,
      email,
      full_name,
      role: role || 'athlete',
      position: position || null,
      department: department || null,
    }),
  })

  if (!profileRes.ok) {
    const profileErr = await profileRes.text()
    console.error('Profile insert failed:', profileErr)
    // Auth user was created — still return success, profile can be set via Admin edit
    return res.status(200).json({ success: true, userId, warning: 'Profile row not created — set manually in Admin.' })
  }

  return res.status(200).json({ success: true, userId })
}

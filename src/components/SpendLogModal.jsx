import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { weekLabel } from '../lib/dates'
import { buildSpendPayload, formatSpendMoney, spendFormValues, SPEND_PLATFORMS } from '../lib/spendAnalytics'
import './spend.css'

export default function SpendLogModal({ client, existing, weekStart, onClose, onSave }) {
  const { profile } = useAuth()
  const [form, setForm] = useState(() => spendFormValues(existing || {}))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))
  let preview = null
  try { preview = buildSpendPayload(form, { clientId: client.id, weekStart, enteredBy: profile?.id, existing }) } catch { /* Validation appears on save. */ }

  async function save(event) {
    event.preventDefault()
    if (saving) return
    setError('')
    setSaving(true)
    try {
      const payload = buildSpendPayload(form, { clientId: client.id, weekStart, enteredBy: profile?.id, existing })
      const { data, error: saveError } = await supabase.from('spend_entries')
        .upsert(payload, { onConflict: 'client_id,week_start' }).select('id').single()
      if (saveError) throw saveError
      if (!data?.id) throw new Error('No entry was saved. Your account may not have permission.')
      await onSave?.()
      onClose()
    } catch (saveError) {
      setError(saveError.message || 'Spend could not be saved. Please try again.')
    } finally { setSaving(false) }
  }

  return <div className="modal-overlay" onClick={() => !saving && onClose()}>
    <div className="modal spend-log-modal" role="dialog" aria-modal="true" aria-labelledby="spend-log-title" onClick={e => e.stopPropagation()}>
      <h2 id="spend-log-title" className="modal-title">{existing?.id ? 'Edit spend' : 'Log spend'} · {client.name}</h2>
      <p className="spend-note">Week of {weekLabel(weekStart)} · amounts in USD</p>
      <form onSubmit={save}>
        <label className="form-group spend-field">Entry method
          <select value={form.mode} onChange={e => set('mode', e.target.value)}>
            <option value="totals">Totals only</option><option value="platforms">By platform</option>
          </select>
        </label>
        {form.mode === 'totals' ? <>
          <div className="spend-input-grid">
            <label className="spend-field">Total client spend ($)<input autoFocus type="number" min="0" step="0.01" required value={form.total_spend} onChange={e => set('total_spend', e.target.value)} /></label>
            <label className="spend-field">Spend on DDU creatives ($)<input type="number" min="0" step="0.01" required value={form.ddu_spend} onChange={e => set('ddu_spend', e.target.value)} /></label>
          </div>
          <p className="spend-note">DDU spend is part of the total, not additional spend. Enter 0 explicitly when there was no spend.</p>
          {existing?.id && <p className="spend-note">Changing totals replaces any old platform breakdown. Notes-only edits preserve it.</p>}
        </> : <>
          <div className="spend-input-grid">{SPEND_PLATFORMS.map(platform => <fieldset key={platform.key} className="spend-platform-field">
            <legend>{platform.label}</legend>
            <label className="spend-field">{platform.label === 'Other' ? 'DDU spend ($)' : 'Total spend ($)'}<input aria-label={`${platform.label} total spend`} type="number" min="0" step="0.01" value={form[platform.totalKey]} onChange={e => set(platform.totalKey, e.target.value)} /></label>
            {platform.key !== platform.totalKey && <label className="spend-field">DDU spend ($)<input aria-label={`${platform.label} DDU spend`} type="number" min="0" step="0.01" value={form[platform.key]} onChange={e => set(platform.key, e.target.value)} /></label>}
          </fieldset>)}</div>
          <p className="spend-note">Other retains the existing tracker rule: its amount counts in both DDU and total spend. Use Totals only if other-channel total spend differs.</p>
        </>}
        {preview && <div className="spend-log-preview"><span>Total: <strong>{formatSpendMoney(preview.total_spend)}</strong></span><span>DDU: <strong>{formatSpendMoney(preview.ddu_spend)}</strong></span><span>DDU share: <strong>{preview.total_spend > 0 ? `${(preview.ddu_spend / preview.total_spend * 100).toFixed(1)}%` : 'N/A · no spend'}</strong></span></div>}
        <label className="form-group spend-field">Notes<textarea value={form.notes} rows={3} onChange={e => set('notes', e.target.value)} placeholder="Context, changes, or follow-up needed…" /></label>
        {error && <p role="alert" className="spend-error">{error}</p>}
        <div className="flex gap-2"><button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : existing?.id ? 'Update entry' : 'Log spend'}</button><button type="button" className="btn btn-ghost" disabled={saving} onClick={onClose}>Cancel</button></div>
      </form>
    </div>
  </div>
}

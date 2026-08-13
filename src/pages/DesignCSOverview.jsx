import { useEffect, useMemo, useState } from 'react'
import { Activity, AlertTriangle, BriefcaseBusiness, ChevronRight, Copy, LayoutDashboard, Network, Pencil, Plus, Trash2, Users, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { loadDesignCsData, persistVirtualPeople } from '../lib/designCsData'
import { buildWorkloads, formatMonth, initials, nextMonthStart, parseIds, roleLabel, statusMeta } from '../lib/workforcePlanning'
import './WorkforcePlanning.css'

const EMPTY_FORM = {
  client_id: '',
  strategist_key: '',
  statics: 0,
  videos: 0,
  designer_keys: [],
  editor_keys: [],
  ugc_manager_keys: [],
}

function CapacityBar({ utilization, status }) {
  const width = Math.min(Math.max(utilization, 0), 100)
  return (
    <div className="capacity-track" aria-label={`${utilization}% utilized`}>
      <div className={`capacity-fill ${status}`} style={{ width: `${width}%` }}/>
    </div>
  )
}

function WorkloadCard({ person, type }) {
  const meta = statusMeta(person.status)
  return (
    <article className="workload-card">
      <div className="workload-card-top">
        <div className="planning-avatar">{initials(person.display_name)}</div>
        <div className="workload-person">
          <strong>{person.display_name}</strong>
          <span>{type === 'creative_strategist' ? `${person.clients} clients · ${person.concepts} concepts` : person.capacityLabel}</span>
        </div>
        <span className={`badge ${meta.tone}`}>{meta.label}</span>
      </div>
      <div className="workload-utilization">
        <CapacityBar utilization={person.utilization} status={person.status}/>
        <strong>{person.utilization}%</strong>
      </div>
      {type === 'creative_strategist' && (
        <div className="workload-split">
          <span>{person.statics} static concepts</span>
          <span>{person.videos} video concepts</span>
        </div>
      )}
      <div className="client-chip-list compact">
        {person.assignments.slice(0, 5).map(item => <span key={item.id}>{item.client_name_snapshot}</span>)}
        {person.assignments.length > 5 && <span>+{person.assignments.length - 5} more</span>}
      </div>
    </article>
  )
}

function WorkloadSection({ title, subtitle, people, type }) {
  const sorted = [...people].sort((a, b) => b.utilization - a.utilization || a.display_name.localeCompare(b.display_name))
  return (
    <section className="planning-section">
      <div className="planning-section-heading">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <span>{people.length} people</span>
      </div>
      <div className="workload-grid">
        {sorted.map(person => <WorkloadCard key={person.source_key} person={person} type={type}/>) }
        {!sorted.length && <div className="empty-state"><p>No active people are mapped to this role.</p></div>}
      </div>
    </section>
  )
}

function MultiChecks({ label, options, value, onChange }) {
  return (
    <fieldset className="planning-checks">
      <legend>{label}</legend>
      <div>
        {options.map(person => {
          const checked = value.includes(person.source_key)
          return (
            <label key={person.source_key}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onChange(checked ? value.filter(key => key !== person.source_key) : [...value, person.source_key])}
              />
              <span>{person.display_name}</span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

function AllocationModal({ allocation, monthStart, clients, people, userId, onClose, onSaved }) {
  const [form, setForm] = useState(allocation ? {
    client_id: allocation.client_id || '',
    strategist_key: allocation.strategist_key || '',
    statics: allocation.statics || 0,
    videos: allocation.videos || 0,
    designer_keys: allocation.designer_keys || [],
    editor_keys: allocation.editor_keys || [],
    ugc_manager_keys: allocation.ugc_manager_keys || [],
  } : EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const optionsFor = role => people.filter(person => person.discipline === role && person.is_active !== false)

  async function save(event) {
    event.preventDefault()
    const client = clients.find(item => item.id === form.client_id)
    if (!client || !form.strategist_key) return
    setSaving(true)
    setError('')
    try {
      const selectedKeys = [form.strategist_key, ...form.designer_keys, ...form.editor_keys, ...form.ugc_manager_keys]
      await persistVirtualPeople(people.filter(person => selectedKeys.includes(person.source_key)))
      const payload = {
        month_start: monthStart,
        source_key: allocation?.source_key || `cc:${client.id}`,
        client_id: client.id,
        client_name_snapshot: allocation?.client_name_snapshot || client.name,
        strategist_key: form.strategist_key,
        statics: Number(form.statics || 0),
        videos: Number(form.videos || 0),
        designer_keys: form.designer_keys,
        editor_keys: form.editor_keys,
        ugc_manager_keys: form.ugc_manager_keys,
        ugc_enabled: form.ugc_manager_keys.length > 0,
        updated_by: userId,
      }
      const query = allocation
        ? supabase.from('design_cs_allocations').update(payload).eq('id', allocation.id)
        : supabase.from('design_cs_allocations').insert(payload)
      const { error: saveError } = await query
      if (saveError) throw saveError
      await onSaved()
      onClose()
    } catch (saveError) {
      setError(saveError.message || 'Unable to save this allocation.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <form className="modal planning-modal" role="dialog" aria-modal="true" aria-labelledby="allocation-title" onSubmit={save}>
        <div className="planning-modal-header">
          <div>
            <h2 id="allocation-title" className="modal-title">{allocation ? 'Edit workload' : 'Add client workload'}</h2>
            <p>{formatMonth(monthStart)}</p>
          </div>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close"><X size={16}/></button>
        </div>

        <label className="field-label">Client</label>
        <select value={form.client_id} onChange={event => setForm(current => ({ ...current, client_id: event.target.value }))} required disabled={Boolean(allocation?.client_id)}>
          <option value="">Select an active client…</option>
          {clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
        </select>

        <label className="field-label">Creative strategist</label>
        <select value={form.strategist_key} onChange={event => setForm(current => ({ ...current, strategist_key: event.target.value }))} required>
          <option value="">Select strategist…</option>
          {optionsFor('creative_strategist').map(person => <option key={person.source_key} value={person.source_key}>{person.display_name}</option>)}
        </select>

        <div className="planning-form-grid">
          <label><span>Static concepts</span><input type="number" min="0" value={form.statics} onChange={event => setForm(current => ({ ...current, statics: event.target.value }))}/></label>
          <label><span>Video concepts</span><input type="number" min="0" value={form.videos} onChange={event => setForm(current => ({ ...current, videos: event.target.value }))}/></label>
        </div>

        <MultiChecks label="Designers" options={optionsFor('designer')} value={form.designer_keys} onChange={designer_keys => setForm(current => ({ ...current, designer_keys }))}/>
        <MultiChecks label="Editors" options={optionsFor('editor')} value={form.editor_keys} onChange={editor_keys => setForm(current => ({ ...current, editor_keys }))}/>
        <MultiChecks label="UGC managers" options={optionsFor('ugc_manager')} value={form.ugc_manager_keys} onChange={ugc_manager_keys => setForm(current => ({ ...current, ugc_manager_keys }))}/>

        {error && <div className="planning-error">{error}</div>}
        <div className="planning-modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving || !form.client_id || !form.strategist_key}>{saving ? 'Saving…' : 'Save workload'}</button>
        </div>
      </form>
    </div>
  )
}

function AllocationTable({ allocations, peopleByKey, onEdit, onDelete }) {
  return (
    <div className="card planning-table-card">
      <div className="table-wrap">
        <table className="planning-table">
          <thead><tr><th>Client</th><th>Strategist</th><th>Concepts</th><th>Designers</th><th>Editors</th><th>UGC</th><th></th></tr></thead>
          <tbody>
            {allocations.map(item => {
              const designers = (item.designer_keys || []).map(key => peopleByKey.get(key)?.display_name || 'Legacy').join(', ')
              const editors = (item.editor_keys || []).map(key => peopleByKey.get(key)?.display_name || 'Legacy').join(', ')
              const ugc = (item.ugc_manager_keys || []).map(key => peopleByKey.get(key)?.display_name || 'Legacy').join(', ')
              return (
                <tr key={item.id}>
                  <td><strong>{item.client_name_snapshot}</strong>{!item.client_id && <span className="legacy-label">Legacy match needed</span>}</td>
                  <td>{peopleByKey.get(item.strategist_key)?.display_name || 'Unassigned'}</td>
                  <td><strong>{Number(item.statics || 0) + Number(item.videos || 0)}</strong><span className="table-subline">{item.statics} static · {item.videos} video</span></td>
                  <td>{designers || '—'}</td>
                  <td>{editors || '—'}</td>
                  <td>{ugc || '—'}</td>
                  <td><div className="planning-row-actions"><button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => onEdit(item)} aria-label={`Edit ${item.client_name_snapshot}`}><Pencil size={13}/></button><button type="button" className="btn btn-ghost btn-icon btn-sm text-red" onClick={() => onDelete(item)} aria-label={`Remove ${item.client_name_snapshot} from this month`}><Trash2 size={13}/></button></div></td>
                </tr>
              )
            })}
            {!allocations.length && <tr><td colSpan="7"><div className="empty-state"><p>No client workload has been entered for this month.</p></div></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function OrgChart({ profiles, clients }) {
  const activeClients = clients.filter(client => client.is_active !== false && !client.is_archived)
  const clientsFor = profile => activeClients.filter(client => {
    const assignmentKeys = ['cs_ids', 'mb_ids', 'editor_ids', 'designer_ids', 'ugc_ids']
    return assignmentKeys.some(key => parseIds(client[key]).includes(profile.id)) || client.assigned_cs_id === profile.id
  })
  const sections = [
    { key: 'leadership', label: 'Leadership', people: profiles.filter(profile => profile.role === 'ceo' || (profile.role === 'management' && profile.position === 'management')) },
    { key: 'operations', label: 'Operations', people: profiles.filter(profile => ['ops_manager', 'ops_assistant'].includes(profile.position)) },
    { key: 'strategy', label: 'Creative Strategy', people: profiles.filter(profile => profile.position === 'creative_strategist') },
    { key: 'growth', label: 'Growth', people: profiles.filter(profile => ['media_buyer', 'email_marketer'].includes(profile.position)) },
    { key: 'production', label: 'Production', people: profiles.filter(profile => ['editor', 'designer', 'ugc_manager'].includes(profile.position)) },
  ]
  const assignedIds = new Set(activeClients.filter(client => ['cs_ids', 'mb_ids', 'editor_ids', 'designer_ids', 'ugc_ids'].some(key => parseIds(client[key]).length)).map(client => client.id))

  return (
    <div className="org-chart">
      {sections.map((section, index) => (
        <section className="org-level" key={section.key}>
          <div className="org-level-label"><span>{section.label}</span><small>{section.people.length}</small></div>
          <div className="org-people-grid">
            {section.people.map(profile => {
              const assigned = clientsFor(profile)
              return (
                <article className="org-person-card" key={profile.id}>
                  <div className="org-person-heading">
                    <div className="planning-avatar">{initials(profile.full_name)}</div>
                    <div><strong>{profile.full_name}</strong><span>{roleLabel(profile.position || profile.role)}</span></div>
                    <span className="org-count">{assigned.length}</span>
                  </div>
                  <div className="client-chip-list compact">
                    {assigned.slice(0, 6).map(client => <span key={client.id}>{client.name}</span>)}
                    {assigned.length > 6 && <span>+{assigned.length - 6} more</span>}
                    {!assigned.length && !['leadership', 'operations'].includes(section.key) && <em>No clients assigned</em>}
                  </div>
                </article>
              )
            })}
          </div>
          {index < sections.length - 1 && <div className="org-connector"><ChevronRight size={14}/></div>}
        </section>
      ))}
      <section className="card unassigned-clients-card">
        <div><AlertTriangle size={16}/><strong>Clients without a delivery team</strong></div>
        <div className="client-chip-list">
          {activeClients.filter(client => !assignedIds.has(client.id)).map(client => <span key={client.id}>{client.name}</span>)}
          {activeClients.every(client => assignedIds.has(client.id)) && <em>Every active client has at least one assignment.</em>}
        </div>
      </section>
    </div>
  )
}

export default function DesignCSOverview() {
  const { user, isCEO, isOps } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedMonth, setSelectedMonth] = useState('')
  const [tab, setTab] = useState('workload')
  const [editing, setEditing] = useState(undefined)
  const [cloning, setCloning] = useState(false)

  async function load(keepMonth = true) {
    setError('')
    try {
      const next = await loadDesignCsData()
      setData(next)
      const latest = next.months.at(-1)?.month_start || ''
      setSelectedMonth(current => keepMonth && next.months.some(month => month.month_start === current) ? current : latest)
    } catch (loadError) {
      setError(loadError.message || 'Unable to load the Design & CS data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(false) }, [])

  const monthAllocations = useMemo(() => (data?.allocations || []).filter(item => item.month_start === selectedMonth), [data?.allocations, selectedMonth])
  const peopleByKey = useMemo(() => new Map((data?.people || []).map(person => [person.source_key, person])), [data?.people])
  const selectedMonthRecord = data?.months.find(month => month.month_start === selectedMonth)
  const workloads = useMemo(() => buildWorkloads({
    allocations: monthAllocations,
    people: data?.people || [],
    settings: data?.settings,
    workingDays: selectedMonthRecord?.working_days || 22,
  }), [monthAllocations, data?.people, data?.settings, selectedMonthRecord?.working_days])

  async function cloneMonth() {
    if (!selectedMonthRecord || cloning) return
    const newMonth = nextMonthStart(selectedMonth)
    if (data.months.some(month => month.month_start === newMonth)) {
      setSelectedMonth(newMonth)
      return
    }
    setCloning(true)
    setError('')
    try {
      const { error: monthError } = await supabase.from('design_cs_months').insert({
        month_start: newMonth,
        label: formatMonth(newMonth),
        working_days: selectedMonthRecord.working_days,
        source: 'company_command',
        updated_by: user.id,
      })
      if (monthError) throw monthError
      if (monthAllocations.length) {
        const copies = monthAllocations.map(item => ({
          month_start: newMonth,
          source_key: item.source_key,
          client_id: item.client_id,
          client_name_snapshot: item.client_name_snapshot,
          strategist_key: item.strategist_key,
          statics: item.statics,
          videos: item.videos,
          designer_keys: item.designer_keys,
          editor_keys: item.editor_keys,
          ugc_manager_keys: item.ugc_manager_keys,
          ugc_enabled: item.ugc_enabled,
          notes: item.notes,
          updated_by: user.id,
        }))
        const { error: allocationError } = await supabase.from('design_cs_allocations').insert(copies)
        if (allocationError) throw allocationError
      }
      await load(false)
      setSelectedMonth(newMonth)
    } catch (cloneError) {
      setError(cloneError.message || 'Unable to clone this month.')
    } finally {
      setCloning(false)
    }
  }

  async function deleteAllocation(allocation) {
    if (!confirm(`Remove "${allocation.client_name_snapshot}" from ${formatMonth(selectedMonth)}? Other months and the client roster will not be changed.`)) return
    const { error: deleteError } = await supabase.from('design_cs_allocations').delete().eq('id', allocation.id)
    if (deleteError) {
      setError(deleteError.message || 'Unable to remove this monthly allocation.')
      return
    }
    await load(true)
  }

  if (!isCEO && !isOps) return <div className="page-body"><div className="empty-state"><p>CEO or Operations access required.</p></div></div>
  if (loading) return <div className="loading-screen"><div className="spinner"/></div>

  const activeClients = (data?.clients || []).filter(client => client.is_active !== false && !client.is_archived)
  const allocatedClientIds = new Set(monthAllocations.map(item => item.client_id).filter(Boolean))
  const addableClients = activeClients.filter(client => !allocatedClientIds.has(client.id))
  const totalConcepts = monthAllocations.reduce((sum, item) => sum + Number(item.statics || 0) + Number(item.videos || 0), 0)
  const overloadedCount = [...workloads.strategists, ...workloads.editors, ...workloads.designers, ...workloads.ugcManagers].filter(person => person.status === 'overloaded').length

  return (
    <>
      <div className="page-header planning-page-header">
        <div>
          <div className="planning-eyebrow">Delivery capacity</div>
          <h1 className="page-title">Design &amp; CS Overview</h1>
          <p className="page-subtitle">One operating view of client ownership, monthly workload, and available team capacity.</p>
        </div>
        <div className="planning-header-actions">
          {tab !== 'org' && <select aria-label="Month" value={selectedMonth} onChange={event => setSelectedMonth(event.target.value)}>{data?.months.map(month => <option key={month.month_start} value={month.month_start}>{month.label}</option>)}</select>}
          {tab === 'allocations' && <button type="button" className="btn btn-ghost" onClick={cloneMonth} disabled={cloning || !selectedMonth}><Copy size={14}/>{cloning ? 'Cloning…' : 'Clone next month'}</button>}
          {tab === 'allocations' && <button type="button" className="btn btn-primary" onClick={() => setEditing(null)} disabled={!addableClients.length}><Plus size={14}/>Add client workload</button>}
        </div>
      </div>

      <div className="page-body planning-page">
        {error && <div className="planning-error"><AlertTriangle size={15}/>{error}</div>}
        <div className="planning-tabs" role="tablist" aria-label="Design and CS views">
          <button type="button" className={tab === 'workload' ? 'active' : ''} onClick={() => setTab('workload')}><Activity size={14}/>Workload</button>
          <button type="button" className={tab === 'allocations' ? 'active' : ''} onClick={() => setTab('allocations')}><LayoutDashboard size={14}/>Client allocations</button>
          <button type="button" className={tab === 'org' ? 'active' : ''} onClick={() => setTab('org')}><Network size={14}/>Agency org chart</button>
        </div>

        {tab !== 'org' && (
          <div className="planning-metrics">
            <div className="planning-metric"><span><BriefcaseBusiness size={14}/>Active clients</span><strong>{monthAllocations.length}</strong><small>{formatMonth(selectedMonth)}</small></div>
            <div className="planning-metric"><span><Activity size={14}/>Monthly concepts</span><strong>{totalConcepts}</strong><small>{monthAllocations.reduce((sum, item) => sum + Number(item.statics || 0), 0)} static · {monthAllocations.reduce((sum, item) => sum + Number(item.videos || 0), 0)} video</small></div>
            <div className="planning-metric"><span><Users size={14}/>Delivery team</span><strong>{workloads.strategists.length + workloads.editors.length + workloads.designers.length + workloads.ugcManagers.length}</strong><small>CS, editors, designers, and UGC</small></div>
            <div className={`planning-metric ${overloadedCount ? 'danger' : ''}`}><span><AlertTriangle size={14}/>Capacity risks</span><strong>{overloadedCount}</strong><small>{overloadedCount ? 'People above their limit' : 'No one above limit'}</small></div>
          </div>
        )}

        {tab === 'workload' && (
          <>
            {workloads.unmatchedKeys.length > 0 && <div className="planning-notice"><AlertTriangle size={15}/><span><strong>{workloads.unmatchedKeys.length} legacy team record{workloads.unmatchedKeys.length === 1 ? '' : 's'} need matching.</strong> Their historical work is preserved, but they are not counted as active Company Command headcount.</span></div>}
            <WorkloadSection title="Creative strategists" subtitle={`Healthy range: ${data.settings.cs_min_concepts}–${data.settings.cs_max_concepts} concepts per month. Client count remains visible as context.`} people={workloads.strategists} type="creative_strategist"/>
            <WorkloadSection title="Video editors" subtitle={`${data.settings.editor_daily_capacity} video concepts per working day · ${selectedMonthRecord?.working_days || 22} working days.`} people={workloads.editors} type="editor"/>
            <WorkloadSection title="Designers" subtitle={`${data.settings.designer_daily_capacity} static concepts per working day · two more concepts than editors.`} people={workloads.designers} type="designer"/>
            <WorkloadSection title="UGC managers" subtitle={`${data.settings.ugc_max_clients} active clients per UGC manager.`} people={workloads.ugcManagers} type="ugc_manager"/>
          </>
        )}

        {tab === 'allocations' && <AllocationTable allocations={monthAllocations} peopleByKey={peopleByKey} onEdit={item => setEditing(item)} onDelete={deleteAllocation}/>}
        {tab === 'org' && <OrgChart profiles={data?.profiles || []} clients={data?.clients || []}/>}
      </div>

      {editing !== undefined && (
        <AllocationModal
          allocation={editing}
          monthStart={selectedMonth}
          clients={editing ? data.clients : addableClients}
          people={data.people}
          userId={user.id}
          onClose={() => setEditing(undefined)}
          onSaved={() => load(true)}
        />
      )}
    </>
  )
}

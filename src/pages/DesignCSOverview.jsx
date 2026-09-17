import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, AlertTriangle, BriefcaseBusiness, CheckCircle2, ChevronRight, Copy, GripVertical, LayoutDashboard, LockKeyhole, Network, Pencil, Plus, Users, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { loadDesignCsData, persistVirtualPeople } from '../lib/designCsData'
import { buildAllocationSnapshot, buildRosterAllocations, buildWorkloads, formatMonth, initials, nextMonthStart, parseIds, roleLabel, statusMeta } from '../lib/workforcePlanning'
import ClientPackageFields from '../components/ClientPackageFields'
import { formatCreatorTarget, packageFormValues, packagePayload, validateClientPackage } from '../lib/clientPackage'
import { guardClientFields, planAssignmentChange } from '../lib/allocationAssignments'
import { isCreativeStrategist } from '../lib/creativeStrategyRoles'
import './WorkforcePlanning.css'

const WORKLOAD_DRAG_MIME = 'application/x-company-command-client'

function createEmptyAllocationForm() {
  return {
    ...packageFormValues(),
    client_id: '',
    client_name: '',
    strategist_profile_ids: [],
    statics: 0,
    video_concepts: 0,
    ugc_concepts: 0,
    designer_profile_ids: [],
    editor_profile_ids: [],
    ugc_manager_profile_ids: [],
  }
}

function formatConcepts(value) {
  return Number.isInteger(Number(value)) ? Number(value) : Number(value).toFixed(1)
}

function formatSharedTarget(value) {
  return value == null || value === '' ? 'Not set' : formatConcepts(value)
}

function equalShareSummary(count, details = '') {
  return count ? `${count} assigned · ${formatConcepts(100 / count)}% each${details ? ` · ${details}` : ''}` : 'Select one or more team members.'
}

function buildCreativeAllocation(current, concepts, isEdit) {
  const count = Number(concepts || 0)
  return {
    ...(current || {}),
    concepts: count,
    variations: isEdit ? Number(current?.variations || 0) : count > 0 ? 1 : 0,
  }
}

function CapacityBar({ utilization, status }) {
  const width = Math.min(Math.max(utilization, 0), 100)
  return (
    <div className="capacity-track" aria-label={`${utilization}% utilized`}>
      <div className={`capacity-fill ${status}`} style={{ width: `${width}%` }}/>
    </div>
  )
}

function WorkloadClientBreakdown({ assignments, showConcepts, type, canDrag, onSelect, onDragStart, onDragEnd, onManage }) {
  const sortedAssignments = [...assignments].sort((a, b) => a.client_name_snapshot.localeCompare(b.client_name_snapshot))
  const showCreatorTargets = type === 'ugc_manager'

  if (!sortedAssignments.length) return <div className="workload-client-empty">No clients assigned</div>

  return (
    <div className="workload-client-table-wrap">
      <table className={`workload-client-table ${showCreatorTargets ? 'creator-targets' : showConcepts ? '' : 'clients-only'}`}>
        <thead>
          <tr>
            <th>Client</th>
            {showConcepts && <th>Static</th>}
            {showConcepts && <th>Video</th>}
            {showCreatorTargets && <th>UGC creators</th>}
            {showCreatorTargets && <th>Seeding creators</th>}
          </tr>
        </thead>
        <tbody>
          {sortedAssignments.map(item => (
            <tr key={item.id}>
              <td title={item.client_name_snapshot}>
                {canDrag && item.client_id ? (
                  <button
                    type="button"
                    className="workload-client-name workload-client-drag-handle"
                    draggable
                    title={`Drag or select ${item.client_name_snapshot} to share or move this assignment`}
                    onPointerDown={event => {
                      if (event.pointerType !== 'mouse') onSelect?.(item, type)
                    }}
                    onClick={() => onSelect?.(item, type)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') onSelect?.(item, type)
                    }}
                    onDragStart={event => onDragStart?.(event, item, type)}
                    onDragEnd={onDragEnd}
                  >
                    <GripVertical size={11}/>
                    <span>{item.client_name_snapshot}</span>
                  </button>
                ) : <span className="workload-client-name">{item.client_name_snapshot}</span>}
                {canDrag && <button type="button" className="workload-manage-team" aria-label={`Manage team for ${item.client_name_snapshot}`} onClick={() => onManage(item.client_id)}><Pencil size={11}/></button>}
                {item.assignment_count > 1 && <span className="workload-shared-target">1/{item.assignment_count} share · {formatConcepts(item.workload_share * 100)}%</span>}
              </td>
              {showConcepts && <td><strong>{formatConcepts(item.statics || 0)}</strong></td>}
              {showConcepts && <td><strong>{formatConcepts(item.videos || 0)}</strong></td>}
              {showCreatorTargets && <td><strong>{formatSharedTarget(item.ugc_creators_per_month)}</strong></td>}
              {showCreatorTargets && <td><strong>{formatSharedTarget(item.seeding_creators_per_month)}</strong></td>}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="workload-target-note">{showCreatorTargets ? 'Monthly sourcing share, split equally between assigned UGC managers. Fractions are planning averages.' : 'This person’s concept workload, split equally within their role.'}</p>
    </div>
  )
}

function WorkloadCard({ person, type, canAcceptDrop, isDropReady, onDropClient, onSelect, onDragStart, onDragEnd, onManage, assignmentMode }) {
  const meta = statusMeta(person.status)
  const showConcepts = ['creative_strategist', 'editor', 'designer'].includes(type)
  return (
    <article
      className={`workload-card ${isDropReady ? 'drop-ready' : ''}`}
      onDragOver={event => {
        if (!canAcceptDrop) return
        event.preventDefault()
        event.dataTransfer.dropEffect = assignmentMode === 'share' ? 'copy' : 'move'
      }}
      onDrop={event => {
        if (!canAcceptDrop) return
        event.preventDefault()
        onDropClient(event, person, type)
      }}
    >
      <div className="workload-card-top">
        <div className="planning-avatar">{initials(person.display_name)}</div>
        <div className="workload-person">
          <strong>{person.display_name}</strong>
          <span>{type === 'creative_strategist' ? `${person.clients} clients · ${formatConcepts(person.concepts)} concepts` : person.capacityLabel}</span>
        </div>
        <span className={`badge ${meta.tone}`}>{meta.label}</span>
      </div>
      <div className="workload-utilization">
        <CapacityBar utilization={person.utilization} status={person.status}/>
        <strong>{person.utilization}%</strong>
      </div>
      {type === 'creative_strategist' && (
        <div className="workload-split">
          <span>{formatConcepts(person.statics)} static concepts</span>
          <span>{formatConcepts(person.videos)} video concepts</span>
        </div>
      )}
      {isDropReady && <button type="button" className="workload-drop-hint" onClick={event => onDropClient(event, person, type)}>{assignmentMode === 'share' ? 'Share client with this person' : 'Move selected share here'}</button>}
      <WorkloadClientBreakdown
        assignments={person.assignments}
        showConcepts={showConcepts}
        type={type}
        canDrag={Boolean(onDragStart)}
        onSelect={(item, role) => onSelect(item, role, person.profile_id)}
        onDragStart={(event, item, role) => onDragStart?.(event, item, role, person.profile_id)}
        onDragEnd={onDragEnd}
        onManage={onManage}
      />
    </article>
  )
}

function UnassignedWorkloads({ allocations, type, onSelect, onDragStart, onDragEnd }) {
  if (!allocations.length) return null
  return (
    <div className="workload-unassigned">
      <div><AlertTriangle size={13}/><strong>Unassigned</strong><span>Drag a client onto a team member</span></div>
      <div className="workload-unassigned-list">
        {allocations.map(item => (
          <button
            type="button"
            key={item.id}
            draggable
            onPointerDown={event => {
              if (event.pointerType !== 'mouse') onSelect(item, type)
            }}
            onClick={() => onSelect(item, type)}
            onDragStart={event => onDragStart(event, item, type)}
            onDragEnd={onDragEnd}
          >
            <GripVertical size={11}/>
            <strong>{item.client_name_snapshot}</strong>
            {type !== 'ugc_manager' && <span>{formatConcepts(Number(item.statics || 0) + Number(item.videos || 0))} concepts</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

function WorkloadSection({ title, subtitle, people, allocations, type, draggedRole, onDropClient, onSelect, onDragStart, onDragEnd, onManage, assignmentMode }) {
  const sorted = [...people].sort((a, b) => b.utilization - a.utilization || a.display_name.localeCompare(b.display_name))
  const unassigned = onDragStart ? allocations.filter(item => {
    if (type === 'creative_strategist') return !(item.strategist_keys?.length || item.strategist_key)
    if (type === 'editor') return Number(item.videos || 0) > 0 && !(item.editor_keys || []).length
    if (type === 'designer') return Number(item.statics || 0) > 0 && !(item.designer_keys || []).length
    return (Number(item.ugc_concepts || 0) > 0 || Number(item.ugc_creators_per_month || 0) > 0 || Number(item.seeding_creators_per_month || 0) > 0) && !(item.ugc_manager_keys || []).length
  }) : []
  return (
    <section className="planning-section">
      <div className="planning-section-heading">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <span>{people.length} people</span>
      </div>
      <UnassignedWorkloads allocations={unassigned} type={type} onSelect={onSelect} onDragStart={onDragStart} onDragEnd={onDragEnd}/>
      <div className="workload-grid">
        {sorted.map(person => (
          <WorkloadCard
            key={person.source_key}
            person={person}
            type={type}
            canAcceptDrop={Boolean(onDragStart) && Boolean(person.profile_id)}
            isDropReady={draggedRole === type && Boolean(person.profile_id)}
            onDropClient={onDropClient}
            onSelect={onSelect}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onManage={onManage}
            assignmentMode={assignmentMode}
          />
        ))}
        {!sorted.length && <div className="empty-state"><p>No active people are mapped to this role.</p></div>}
      </div>
    </section>
  )
}

function MultiChecks({ label, options, value, onChange, summary }) {
  const visibleOptions = options.filter(person => person.profile_id)
  const missingIds = value.filter(id => !visibleOptions.some(person => person.profile_id === id))
  return (
    <fieldset className="planning-checks">
      <legend>{label} · select multiple</legend>
      <p className="allocation-share-summary">{summary || equalShareSummary(value.length)}</p>
      <div>
        {visibleOptions.map(person => {
          const checked = value.includes(person.profile_id)
          return (
            <label key={person.profile_id}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onChange(checked ? value.filter(id => id !== person.profile_id) : [...value, person.profile_id])}
              />
              <span>{person.display_name}</span>
            </label>
          )
        })}
        {missingIds.map(id => <label key={id}><input type="checkbox" checked onChange={() => onChange(value.filter(valueId => valueId !== id))}/><span>Unavailable assignment · {id.slice(0, 8)}</span></label>)}
      </div>
    </fieldset>
  )
}

function AllocationModal({ allocation, monthStart, clients, people, onClose, onSaved }) {
  const isEdit = Boolean(allocation)
  const [form, setForm] = useState(allocation ? {
    ...packageFormValues(clients.find(client => client.id === allocation.client_id) || allocation),
    client_id: allocation.client_id || '',
    client_name: allocation.client_name_snapshot || '',
    strategist_profile_ids: allocation.strategist_profile_ids || [],
    statics: allocation.statics || 0,
    video_concepts: allocation.video_concepts || 0,
    ugc_concepts: allocation.ugc_concepts || 0,
    designer_profile_ids: allocation.designer_profile_ids || [],
    editor_profile_ids: allocation.editor_profile_ids || [],
    ugc_manager_profile_ids: allocation.ugc_manager_profile_ids || [],
  } : createEmptyAllocationForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const modalRef = useRef(null)
  const savingRef = useRef(false)

  useEffect(() => {
    const previousFocus = document.activeElement
    modalRef.current?.querySelector('button, input:not(:disabled), select:not(:disabled)')?.focus()
    return () => previousFocus?.focus?.()
  }, [])

  function handleModalKey(event) {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (!savingRef.current) onClose()
    }
    if (event.key === 'Tab') {
      const elements = [...modalRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')]
      const first = elements[0], last = elements.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
  }

  const optionsFor = role => people.filter(person => person.discipline === role && person.is_active !== false)
  const shareSummary = (ids, role) => {
    const count = ids.length
    const statics = Number(form.statics || 0)
    const videos = Number(form.video_concepts || 0) + Number(form.ugc_concepts || 0)
    if (!count) return equalShareSummary(0)
    const detail = role === 'editor' ? `${formatConcepts(videos / count)} video concepts per person`
      : role === 'designer' ? `${formatConcepts(statics / count)} static concepts per person`
        : role === 'creative_strategist' ? `${formatConcepts((statics + videos) / count)} concepts per person`
          : `${formatSharedTarget(form.ugc_creators_per_month === '' ? null : Number(form.ugc_creators_per_month) / count)} UGC / ${formatSharedTarget(form.seeding_creators_per_month === '' ? null : Number(form.seeding_creators_per_month) / count)} seeding creators per person`
    return equalShareSummary(count, detail)
  }

  async function save(event) {
    event.preventDefault()
    if (saving) return
    const client = isEdit ? clients.find(item => item.id === form.client_id) : null
    const clientName = form.client_name.trim()
    if (isEdit && !client) return
    if (!isEdit && !clientName) {
      setError('Enter a client name.')
      return
    }
    if (!isEdit && clients.some(item => item.name?.trim().toLowerCase() === clientName.toLowerCase())) {
      setError('That client already exists in the Client Roster. Edit or reactivate the existing client instead.')
      return
    }
    const packageError = validateClientPackage({
      ...form,
      creatives: {
        static: { concepts: form.statics },
        video: { concepts: form.video_concepts },
        ugc: { concepts: form.ugc_concepts },
      },
    }, { requirePackage: !isEdit })
    if (packageError) {
      setError(packageError)
      return
    }
    setSaving(true)
    savingRef.current = true
    setError('')
    try {
      const selectedProfileIds = [
        ...form.strategist_profile_ids,
        ...form.designer_profile_ids,
        ...form.editor_profile_ids,
        ...form.ugc_manager_profile_ids,
      ]
      await persistVirtualPeople(people.filter(person => selectedProfileIds.includes(person.profile_id)))
      const currentCreatives = client?.creatives || {}
      const payload = {
        ...packagePayload(form),
        cs_ids: form.strategist_profile_ids,
        assigned_cs_id: form.strategist_profile_ids[0] || null,
        designer_ids: form.designer_profile_ids,
        editor_ids: form.editor_profile_ids,
        ugc_ids: form.ugc_manager_profile_ids,
        creatives: {
          ...currentCreatives,
          static: buildCreativeAllocation(currentCreatives.static, form.statics, isEdit),
          video: buildCreativeAllocation(currentCreatives.video, form.video_concepts, isEdit),
          ugc: buildCreativeAllocation(currentCreatives.ugc, form.ugc_concepts, isEdit),
        },
      }
      const saveQuery = isEdit
        ? guardClientFields(supabase.from('clients').update(payload).eq('id', client.id), client, Object.keys(payload))
        : supabase.from('clients').insert({
          ...payload,
          name: clientName,
          mb_ids: [],
          is_active: true,
          is_archived: false,
        })
      const { data: savedClient, error: saveError } = await saveQuery.select('*').single()
      if (saveError?.code === 'PGRST116') throw new Error('This client changed while you were editing. Close and refresh before trying again; no changes were saved.')
      if (saveError) throw saveError
      if (!savedClient) throw new Error(`The Client Roster did not accept this ${isEdit ? 'update' : 'new client'}.`)
      await onSaved({ client: savedClient, isNew: !isEdit })
      onClose()
    } catch (saveError) {
      setError(saveError.message || 'Unable to save this allocation.')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={event => !saving && event.target === event.currentTarget && onClose()}>
      <form ref={modalRef} className="modal planning-modal" role="dialog" aria-modal="true" aria-labelledby="allocation-title" onSubmit={save} onKeyDown={handleModalKey}>
        <div className="planning-modal-header">
          <div>
            <h2 id="allocation-title" className="modal-title">{isEdit ? 'Edit client allocation' : 'Add client allocation'}</h2>
            <p>{formatMonth(monthStart)} · {isEdit ? 'saves to' : 'creates a new active client in'} the Client Roster</p>
          </div>
          <button type="button" className="btn btn-ghost btn-icon" disabled={saving} onClick={onClose} aria-label="Close"><X size={16}/></button>
        </div>

        <label className="field-label">Client</label>
        {isEdit ? (
          <select value={form.client_id} disabled>
            {clients.filter(client => client.id === form.client_id).map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select>
        ) : (
          <input value={form.client_name} onChange={event => setForm(current => ({ ...current, client_name: event.target.value }))} placeholder="Client name" required autoFocus/>
        )}

        <ClientPackageFields value={form} onChange={value => setForm(current => ({ ...current, ...value }))} requirePackage={!isEdit} showConcepts={false}/>

        <p className="allocation-sharing-help">Assign as many people as needed in each role. Workload is divided equally within that role; the client’s total package stays unchanged.</p>
        <MultiChecks label="Creative strategists" summary={shareSummary(form.strategist_profile_ids, 'creative_strategist')} options={optionsFor('creative_strategist')} value={form.strategist_profile_ids} onChange={strategist_profile_ids => setForm(current => ({ ...current, strategist_profile_ids }))}/>

        <div className="planning-form-grid">
          <label><span>Static concepts</span><input type="number" min="0" step="1" max="2147483647" value={form.statics} onChange={event => setForm(current => ({ ...current, statics: event.target.value }))}/></label>
          <label><span>Video concepts</span><input type="number" min="0" step="1" max="2147483647" value={form.video_concepts} onChange={event => setForm(current => ({ ...current, video_concepts: event.target.value }))}/></label>
          <label><span>UGC video concepts</span><input type="number" min="0" step="1" max="2147483647" value={form.ugc_concepts} onChange={event => setForm(current => ({ ...current, ugc_concepts: event.target.value }))}/></label>
        </div>

        <MultiChecks label="Designers" summary={shareSummary(form.designer_profile_ids, 'designer')} options={optionsFor('designer')} value={form.designer_profile_ids} onChange={designer_profile_ids => setForm(current => ({ ...current, designer_profile_ids }))}/>
        <MultiChecks label="Editors" summary={shareSummary(form.editor_profile_ids, 'editor')} options={optionsFor('editor')} value={form.editor_profile_ids} onChange={editor_profile_ids => setForm(current => ({ ...current, editor_profile_ids }))}/>
        <MultiChecks label="UGC managers" summary={shareSummary(form.ugc_manager_profile_ids, 'ugc_manager')} options={optionsFor('ugc_manager')} value={form.ugc_manager_profile_ids} onChange={ugc_manager_profile_ids => setForm(current => ({ ...current, ugc_manager_profile_ids }))}/>

        {error && <div className="planning-error" role="alert">{error}</div>}
        <div className="planning-modal-actions">
          <button type="button" className="btn btn-ghost" disabled={saving} onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving || (isEdit ? !form.client_id : !form.client_name.trim())}>{saving ? 'Saving…' : isEdit ? 'Save to Client Roster' : 'Create in Client Roster'}</button>
        </div>
      </form>
    </div>
  )
}

function AllocationTable({ allocations, peopleByKey, onEdit, isLive }) {
  return (
    <div className="card planning-table-card">
      <div className="table-wrap">
        <table className="planning-table planning-allocation-table">
          <thead><tr><th>Client</th><th>Strategists</th><th>Concepts</th><th>UGC creators / month</th><th>Seeding creators / month</th><th>Designers</th><th>Editors</th><th>UGC managers</th><th></th></tr></thead>
          <tbody>
            {allocations.map(item => {
              const strategistKeys = item.strategist_keys?.length ? item.strategist_keys : item.strategist_key ? [item.strategist_key] : []
              const strategists = strategistKeys.map(key => peopleByKey.get(key)?.display_name || 'Legacy').join(', ')
              const designers = (item.designer_keys || []).map(key => peopleByKey.get(key)?.display_name || 'Legacy').join(', ')
              const editors = (item.editor_keys || []).map(key => peopleByKey.get(key)?.display_name || 'Legacy').join(', ')
              const ugc = (item.ugc_manager_keys || []).map(key => peopleByKey.get(key)?.display_name || 'Legacy').join(', ')
              return (
                <tr key={item.id}>
                  <td><strong>{item.client_name_snapshot}</strong><span className="table-subline">{item.package_type || 'Package not set'}</span>{!item.client_id && <span className="legacy-label">Legacy match needed</span>}</td>
                  <td>{strategists || 'Unassigned'}{strategistKeys.length > 1 && <span className="table-subline">{equalShareSummary(strategistKeys.length)}</span>}</td>
                  <td><strong>{formatConcepts(Number(item.statics || 0) + Number(item.videos || 0))}</strong><span className="table-subline">{formatConcepts(item.statics)} static · {formatConcepts(item.videos)} video</span></td>
                  <td>{formatCreatorTarget(item.ugc_creators_per_month)}</td>
                  <td>{formatCreatorTarget(item.seeding_creators_per_month)}</td>
                  <td>{designers || '—'}{parseIds(item.designer_keys).length > 1 && <span className="table-subline">{equalShareSummary(parseIds(item.designer_keys).length)}</span>}</td>
                  <td>{editors || '—'}{parseIds(item.editor_keys).length > 1 && <span className="table-subline">{equalShareSummary(parseIds(item.editor_keys).length)}</span>}</td>
                  <td>{ugc || '—'}{parseIds(item.ugc_manager_keys).length > 1 && <span className="table-subline">{equalShareSummary(parseIds(item.ugc_manager_keys).length)}</span>}</td>
                  <td>
                    {isLive
                      ? <div className="planning-row-actions"><button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => onEdit(item)} aria-label={`Edit ${item.client_name_snapshot}`}><Pencil size={13}/></button></div>
                      : <span className="snapshot-label">Snapshot</span>}
                  </td>
                </tr>
              )
            })}
            {!allocations.length && <tr><td colSpan="9"><div className="empty-state"><p>No client workload has been entered for this month.</p></div></td></tr>}
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
    { key: 'strategy', label: 'Creative Strategy', people: profiles.filter(isCreativeStrategist) },
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
  const { isCEO, isOps } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedMonth, setSelectedMonth] = useState('')
  const [tab, setTab] = useState('workload')
  const [editing, setEditing] = useState(undefined)
  const [cloning, setCloning] = useState(false)
  const draggedAllocationRef = useRef(null)
  const [draggedRole, setDraggedRole] = useState(null)
  const [syncMessage, setSyncMessage] = useState('')
  const [assignmentMode, setAssignmentMode] = useState('share')
  const [assignmentSaving, setAssignmentSaving] = useState(false)
  const assignmentSavingRef = useRef(false)

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

  const latestMonth = data?.months.at(-1)?.month_start || ''
  const isLiveMonth = Boolean(selectedMonth) && selectedMonth === latestMonth
  const liveAllocations = useMemo(() => buildRosterAllocations({
    clients: data?.clients || [],
    people: data?.people || [],
    monthStart: latestMonth,
  }), [data?.clients, data?.people, latestMonth])
  const monthAllocations = useMemo(() => {
    if (isLiveMonth) return liveAllocations
    return (data?.allocations || []).filter(item => item.month_start === selectedMonth)
  }, [data?.allocations, isLiveMonth, liveAllocations, selectedMonth])
  const peopleByKey = useMemo(() => new Map((data?.people || []).map(person => [person.source_key, person])), [data?.people])
  const selectedMonthRecord = data?.months.find(month => month.month_start === selectedMonth)
  const workloads = useMemo(() => buildWorkloads({
    allocations: monthAllocations,
    people: data?.people || [],
    settings: data?.settings,
    workingDays: selectedMonthRecord?.working_days || 22,
  }), [monthAllocations, data?.people, data?.settings, selectedMonthRecord?.working_days])

  async function closeMonthAndStartNext() {
    if (!selectedMonthRecord || !isLiveMonth || cloning) return
    const newMonth = nextMonthStart(selectedMonth)
    if (data.months.some(month => month.month_start === newMonth)) {
      setSelectedMonth(newMonth)
      return
    }
    const closingLabel = formatMonth(selectedMonth)
    const newLabel = formatMonth(newMonth)
    const confirmed = window.confirm(
      `Close ${closingLabel} and start ${newLabel}?\n\n${closingLabel} will be frozen as a read-only snapshot. ${newLabel} will remain live from Client Roster.`,
    )
    if (!confirmed) return
    setCloning(true)
    setError('')
    setSyncMessage('')
    try {
      await persistVirtualPeople(data.people)
      const snapshot = buildAllocationSnapshot(monthAllocations)
      const { data: result, error: rolloverError } = await supabase.rpc('close_design_cs_month', {
        p_current_month: selectedMonth,
        p_new_month: newMonth,
        p_new_label: newLabel,
        p_working_days: selectedMonthRecord.working_days,
        p_allocations: snapshot,
      })
      if (rolloverError) throw rolloverError
      await load(false)
      setSelectedMonth(newMonth)
      setSyncMessage(`${closingLabel} is now read-only with ${result?.snapshot_count ?? snapshot.length} client allocations. ${newLabel} is live from Client Roster.`)
    } catch (rolloverError) {
      setError(rolloverError.message || `Unable to close ${closingLabel}. No month changes were saved.`)
    } finally {
      setCloning(false)
    }
  }

  function selectClientForMove(allocation, type, sourceProfileId) {
    if (!isLiveMonth || assignmentSavingRef.current || !allocation.client_id) return
    draggedAllocationRef.current = { allocation, type, sourceProfileId }
    setDraggedRole(type)
  }

  function startClientDrag(event, allocation, type, sourceProfileId) {
    selectClientForMove(allocation, type, sourceProfileId)
    event.dataTransfer.effectAllowed = 'copyMove'
    event.dataTransfer.setData(WORKLOAD_DRAG_MIME, JSON.stringify({ clientId: allocation.client_id, type, sourceProfileId }))
    event.dataTransfer.setData('text/plain', allocation.client_id)
  }

  function endClientDrag() {
    const endingDrag = draggedAllocationRef.current
    window.setTimeout(() => {
      if (draggedAllocationRef.current !== endingDrag) return
      draggedAllocationRef.current = null
      setDraggedRole(null)
    }, 0)
  }

  async function moveClient(event, person, type) {
    if (!isLiveMonth || assignmentSavingRef.current) return
    let transferred = null
    try {
      const raw = event?.dataTransfer?.getData(WORKLOAD_DRAG_MIME)
      if (raw) transferred = JSON.parse(raw)
    } catch {
      transferred = null
    }
    const selected = draggedAllocationRef.current
    const selectedType = transferred?.type || selected?.type
    const clientId = transferred?.clientId || event?.dataTransfer?.getData('text/plain') || selected?.allocation?.client_id
    if (!clientId || selectedType !== type || !person.profile_id) return
    const client = data.clients.find(item => item.id === clientId)
    if (!client) return
    const change = planAssignmentChange(client, type, person.profile_id, transferred?.sourceProfileId || selected?.sourceProfileId, assignmentMode)
    draggedAllocationRef.current = null
    setDraggedRole(null)
    if (!change?.changed) return

    setError('')
    setSyncMessage('')
    assignmentSavingRef.current = true
    setAssignmentSaving(true)
    try {
      await persistVirtualPeople([person])
      const { data: savedClient, error: moveError } = await guardClientFields(
        supabase.from('clients').update(change.updates).eq('id', clientId), client, Object.keys(change.updates),
      ).select('*').single()
      if (moveError || !savedClient) throw new Error(moveError?.code === 'PGRST116'
        ? 'This assignment changed elsewhere. Refresh and try again; the other team member’s change has been preserved.'
        : moveError?.message || 'The Client Roster did not accept this assignment change.')
      setData(current => ({ ...current, clients: current.clients.map(item => item.id === clientId ? savedClient : item) }))
      setSyncMessage(`${client.name}: ${assignmentMode === 'share' ? 'shared with' : 'selected share moved to'} ${person.display_name}. ${change.ids.length} assigned in this role; workload is split equally. Client Roster is in sync.`)
    } catch (moveError) {
      setError(moveError.message || 'Unable to save this assignment. Refresh and try again.')
    } finally {
      assignmentSavingRef.current = false
      setAssignmentSaving(false)
    }
  }

  function manageClientTeam(clientId) {
    const allocation = liveAllocations.find(item => item.client_id === clientId)
    if (isLiveMonth && allocation) setEditing(allocation)
  }

  if (!isCEO && !isOps) return <div className="page-body"><div className="empty-state"><p>CEO or Operations access required.</p></div></div>
  if (loading) return <div className="loading-screen"><div className="spinner"/></div>

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
          <button type="button" className="btn btn-ghost" disabled={assignmentSaving || cloning} onClick={() => load(true)}>Refresh</button>
          {tab !== 'org' && <select aria-label="Month" value={selectedMonth} disabled={assignmentSaving || cloning} onChange={event => { draggedAllocationRef.current = null; setDraggedRole(null); setSelectedMonth(event.target.value) }}>{data?.months.map(month => <option key={month.month_start} value={month.month_start}>{month.label}</option>)}</select>}
          {tab === 'allocations' && isLiveMonth && <button type="button" className="btn btn-primary" onClick={() => setEditing(null)}><Plus size={14}/>Add client</button>}
          {tab === 'allocations' && isLiveMonth && <button type="button" className="btn btn-ghost" onClick={closeMonthAndStartNext} disabled={cloning || !selectedMonth}><LockKeyhole size={14}/>{cloning ? 'Closing month…' : `Close ${formatMonth(selectedMonth)} & start ${formatMonth(nextMonthStart(selectedMonth))}`}</button>}
        </div>
      </div>

      <div className="page-body planning-page">
        {error && <div className="planning-error"><AlertTriangle size={15}/>{error}</div>}
        {syncMessage && <div className="planning-sync-success"><CheckCircle2 size={15}/><span>{syncMessage}</span></div>}
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
            {isLiveMonth && <div className="planning-roster-source"><CheckCircle2 size={15}/><span><strong>Equal workload sharing.</strong> Add multiple people per role using a client’s pencil button, or drag/click a client and then another teammate. CS share all concepts, editors share video, designers share statics, and UGC managers share client load and sourcing targets.</span></div>}
            {isLiveMonth && <div className="allocation-assignment-toolbar">
              <label>Assignment action <select aria-label="Assignment action" value={assignmentMode} disabled={assignmentSaving} onChange={event => setAssignmentMode(event.target.value)}><option value="share">Share with another teammate</option><option value="move">Move this person’s share</option></select></label>
              <span>{assignmentMode === 'share' ? 'Keeps existing teammates and divides the role’s workload equally.' : 'Replaces only the selected person; other assigned teammates stay.'}</span>
              {draggedRole && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { draggedAllocationRef.current = null; setDraggedRole(null) }}>Cancel selection</button>}
              {assignmentSaving && <span role="status">Saving assignment…</span>}
            </div>}
            {!isLiveMonth && <div className="planning-history-source"><Copy size={15}/><span><strong>Historical snapshot.</strong> Select the latest month to edit roster assignments or use drag and drop.</span></div>}
            {workloads.unmatchedKeys.length > 0 && <div className="planning-notice"><AlertTriangle size={15}/><span><strong>{workloads.unmatchedKeys.length} unmatched or unavailable assignment{workloads.unmatchedKeys.length === 1 ? '' : 's'}.</strong> Their shares are preserved but excluded from active-person cards. Review the client’s team before using capacity totals.</span></div>}
            <WorkloadSection title="Creative strategists" subtitle={`Healthy range: ${data.settings.cs_min_concepts}–${data.settings.cs_max_concepts} concepts per month. Client count remains visible as context.`} people={workloads.strategists} allocations={monthAllocations} type="creative_strategist" draggedRole={draggedRole} onDropClient={moveClient} onSelect={selectClientForMove} onDragStart={isLiveMonth && !assignmentSaving ? startClientDrag : undefined} onDragEnd={endClientDrag} onManage={manageClientTeam} assignmentMode={assignmentMode}/>
            <WorkloadSection title="Video editors" subtitle={`${data.settings.editor_daily_capacity} video concepts per working day · ${selectedMonthRecord?.working_days || 22} working days.`} people={workloads.editors} allocations={monthAllocations} type="editor" draggedRole={draggedRole} onDropClient={moveClient} onSelect={selectClientForMove} onDragStart={isLiveMonth && !assignmentSaving ? startClientDrag : undefined} onDragEnd={endClientDrag} onManage={manageClientTeam} assignmentMode={assignmentMode}/>
            <WorkloadSection title="Designers" subtitle={`${data.settings.designer_daily_capacity} static concepts per working day · two more concepts than editors.`} people={workloads.designers} allocations={monthAllocations} type="designer" draggedRole={draggedRole} onDropClient={moveClient} onSelect={selectClientForMove} onDragStart={isLiveMonth && !assignmentSaving ? startClientDrag : undefined} onDragEnd={endClientDrag} onManage={manageClientTeam} assignmentMode={assignmentMode}/>
            <WorkloadSection title="UGC managers" subtitle={`${data.settings.ugc_max_clients} full-client equivalents per UGC manager. A client shared by two managers counts as 0.5 each.`} people={workloads.ugcManagers} allocations={monthAllocations} type="ugc_manager" draggedRole={draggedRole} onDropClient={moveClient} onSelect={selectClientForMove} onDragStart={isLiveMonth && !assignmentSaving ? startClientDrag : undefined} onDragEnd={endClientDrag} onManage={manageClientTeam} assignmentMode={assignmentMode}/>
          </>
        )}

        {tab === 'allocations' && (
          <>
            {isLiveMonth
              ? <div className="planning-roster-source"><CheckCircle2 size={15}/><span><strong>Client Roster is the source of truth.</strong> Edit a client to select multiple people per role; workload splits equally. Close this month to freeze the allocation as read-only, then continue live in the next month.</span></div>
              : <div className="planning-history-source"><Copy size={15}/><span><strong>Read-only historical snapshot.</strong> This imported data is preserved and cannot overwrite today’s Client Roster.</span></div>}
            <AllocationTable allocations={monthAllocations} peopleByKey={peopleByKey} onEdit={item => setEditing(item)} isLive={isLiveMonth}/>
          </>
        )}
        {tab === 'org' && <OrgChart profiles={data?.profiles || []} clients={data?.clients || []}/>}
      </div>

      {editing !== undefined && isLiveMonth && (
        <AllocationModal
          allocation={editing}
          monthStart={selectedMonth}
          clients={data.clients}
          people={data.people}
          onClose={() => setEditing(undefined)}
          onSaved={async ({ client, isNew }) => {
            await load(true)
            setSyncMessage(isNew
              ? `${client.name} was created in Client Roster and is now available everywhere.`
              : `${client.name} was updated in Client Roster and workload has been recalculated.`)
          }}
        />
      )}
    </>
  )
}

import { CREATIVE_TYPES, packageFormValues } from '../lib/clientPackage'

export default function ClientPackageFields({ value, onChange, requirePackage = false, showConcepts = false }) {
  const form = packageFormValues(value)
  const update = patch => onChange({ ...value, ...patch })
  const updateCreative = (type, field, next) => update({ creatives: {
    ...form.creatives, [type]: { ...form.creatives[type], [field]: next },
  } })
  return <div>
    <div className="form-group">
      <label style={{ display: 'block' }}>
        Creative package{requirePackage ? ' *' : ''}
        <input aria-label="Creative package" value={form.package_type} required={requirePackage}
          placeholder="e.g. Statics, Video Remix, UGC + Seeding"
          onChange={event => update({ package_type: event.target.value })}/>
      </label>
    </div>
    {showConcepts && <div className="form-group">
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Monthly creative deliverables</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10 }}>
        {CREATIVE_TYPES.map(type => {
          const label = type === 'ugc' ? 'UGC video' : type === 'video' ? 'Video remix' : 'Static'
          return <div key={type} style={{ padding: 10, border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
            <strong style={{ fontSize: 11 }}>{label}</strong>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 }}>
              {['concepts', 'variations'].map(field => <label key={field} style={{ fontSize: 10 }}>
                {field === 'concepts' ? 'Concepts' : 'Variations'}
                <input aria-label={`${label} ${field}`} type="number" min="0" step="1" max="2147483647"
                  value={form.creatives[type][field]} onChange={event => updateCreative(type, field, event.target.value)}/>
              </label>)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 6 }}>
              {(Number(form.creatives[type].concepts) || 0) * (Number(form.creatives[type].variations) || 0)} deliverables / month
            </div>
          </div>
        })}
      </div>
    </div>}
    <div className="form-group">
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Monthly creator sourcing</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
        {[
          ['ugc_creators_per_month', 'UGC creators to source / month'],
          ['seeding_creators_per_month', 'Seeding creators to source / month'],
        ].map(([field, label]) => <label key={field} style={{ display: 'block', fontSize: 11 }}>
          {label}
          <input aria-label={label} type="number" min="0" step="1" max="2147483647" placeholder="Not set"
            value={form[field]} onChange={event => update({ [field]: event.target.value })}/>
        </label>)}
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
        Number of creators to source each month, separate from concepts. Enter 0 if none are needed; leave blank if not yet agreed.
      </p>
    </div>
  </div>
}

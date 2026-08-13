import { readFile, writeFile } from 'node:fs/promises'

const [inputPath, outputPath] = process.argv.slice(2)
if (!inputPath || !outputPath) {
  throw new Error('Usage: node scripts/generate-design-cs-import.mjs <legacy-json> <migration-sql>')
}

const source = JSON.parse(await readFile(inputPath, 'utf8'))
const state = source.state
const months = Object.values(state.months || {})

const quote = value => `'${String(value ?? '').replaceAll("'", "''")}'`
const nullableQuote = value => value == null || value === '' ? 'null' : quote(value)
const textArray = values => `array[${(values || []).map(quote).join(',')}]::text[]`

const profileAliases = {
  Alex: 'alexander',
  Elish: 'Elish McBrearty',
  Isla: 'isla',
  Max: 'max',
  Jared: 'jared',
  Sean: 'sean',
  Manahil: 'manahil',
  Carolina: 'carolina',
  Paula: 'paula',
  Mansi: 'mansi',
  Angel: 'angel',
  Angeluo: 'angeluo',
  David: 'david',
  Kief: 'kiefer',
  Roshan: 'roshan',
  John: 'john',
  Muhammad: 'muhammad',
  Lucylen: 'lucylen',
  Trishe: 'trishe',
  Ariane: 'arianne',
  Renz: 'renz',
}

const clientAliases = {
  'breathefree': 'Breathfree',
  'cook and pan': 'Cook&Pan',
  'ddu ads': 'DDU Agency Ads',
  'francis': 'Francis by FB',
  'fyne': 'Fyne Supplements',
  'meroda': 'Meroda Cosmetics',
  'moov': 'Moov Germany',
  'profa-clean': 'ProfaClean',
  'tibakids': 'Tiba Kids',
  'tibatoes': 'Tiba Toes',
  'tt': 'Tiba Toes',
  'track a cell': 'Track A Cell',
  'virage': 'Virage London',
}

function clientLookupName(rawName) {
  const cleaned = rawName.trim()
    .replace(/\s*-\s*(elish support|support elish|support|assist|with alex|pause|under discussion|not started|delayed tasks|delayed|confirm volume).*$/i, '')
    .trim()
  return clientAliases[cleaned.toLowerCase()] || cleaned
}

const people = [
  ...state.strategists.map(person => ({ ...person, discipline: 'creative_strategist' })),
  ...state.designers.map(person => ({ ...person, discipline: 'designer' })),
  ...state.editors.map(person => ({ ...person, discipline: 'editor' })),
  ...state.ugcManagers.map(person => ({ ...person, discipline: 'ugc_manager' })),
]

const personRows = people.map(person => {
  const profileName = profileAliases[person.name]
  const profileLookup = profileName
    ? `(select id from public.profiles where is_active is true and lower(full_name) = lower(${quote(profileName)}) limit 1)`
    : 'null'
  const isActive = profileName
    ? `exists (select 1 from public.profiles where is_active is true and lower(full_name) = lower(${quote(profileName)}))`
    : 'false'
  return `(${quote(person.id)}, ${profileLookup}, ${quote(person.name)}, ${quote(person.discipline)}, ${person.dailyCapacity ?? 'null'}, ${person.maxClients ?? 'null'}, ${isActive}, 'legacy_design_cs')`
}).join(',\n  ')

const monthRows = months.map(month => (
  `(${quote(`${month.id}-01`)}::date, ${quote(month.label)}, ${Number(state.workingDaysPerMonth || 22)}, 'legacy_design_cs')`
)).join(',\n  ')

const allocationRows = months.flatMap(month => month.groups.flatMap(group => group.brands.map(brand => {
  const lookupName = clientLookupName(brand.name)
  return `(${quote(`${month.id}-01`)}::date, ${quote(brand.id)}, ${quote(lookupName)}, ${quote(brand.name.trim())}, ${nullableQuote(group.strategistId)}, ${Number(brand.statics || 0)}, ${Number(brand.videos || 0)}, ${textArray(brand.designerIds)}, ${textArray(brand.editorIds)}, ${textArray(brand.ugcManagerIds)}, ${Boolean(brand.ugcEnabled)})`
}))).join(',\n  ')

const payload = JSON.stringify(source)
if (payload.includes('$design_cs$')) throw new Error('Unexpected dollar-quote token in source payload')

const sql = `-- Generated from the legacy Design/CS Vercel KV export.
-- This migration is additive: conflicts are left untouched and the complete
-- source payload is retained as an immutable recovery snapshot.

insert into public.design_cs_import_snapshots (
  source_url, source_version, source_current_month, payload
) values (
  'https://design-cs.vercel.app/api/data',
  ${Number(state.version || 0)},
  ${quote(state.currentMonthId)},
  $design_cs$${payload}$design_cs$::jsonb
);

insert into public.design_cs_people (
  source_key, profile_id, display_name, discipline, daily_capacity, max_clients, is_active, source
) values
  ${personRows}
on conflict (source_key) do nothing;

insert into public.design_cs_months (month_start, label, working_days, source)
values
  ${monthRows}
on conflict (month_start) do nothing;

with legacy_rows (
  month_start, source_key, client_lookup_name, client_name_snapshot,
  strategist_key, statics, videos, designer_keys, editor_keys,
  ugc_manager_keys, ugc_enabled
) as (
  values
  ${allocationRows}
)
insert into public.design_cs_allocations (
  month_start, source_key, client_id, client_name_snapshot, strategist_key,
  statics, videos, designer_keys, editor_keys, ugc_manager_keys, ugc_enabled
)
select
  row.month_start,
  row.source_key,
  (
    select client.id
    from public.clients client
    where lower(trim(client.name)) = lower(trim(row.client_lookup_name))
    order by (client.is_active is true and coalesce(client.is_archived, false) is false) desc, client.created_at desc nulls last
    limit 1
  ),
  row.client_name_snapshot,
  row.strategist_key,
  row.statics,
  row.videos,
  row.designer_keys,
  row.editor_keys,
  row.ugc_manager_keys,
  row.ugc_enabled
from legacy_rows row
on conflict (month_start, source_key) do nothing;
`

await writeFile(outputPath, sql)
console.log(JSON.stringify({
  outputPath,
  people: people.length,
  months: months.length,
  allocations: months.reduce((sum, month) => sum + month.groups.reduce((groupSum, group) => groupSum + group.brands.length, 0), 0),
}))

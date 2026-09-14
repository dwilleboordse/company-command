import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const css = readFileSync(new URL('../components/PlanDashboard.css', import.meta.url), 'utf8')

function declarations(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const rule = css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))
  assert.ok(rule, `Missing scoped rule: ${selector}`)
  return Object.fromEntries(rule[1].split(';').filter(value => value.trim()).map(value => {
    const colon = value.indexOf(':')
    return [value.slice(0, colon).trim(), value.slice(colon + 1).trim()]
  }))
}

test('plan dropdown keeps one theme-provided arrow with text clearance', () => {
  const style = declarations('.plan-dashboard-filter select')
  assert.equal(style.background, undefined, 'Background shorthand must not reset the shared select arrow')
  assert.equal(style['background-image'], undefined, 'The shared theme owns the arrow image')
  assert.equal(style['background-color'], 'var(--bg-card)')
  assert.equal(style['background-repeat'], 'no-repeat')
  assert.equal(style['background-position'], 'right 10px center')
  assert.equal(style['background-size'], '12px 12px')
  assert.ok(Number.parseFloat(style['padding-right']) >= 32, 'Leave enough room for the arrow')
})

test('plan dropdown retains a visible focus border and ring', () => {
  const style = declarations('.plan-dashboard-filter select:focus')
  assert.equal(style['border-color'], 'var(--accent)')
  assert.match(style['box-shadow'], /0 0 0 3px/)
  assert.notEqual(style.outline, 'none')
})

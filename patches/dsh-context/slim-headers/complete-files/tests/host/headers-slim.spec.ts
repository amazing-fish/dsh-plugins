import assert from 'node:assert/strict'
import { test } from 'vitest'
import { createContextHeadersDefinition } from '../../src/host/headers'
import { driveTimeline } from './helpers/projection'
import { header } from './helpers/events'

test('a legacy v1 row serves a bounded envelope without migration or tool attribution work', () => {
  let slim = true
  let resolutions = 0
  const def = createContextHeadersDefinition(() => { resolutions++; return 'owner' }, () => slim)
  const state = { headers: Array.from({ length: 50 }, (_, i) => ({
    seq: i + 1, time: 1700000000000 + i, system: 'legacy system',
    tools: Array.from({ length: 100 }, (_, j) => ({ name: `tool_${j}`, tokens: j + 1, schema: { type: 'object' } })),
  })) }
  const before = JSON.stringify(state)
  const value = def.wire.viewSchema.parse(def.wire.view(def.stateSchema.parse(state)))
  assert.equal(def.stateVersion, 1)
  assert.equal(value.epochCount, 50)
  assert.equal(value.detail, true)
  assert.equal(value.headers.length, 3)
  assert.equal(value.headers[0].seq, 48)
  assert.equal(value.headers[0].toolCount, 100)
  assert.equal(value.headers[0].totalToolTokens, 5050)
  assert.deepEqual(value.headers[0].tools, [])
  assert.ok(value.headers[0].systemTokens! > 0)
  assert.ok(Buffer.byteLength(JSON.stringify(value)) <= 2048)
  assert.equal(resolutions, 0)
  assert.equal(JSON.stringify(state), before)
  slim = false
  const inline = def.wire.view(state)
  assert.equal(inline.headers.length, 50)
  assert.equal(inline.headers[0].tools.length, 100)
  assert.equal(inline.headers[0].tools[0].plugin, 'owner')
  assert.equal(inline.detail, undefined)
})

test('empty split state and newly appended epochs keep the v1 state and original revision semantics', () => {
  const def = createContextHeadersDefinition(undefined, () => true)
  assert.deepEqual(def.wire.view(def.init()), { epochCount: 0, detail: true, headers: [] })
  const event = header(1, { tools: [{ name: 'tool', description: 'first' }] })
  const state = def.apply(def.init(), event as never)
  assert.equal(def.wire.view(state).headers[0].toolCount, 1)
  const events = [event, header(2, { tools: [{ name: 'other', description: 'second' }] })]
  const folded = driveTimeline(events)
  assert.equal(folded.state.detailRev, undefined, 'headers use their event seq without changing persisted counters')
})

test('v28 checkpoint resume and a cold refold keep comparable detail revisions', () => {
  const events = Array.from({ length: 45 }, (_, i) => header(i + 1, { tools: [{ name: `tool_${i}` }] }))
  const { def, state } = driveTimeline(events)
  // A pre-upgrade v28 checkpoint did not count these header-only events.
  const cached = { ...state, detailRev: 0 }
  const next = header(46, { tools: [{ name: 'new_tool' }] })
  const resumed = def.apply(cached, next)
  const cold = driveTimeline([...events, next]).state
  assert.equal(cold.detailRev ?? 0, resumed.detailRev ?? 0)
})

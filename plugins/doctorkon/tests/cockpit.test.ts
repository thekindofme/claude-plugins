import { describe, expect, test } from 'claude-code/testing'

import type { Action, Cockpit, Decision } from '../types'
import { EMPTY, hhmm, parseAsk, parseBrief, parseKey, queueTag, ranked, recapDue, reduce, waiting } from '../hooks/cockpit'

function decision(id: string, over: Partial<Decision> = {}): Decision {
  return {
    id,
    title: `Title ${id}`,
    session: `s-${id}`,
    urgency: 1,
    badge: 'normal',
    context: `Context ${id}`,
    options: ['Go', 'Hold'],
    urgent: false,
    at: 100,
    ...over,
  }
}

function run(...actions: Action[]): Cockpit {
  return actions.reduce(reduce, { ...EMPTY, on: true })
}

const acme = decision('acme', { title: 'Acme onboarding', session: 'gw-dev', at: 10 })
const deploy = decision('deploy', { title: 'Prod deploy', session: 'gw-prod', urgency: 3, urgent: true, at: 20 })

describe('pain 1: updates never move the pinned decision', () => {
  test('a new status brief leaves pinned, parked and drafts alone', () => {
    const before = run({ t: 'ask', decision: acme }, { t: 'draft', id: 'acme', text: 'half typed' })
    const brief = { summary: 'PR 12 is merged.', highlights: [{ kind: 'shipped' as const, text: 'PR 12 merged' }], at: 30 }
    const after = reduce(before, { t: 'brief', brief })
    expect(after.pinned).toBe('acme')
    expect(after.parked).toEqual([])
    expect(after.drafts).toEqual({ acme: 'half typed' })
    expect(after.brief).toEqual(brief)
  })

  test('a second non-urgent ask queues behind the pinned one', () => {
    const s = run({ t: 'ask', decision: acme }, { t: 'ask', decision: decision('later', { urgency: 3, at: 5 }) })
    expect(s.pinned).toBe('acme')
    expect(s.interrupt).toBe(null)
    expect(ranked(s).map(d => d.id)).toEqual(['later', 'acme'])
  })
})

describe('pain 2: status is visible without asking', () => {
  test('a new brief is fresh until the person next submits, and waiting excludes the pinned one', () => {
    const s = run(
      { t: 'brief', brief: { summary: 'Done.', highlights: [], at: 1 } },
      { t: 'ask', decision: acme },
      { t: 'ask', decision: decision('later') },
    )
    expect(s.briefFresh).toBe(true)
    expect(waiting(s)).toBe(1)
    expect(reduce(s, { t: 'seen' }).briefFresh).toBe(false)
  })

  test('the recap reply parses into at most two sentences and five known highlights', () => {
    const reply = `Sure:
{"summary": "Plugins are published. The pane is being redesigned. Tests pass.",
 "highlights": [
  {"kind": "shipped", "text": "doctorkon 1.0.1 published"},
  {"kind": "problem", "text": "dev copy deleted by accident"},
  {"kind": "noise", "text": "read a file"},
  {"kind": "blocked", "text": "a"}, {"kind": "blocked", "text": "b"}, {"kind": "blocked", "text": "c"}, {"kind": "blocked", "text": "d"}
 ]}`
    expect(parseBrief(reply, 7)).toEqual({
      summary: 'Plugins are published. The pane is being redesigned.',
      highlights: [
        { kind: 'shipped', text: 'doctorkon 1.0.1 published' },
        { kind: 'problem', text: 'dev copy deleted by accident' },
        { kind: 'blocked', text: 'a' },
        { kind: 'blocked', text: 'b' },
        { kind: 'blocked', text: 'c' },
      ],
      at: 7,
    })
    expect(parseBrief('no json here', 7)).toBe(undefined)
    expect(parseBrief('{"summary": ""}', 7)).toBe(undefined)
  })

  test('a recap runs at once, then at most every two minutes', () => {
    expect(recapDue(null, 0)).toBe(true)
    expect(recapDue(0, 119_999)).toBe(false)
    expect(recapDue(0, 120_000)).toBe(true)
  })

  test('status times read as HH:MM in the given offset', () => {
    expect(hhmm(Date.UTC(2026, 9, 9, 3, 7), 600)).toBe('13:07')
    expect(hhmm(Date.UTC(2026, 9, 9, 23, 30), 660)).toBe('10:30')
    expect(hhmm(Date.UTC(2026, 9, 9, 0, 5), -300)).toBe('19:05')
  })

  test('queue tags colour by meaning', () => {
    const s = run(
      { t: 'ask', decision: acme },
      { t: 'ask', decision: deploy },
      { t: 'ask', decision: decision('cust', { badge: 'customers' }) },
      { t: 'ask', decision: decision('idle', { badge: 'idle' }) },
      { t: 'ask', decision: decision('rel', { urgency: 3, badge: 'tenant waiting' }) },
    )
    expect(ranked(s).map(d => queueTag(s, d))).toEqual([
      { text: 'urgent', tone: 'urgent' },
      { text: 'tenant waiting', tone: 'release' },
      { text: 'pinned', tone: 'pinned' },
      { text: 'customers', tone: 'customers' },
      { text: 'idle', tone: 'dim' },
    ])
  })
})

describe('pain 3: an urgent ask is flagged, not swapped in', () => {
  test('urgent ask while something is pinned sets interrupt and keeps pinned', () => {
    const s = run({ t: 'ask', decision: acme }, { t: 'ask', decision: deploy })
    expect(s.pinned).toBe('acme')
    expect(s.interrupt).toBe('deploy')
    expect(ranked(s).map(d => d.id)).toEqual(['deploy', 'acme'])
  })

  test('urgent ask with nothing pinned pins it directly', () => {
    const s = run({ t: 'ask', decision: deploy })
    expect(s.pinned).toBe('deploy')
    expect(s.interrupt).toBe(null)
  })
})

describe('pain 4: coming back keeps context and draft', () => {
  const base: Action[] = [
    { t: 'ask', decision: acme },
    { t: 'draft', id: 'acme', text: 'ship after the' },
    { t: 'ask', decision: deploy },
  ]

  test('switch parks the current decision with its draft kept', () => {
    const s = run(...base, { t: 'switch' })
    expect(s.pinned).toBe('deploy')
    expect(s.parked).toEqual(['acme'])
    expect(s.interrupt).toBe(null)
    expect(s.drafts).toEqual({ acme: 'ship after the' })
  })

  test('answering the interrupt auto-returns to the parked decision, draft intact', () => {
    const s = run(...base, { t: 'switch' }, { t: 'answer', id: 'deploy', choice: 'Go', at: 50 })
    expect(s.pinned).toBe('acme')
    expect(s.parked).toEqual([])
    expect(s.drafts).toEqual({ acme: 'ship after the' })
    expect(s.decisions.map(d => d.id)).toEqual(['acme'])
  })

  test('a card that comes back from the stack with a draft is marked resumed', () => {
    const s = run(...base, { t: 'switch' }, { t: 'answer', id: 'deploy', choice: 'Go', at: 50 })
    expect(s.resumed).toBe('acme')
    expect(s.lastAnswered).toEqual({ title: 'Prod deploy', at: 50 })
    const after = reduce(reduce(s, { t: 'brief', brief: { summary: 'x.', highlights: [], at: 60 } }), { t: 'seen' })
    expect(after.resumed).toBe('acme')
    expect(after.lastAnswered).toEqual({ title: 'Prod deploy', at: 50 })
  })

  test('the next stack move clears the answered marker, and clearing the draft clears resumed', () => {
    const s = run(...base, { t: 'switch' }, { t: 'answer', id: 'deploy', choice: 'Go', at: 50 })
    const asked = reduce(s, { t: 'ask', decision: decision('next') })
    expect(asked.lastAnswered).toBe(null)
    expect(asked.resumed).toBe('acme')
    expect(reduce(s, { t: 'draft', id: 'acme', text: '' }).resumed).toBe(null)
  })

  test('a card without a draft, or answered with nothing parked, is not marked', () => {
    const s = run({ t: 'ask', decision: acme }, { t: 'ask', decision: deploy }, { t: 'switch' }, { t: 'back' })
    expect(s.resumed).toBe(null)
    const plain = run({ t: 'ask', decision: acme }, { t: 'ask', decision: decision('next') }, { t: 'answer', id: 'acme', choice: 'Go', at: 9 })
    expect(plain.lastAnswered).toBe(null)
    expect(plain.resumed).toBe(null)
  })

  test('back pops the parked decision and the current one returns to the queue', () => {
    const s = run(...base, { t: 'switch' }, { t: 'back' })
    expect(s.pinned).toBe('acme')
    expect(s.parked).toEqual([])
    expect(s.decisions.map(d => d.id)).toEqual(['acme', 'deploy'])
    expect(s.drafts).toEqual({ acme: 'ship after the' })
  })

  test('answering with nothing parked auto-pins the top of the queue', () => {
    const s = run({ t: 'ask', decision: acme }, { t: 'ask', decision: decision('next', { urgency: 2 }) }, { t: 'answer', id: 'acme', choice: 'Hold', at: 9 })
    expect(s.pinned).toBe('next')
  })
})

describe('idempotent re-ask', () => {
  test('the same ask twice equals asking once', () => {
    const once = run({ t: 'ask', decision: acme }, { t: 'ask', decision: deploy })
    const twice = reduce(reduce(once, { t: 'ask', decision: acme }), { t: 'ask', decision: deploy })
    expect(twice).toEqual(once)
  })

  test('a re-ask updates the card in place without moving pin or age', () => {
    const s = run({ t: 'ask', decision: acme }, { t: 'ask', decision: { ...acme, context: 'New facts', at: 999 } })
    expect(s.pinned).toBe('acme')
    expect(s.decisions).toEqual([{ ...acme, context: 'New facts', at: 10 }])
  })

  test('resolve withdraws a decision and its draft', () => {
    const s = run({ t: 'ask', decision: acme }, { t: 'draft', id: 'acme', text: 'x' }, { t: 'resolve', id: 'acme' })
    expect(s.pinned).toBe(null)
    expect(s.decisions).toEqual([])
    expect(s.drafts).toEqual({})
  })
})

describe('boundary parsing', () => {
  test('prompt keys', () => {
    expect(parseKey('1')).toEqual({ t: 'option', index: 0 })
    expect(parseKey(' i ')).toEqual({ t: 'switch' })
    expect(parseKey('b')).toEqual({ t: 'back' })
    expect(parseKey('10')).toBe(undefined)
    expect(parseKey('ib')).toBe(undefined)
  })

  test('ask input is validated', () => {
    expect(parseAsk({ id: 'a', title: 't', session: 's', context: 'c', urgency: 5, options: ['x'] }, 1)).toEqual({
      ok: false,
      error: 'urgency must be 0, 1, 2 or 3',
    })
    expect(parseAsk({ id: 'a', title: 't', session: 's', context: 'c', urgency: 2, options: ['x', ''] }, 7)).toEqual({
      ok: true,
      value: { id: 'a', title: 't', session: 's', context: 'c', urgency: 2, badge: 'high', options: ['x'], urgent: false, at: 7 },
    })
  })
})

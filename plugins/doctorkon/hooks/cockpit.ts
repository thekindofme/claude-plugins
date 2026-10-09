import type { Action, Cockpit, Decision, Kind, Status, Urgency } from '../types'

export const STATUS_CAP = 200

export const EMPTY: Cockpit = {
  on: false,
  statuses: [],
  decisions: [],
  pinned: null,
  parked: [],
  interrupt: null,
  drafts: {},
  seenId: 0,
  nextId: 1,
  resumed: null,
  lastAnswered: null,
}

export function ranked(s: Cockpit): Decision[] {
  return s.decisions.slice().sort(
    (a, b) =>
      Number(b.id === s.interrupt) - Number(a.id === s.interrupt) ||
      b.urgency - a.urgency ||
      a.at - b.at,
  )
}

export function byId(s: Cockpit, id: string | null): Decision | undefined {
  return id === null ? undefined : s.decisions.find(d => d.id === id)
}

export function unread(s: Cockpit): number {
  return s.statuses.filter(x => x.id > s.seenId).length
}

export type Glance = { shipped: number; stuck: number; errored: number; waiting: number; fresh: number }

export function glance(s: Cockpit): Glance {
  const count = (k: Kind) => s.statuses.filter(x => x.kind === k).length
  return {
    shipped: count('shipped'),
    stuck: count('stuck'),
    errored: count('errored'),
    waiting: s.decisions.filter(d => d.id !== s.pinned).length,
    fresh: unread(s),
  }
}

export type Tone = 'urgent' | 'pinned' | 'release' | 'customers' | 'dim'

export function queueTag(s: Cockpit, d: Decision): { text: string; tone: Tone } {
  if (d.id === s.interrupt) return { text: 'urgent', tone: 'urgent' }
  if (d.id === s.pinned) return { text: 'pinned', tone: 'pinned' }
  if (d.urgency === 3 || /release/i.test(d.badge)) return { text: d.badge, tone: 'release' }
  if (/customer/i.test(d.badge)) return { text: d.badge, tone: 'customers' }
  return { text: d.badge, tone: 'dim' }
}

export function hhmm(ms: number, offsetMinutes: number): string {
  const minutes = Math.floor(ms / 60000) + offsetMinutes
  const day = ((minutes % 1440) + 1440) % 1440
  return `${String(Math.floor(day / 60)).padStart(2, '0')}:${String(day % 60).padStart(2, '0')}`
}

export function clip(text: string, max: number): string {
  if (max <= 1) return text.slice(0, Math.max(0, max))
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function withoutId(list: string[], id: string): string[] {
  return list.filter(x => x !== id)
}

function withoutDraft(drafts: Record<string, string>, id: string): Record<string, string> {
  const { [id]: _gone, ...rest } = drafts
  return rest
}

function autoPin(s: Cockpit): Cockpit {
  if (s.pinned !== null) return s
  const top = ranked(s)[0]
  if (top === undefined) return s
  return { ...s, pinned: top.id, interrupt: s.interrupt === top.id ? null : s.interrupt }
}

function pin(s: Cockpit, id: string): Cockpit {
  if (s.pinned === id || byId(s, id) === undefined) return s
  const parked = withoutId(s.parked, id)
  return {
    ...s,
    pinned: id,
    parked: s.pinned === null ? parked : [...parked, s.pinned],
    interrupt: s.interrupt === id ? null : s.interrupt,
  }
}

function logStatus(s: Cockpit, entry: Omit<Status, 'id'>): Cockpit {
  const status: Status = { id: s.nextId, ...entry }
  return { ...s, statuses: [status, ...s.statuses].slice(0, STATUS_CAP), nextId: s.nextId + 1 }
}

function drop(s: Cockpit, id: string): Cockpit {
  const parked = withoutId(s.parked, id)
  const wasPinned = s.pinned === id
  return autoPin({
    ...s,
    decisions: s.decisions.filter(d => d.id !== id),
    drafts: withoutDraft(s.drafts, id),
    parked: wasPinned ? parked.slice(0, -1) : parked,
    pinned: wasPinned ? (parked[parked.length - 1] ?? null) : s.pinned,
    interrupt: s.interrupt === id ? null : s.interrupt,
  })
}

function step(s: Cockpit, a: Action): Cockpit {
  switch (a.t) {
    case 'toggle':
      return { ...s, on: a.on }
    case 'status':
      return logStatus(s, {
        kind: a.kind,
        session: a.session,
        text: a.text,
        at: a.at,
        ...(a.detail === undefined ? {} : { detail: a.detail }),
      })
    case 'ask': {
      const prior = byId(s, a.decision.id)
      if (prior !== undefined) {
        const decisions = s.decisions.map(d => (d.id === prior.id ? { ...a.decision, at: prior.at } : d))
        const turnedUrgent = a.decision.urgent && !prior.urgent && s.pinned !== prior.id
        return { ...s, decisions, interrupt: turnedUrgent ? prior.id : s.interrupt }
      }
      const next = { ...s, decisions: [...s.decisions, a.decision] }
      if (a.decision.urgent && s.pinned !== null) return { ...next, interrupt: a.decision.id }
      return autoPin(next)
    }
    case 'resolve':
      return byId(s, a.id) === undefined ? s : drop(s, a.id)
    case 'pin':
      return pin(s, a.id)
    case 'switch':
      return s.interrupt === null ? s : pin(s, s.interrupt)
    case 'back': {
      const top = s.parked[s.parked.length - 1]
      if (top === undefined) return s
      return { ...s, pinned: top, parked: s.parked.slice(0, -1) }
    }
    case 'draft': {
      if (byId(s, a.id) === undefined) return s
      return { ...s, drafts: a.text === '' ? withoutDraft(s.drafts, a.id) : { ...s.drafts, [a.id]: a.text } }
    }
    case 'answer': {
      const d = byId(s, a.id)
      if (d === undefined) return s
      const logged = logStatus(s, { kind: 'answered', session: d.session, text: `${d.title}: ${a.choice}`, at: a.at })
      const popped = d.id === s.pinned && s.parked.length > 0
      return { ...drop(logged, a.id), lastAnswered: popped ? { title: d.title, at: a.at } : null }
    }
    case 'seen':
      return { ...s, seenId: s.nextId - 1 }
  }
}

const STACK_MOVES: ReadonlySet<Action['t']> = new Set(['ask', 'resolve', 'pin', 'switch', 'back'])

export function reduce(s: Cockpit, a: Action): Cockpit {
  const next = step(s, a)
  const candidate = next.pinned === s.pinned ? s.resumed : next.pinned !== null && s.parked.includes(next.pinned) ? next.pinned : null
  return {
    ...next,
    resumed: candidate !== null && next.drafts[candidate] !== undefined ? candidate : null,
    lastAnswered: STACK_MOVES.has(a.t) ? null : next.lastAnswered,
  }
}

export function answerPrompt(d: Decision, choice: string): string {
  return `[doctorkon] ${d.session} / ${d.title}: ${choice}`
}

export type Key = { t: 'option'; index: number } | { t: 'switch' } | { t: 'back' }

export function parseKey(text: string): Key | undefined {
  const typed = text.trim()
  if (/^[1-9]$/.test(typed)) return { t: 'option', index: Number(typed) - 1 }
  if (typed === 'i') return { t: 'switch' }
  if (typed === 'b') return { t: 'back' }
  return undefined
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

const KINDS: readonly Kind[] = ['shipped', 'stuck', 'errored', 'needs']

function text(raw: Record<string, unknown>, key: string, max: number): string | undefined {
  const v = raw[key]
  return typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, max) : undefined
}

export function parseStatus(raw: Record<string, unknown>): Parsed<{ kind: Kind; session: string; text: string; detail?: string }> {
  const kind = KINDS.find(k => k === raw.kind)
  const session = text(raw, 'session', 60)
  const body = text(raw, 'text', 300)
  if (kind === undefined) return { ok: false, error: `kind must be one of ${KINDS.join(', ')}` }
  if (session === undefined) return { ok: false, error: 'session is required' }
  if (body === undefined) return { ok: false, error: 'text is required' }
  const detail = text(raw, 'detail', 2000)
  return { ok: true, value: { kind, session, text: body, ...(detail === undefined ? {} : { detail }) } }
}

export function parseAsk(raw: Record<string, unknown>, at: number): Parsed<Decision> {
  const id = text(raw, 'id', 80)
  const title = text(raw, 'title', 120)
  const session = text(raw, 'session', 60)
  const context = text(raw, 'context', 600)
  const urgency = raw.urgency
  const options = Array.isArray(raw.options)
    ? raw.options.filter((o): o is string => typeof o === 'string' && o.trim() !== '').map(o => o.trim().slice(0, 80))
    : []
  if (id === undefined) return { ok: false, error: 'id is required' }
  if (title === undefined) return { ok: false, error: 'title is required' }
  if (session === undefined) return { ok: false, error: 'session is required' }
  if (context === undefined) return { ok: false, error: 'context is required' }
  if (urgency !== 0 && urgency !== 1 && urgency !== 2 && urgency !== 3) return { ok: false, error: 'urgency must be 0, 1, 2 or 3' }
  if (options.length < 1 || options.length > 9) return { ok: false, error: 'options must hold 1 to 9 non-empty strings' }
  return {
    ok: true,
    value: {
      id,
      title,
      session,
      context,
      urgency: urgency as Urgency,
      badge: text(raw, 'badge', 24) ?? ['low', 'normal', 'high', 'release'][urgency] ?? 'normal',
      options,
      urgent: raw.urgent === true,
      at,
    },
  }
}

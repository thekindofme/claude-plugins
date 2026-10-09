import type { Action, Brief, Cockpit, Decision, Highlight, Kind, Saved, Urgency } from '../types'

export const HIGHLIGHT_CAP = 5

export const EMPTY: Cockpit = {
  on: false,
  brief: null,
  briefFresh: false,
  decisions: [],
  pinned: null,
  parked: [],
  interrupt: null,
  drafts: {},
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

export function waiting(s: Cockpit): number {
  return s.decisions.filter(d => d.id !== s.pinned).length
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
    case 'brief':
      return { ...s, brief: a.brief, briefFresh: true }
    case 'restore':
      return s.decisions.length > 0 || s.brief !== null ? s : { ...s, ...a.saved, briefFresh: false }
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
      const popped = d.id === s.pinned && s.parked.length > 0
      return { ...drop(s, a.id), lastAnswered: popped ? { title: d.title, at: a.at } : null }
    }
    case 'seen':
      return { ...s, briefFresh: false }
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

function text(raw: Record<string, unknown>, key: string, max: number): string | undefined {
  const v = raw[key]
  return typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, max) : undefined
}

export function saved(s: Cockpit): Saved {
  return { on: s.on, brief: s.brief, decisions: s.decisions, pinned: s.pinned, parked: s.parked, interrupt: s.interrupt, drafts: s.drafts }
}

// Parsed at the boundary: the store is a JSON file anyone can edit, and older versions wrote other shapes.
export function parseSaved(raw: unknown): Saved | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const r = raw as Record<string, unknown>
  if (!Array.isArray(r.decisions)) return undefined
  const decisions = r.decisions.flatMap((d): Decision[] => {
    if (typeof d !== 'object' || d === null) return []
    const parsed = parseAsk(d as Record<string, unknown>, typeof (d as Record<string, unknown>).at === 'number' ? ((d as Record<string, unknown>).at as number) : 0)
    return parsed.ok ? [parsed.value] : []
  })
  const ids = new Set(decisions.map(d => d.id))
  const known = (v: unknown): string | null => (typeof v === 'string' && ids.has(v) ? v : null)
  const brief = typeof r.brief === 'object' && r.brief !== null ? parseBrief(JSON.stringify(r.brief), Number((r.brief as Record<string, unknown>).at) || 0) : undefined
  const drafts = typeof r.drafts === 'object' && r.drafts !== null ? (r.drafts as Record<string, unknown>) : {}
  return {
    on: r.on === true,
    brief: brief ?? null,
    decisions,
    pinned: known(r.pinned),
    parked: Array.isArray(r.parked) ? r.parked.flatMap(x => (known(x) === null ? [] : [x as string])) : [],
    interrupt: known(r.interrupt),
    drafts: Object.fromEntries(Object.entries(drafts).filter(([k, v]) => ids.has(k) && typeof v === 'string')) as Record<string, string>,
  }
}

export function stalePrompt(decisions: readonly Decision[]): string {
  return [
    'doctorkon restored these open decisions after a restart:',
    ...decisions.map(d => `- ${d.id}: ${d.title} (${d.context})`),
    'Using this conversation, list the ids that no longer need the person: already answered or decided, done, withdrawn, or overtaken by events.',
    'Keep any you are unsure about. Answer with JSON only, no code fence: {"stale": ["id", ...]}.',
  ].join('\n')
}

export function parseStale(reply: string, ids: readonly string[]): string[] {
  const start = reply.indexOf('{')
  const end = reply.lastIndexOf('}')
  if (start < 0 || end <= start) return []
  try {
    const raw = JSON.parse(reply.slice(start, end + 1)) as { stale?: unknown }
    return Array.isArray(raw.stale) ? ids.filter(id => (raw.stale as unknown[]).includes(id)) : []
  } catch {
    return []
  }
}

export const RECAP_EVERY_MS = 2 * 60 * 1000

export function recapDue(lastAt: number | null, now: number): boolean {
  return lastAt === null || now - lastAt >= RECAP_EVERY_MS
}

export const RECAP_PROMPT = [
  'Write the status of this session for a person glancing at a side panel, the way /recap would.',
  'Answer with JSON only, no code fence: {"summary": string, "highlights": [{"kind": "shipped" | "problem" | "blocked", "text": string}]}.',
  'summary: at most two short sentences on where the work stands now and what happens next.',
  'highlights: at most 5, most important first. Only things that matter: something shipped, published or verified; a serious bug or failure; something deleted or broken by accident; a hard blocker. Never routine steps, reads, checks or plans, and never a decision still waiting on the person: the panel below already lists those.',
  'Each highlight is one line under 90 characters. The person\'s answers to [doctorkon] decisions count when they changed the plan.',
].join(' ')

const HIGHLIGHT_KINDS: readonly Kind[] = ['shipped', 'problem', 'blocked']

function sentences(text: string, max: number): string {
  const parts = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [text]
  return parts.slice(0, max).join('').trim()
}

export function parseBrief(reply: string, at: number): Brief | undefined {
  const start = reply.indexOf('{')
  const end = reply.lastIndexOf('}')
  if (start < 0 || end <= start) return undefined
  let raw: unknown
  try {
    raw = JSON.parse(reply.slice(start, end + 1))
  } catch {
    return undefined
  }
  if (typeof raw !== 'object' || raw === null) return undefined
  const r = raw as Record<string, unknown>
  if (typeof r.summary !== 'string' || r.summary.trim() === '') return undefined
  const highlights: Highlight[] = (Array.isArray(r.highlights) ? r.highlights : [])
    .flatMap((h): Highlight[] => {
      if (typeof h !== 'object' || h === null) return []
      const { kind, text: body } = h as Record<string, unknown>
      const k = HIGHLIGHT_KINDS.find(x => x === kind)
      return k !== undefined && typeof body === 'string' && body.trim() !== '' ? [{ kind: k, text: body.trim().slice(0, 140) }] : []
    })
    .slice(0, HIGHLIGHT_CAP)
  return { summary: sentences(r.summary.trim(), 2).slice(0, 400), highlights, at }
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

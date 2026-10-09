export type Kind = 'shipped' | 'problem' | 'blocked'

export type Highlight = { kind: Kind; text: string }

export type Brief = {
  summary: string
  highlights: Highlight[]
  at: number
}

export type Urgency = 0 | 1 | 2 | 3

export type Decision = {
  id: string
  title: string
  session: string
  urgency: Urgency
  badge: string
  context: string
  options: string[]
  urgent: boolean
  at: number
}

export type Cockpit = {
  on: boolean
  brief: Brief | null
  briefFresh: boolean
  decisions: Decision[]
  pinned: string | null
  parked: string[]
  interrupt: string | null
  drafts: Record<string, string>
  resumed: string | null
  lastAnswered: { title: string; at: number } | null
}

export type Saved = Pick<Cockpit, 'on' | 'brief' | 'decisions' | 'pinned' | 'parked' | 'interrupt' | 'drafts'>

export type Action =
  | { t: 'toggle'; on: boolean }
  | { t: 'brief'; brief: Brief }
  | { t: 'restore'; saved: Saved }
  | { t: 'ask'; decision: Decision }
  | { t: 'resolve'; id: string }
  | { t: 'pin'; id: string }
  | { t: 'switch' }
  | { t: 'back' }
  | { t: 'draft'; id: string; text: string }
  | { t: 'answer'; id: string; choice: string; at: number }
  | { t: 'seen' }

declare module 'claude-code' {
  interface PluginState {
    doctorkon: { cockpit: Cockpit }
  }
}

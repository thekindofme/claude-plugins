export type Kind = 'shipped' | 'stuck' | 'errored' | 'needs' | 'answered'

export type Status = {
  id: number
  kind: Kind
  session: string
  text: string
  detail?: string
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
  statuses: Status[]
  decisions: Decision[]
  pinned: string | null
  parked: string[]
  interrupt: string | null
  drafts: Record<string, string>
  seenId: number
  nextId: number
  resumed: string | null
  lastAnswered: { title: string; at: number } | null
}

export type Action =
  | { t: 'toggle'; on: boolean }
  | { t: 'status'; kind: Kind; session: string; text: string; detail?: string; at: number }
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

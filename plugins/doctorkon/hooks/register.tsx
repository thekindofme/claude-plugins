import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Action, Cockpit, Decision, Kind } from '../types'
import {
  EMPTY,
  answerPrompt,
  byId,
  clip,
  hhmm,
  parseAsk,
  parseBrief,
  parseKey,
  parseSaved,
  parseStale,
  queueTag,
  RECAP_EVERY_MS,
  RECAP_PROMPT,
  ranked,
  recapDue,
  reduce,
  saved,
  stalePrompt,
  waiting,
} from './cockpit'
import type { Tone } from './cockpit'

const PANE = 'doctorkon'
const TOOL = {
  ask: 'mcp__doctorkon__doctorkon_ask',
  resolve: 'mcp__doctorkon__doctorkon_resolve',
} as const

const cockpit = atom({ plugin: 'doctorkon', key: 'cockpit' } as const, EMPTY)

// Theme keys, not hex, so the cockpit follows the person's light or dark theme.
const C = {
  line: 'subtle',
  fg: 'text',
  dim: 'inactive',
  context: 'text',
  title: 'text',
  blue: 'permission',
  shipped: 'success',
  stuck: 'warning',
  errored: 'error',
  needs: 'merged',
  urgentBg: 'diffRemovedDimmed',
  urgentFg: 'error',
  ink: 'inverseText',
  badgeBg: 'userMessageBackground',
  badgeFg: 'merged',
  unread: 'userMessageBackground',
} as const

const GLYPH: Record<Kind, { glyph: string; color: string }> = {
  shipped: { glyph: '✓', color: C.shipped },
  problem: { glyph: '✗', color: C.errored },
  blocked: { glyph: '‖', color: C.stuck },
}

const TONE: Record<Tone, string> = {
  urgent: C.urgentFg,
  pinned: C.blue,
  release: C.errored,
  customers: C.stuck,
  dim: C.dim,
}

// No timezone API on $.clock; Date still carries the host offset.
function clock(ms: number): string {
  return hhmm(ms, -new Date(ms).getTimezoneOffset())
}

const SYSTEM = [
  'doctorkon cockpit is on. The person reads a pinned decision card above the prompt and a status summary in a side pane that doctorkon writes from this conversation, so keep chat short.',
  'Raise every go or no-go call with doctorkon_ask. Give options, an urgency from 0 to 3 (3 blocks a release or is live to customers), a short badge, and 1 to 3 sentences of context.',
  'Set urgent true only when the call is truly time-critical. Withdraw a call that no longer applies with doctorkon_resolve.',
  'Answers arrive as prompts starting [doctorkon], naming the session, the decision title and the chosen option.',
].join(' ')

type $ = EngineInterface

let storeKey: string | null = null

async function dispatch($: $, action: Action): Promise<Cockpit> {
  const next = await update($, cockpit, x => reduce(x, action))
  if (storeKey !== null) await $.store.set(storeKey, saved(next))
  return next
}

// Keyed by the Orca tab, which survives a restart; a resumed conversation gets a new session id.
async function cockpitKey($: $): Promise<string> {
  const tab = await $.env.get('ORCA_TERMINAL_HANDLE')
  return `cockpit:${tab ?? await $.session.id()}`
}

async function dropStale($: $): Promise<void> {
  const open = (await read($, cockpit)).decisions
  if (open.length === 0) return
  const reply = await $.model.fork({ prompt: stalePrompt(open) })
  if (!reply.isAnswered) return
  for (const id of parseStale(reply.text, open.map(d => d.id))) await dispatch($, { t: 'resolve', id })
}

let lastRecap: number | null = null
let recapping = false
let trailing = false

async function recap($: $): Promise<void> {
  if (recapping) return
  recapping = true
  try {
    const at = await $.clock.now()
    lastRecap = at
    const reply = await $.model.fork({ prompt: RECAP_PROMPT })
    const brief = reply.isAnswered ? parseBrief(reply.text, at) : undefined
    if (brief !== undefined) await dispatch($, { t: 'brief', brief })
  } finally {
    recapping = false
  }
}

async function answer($: $, id: string, choice: string): Promise<void> {
  const d = byId(await read($, cockpit), id)
  if (d === undefined) return
  await dispatch($, { t: 'answer', id, choice, at: await $.clock.now() })
  await $.prompt.submit({ text: answerPrompt(d, choice), asUser: true })
}

// The band holds the keys only after ctrl+x tab or a click, so a bare key from the composer is denied.
async function focusReply($: $, requestId: string): Promise<void> {
  const moved = await $.ui.focus({ requestId, key: 'reply' })
  if (moved.deny !== undefined) $.ui.toast('ctrl+x tab, then type to reply in your own words')
}

type Choice = { key: string; hotkey?: string; label: string; onPress: () => void }

function pairs<T>(list: T[]): T[][] {
  return list.flatMap((x, i) => (i % 2 === 0 ? [list.slice(i, i + 2)] : []))
}

export const register: Register = on => {
  let bandId: string | null = null

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'doctorkon',
      description: 'Turn the doctorkon cockpit on or off',
      argumentHint: 'on | off | recap',
    })
    await $.tool.register({
      name: 'doctorkon_ask',
      description:
        'Raise a go or no-go decision for the person. It is pinned above the prompt or queued. Re-asking the same id updates it in place. Mark urgent only when truly time-critical.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Stable id for this decision' },
          title: { type: 'string' },
          session: { type: 'string' },
          urgency: { type: 'integer', enum: [0, 1, 2, 3], description: '3 blocks a release or is live to customers' },
          badge: { type: 'string', description: 'Short label such as release or customer' },
          context: { type: 'string', description: '1 to 3 sentences' },
          options: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 9 },
          urgent: { type: 'boolean' },
        },
        required: ['id', 'title', 'session', 'urgency', 'context', 'options'],
      },
    })
    await $.tool.register({
      name: 'doctorkon_resolve',
      description: 'Withdraw a doctorkon decision that no longer needs the person.',
      inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    })
    // The engine draws a plugin status line as a yellow warning notice; the band's glance row replaces it.
    $.ui.status(undefined)
    storeKey = await cockpitKey($)
    const kept = parseSaved(await $.store.get(storeKey))
    const restored = kept !== undefined && (await read($, cockpit)).decisions.length === 0 && kept.decisions.length > 0
    if (kept !== undefined) await dispatch($, { t: 'restore', saved: kept })
    if (restored) $.clock.after(0, () => void dropStale($))
    // The pane does not survive a reload or a reinstall; reopen it whenever the cockpit is already on.
    if ((await read($, cockpit)).on) void $.ui.open({ id: PANE, title: 'doctorkon' })
    return next(e)
  })

  on('command.run', { command: 'doctorkon' }, async ($, e) => {
    const arg = e.args.trim()
    const current = await read($, cockpit)
    if (arg === 'recap') {
      $.clock.after(0, () => void recap($))
      return { text: 'doctorkon is rewriting the status.' }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') return { text: 'Use /doctorkon on, off or recap.' }
    const want = arg === '' ? !current.on : arg === 'on'
    await dispatch($, { t: 'toggle', on: want })
    if (want) {
      await $.ui.open({ id: PANE, title: 'doctorkon' })
      return { text: 'doctorkon cockpit on.' }
    }
    await $.ui.close({ id: PANE })
    return { text: 'doctorkon cockpit off.' }
  })

  on('tool.call', { tool: 'mcp__doctorkon__doctorkon_ask' }, async ($, e) => {
    const parsed = parseAsk(e, await $.clock.now())
    if (!parsed.ok) return { deny: `doctorkon_ask rejected. ${parsed.error}.` }
    const before = await read($, cockpit)
    const s = await dispatch($, { t: 'ask', decision: parsed.value })
    const id = parsed.value.id
    if (s.on && s.interrupt === id && before.interrupt !== id) {
      $.ui.toast(`urgent: ${parsed.value.title} (i to switch)`)
    }
    const where = s.pinned === id ? 'pinned' : s.interrupt === id ? 'flagged as interrupt' : 'queued'
    return { result: `Decision ${id} ${where}.` }
  }).catch(() => ({ deny: 'doctorkon_ask failed inside the plugin.' }))

  on('tool.call', { tool: 'mcp__doctorkon__doctorkon_resolve' }, async ($, e) => {
    const id = typeof e.id === 'string' ? e.id : ''
    if (byId(await read($, cockpit), id) === undefined) return { deny: `doctorkon_resolve rejected. No open decision ${id}.` }
    await dispatch($, { t: 'resolve', id })
    return { result: `Decision ${id} withdrawn.` }
  }).catch(() => ({ deny: 'doctorkon_resolve failed inside the plugin.' }))

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!(await read($, cockpit)).on) return composed
    return { sections: [...composed.sections, { id: 'doctorkon:cockpit', text: SYSTEM, scope: 'session' as const }] }
  })

  // Like /recap: a fork over this session's own cached transcript, at most every RECAP_EVERY_MS.
  // Started on a timer so the fork outlives this dispatch instead of being cut with it.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId !== undefined || e.isAborted) return done
    if (!(await read($, cockpit)).on) return done
    const now = await $.clock.now()
    if (recapDue(lastRecap, now)) {
      $.clock.after(0, () => void recap($))
    } else if (!trailing && lastRecap !== null) {
      // A turn inside the window still gets summarised once the window ends.
      trailing = true
      $.clock.after(lastRecap + RECAP_EVERY_MS - now, () => {
        trailing = false
        void recap($)
      })
    }
    return done
  })

  on('prompt.submit', async ($, e, next) => {
    const s = await read($, cockpit)
    if (!s.on || e.origin.kind !== 'composer') return next(e)
    await dispatch($, { t: 'seen' })
    const key = parseKey(e.text)
    if (key === undefined) return next(e)
    if (key.t === 'option') {
      const d = byId(s, s.pinned)
      if (d !== undefined && key.index === d.options.length && bandId !== null) {
        await focusReply($, bandId)
        return { drop: 'doctorkon focused the reply field' }
      }
      const choice = d?.options[key.index]
      if (d === undefined || choice === undefined) return next(e)
      await answer($, d.id, choice)
      return { drop: `doctorkon answered ${clip(d.title, 28)} with ${choice}` }
    }
    if (key.t === 'switch') {
      if (s.interrupt === null) return next(e)
      await dispatch($, { t: 'switch' })
      return { drop: 'doctorkon switched to the interrupt' }
    }
    if (s.parked.length === 0) return next(e)
    await dispatch($, { t: 'back' })
    return { drop: 'doctorkon went back to the parked decision' }
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const tool = e.props.tool
    if (tool !== TOOL.ask && tool !== TOOL.resolve) return next(e)
    const { Text } = $.ui.resolve(e)
    const input = (e.props.input ?? {}) as Record<string, unknown>
    const label = String(input.title ?? input.text ?? input.id ?? '')
    const verb = tool === TOOL.ask ? 'ask' : 'resolve'
    const failed = e.props.isErrored ? ' (rejected)' : ''
    return (
      <Text dimColor wrap="truncate-end">
        doctorkon {verb} {String(input.session ?? '')} {label}
        {failed}
      </Text>
    )
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const tool = e.props.tool
    if (tool !== TOOL.ask && tool !== TOOL.resolve) return next(e)
    if (e.props.isErrored) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const s = await read($, cockpit)
    if (!s.on) return next(e)
    bandId = e.requestId
    const elements = $.ui.resolve(e)
    const { Box, Text, Button } = elements
    const Input = 'Input' in elements ? elements.Input : undefined
    const d = byId(s, s.pinned)
    const urgent = byId(s, s.interrupt)
    const queue = ranked(s)
    const stack = [...s.parked, s.pinned]
      .map(id => byId(s, id))
      .filter((x): x is Decision => x !== undefined)
    const replyKey = d !== undefined && d.options.length < 9 ? d.options.length + 1 : undefined
    const answerKeys = d === undefined ? 0 : (replyKey ?? d.options.length)
    const hints = [
      answerKeys > 0 ? `1-${answerKeys} answer` : '',
      urgent !== undefined ? 'i switch' : '',
      s.parked.length > 0 ? 'b back' : '',
    ].filter(x => x !== '')

    const choices: Choice[] =
      d === undefined
        ? []
        : [
            ...d.options.map((option, i) => ({
              key: `opt-${i + 1}`,
              hotkey: String(i + 1),
              label: option,
              onPress: () => void answer($, d.id, option),
            })),
            {
              key: 'opt-reply',
              ...(replyKey === undefined ? {} : { hotkey: String(replyKey) }),
              label: 'Reply in my own words',
              onPress: () => void focusReply($, e.requestId),
            },
          ]

    const stackRow = d !== undefined && (
      <Box key="stack" flexDirection="row" alignItems="center" columnGap={1}>
        <Text color={C.dim}>stack</Text>
        {stack.flatMap((x, i) => [
          ...(i > 0 ? [<Text key={`sep-${x.id}`} color={C.dim}>▸</Text>] : []),
          <Box key={`chip-${x.id}`} borderStyle="round" borderColor={C.blue} paddingX={1} flexShrink={1}>
            <Text color={C.fg} wrap="truncate-end">
              {clip(x.title, 28)}
            </Text>
          </Box>,
        ])}
        {s.lastAnswered !== null && <Text key="sep-answered" color={C.dim}>▸</Text>}
        {s.lastAnswered !== null && (
          <Box key="chip-answered" borderStyle="dashed" borderColor={C.line} paddingX={1} flexShrink={1}>
            <Text color={C.dim} strikethrough wrap="truncate-end">
              {clip(s.lastAnswered.title, 24)}
            </Text>
          </Box>
        )}
        {s.lastAnswered !== null && <Text color={C.shipped}>↳ answered {clock(s.lastAnswered.at)}</Text>}
        <Box key="stack-gap" flexGrow={1} />
        {urgent === undefined ? (
          <Text color={C.dim}>nothing urgent</Text>
        ) : (
          <Box key="urgent" borderStyle="round" borderColor={C.errored} backgroundColor={C.urgentBg} paddingX={1} flexShrink={1}>
            <Text color={C.urgentFg} backgroundColor={C.urgentBg} wrap="truncate-end">
              ✗ urgent · {clip(`${urgent.session}: ${urgent.title}`, 48)}{' '}
            </Text>
            <Button key="switch" plain hotkey="i" label="switch" onPress={() => dispatch($, { t: 'switch' })} />
          </Box>
        )}
        {s.parked.length > 0 && (
          <Box key="back-box" alignSelf="center">
            <Button key="back" plain dimColor hotkey="b" label="back" onPress={() => dispatch($, { t: 'back' })} />
          </Box>
        )}
      </Box>
    )

    const card = d !== undefined && (
      <Box key="card" flexDirection="column" borderStyle="round" borderColor={C.blue} paddingX={1}>
        <Box key="card-head" flexDirection="row" columnGap={1}>
          <Text color={C.needs}>◆ needs you</Text>
          <Text color={C.dim} wrap="truncate-end">
            pinned · {queue.findIndex(x => x.id === d.id) + 1} of {queue.length} waiting · {d.session} session
          </Text>
          {s.resumed === d.id && <Text color={C.shipped}>resumed · draft kept</Text>}
          <Box key="card-gap" flexGrow={1} />
          <Text color={C.badgeFg} backgroundColor={C.badgeBg}>
            {' '}{d.badge}{' '}
          </Text>
        </Box>
        <Text bold color={C.title} wrap="truncate-end">
          {d.title}
        </Text>
        <Text color={C.context} wrap="wrap">
          {d.context}
        </Text>
        {pairs(choices).map((pair, row) => (
          <Box key={`options-${row}`} flexDirection="row">
            {pair.map(c => (
              <Box key={`box-${c.key}`} width="50%" borderStyle="round" borderColor={C.line} paddingX={1}>
                <Button
                  key={c.key}
                  plain
                  {...(c.hotkey === undefined ? {} : { hotkey: c.hotkey })}
                  {...(c.key === 'opt-1' ? { autoFocus: true as const } : {})}
                  label={c.label}
                  onPress={c.onPress}
                />
              </Box>
            ))}
          </Box>
        ))}
        <Text color={C.dim}>reply to {d.session} session</Text>
        {Input !== undefined && (
          <Box key="reply-row" flexDirection="row">
            <Text color={C.blue}>› </Text>
            <Input
              key="reply"
              placeholder="your own words, Enter sends"
              value={s.drafts[d.id] ?? ''}
              submitLabel="send"
              onInput={(value: string) => void dispatch($, { t: 'draft', id: d.id, text: value })}
              onSubmit={(value: string) => {
                if (value.trim() !== '') void answer($, d.id, value.trim())
              }}
            />
          </Box>
        )}
      </Box>
    )

    return (
      <Box flexDirection="column">
        {stackRow}
        {card}
        <Box key="glance" flexDirection="row" columnGap={1}>
          <Text color={C.blue}>doctorkon</Text>
          <Text color={C.needs}>◆{waiting(s)} waiting</Text>
          {s.briefFresh ? (
            <Text color={C.ink} backgroundColor={C.blue}>
              {' '}status updated{' '}
            </Text>
          ) : (
            <Text color={C.dim}>{s.brief === null ? 'no status yet' : `status ${clock(s.brief.at)}`}</Text>
          )}
          {urgent !== undefined && (
            <Text color={C.ink} backgroundColor={C.errored} bold wrap="truncate-end">
              {' '}urgent: {urgent.session} · i to switch{' '}
            </Text>
          )}
          <Box key="glance-gap" flexGrow={1} />
          {hints.length > 0 && <Text color={C.dim}>{hints.join(' · ')}</Text>}
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const s = await read($, cockpit)
    const cols = e.props.bodyColumns - 4
    const queue = ranked(s)
    const brief = s.brief
    let rank = 0
    return (
      <Box flexDirection="column">
        <Box key="status-panel" flexDirection="column" borderStyle="round" borderColor={C.line} paddingX={1} flexShrink={0}>
          <Box key="status-head" flexDirection="row" columnGap={1}>
            <Text bold>Status</Text>
            <Box key="status-gap" flexGrow={1} />
            {s.briefFresh ? (
              <Text bold color={C.ink} backgroundColor={C.blue}>
                {' '}updated {brief === null ? '' : clock(brief.at)}{' '}
              </Text>
            ) : (
              <Text color={C.dim}>{brief === null ? '' : clock(brief.at)}</Text>
            )}
          </Box>
          {brief === null ? (
            <Text color={C.dim}>No status yet. It is written when the next turn ends.</Text>
          ) : (
            <Text color={C.context} wrap="wrap">
              {brief.summary}
            </Text>
          )}
          {brief !== null && brief.highlights.length > 0 && <Text> </Text>}
          {brief?.highlights.map((point, i) => (
            <Box key={`point-${i}`} flexDirection="row">
              <Text color={GLYPH[point.kind].color}>{GLYPH[point.kind].glyph} </Text>
              <Text wrap="wrap">{clip(point.text, cols * 2)}</Text>
            </Box>
          ))}
        </Box>
        <Box key="wait-panel" flexDirection="column" borderStyle="round" borderColor={C.line} paddingX={1}>
        <Box key="wait-head" flexDirection="row" columnGap={1}>
          <Text bold>Waiting on you</Text>
          <Box key="wait-gap" flexGrow={1} />
          <Text color={C.needs}>
            ◆{waiting(s)}
            {s.pinned !== null ? ' + 1 pinned' : ''}
          </Text>
        </Box>
        {queue.length === 0 && <Text color={C.dim}>Nothing waiting.</Text>}
        {queue.map(d => {
          const tag = queueTag(s, d)
          const width = Math.max(4, cols - 4 - tag.text.length)
          if (tag.tone === 'urgent') {
            return (
              <Box key={`w-${d.id}`} flexDirection="row" backgroundColor={C.urgentBg}>
                <Text bold color={C.urgentFg}>
                  i{'  '}
                </Text>
                <Text color={C.urgentFg}>{clip(d.title, width)}</Text>
                <Box key={`w-gap-${d.id}`} flexGrow={1} />
                <Text color={C.urgentFg}>{tag.text}</Text>
              </Box>
            )
          }
          rank += 1
          const mark = String(rank).padEnd(3)
          return (
            <Box key={`w-${d.id}`} flexDirection="row">
              <Text color={tag.tone === 'pinned' ? C.blue : C.dim}>{mark}</Text>
              {tag.tone === 'pinned' ? (
                <Text color={C.blue}>{clip(d.title, width)}</Text>
              ) : (
                <Button key={`pin-${d.id}`} plain label={clip(d.title, width)} onPress={() => dispatch($, { t: 'pin', id: d.id })} />
              )}
              <Box key={`w-gap-${d.id}`} flexGrow={1} />
              <Text color={TONE[tag.tone]}>{tag.text}</Text>
            </Box>
          )
        })}
        </Box>
      </Box>
    )
  })
}

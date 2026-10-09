import type { EngineInterface, Register } from 'claude-code'

import { buildIndex, mentions, parseTerminalList, parseTerms } from './sessions'
import type { LiveTerminal, SessionIndex } from './sessions'

const CACHE_MS = 10_000

type OrcaReply = { ok: boolean; result?: unknown; error?: { message?: string } }

async function orcaBinary($: EngineInterface): Promise<string | undefined> {
  const explicit = await $.env.get('ORCA_CLI_COMMAND')
  if (explicit) return explicit
  // Outside an Orca terminal a bare `orca` can be the GNOME screen reader, so it never runs there.
  return (await $.env.get('ORCA_TERMINAL_HANDLE')) ? 'orca' : undefined
}

async function orca($: EngineInterface, args: string[]): Promise<OrcaReply> {
  const binary = await orcaBinary($)
  if (!binary) return { ok: false, error: { message: 'not running inside an Orca terminal' } }
  const ran = await $.process.run([binary, ...args], { timeoutMs: 8_000 }).catch((err: unknown) => ({
    exitCode: 1,
    stdout: '',
    stderr: `${binary} did not run: ${String(err)}`,
  }))
  try {
    return JSON.parse(ran.stdout) as OrcaReply
  } catch {
    return { ok: false, error: { message: (ran.stderr || ran.stdout).trim().slice(0, 200) || `exit ${ran.exitCode}` } }
  }
}

let cache: { at: number; index: SessionIndex } | undefined

async function sessionIndex($: EngineInterface, fresh = false): Promise<SessionIndex> {
  const now = await $.clock.now()
  if (!fresh && cache && now - cache.at < CACHE_MS) return cache.index
  const termsPath = await $.env.get('ORCA_SESSION_LINKS_TERMS')
  const terms = termsPath ? await $.fs.read(termsPath).then(parseTerms, () => new Map<string, string>()) : new Map<string, string>()
  const listed = await orca($, ['terminal', 'list', '--json'])
  const live: LiveTerminal[] | undefined = listed.ok ? parseTerminalList(listed.result) : undefined
  cache = { at: now, index: buildIndex(terms, live) }
  return cache.index
}

async function proofLog($: EngineInterface, line: string) {
  const path = await $.env.get('ORCA_SESSION_LINKS_LOG')
  if (!path) return
  const before = await $.fs.read(path).catch(() => '')
  await $.fs.write(path, `${before}${new Date(await $.clock.now()).toISOString()} ${line}\n`)
}

async function switchTo($: EngineInterface, name: string) {
  const switchArgs = (handle: string) => ['terminal', 'switch', '--terminal', handle, '--json']
  let handle = (await sessionIndex($)).get(name) ?? (await sessionIndex($, true)).get(name)
  if (!handle) {
    $.ui.toast(`Session links: no Orca tab named ${name}`)
    return
  }
  let switched = await orca($, switchArgs(handle))
  if (!switched.ok) {
    const fresh = (await sessionIndex($, true)).get(name)
    if (fresh && fresh !== handle) {
      handle = fresh
      switched = await orca($, switchArgs(handle))
    }
  }
  await proofLog($, `switch ${name} ${handle} ${JSON.stringify(switched)}`)
  if (!switched.ok) $.ui.toast(`Session links: could not switch to ${name}: ${switched.error?.message ?? 'unknown error'}`)
}

export const register: Register = on => {
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.props.isSummary) return next(e)
    const names = mentions(e.props.text, (await sessionIndex($)).keys())
    if (names.length === 0) return next(e)
    const { Box, Button } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {await next(e)}
        <Box flexDirection="row" flexWrap="wrap" columnGap={1} marginLeft={2}>
          {names.map(name => (
            <Button key={`switch:${name}`} label={`↗ ${name}`} onPress={() => void switchTo($, name)} />
          ))}
        </Box>
      </Box>
    )
  })
}

import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const PLUGIN = 'orca-claude-session-links'
const LIST = {
  ok: true,
  result: {
    terminals: [
      { handle: 'term_test_a', title: '◐ build-api' },
      { handle: 'term_test_b', title: '✳ model-audit' },
    ],
  },
}
const SWITCH_A = [['orca', 'terminal', 'switch', '--terminal', 'term_test_a', '--json']]

function world(on: On, env: Record<string, string> = { ORCA_TERMINAL_HANDLE: 'term_test_self' }) {
  mock.clock(on, { now: 1_000 })
  mock.env(on, env)
  const ran: string[][] = []
  const toasts: string[] = []
  on('fs.read', ($, e) => {
    if (e.path === '/terms.txt') return { value: 'term_test_old|docs-sweep\nterm_test_b|docs-sweep\n' }
    throw new Error(`ENOENT ${e.path}`)
  })
  on('process.run', ($, e) => {
    ran.push([...e.argv])
    const args = e.argv.slice(1)
    const reply =
      args[1] === 'list'
        ? LIST
        : args[3] === 'term_test_a'
          ? { ok: true, result: { focus: { handle: args[3], navigated: true } } }
          : { ok: false, error: { message: 'terminal_handle_stale' } }
    return { value: { exitCode: reply.ok ? 0 : 1, stdout: JSON.stringify(reply), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box key="engine">
        <Text>{e.props.text}</Text>
      </Box>
    )
  })
  const switched = () => ran.filter(argv => argv[2] === 'switch')
  return { ran, switched, toasts }
}

const MESSAGE = { text: 'check build-api', isFirstOfReply: true }

for (const surface of ['terminal', 'desktop'] as const) {
  test(`pressing "↗ build-api" runs orca terminal switch for its handle on ${surface}`, async ($, on) => {
    const { switched, toasts } = world(on)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'AssistantMessage', props: MESSAGE })
    expect((await ui.find({ key: 'engine' }))?.text).toBe('check build-api')
    const buttons = await ui.findAll({ type: 'Button' })
    expect(buttons.map(b => [b.key, b.props.label])).toEqual([['switch:build-api', '↗ build-api']])
    await ui.press({ key: 'switch:build-api' })
    expect(switched()).toEqual(SWITCH_A)
    expect(toasts).toEqual([])
    await ui.unmount()
  })
}

test('one button per distinct name, in order of first mention', async ($, on) => {
  world(on)
  const props = { text: 'model-audit then build-api, then model-audit and `model-audit` again', isFirstOfReply: false }
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AssistantMessage', props })
  expect((await ui.findAll({ type: 'Button' })).map(b => b.props.label)).toEqual(['↗ model-audit', '↗ build-api'])
  await ui.unmount()
})

test('a reply with no known session is left to the engine', async ($, on) => {
  world(on)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AssistantMessage', props: { text: 'ask docs-sweep', isFirstOfReply: true } })
  expect((await ui.find({ key: 'engine' }))?.text).toBe('ask docs-sweep')
  expect(await ui.findAll({ type: 'Button' })).toEqual([])
  await ui.unmount()
})

test('a summary row is left to the engine', async ($, on) => {
  world(on)
  const props = { text: 'check build-api', isFirstOfReply: false, isSummary: true as const }
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AssistantMessage', props })
  expect((await ui.find({ key: 'engine' }))?.text).toBe('check build-api')
  expect(await ui.findAll({ type: 'Button' })).toEqual([])
  await ui.unmount()
})

test('the terms file names sessions, later line wins, and a failed switch toasts', async ($, on) => {
  const { switched, toasts } = world(on, { ORCA_TERMINAL_HANDLE: 'term_test_self', ORCA_SESSION_LINKS_TERMS: '/terms.txt' })
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AssistantMessage', props: { text: 'ask docs-sweep', isFirstOfReply: true } })
  await ui.press({ key: 'switch:docs-sweep' })
  expect(switched()).toEqual([['orca', 'terminal', 'switch', '--terminal', 'term_test_b', '--json']])
  expect(toasts).toEqual(['Session links: could not switch to docs-sweep: terminal_handle_stale'])
  await ui.unmount()
})

test('ORCA_CLI_COMMAND names the binary', async ($, on) => {
  const { ran } = world(on, { ORCA_CLI_COMMAND: 'orca-wsl' })
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AssistantMessage', props: MESSAGE })
  await ui.press({ key: 'switch:build-api' })
  expect(ran.map(argv => argv[0])).toEqual(['orca-wsl', 'orca-wsl'])
  await ui.unmount()
})

test('outside an Orca terminal nothing runs and no buttons draw', async ($, on) => {
  const { ran } = world(on, {})
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AssistantMessage', props: MESSAGE })
  expect(await ui.findAll({ type: 'Button' })).toEqual([])
  expect(ran).toEqual([])
  await ui.unmount()
})

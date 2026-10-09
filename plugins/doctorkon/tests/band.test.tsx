import { expect, mock, test } from 'claude-code/testing'

const BAND_PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 20,
  bodyColumns: 80,
  scroll: { offset: 0, bodyRows: 19 },
  view: {},
} as const

const USAGE = { input_tokens: 10, output_tokens: 40, cache_read_input_tokens: 9000, cache_creation_input_tokens: 0 }

for (const surface of ['terminal', 'desktop'] as const) {
  test(`band option 1 answers the pinned decision on ${surface}`, async ($, on) => {
    mock.clock(on, { now: 1_000 })
    const sent: string[] = []
    on('prompt.submit', ($, e) => {
      sent.push(e.text)
      return { text: e.text }
    })
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('ui.status', () => ({ value: undefined }))
    on('ui.toast', () => ({ value: undefined }))
    on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
      const { Box } = $.ui.resolve(e)
      return <Box key="engine-band" />
    })

    await $.command.run({ command: 'doctorkon', args: 'on', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
    await $.tool.call({
      tool: 'mcp__doctorkon__doctorkon_ask',
      id: 'acme',
      title: 'Acme onboarding',
      session: 'gw-dev',
      urgency: 2,
      badge: 'customer',
      context: 'Acme wants SSO before Friday.',
      options: ['Ship Thursday', 'Hold a week'],
    })

    const ui = await $.ui.mount({ plugin: 'doctorkon', surface, component: 'AbovePrompt', props: BAND_PROPS })
    expect((await ui.find({ type: 'Text', text: 'Acme onboarding' }))?.text).toBe('Acme onboarding')
    expect(await ui.findAll({ type: 'Button', key: 'opt-1' })).toHaveLength(1)

    expect((await ui.find({ type: 'Text', text: 'pinned · 1 of 1 waiting' }))?.text).toBe('pinned · 1 of 1 waiting · gw-dev session')
    expect((await ui.find({ type: 'Text', text: 'nothing urgent' }))?.text).toBe('nothing urgent')
    expect((await ui.find({ key: 'opt-reply' }))?.text).toBe('Reply in my own words')
    expect((await ui.find({ type: 'Text', text: 'answer' }))?.text).toBe('1-3 answer')

    await ui.press({ key: 'opt-1' })
    expect(sent).toEqual(['[doctorkon] gw-dev / Acme onboarding: Ship Thursday'])
    expect(await ui.find({ type: 'Text', text: 'Acme onboarding' })).toBe(undefined)
    expect((await ui.find({ type: 'Text', text: 'waiting' }))?.text).toBe('◆0 waiting')
    expect(await ui.find({ key: 'engine-band' })).toBe(undefined)
    await ui.unmount()
  })

  test(`band flags an urgent ask, then shows the resumed card after it is answered on ${surface}`, async ($, on) => {
    mock.clock(on, { now: Date.UTC(2026, 9, 9, 3, 18) })
    on('prompt.submit', ($, e) => ({ text: e.text }))
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('ui.status', () => ({ value: undefined }))
    on('ui.toast', () => ({ value: undefined }))

    await $.command.run({ command: 'doctorkon', args: 'on', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
    const ask = { tool: 'mcp__doctorkon__doctorkon_ask', session: 'onboarding', urgency: 2, context: 'Ready to run.' } as const
    await $.tool.call({ ...ask, id: 'acme', title: 'Acme onboarding', badge: 'tenant waiting', options: ['Run', 'Hold'] })
    const ui = await $.ui.mount({ plugin: 'doctorkon', surface, component: 'AbovePrompt', props: BAND_PROPS })
    await ui.input({ key: 'reply', text: 'run it, but ping me if', kind: 'change' })
    await $.tool.call({ ...ask, id: 'gwdev', session: 'gw-dev', title: 'Redeploy or pause merges', urgency: 3, urgent: true, options: ['Redeploy'] })

    expect((await ui.find({ type: 'Text', text: '✗ urgent ·' }))?.text).toBe('✗ urgent · gw-dev: Redeploy or pause merges ')
    expect((await ui.find({ type: 'Text', text: 'urgent: gw-dev' }))?.text).toBe(' urgent: gw-dev · i to switch ')
    expect((await ui.find({ type: 'Text', text: 'Acme onboarding' }))?.text).toBe('Acme onboarding')

    await ui.press({ key: 'switch' })
    expect((await ui.find({ type: 'Text', text: 'b back' }))?.text).toBe('1-2 answer · b back')
    await ui.press({ key: 'opt-1' })

    expect((await ui.find({ type: 'Text', text: 'resumed' }))?.text).toBe('resumed · draft kept')
    expect((await ui.find({ type: 'Text', text: 'Redeploy or pause' }))?.text).toBe('Redeploy or pause merges')
    expect((await ui.find({ type: 'Text', text: '↳ answered' }))?.text).toMatch(/^↳ answered \d\d:18$/)
    expect((await ui.find({ key: 'reply' }))?.text).toBe('run it, but ping me if')
    expect((await ui.find({ type: 'Text', text: 'nothing urgent' }))?.text).toBe('nothing urgent')
    await ui.unmount()
  })
}

test('a finished turn writes the Status panel from a fork of the transcript', async ($, on) => {
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 9, 3, 18) })
  const prompts: string[] = []
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('model.fork', ($, e) => {
    prompts.push(e.prompt)
    return {
      value: {
        isAnswered: true,
        text: '{"summary": "doctorkon is published. Next is the pane redesign.", "highlights": [{"kind": "shipped", "text": "doctorkon 1.0.1 published"}, {"kind": "problem", "text": "dev copy removed by accident"}]}',
        usage: USAGE,
      },
    }
  })

  await $.command.run({ command: 'doctorkon', args: 'on', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } })
  await $.turn.complete({ reason: 'answer', answer: 'done', durationMs: 10, isAborted: false, turnId: 't1' })
  await clock.advance(0)

  const pane = await $.ui.mount({
    plugin: 'doctorkon',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'doctorkon',
    props: { title: 'doctorkon', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
  })
  expect(prompts).toHaveLength(1)
  expect((await pane.find({ type: 'Text', text: 'doctorkon is published' }))?.text).toBe('doctorkon is published. Next is the pane redesign.')
  expect((await pane.find({ type: 'Text', text: 'by accident' }))?.text).toBe('dev copy removed by accident')
  expect(await pane.find({ type: 'Text', text: 'Status updates' })).toBe(undefined)
  await pane.unmount()
})

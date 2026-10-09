import { describe, expect, test } from 'claude-code/testing'

import { buildIndex, mentions, parseTerminalList, parseTerms, stripStatusMark } from '../hooks/sessions'

const NAMES = ['model-audit', 'build-api-v2', 'build-api', 'docs-sweep']

describe('session index', () => {
  test('tab titles lose their leading status mark', () => {
    expect(stripStatusMark('✳ build-api')).toBe('build-api')
    expect(stripStatusMark('◐ model-audit')).toBe('model-audit')
    expect(stripStatusMark('docs-sweep')).toBe('docs-sweep')
  })

  test('terms file keeps the later line for a repeated name and skips other lines', () => {
    const terms = parseTerms('term_test_a|model-audit\nnot a term line\nterm_test_b|build-api\nterm_test_c|model-audit\nhandle|docs-sweep\n')
    expect([...terms]).toEqual([
      ['model-audit', 'term_test_c'],
      ['build-api', 'term_test_b'],
    ])
  })

  test('terms win over titles, stale terms drop, free-text titles stay out', () => {
    const live = parseTerminalList({
      terminals: [
        { handle: 'term_test_a', title: '✳ model-audit' },
        { handle: 'term_test_b', title: '◑ build-api' },
        { handle: 'term_test_c', title: '✳ Fix the flaky login test' },
        { handle: 'term_test_d', title: '✳ docs-sweep' },
      ],
    })
    const terms = new Map([
      ['docs-sweep', 'term_test_a'],
      ['gone-session', 'term_test_dead'],
    ])
    expect([...buildIndex(terms, live)]).toEqual([
      ['docs-sweep', 'term_test_a'],
      ['model-audit', 'term_test_a'],
      ['build-api', 'term_test_b'],
    ])
  })

  test('a case-variant title is its own name and never takes the exact one', () => {
    const live = parseTerminalList({
      terminals: [
        { handle: 'term_test_auto', title: '✳ Build-api' },
        { handle: 'term_test_real', title: '✳ build-api' },
      ],
    })
    const index = buildIndex(new Map(), live)
    expect(index.get('build-api')).toBe('term_test_real')
    expect(index.get('Build-api')).toBe('term_test_auto')
    expect(mentions('ask build-api', index.keys())).toEqual(['build-api'])
  })

  test('an unreadable terminal list keeps every term', () => {
    expect([...buildIndex(new Map([['build-api', 'term_test_a']]), undefined)]).toEqual([['build-api', 'term_test_a']])
    expect(parseTerminalList(undefined)).toEqual([])
  })
})

describe('mentions', () => {
  test('distinct names in order of first mention', () => {
    expect(mentions('docs-sweep, then model-audit, then docs-sweep again', NAMES)).toEqual(['docs-sweep', 'model-audit'])
  })

  test('inline code, fenced code, links and URLs are not mentions', () => {
    const text = [
      'Run `model-audit` and see [docs-sweep](https://x.dev/a), https://x.dev/build-api, <https://x.dev/build-api-v2>',
      '```',
      'build-api inside a fence',
      '```',
    ].join('\n')
    expect(mentions(text, NAMES)).toEqual([])
  })

  test('longest name wins on overlap', () => {
    expect(mentions('build-api-v2 and build-api', NAMES)).toEqual(['build-api-v2', 'build-api'])
  })

  test('whole words only, case sensitive, not inside paths', () => {
    expect(mentions('Model-audit, model-audits, /tmp/model-audit/x, pre-model-audit', NAMES)).toEqual([])
  })

  test('names without a hyphen never match', () => {
    expect(mentions('ask scratch about it', ['scratch'])).toEqual([])
  })
})

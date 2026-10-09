export type SessionIndex = ReadonlyMap<string, string>
export type LiveTerminal = { handle: string; title: string }

const SESSION_NAME = /^[A-Za-z0-9_.]+(?:-[A-Za-z0-9_.]+)+$/
const STATUS_MARK = /^[^\p{L}\p{N}\s]+\s+/u

export function isSessionName(name: string): boolean {
  return SESSION_NAME.test(name)
}

export function parseTerms(text: string): Map<string, string> {
  const terms = new Map<string, string>()
  for (const line of text.split('\n')) {
    const bar = line.indexOf('|')
    if (bar < 0) continue
    const handle = line.slice(0, bar).trim()
    const name = line.slice(bar + 1).trim()
    if (handle.startsWith('term_') && isSessionName(name)) terms.set(name, handle)
  }
  return terms
}

export function stripStatusMark(title: string): string {
  return title.replace(STATUS_MARK, '').trim()
}

export function parseTerminalList(result: unknown): LiveTerminal[] {
  const terminals = (result as { terminals?: unknown } | undefined)?.terminals
  if (!Array.isArray(terminals)) return []
  return terminals.flatMap(t =>
    typeof t?.handle === 'string' && typeof t?.title === 'string' ? [{ handle: t.handle, title: t.title }] : [],
  )
}

export function buildIndex(terms: ReadonlyMap<string, string>, live: readonly LiveTerminal[] | undefined): Map<string, string> {
  const liveHandles = live && new Set(live.map(t => t.handle))
  const index = new Map<string, string>()
  for (const [name, handle] of terms) {
    if (!liveHandles || liveHandles.has(handle)) index.set(name, handle)
  }
  for (const { handle, title } of live ?? []) {
    const name = stripStatusMark(title)
    if (isSessionName(name) && !index.has(name)) index.set(name, handle)
  }
  return index
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/
const PROTECTED = /(`+)[\s\S]*?\1|!?\[[^\]\n]*\]\([^)\n]*\)|\[[^\]\n]*\]\[[^\]\n]*\]|<[a-z][a-z0-9+.-]*:[^>\s]*>|\b[a-z][a-z0-9+.-]*:\/\/[^\s<>()]+/gi

function escape(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function proseBlocks(markdown: string): string[] {
  const blocks: string[] = []
  let prose: string[] = []
  let fence: string | undefined
  for (const line of markdown.split('\n')) {
    if (fence) {
      if (line.trimStart().startsWith(fence) && line.trim().replace(/[`~]/g, '') === '') fence = undefined
      continue
    }
    const open = FENCE.exec(line)
    if (open) {
      blocks.push(prose.join('\n'))
      prose = []
      fence = open[1]
      continue
    }
    prose.push(line)
  }
  blocks.push(prose.join('\n'))
  return blocks.flatMap(block => {
    const pieces: string[] = []
    let last = 0
    for (const m of block.matchAll(PROTECTED)) {
      pieces.push(block.slice(last, m.index))
      last = m.index! + m[0].length
    }
    pieces.push(block.slice(last))
    return pieces
  })
}

export function mentions(markdown: string, names: Iterable<string>): string[] {
  const sorted = [...names].filter(isSessionName).sort((a, b) => b.length - a.length)
  if (sorted.length === 0) return []
  const mention = new RegExp(`(?<![\\w./-])(?:${sorted.map(escape).join('|')})(?![\\w/-])`, 'g')
  const found = new Set<string>()
  for (const prose of proseBlocks(markdown)) {
    for (const [name] of prose.matchAll(mention)) found.add(name)
  }
  return [...found]
}

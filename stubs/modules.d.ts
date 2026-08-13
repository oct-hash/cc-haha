declare module 'asciichart' {
  export function plot(series: number[], cfg?: Record<string, unknown>): string
  export default plot
}

declare module 'bidi-js' {
  export default class Bidi {
    getEmbeddingLevels(text: string, levels: number[]): void
  }
}

declare module 'mailparser' {
  export interface ParsedMail {
    text?: string
    html?: string
    subject?: string
    from?: { text: string }
    to?: { text: string }
    date?: Date
    attachments?: Array<{
      filename: string
      content: Buffer
      contentType: string
    }>
  }
  export function simpleParser(source: Buffer | string): Promise<ParsedMail>
}

declare module 'picomatch' {
  interface Options {
    dot?: boolean
    nocase?: boolean
    bash?: boolean
  }
  function picomatch(pattern: string, options?: Options): (str: string) => boolean
  export default picomatch
}

declare module 'proper-lockfile' {
  interface LockOptions {
    stale?: number
    retries?: number
    realpath?: boolean
  }
  export function lock(file: string, options?: LockOptions): Promise<() => Promise<void>>
  export function unlock(file: string): Promise<void>
  export function check(file: string): Promise<boolean>
}

declare module 'react-reconciler' {
  const reconciler: unknown
  export default reconciler
}

declare module 'react-reconciler/constants.js' {
  const constants: Record<string, number>
  export default constants
}

declare module 'stack-utils' {
  export default class StackUtils {
    constructor(options?: { cwd?: string; internals?: RegExp[] })
    clean(stack: string): string
    parseLine(line: string): {
      file: string
      line: number
      column: number
      method: string
    } | undefined
  }
}

declare module 'turndown' {
  interface Options {
    headingStyle?: 'setext' | 'atx'
    hr?: string
    bulletListMarker?: string
    codeBlockStyle?: 'indented' | 'fenced'
    fence?: string
    emDelimiter?: string
    strongDelimiter?: string
    linkStyle?: 'inlined' | 'referenced'
    linkReferenceStyle?: 'full' | 'collapsed' | 'shortcut'
  }
  export default class TurndownService {
    constructor(options?: Options)
    turndown(html: string): string
    use(plugin: (service: TurndownService) => void): void
  }
}

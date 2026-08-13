import type { FileStateCache } from '../../utils/fileStateCache.js'
import type { ThemeName } from '../../utils/theme.js'

export interface TipContext {
  theme: ThemeName
  bashTools?: Set<string>
  readFileState?: FileStateCache
}

export interface Tip {
  id: string
  content: (ctx: TipContext) => Promise<string> | string
  cooldownSessions: number
  isRelevant: (context?: TipContext) => Promise<boolean> | boolean
}

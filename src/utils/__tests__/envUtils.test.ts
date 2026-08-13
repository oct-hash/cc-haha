import { afterEach, describe, expect, it } from 'bun:test'
import {
  getAWSRegion,
  getClaudeConfigHomeDir,
  getDefaultVertexRegion,
  getTeamsDir,
  getVertexRegionForModel,
  hasNodeOption,
  isBareMode,
  isEnvDefinedFalsy,
  isEnvTruthy,
  isInProtectedNamespace,
  isRunningOnHomespace,
  parseEnvVars,
  shouldMaintainProjectWorkingDir,
} from '../envUtils'

describe('isEnvTruthy', () => {
  it('accepts "1"', () => expect(isEnvTruthy('1')).toBe(true))
  it('accepts "true"', () => expect(isEnvTruthy('true')).toBe(true))
  it('accepts "yes"', () => expect(isEnvTruthy('yes')).toBe(true))
  it('accepts "on"', () => expect(isEnvTruthy('on')).toBe(true))
  it('accepts "TRUE" case-insensitively', () => expect(isEnvTruthy('TRUE')).toBe(true))
  it('accepts boolean true', () => expect(isEnvTruthy(true)).toBe(true))
  it('rejects "0"', () => expect(isEnvTruthy('0')).toBe(false))
  it('rejects "false"', () => expect(isEnvTruthy('false')).toBe(false))
  it('rejects empty string', () => expect(isEnvTruthy('')).toBe(false))
  it('rejects undefined', () => expect(isEnvTruthy(undefined)).toBe(false))
  it('rejects boolean false', () => expect(isEnvTruthy(false)).toBe(false))
  it('rejects random string', () => expect(isEnvTruthy('random')).toBe(false))
})

describe('isEnvDefinedFalsy', () => {
  it('accepts "0"', () => expect(isEnvDefinedFalsy('0')).toBe(true))
  it('accepts "false"', () => expect(isEnvDefinedFalsy('false')).toBe(true))
  it('accepts "no"', () => expect(isEnvDefinedFalsy('no')).toBe(true))
  it('accepts "off"', () => expect(isEnvDefinedFalsy('off')).toBe(true))
  it('accepts boolean false', () => expect(isEnvDefinedFalsy(false)).toBe(true))
  it('rejects "1"', () => expect(isEnvDefinedFalsy('1')).toBe(false))
  it('rejects boolean true', () => expect(isEnvDefinedFalsy(true)).toBe(false))
  it('rejects undefined (not defined at all)', () =>
    expect(isEnvDefinedFalsy(undefined)).toBe(false))
  it('rejects empty string', () => expect(isEnvDefinedFalsy('')).toBe(false))
})

describe('parseEnvVars', () => {
  it('parses KEY=VALUE pairs', () => {
    expect(parseEnvVars(['FOO=bar', 'BAZ=qux'])).toEqual({ FOO: 'bar', BAZ: 'qux' })
  })

  it('handles value with equals sign', () => {
    expect(parseEnvVars(['URL=http://a=b&c=d'])).toEqual({ URL: 'http://a=b&c=d' })
  })

  it('returns empty object for undefined', () => {
    expect(parseEnvVars(undefined)).toEqual({})
  })

  it('returns empty object for empty array', () => {
    expect(parseEnvVars([])).toEqual({})
  })

  it('throws on missing value', () => {
    expect(() => parseEnvVars(['FOO'])).toThrow('Invalid environment variable format')
  })

  it('throws on empty key', () => {
    expect(() => parseEnvVars(['=value'])).toThrow('Invalid environment variable format')
  })
})

describe('hasNodeOption', () => {
  const originalNodeOptions = process.env.NODE_OPTIONS

  afterEach(() => {
    if (originalNodeOptions === undefined) {
      delete process.env.NODE_OPTIONS
    } else {
      process.env.NODE_OPTIONS = originalNodeOptions
    }
  })

  it('returns false when NODE_OPTIONS is unset', () => {
    delete process.env.NODE_OPTIONS
    expect(hasNodeOption('--max-old-space-size=4096')).toBe(false)
  })

  it('finds exact flag match', () => {
    process.env.NODE_OPTIONS = '--max-old-space-size=4096 --expose-gc'
    expect(hasNodeOption('--expose-gc')).toBe(true)
    expect(hasNodeOption('--max-old-space-size=4096')).toBe(true)
  })

  it('rejects partial match', () => {
    process.env.NODE_OPTIONS = '--max-old-space-size=4096'
    expect(hasNodeOption('--max-old-space-size=409')).toBe(false)
  })
})

describe('getClaudeConfigHomeDir', () => {
  const originalDir = process.env.CLAUDE_CONFIG_DIR

  afterEach(() => {
    if (originalDir === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR
    } else {
      process.env.CLAUDE_CONFIG_DIR = originalDir
    }
    ;(getClaudeConfigHomeDir as any).cache?.clear?.()
  })

  it('uses CLAUDE_CONFIG_DIR when set', () => {
    process.env.CLAUDE_CONFIG_DIR = '/custom/claude/config'
    expect(getClaudeConfigHomeDir()).toBe('/custom/claude/config')
  })

  it('falls back to ~/.claude when env var not set', () => {
    delete process.env.CLAUDE_CONFIG_DIR
    const result = getClaudeConfigHomeDir()
    expect(result).toContain('.claude')
  })
})

describe('getTeamsDir', () => {
  const originalDir = process.env.CLAUDE_CONFIG_DIR

  afterEach(() => {
    if (originalDir === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR
    } else {
      process.env.CLAUDE_CONFIG_DIR = originalDir
    }
    ;(getClaudeConfigHomeDir as any).cache?.clear?.()
  })

  it('returns teams subdirectory of config home', () => {
    process.env.CLAUDE_CONFIG_DIR = '/tmp/claude'
    const result = getTeamsDir()
    expect(result.endsWith('teams')).toBe(true)
    expect(result).toContain('claude')
  })
})

describe('isBareMode', () => {
  const originalBare = process.env.CLAUDE_CODE_SIMPLE

  afterEach(() => {
    if (originalBare === undefined) {
      delete process.env.CLAUDE_CODE_SIMPLE
    } else {
      process.env.CLAUDE_CODE_SIMPLE = originalBare
    }
  })

  it('returns true when CLAUDE_CODE_SIMPLE is set', () => {
    process.env.CLAUDE_CODE_SIMPLE = '1'
    expect(isBareMode()).toBe(true)
  })

  it('returns false when env var is not set', () => {
    delete process.env.CLAUDE_CODE_SIMPLE
    expect(isBareMode()).toBe(false)
  })
})

describe('getAWSRegion', () => {
  const originalRegion = process.env.AWS_REGION
  const originalDefault = process.env.AWS_DEFAULT_REGION

  afterEach(() => {
    if (originalRegion === undefined) delete process.env.AWS_REGION
    else process.env.AWS_REGION = originalRegion
    if (originalDefault === undefined) delete process.env.AWS_DEFAULT_REGION
    else process.env.AWS_DEFAULT_REGION = originalDefault
  })

  it('prefers AWS_REGION over default', () => {
    delete process.env.AWS_DEFAULT_REGION
    process.env.AWS_REGION = 'us-west-2'
    expect(getAWSRegion()).toBe('us-west-2')
  })

  it('falls back to AWS_DEFAULT_REGION', () => {
    delete process.env.AWS_REGION
    process.env.AWS_DEFAULT_REGION = 'eu-west-1'
    expect(getAWSRegion()).toBe('eu-west-1')
  })

  it('falls back to us-east-1 when neither is set', () => {
    delete process.env.AWS_REGION
    delete process.env.AWS_DEFAULT_REGION
    expect(getAWSRegion()).toBe('us-east-1')
  })
})

describe('getDefaultVertexRegion', () => {
  const original = process.env.CLOUD_ML_REGION

  afterEach(() => {
    if (original === undefined) delete process.env.CLOUD_ML_REGION
    else process.env.CLOUD_ML_REGION = original
  })

  it('uses CLOUD_ML_REGION when set', () => {
    process.env.CLOUD_ML_REGION = 'europe-west4'
    expect(getDefaultVertexRegion()).toBe('europe-west4')
  })

  it('falls back to us-east5', () => {
    delete process.env.CLOUD_ML_REGION
    expect(getDefaultVertexRegion()).toBe('us-east5')
  })
})

describe('shouldMaintainProjectWorkingDir', () => {
  const original = process.env.CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR

  afterEach(() => {
    if (original === undefined) delete process.env.CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR
    else process.env.CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR = original
  })

  it('returns true when env var is "1"', () => {
    process.env.CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR = '1'
    expect(shouldMaintainProjectWorkingDir()).toBe(true)
  })

  it('returns false when env var is not set', () => {
    delete process.env.CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR
    expect(shouldMaintainProjectWorkingDir()).toBe(false)
  })
})

describe('isRunningOnHomespace', () => {
  const originalType = process.env.USER_TYPE
  const originalHomespace = process.env.COO_RUNNING_ON_HOMESPACE

  afterEach(() => {
    if (originalType === undefined) delete process.env.USER_TYPE
    else process.env.USER_TYPE = originalType
    if (originalHomespace === undefined) delete process.env.COO_RUNNING_ON_HOMESPACE
    else process.env.COO_RUNNING_ON_HOMESPACE = originalHomespace
  })

  it('returns true when ant + homespace flag', () => {
    process.env.USER_TYPE = 'ant'
    process.env.COO_RUNNING_ON_HOMESPACE = '1'
    expect(isRunningOnHomespace()).toBe(true)
  })

  it('returns false when not ant', () => {
    delete process.env.USER_TYPE
    process.env.COO_RUNNING_ON_HOMESPACE = '1'
    expect(isRunningOnHomespace()).toBe(false)
  })

  it('returns false when ant but homespace not set', () => {
    process.env.USER_TYPE = 'ant'
    delete process.env.COO_RUNNING_ON_HOMESPACE
    expect(isRunningOnHomespace()).toBe(false)
  })
})

describe('isInProtectedNamespace', () => {
  it('returns false for non-ant environments', () => {
    expect(isInProtectedNamespace()).toBe(false)
  })
})

describe('getVertexRegionForModel', () => {
  const original = process.env.VERTEX_REGION_CLAUDE_4_6_SONNET

  afterEach(() => {
    if (original === undefined) delete process.env.VERTEX_REGION_CLAUDE_4_6_SONNET
    else process.env.VERTEX_REGION_CLAUDE_4_6_SONNET = original
  })

  it('returns default region for undefined model', () => {
    expect(getVertexRegionForModel(undefined)).toBe('us-east5')
  })

  it('returns model-specific region override', () => {
    process.env.VERTEX_REGION_CLAUDE_4_6_SONNET = 'asia-east1'
    expect(getVertexRegionForModel('claude-sonnet-4-6-20250514')).toBe('asia-east1')
  })

  it('returns default region for unknown model', () => {
    expect(getVertexRegionForModel('unknown-model')).toBe('us-east5')
  })

  it('matches by prefix', () => {
    process.env.VERTEX_REGION_CLAUDE_4_0_OPUS = 'europe-west1'
    expect(getVertexRegionForModel('claude-opus-4-20250514')).toBe('europe-west1')
  })

  it('matches claude-haiku-4-5 prefix', () => {
    process.env.VERTEX_REGION_CLAUDE_HAIKU_4_5 = 'us-central1'
    expect(getVertexRegionForModel('claude-haiku-4-5-20251001')).toBe('us-central1')
  })
})

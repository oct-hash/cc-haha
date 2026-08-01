import { beforeEach, describe, expect, it, vi } from 'bun:test'

// Mock findToolByName before the module under test imports it
vi.mock('../../../Tool.js', () => ({
  findToolByName: vi.fn(),
}))

import type { ToolUseBlock } from '@anthropic-ai/sdk/resources/index.mjs'
import type { ToolUseContext } from '../../../Tool'
import { findToolByName } from '../../../Tool'
import { partitionToolCalls } from '../toolOrchestration'

const mockFind = findToolByName as unknown as {
  mockReturnValue: (v: unknown) => void
  mockImplementation: (fn: (...args: unknown[]) => unknown) => void
}

function mockBlock(id: string, name: string, input: unknown = {}): ToolUseBlock {
  return { id, name, input, type: 'tool_use' } as ToolUseBlock
}

function mockContext(): ToolUseContext {
  return {
    options: {
      tools: [],
      commands: [],
      debug: false,
      mainLoopModel: '',
      verbose: false,
      thinkingConfig: { budgetTokens: 0 },
      mcpClients: [],
      mcpResources: {},
      isNonInteractiveSession: false,
      agentDefinitions: { agents: {}, tools: {}, skills: {} },
    },
    abortController: new AbortController(),
    readFileState: {} as ToolUseContext['readFileState'],
    getAppState: () => ({}) as ReturnType<ToolUseContext['getAppState']>,
    setAppState: () => {},
  } as unknown as ToolUseContext
}

function mockTool(
  overrides: {
    safeParseResult?: { success: boolean; data: unknown }
    isConcurrencySafeImpl?: (input: unknown) => boolean
  } = {},
) {
  const { safeParseResult, isConcurrencySafeImpl } = overrides
  return {
    name: '',
    inputSchema: {
      safeParse: () => safeParseResult ?? { success: true, data: {} },
    },
    isConcurrencySafe: isConcurrencySafeImpl ?? (() => false),
  }
}

describe('partitionToolCalls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty array for empty input', () => {
    expect(partitionToolCalls([], mockContext())).toEqual([])
  })

  it('puts a single non-safe tool in its own batch', () => {
    const block = mockBlock('1', 'bash')
    mockFind.mockReturnValue(mockTool({ isConcurrencySafeImpl: () => false }))

    const result = partitionToolCalls([block], mockContext())

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ isConcurrencySafe: false, blocks: [block] })
  })

  it('puts a single concurrency-safe tool in its own batch', () => {
    const block = mockBlock('1', 'read')
    mockFind.mockReturnValue(mockTool({ isConcurrencySafeImpl: () => true }))

    const result = partitionToolCalls([block], mockContext())

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ isConcurrencySafe: true, blocks: [block] })
  })

  it('groups consecutive safe tools into one batch', () => {
    const b1 = mockBlock('1', 'read')
    const b2 = mockBlock('2', 'grep')
    mockFind.mockReturnValue(mockTool({ isConcurrencySafeImpl: () => true }))

    const result = partitionToolCalls([b1, b2], mockContext())

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ isConcurrencySafe: true, blocks: [b1, b2] })
  })

  it('splits consecutive non-safe tools into separate batches', () => {
    const b1 = mockBlock('1', 'write')
    const b2 = mockBlock('2', 'edit')
    mockFind.mockReturnValue(mockTool({ isConcurrencySafeImpl: () => false }))

    const result = partitionToolCalls([b1, b2], mockContext())

    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ isConcurrencySafe: false, blocks: [b1] })
    expect(result[1]).toEqual({ isConcurrencySafe: false, blocks: [b2] })
  })

  it('handles mixed safe and non-safe tools correctly', () => {
    const safe1 = mockBlock('1', 'read')
    const safe2 = mockBlock('2', 'grep')
    const unsafe = mockBlock('3', 'write')
    const safe3 = mockBlock('4', 'glob')

    mockFind.mockImplementation(((_tools: unknown, name: string) => {
      const isSafe = name !== 'write'
      return mockTool({ isConcurrencySafeImpl: () => isSafe })
    }) as () => unknown)

    const result = partitionToolCalls([safe1, safe2, unsafe, safe3], mockContext())

    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({
      isConcurrencySafe: true,
      blocks: [safe1, safe2],
    })
    expect(result[1]).toEqual({
      isConcurrencySafe: false,
      blocks: [unsafe],
    })
    expect(result[2]).toEqual({
      isConcurrencySafe: true,
      blocks: [safe3],
    })
  })

  it('treats tool-not-found as non-concurrency-safe', () => {
    const block = mockBlock('1', 'nonexistent')
    mockFind.mockReturnValue(undefined)

    const result = partitionToolCalls([block], mockContext())

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ isConcurrencySafe: false, blocks: [block] })
  })

  it('treats failed input parsing as non-concurrency-safe', () => {
    const block = mockBlock('1', 'bash')
    mockFind.mockReturnValue(
      mockTool({
        safeParseResult: { success: false, data: undefined },
      }),
    )

    const result = partitionToolCalls([block], mockContext())

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ isConcurrencySafe: false, blocks: [block] })
  })

  it('treats isConcurrencySafe that throws as not safe', () => {
    const block = mockBlock('1', 'crashy')
    mockFind.mockReturnValue(
      mockTool({
        isConcurrencySafeImpl: () => {
          throw new Error('parse failure')
        },
      }),
    )

    const result = partitionToolCalls([block], mockContext())

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ isConcurrencySafe: false, blocks: [block] })
  })

  it('separates safe batch when unsafe tool appears in middle', () => {
    const safe1 = mockBlock('1', 'read')
    const unsafe = mockBlock('2', 'write')
    const safe2 = mockBlock('3', 'grep')

    mockFind.mockImplementation(((_tools: unknown, name: string) => {
      const isSafe = name !== 'write'
      return mockTool({ isConcurrencySafeImpl: () => isSafe })
    }) as () => unknown)

    const result = partitionToolCalls([safe1, unsafe, safe2], mockContext())

    expect(result).toHaveLength(3)
    expect(result[0].isConcurrencySafe).toBe(true)
    expect(result[1].isConcurrencySafe).toBe(false)
    expect(result[2].isConcurrencySafe).toBe(true)
  })

  it('preserves block ordering in output', () => {
    const blocks = [
      mockBlock('a', 'read'),
      mockBlock('b', 'write'),
      mockBlock('c', 'read'),
      mockBlock('d', 'grep'),
      mockBlock('e', 'edit'),
    ]

    mockFind.mockImplementation(((_tools: unknown, name: string) => {
      const isSafe = name === 'read' || name === 'grep'
      return mockTool({ isConcurrencySafeImpl: () => isSafe })
    }) as () => unknown)

    const result = partitionToolCalls(blocks, mockContext())

    const ordered = result.flatMap((b) => b.blocks.map((bl) => bl.id))
    expect(ordered).toEqual(['a', 'b', 'c', 'd', 'e'])
  })
})

import { describe, expect, it } from 'bun:test'
import { parseSlashCommand } from '../slashCommandParsing'

describe('parseSlashCommand', () => {
  it('parses simple slash command', () => {
    const result = parseSlashCommand('/search foo bar')
    expect(result).toEqual({
      commandName: 'search',
      args: 'foo bar',
      isMcp: false,
    })
  })

  it('parses command with no args', () => {
    const result = parseSlashCommand('/help')
    expect(result).toEqual({
      commandName: 'help',
      args: '',
      isMcp: false,
    })
  })

  it('parses MCP command with (MCP) marker', () => {
    const result = parseSlashCommand('/mcp:tool (MCP) arg1 arg2')
    expect(result).toEqual({
      commandName: 'mcp:tool (MCP)',
      args: 'arg1 arg2',
      isMcp: true,
    })
  })

  it('returns null for input without leading slash', () => {
    expect(parseSlashCommand('hello world')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseSlashCommand('')).toBeNull()
  })

  it('returns null for just "/"', () => {
    expect(parseSlashCommand('/')).toBeNull()
  })

  it('handles input with leading/trailing whitespace', () => {
    const result = parseSlashCommand('  /config   value  ')
    expect(result).toEqual({
      commandName: 'config',
      args: '  value',
      isMcp: false,
    })
  })

  it('handles MCP command with no extra args', () => {
    const result = parseSlashCommand('/mcp:tool (MCP)')
    expect(result).toEqual({
      commandName: 'mcp:tool (MCP)',
      args: '',
      isMcp: true,
    })
  })

  it('does not flag (MCP) in third position as MCP', () => {
    const result = parseSlashCommand('/tool arg (MCP)')
    expect(result).toEqual({
      commandName: 'tool',
      args: 'arg (MCP)',
      isMcp: false,
    })
  })
})

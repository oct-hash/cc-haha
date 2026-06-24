/**
 * 测试 MCP 服务器 — 验证 Claude Code 能否正常启动 MCP 进程
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

const fs = require('fs')
fs.writeFileSync('D:/mcp-test.log', `Started at ${new Date().toISOString()}\nQQ_USER=${process.env.QQ_USER ? 'OK' : 'MISSING'}\n`, { flag: 'a' })

const server = new Server(
  { name: 'test-server', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: 'test_ping',
    description: '测试',
    inputSchema: { type: 'object', properties: {} }
  }]
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  return { content: [{ type: 'text', text: 'pong' }] }
})

const transport = new StdioServerTransport()
await server.connect(transport)
console.error('test-mcp-server started')

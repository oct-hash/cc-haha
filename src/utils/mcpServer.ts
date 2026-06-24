import {
  type ListToolsResult,
  type CallToolResult,
  type Tool,
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { randomUUID } from 'crypto'
import { createServer } from 'http'
import { shutdownDatadog } from '../services/analytics/datadog.js'
import { shutdown1PEventLogging } from '../services/analytics/firstPartyEventLogger.js'
import { initializeAnalyticsSink } from '../services/analytics/sink.js'
import { enableConfigs } from './config.js'
import { logForDebugging } from './debug.js'
import { getDefaultAppState } from 'src/state/AppStateStore.js'
import {
  findToolByName,
  getEmptyToolPermissionContext,
  type ToolUseContext,
} from '../Tool.js'
import { getTools } from '../tools.js'
import { createAbortController } from './abortController.js'
import { createFileStateCacheWithSizeLimit } from './fileStateCache.js'
import { logError } from './log.js'
import { createAssistantMessage } from './messages.js'
import { getMainLoopModel } from './model/model.js'
import { hasPermissionsToUseTool } from './permissions/permissions.js'
import { setCwd } from './Shell.js'
import { jsonStringify } from './slowOperations.js'
import { getErrorParts } from './toolErrors.js'
import { zodToJsonSchema } from './zodToJsonSchema.js'

const DEFAULT_ALLOWED_TOOLS = 'Read,Write,Edit,Bash,Glob,Grep'

function parseAllowedTools(): Set<string> {
  const envTools = process.env.MCP_SERVER_TOOLS ?? DEFAULT_ALLOWED_TOOLS
  return new Set(envTools.split(',').map(t => t.trim()))
}

function createMcpServer(cwd: string, debug: boolean, verbose: boolean) {
  const readFileStateCache = createFileStateCacheWithSizeLimit(100)
  setCwd(cwd)

  const server = new Server(
    { name: 'claude-code-haha', version: MACRO.VERSION },
    { capabilities: { tools: {} } },
  )

  const allowedTools = parseAllowedTools()

  server.setRequestHandler(
    ListToolsRequestSchema,
    async (): Promise<ListToolsResult> => {
      const toolPermissionContext = getEmptyToolPermissionContext()
      const allTools = getTools(toolPermissionContext)

      const filteredTools = allTools.filter(tool => allowedTools.has(tool.name))

      return {
        tools: await Promise.all(
          filteredTools.map(async tool => {
            let outputSchema: Tool['outputSchema'] | undefined
            if (tool.outputSchema) {
              const convertedSchema = zodToJsonSchema(tool.outputSchema)
              if (
                typeof convertedSchema === 'object' &&
                convertedSchema !== null &&
                'type' in convertedSchema &&
                convertedSchema.type === 'object'
              ) {
                outputSchema = convertedSchema as Tool['outputSchema']
              }
            }
            return {
              name: tool.name,
              description: await tool.prompt({
                getToolPermissionContext: async () => toolPermissionContext,
                tools: filteredTools,
                agents: [],
              }),
              inputSchema: zodToJsonSchema(tool.inputSchema) as Tool['inputSchema'],
              outputSchema,
            }
          }),
        ),
      }
    },
  )

  server.setRequestHandler(
    CallToolRequestSchema,
    async ({ params: { name, arguments: args } }): Promise<CallToolResult> => {
      if (!allowedTools.has(name)) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Tool ${name} is not allowed` }],
        }
      }

      const toolPermissionContext = getEmptyToolPermissionContext()
      const allTools = getTools(toolPermissionContext)
      const tool = findToolByName(allTools, name)

      if (!tool) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Tool ${name} not found` }],
        }
      }

      const toolUseContext: ToolUseContext = {
        abortController: createAbortController(),
        options: {
          commands: [],
          tools: allTools,
          mainLoopModel: getMainLoopModel(),
          thinkingConfig: { type: 'disabled' },
          mcpClients: [],
          mcpResources: {},
          isNonInteractiveSession: true,
          debug,
          verbose,
          agentDefinitions: { activeAgents: [], allAgents: [] },
        },
        getAppState: () => getDefaultAppState(),
        setAppState: () => {},
        messages: [],
        readFileState: readFileStateCache,
        setInProgressToolUseIDs: () => {},
        setResponseLength: () => {},
        updateFileHistoryState: () => {},
        updateAttributionState: () => {},
      }

      try {
        if (!tool.isEnabled()) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Tool ${name} is not enabled` }],
          }
        }

        const validationResult = await tool.validateInput?.(
          (args as never) ?? {},
          toolUseContext,
        )
        if (validationResult && !validationResult.result) {
          return {
            isError: true,
            content: [
              { type: 'text', text: `Tool ${name} input is invalid: ${validationResult.message}` },
            ],
          }
        }

        const result = await tool.call(
          (args as never) ?? {},
          toolUseContext,
          hasPermissionsToUseTool,
          createAssistantMessage({ content: [] }),
        )

        return {
          content: [
            {
              type: 'text' as const,
              text: typeof result === 'string' ? result : jsonStringify(result.data),
            },
          ],
        }
      } catch (error) {
        logError(error)
        const parts = error instanceof Error ? getErrorParts(error) : [String(error)]
        const errorText = parts.filter(Boolean).join('\n').trim() || 'Error'

        return {
          isError: true,
          content: [{ type: 'text', text: errorText }],
        }
      }
    },
  )

  return server
}

export async function runMcpServer(): Promise<void> {
  enableConfigs()
  initializeAnalyticsSink()

  const token = process.env.MCP_SERVER_TOKEN
  if (!token) {
    throw new Error('MCP_SERVER_TOKEN environment variable is required')
  }

  const port = Number(process.env.MCP_SERVER_PORT ?? 3000)
  const path = process.env.MCP_SERVER_PATH ?? '/mcp'
  const cwd = process.env.MCP_SERVER_CWD ?? process.cwd()
  const debug = process.env.DEBUG === '1'
  const verbose = process.env.VERBOSE === '1'

  const server = createMcpServer(cwd, debug, verbose)

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  })

  const httpServer = createServer()

  httpServer.on('request', (req, res) => {
    // Only handle the configured path
    if (!req.url?.startsWith(path)) {
      res.writeHead(404)
      res.end('Not found')
      return
    }

    const auth = req.headers.authorization
    if (auth !== `Bearer ${token}`) {
      res.writeHead(401)
      res.end('Unauthorized')
      return
    }

    transport.handleRequest(req, res)
  })

  await new Promise<void>(resolve => {
    httpServer.listen(port, () => {
      logForDebugging(`[MCP Server] Listening on http://localhost:${port}${path}`)
      resolve()
    })
  })

  // Handle graceful shutdown
  let exiting = false
  const shutdownAndExit = async (): Promise<void> => {
    if (exiting) return
    exiting = true
    await Promise.all([shutdown1PEventLogging(), shutdownDatadog()])
    process.exit(0)
  }
  process.stdin.on('end', () => void shutdownAndExit())
  process.stdin.on('error', () => void shutdownAndExit())

  logForDebugging('[MCP Server] Server started')
  await server.connect(transport)
}
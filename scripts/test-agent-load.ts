import type { AgentDefinition } from '../src/tools/AgentTool/loadAgentsDir.js'
import {
  getActiveAgentsFromList,
  getAgentDefinitionsWithOverrides,
} from '../src/tools/AgentTool/loadAgentsDir.js'

async function main() {
  console.log('STARTING AGENT LOAD TEST...')

  const result = await getAgentDefinitionsWithOverrides(process.cwd())

  console.log(`allAgents: ${result.allAgents.length}`)
  console.log(`activeAgents: ${result.activeAgents.length}`)

  // Per-source breakdown
  const perSource: Record<string, number> = {}
  for (const a of result.allAgents) {
    perSource[a.source] = (perSource[a.source] || 0) + 1
  }
  console.log('Per-source breakdown:', JSON.stringify(perSource, null, 2))

  // Check if all sources match expected filter keys
  const sources = Object.keys(perSource)
  const knownSources = [
    'built-in',
    'userSettings',
    'projectSettings',
    'policySettings',
    'localSettings',
    'flagSettings',
    'plugin',
  ]
  const unknown = sources.filter((s) => !knownSources.includes(s))
  if (unknown.length > 0) {
    console.log('UNKNOWN SOURCES:', unknown)
  } else {
    console.log('All sources are known filter keys ✓')
  }

  // Check for duplicate agentTypes
  const types = result.allAgents.map((a: AgentDefinition) => a.agentType)
  const uniqueTypes = new Set(types)
  console.log(
    `Unique agentTypes: ${uniqueTypes.size} (${types.length - uniqueTypes.size} duplicates)`,
  )

  // Check built-in agents
  const builtIn = result.allAgents.filter((a: AgentDefinition) => a.source === 'built-in')
  console.log(
    `Built-in agents (${builtIn.length}):`,
    builtIn.map((a_0: AgentDefinition) => a_0.agentType),
  )

  // List first 10 non-built-in agents with their sources
  const nonBuiltIn = result.allAgents.filter((a: AgentDefinition) => a.source !== 'built-in')
  console.log(`\nFirst 10 non-built-in agents:`)
  nonBuiltIn
    .slice(0, 10)
    .forEach((a: AgentDefinition) => { console.log(`  ${a.agentType} -> source=${a.source}`) })

  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

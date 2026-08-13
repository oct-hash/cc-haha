/**
 * Direct test of the store/rendering pipeline without TUI.
 * Tests whether agents are correctly stored and retrievable from the store pattern.
 */

import { AGENT_SOURCE_GROUPS } from '../src/tools/AgentTool/agentDisplay.js'
import {
  getActiveAgentsFromList,
  getAgentDefinitionsWithOverrides,
} from '../src/tools/AgentTool/loadAgentsDir.js'

async function main() {
  console.log('='.repeat(60))
  console.log('AGENT PIPELINE TEST')
  console.log('='.repeat(60))

  // Step 1: Load agents (same as main.tsx does)
  const agentDefs = await getAgentDefinitionsWithOverrides(process.cwd())
  console.log(`\n[STEP 1] getAgentDefinitionsWithOverrides:`)
  console.log(`  allAgents: ${agentDefs.allAgents.length}`)
  console.log(`  activeAgents: ${agentDefs.activeAgents.length}`)

  // Step 2: Simulate the merge (same as main.tsx lines 2052-2058)
  const allAgents = [...agentDefs.allAgents] // no CLI agents in test
  const activeAgents = getActiveAgentsFromList(allAgents)
  const agentDefinitions = { ...agentDefs, allAgents, activeAgents }
  console.log(`\n[STEP 2] After merge:`)
  console.log(`  allAgents: ${allAgents.length}`)
  console.log(`  activeAgents: ${activeAgents.length}`)

  // Step 3: Simulate the initialState (same as main.tsx line 2936)
  const initialState = { agentDefinitions }
  console.log(`\n[STEP 3] In initialState:`)
  console.log(`  agentDefinitions.allAgents: ${initialState.agentDefinitions.allAgents.length}`)
  console.log(
    `  agentDefinitions.activeAgents: ${initialState.agentDefinitions.activeAgents.length}`,
  )

  // Step 4: Verify per-source breakdown
  const perSource: Record<string, number> = {}
  for (const a of allAgents) {
    perSource[a.source] = (perSource[a.source] || 0) + 1
  }
  console.log(`\n[STEP 4] Per-source breakdown:`)
  for (const [source, count] of Object.entries(perSource)) {
    console.log(`  ${source}: ${count}`)
  }

  // Step 5: Check against AGENT_SOURCE_GROUPS
  console.log(`\n[STEP 5] AGENT_SOURCE_GROUPS coverage:`)
  for (const group of AGENT_SOURCE_GROUPS) {
    const count = allAgents.filter((a) => a.source === group.source).length
    const inGroup = perSource[group.source] || 0
    const match = count === inGroup ? '✓' : '✗'
    console.log(`  ${group.source}: ${count} agents, label="${group.label}" ${match}`)
  }

  // Step 6: Simulate agentsBySource filters (AgentsMenu.tsx pattern)
  console.log(`\n[STEP 6] Simulating agentsBySource filters:`)
  const userSettings = allAgents.filter((a) => a.source === 'userSettings')
  const projectSettings = allAgents.filter((a) => a.source === 'projectSettings')
  const builtIn = allAgents.filter((a) => a.source === 'built-in')
  console.log(`  userSettings: ${userSettings.length}`)
  console.log(`  projectSettings: ${projectSettings.length}`)
  console.log(`  builtIn: ${builtIn.length}`)

  // Step 7: Simulate hasNoAgents check (AgentsList.tsx line 233)
  const sortedAgents = [...activeAgents].sort((a, b) => a.agentType.localeCompare(b.agentType))
  const hasNonBuiltIn = sortedAgents.some((a) => a.source !== 'built-in')
  const hasNoAgents = sortedAgents.length === 0 || hasNonBuiltIn === false
  console.log(`\n[STEP 7] hasNoAgents check:`)
  console.log(`  sortedAgents.length: ${sortedAgents.length}`)
  console.log(`  hasNonBuiltIn: ${hasNonBuiltIn}`)
  console.log(`  hasNoAgents: ${hasNoAgents}`)
  console.log(
    `  ${hasNoAgents ? '✗ BLOCKED - would show empty state' : '✓ PASS - agents would render'}`,
  )

  // Step 8: Simulate AGENT_SOURCE_GROUPS rendering order
  console.log(`\n[STEP 8] Rendering order for "all" source:`)
  const nonBuiltInGroupSources = AGENT_SOURCE_GROUPS.filter(
    (g: { source: string }) => g.source !== 'built-in',
  )
  let totalRendered = 0
  for (const group of nonBuiltInGroupSources) {
    const groupAgents = allAgents.filter((a) => a.source === group.source)
    if (groupAgents.length > 0) {
      console.log(`  ${group.label} (${group.source}): ${groupAgents.length} agents ✓`)
      totalRendered += groupAgents.length
    } else {
      console.log(`  ${group.label} (${group.source}): 0 agents (skipped)`)
    }
  }
  // Also built-in
  console.log(`  Built-in: ${builtIn.length} agents`)

  console.log(
    `\n  Total renderable agents: ${totalRendered + builtIn.length} (${totalRendered} non-built-in + ${builtIn.length} built-in)`,
  )

  console.log(`\n${'='.repeat(60)}`)
  console.log('TEST COMPLETE')
  console.log('='.repeat(60))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

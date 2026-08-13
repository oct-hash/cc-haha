#!/usr/bin/env node
/**
 * Context7 CLI — direct REST API wrapper (replaces MCP server).
 *
 * Usage:
 *   node scripts/cli/context7.mjs resolve <libraryName> [query]
 *   node scripts/cli/context7.mjs query <libraryId> <query> [--json]
 *
 * API key: set CONTEXT7_API_KEY env var (optional, anonymous has lower rate limits)
 *
 * API reference: https://context7.com/api
 *   GET /v2/libs/search?libraryName=X&query=Y  → resolve
 *   GET /v2/context?libraryId=X&query=Y&type=txt|json → query
 */

const BASE = 'https://context7.com/api'

async function main() {
  const args = process.argv.slice(2)
  const cmd = args[0]

  if (!cmd || cmd === '--help' || cmd === '-h') {
    console.log(`Context7 CLI — direct REST API

Usage:
  node scripts/cli/context7.mjs resolve <libraryName> [query]
      Resolve a library name to a Context7 ID.
      Returns: JSON list of matching libraries with id, description, versions.

  node scripts/cli/context7.mjs query <libraryId> <query> [--json]
      Fetch documentation for a library ID.
      --json  return structured JSON instead of markdown text

Examples:
  node scripts/cli/context7.mjs resolve next.js "How to use middleware"
  node scripts/cli/context7.mjs query /vercel/next.js "getServerSideProps usage"
  node scripts/cli/context7.mjs query /supabase/supabase "auth signIn" --json

Authentication:
  Set CONTEXT7_API_KEY env var for higher rate limits.
  Anonymous access works but is rate-limited.
`)
    process.exit(0)
  }

  const apiKey = process.env.CONTEXT7_API_KEY
  const headers = {
    'User-Agent': 'context7-cli/1.0',
    Accept: 'application/json',
  }
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

  try {
    switch (cmd) {
      case 'resolve': {
        const libraryName = args[1]
        const query = args[2] || libraryName
        if (!libraryName) {
          console.error('Error: libraryName is required')
          process.exit(1)
        }
        const url = `${BASE}/v2/libs/search?${new URLSearchParams({ libraryName, query })}`
        const res = await fetch(url, { headers })
        if (!res.ok) {
          console.error(`Error ${res.status}: ${res.statusText}`)
          process.exit(1)
        }
        const data = await res.json()
        console.log(JSON.stringify(data, null, 2))
        break
      }

      case 'query': {
        const libraryId = args[1]
        const useJson = args.includes('--json')
        // Rebuild query from positional args, excluding known flags
        const query = args
          .slice(2)
          .filter((a) => a !== '--json')
          .join(' ')
        if (!libraryId || !query) {
          console.error('Error: libraryId and query are required')
          process.exit(1)
        }
        const params = new URLSearchParams({ libraryId, query, type: useJson ? 'json' : 'txt' })
        const url = `${BASE}/v2/context?${params}`
        const res = await fetch(url, { headers })
        if (!res.ok) {
          console.error(`Error ${res.status}: ${res.statusText}`)
          process.exit(1)
        }
        if (useJson) {
          const data = await res.json()
          console.log(JSON.stringify(data, null, 2))
        } else {
          const text = await res.text()
          console.log(text)
        }
        break
      }

      default:
        console.error(`Unknown command: ${cmd}`)
        console.error('Use --help for usage')
        process.exit(1)
    }
  } catch (err) {
    console.error(`Fetch failed: ${err.message}`)
    process.exit(1)
  }
}

main()

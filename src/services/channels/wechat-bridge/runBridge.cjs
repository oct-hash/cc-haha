// Simple Bridge - WeChat to Claude
const { execSync } = require('child_process')
const axios = require('axios')

const WEIXIN_ACCOUNT_ID = 'e87c180011fe-im-bot'
const ANTHROPIC_AUTH_TOKEN = process.env.ANTHROPIC_AUTH_TOKEN
const ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL || 'https://api.minimaxi.com/anthropic'
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'MiniMax-M2.7'
const CLAUDE_API_URL =
  (ANTHROPIC_BASE_URL?.endsWith('/v1') ? ANTHROPIC_BASE_URL : ANTHROPIC_BASE_URL + '/v1') +
  '/messages'

const weixinMcpBin = 'D:/npm-cache/_npx/7e052a239a18d57c/node_modules/weixin-mcp/dist/cli.js'

console.error('[Bridge] Starting...')
console.error('[Bridge] Account:', WEIXIN_ACCOUNT_ID)
console.error('[Bridge] API:', CLAUDE_API_URL)

if (!ANTHROPIC_AUTH_TOKEN) {
  console.error('[Bridge] FATAL: Missing ANTHROPIC_AUTH_TOKEN')
  process.exit(1)
}

function pollMessages() {
  try {
    const env = { WEIXIN_ACCOUNT_ID }
    for (const key in process.env) {
      if (key !== 'WEIXIN_ACCOUNT_ID') env[key] = process.env[key]
    }

    const output = execSync(`node "${weixinMcpBin}" poll`, {
      env,
      timeout: 30000,
      encoding: 'utf-8',
      shell: true,
    })
    return { output: output.trim(), error: null }
  } catch (e) {
    const errStr = String(e)
    if (errStr.includes('No new messages') || errStr.includes('timed out')) {
      return { output: '', error: null }
    }
    const status = e.status
    if (status !== undefined && status !== 0) {
      return { output: '', error: `exit ${status}` }
    }
    return { output: '', error: errStr.substring(0, 100) }
  }
}

function sendMessage(to, text) {
  try {
    const env = { WEIXIN_ACCOUNT_ID }
    for (const key in process.env) {
      if (key !== 'WEIXIN_ACCOUNT_ID') env[key] = process.env[key]
    }
    const safeText = text.replace(/"/g, '\\"')
    execSync(`node "${weixinMcpBin}" send ${to} "${safeText}"`, {
      env,
      timeout: 10000,
      encoding: 'utf-8',
      shell: true,
    })
    return true
  } catch (e) {
    console.error('[Bridge] send error:', String(e).substring(0, 100))
    return false
  }
}

async function callClaude(userId, message) {
  try {
    const response = await axios.post(
      CLAUDE_API_URL,
      {
        model: ANTHROPIC_MODEL,
        max_tokens: 4096,
        messages: [{ role: 'user', content: `微信用户 (ID: ${userId}) 说: ${message}` }],
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ANTHROPIC_AUTH_TOKEN}`,
          'anthropic-version': '2023-06-01',
        },
        timeout: 90000,
      },
    )
    return response.data.content?.[0]?.text || '抱歉，没有收到回复。'
  } catch (err) {
    console.error('[Bridge] Claude error:', err.response?.data?.error?.message || err.message)
    return '抱歉，处理消息时遇到错误。'
  }
}

function parseMessages(output) {
  if (!output) return []
  const messages = []
  const lines = output.split('\n')
  let inMessage = false

  for (const line of lines) {
    if (line.match(/^\d+ message/)) {
      inMessage = true
    } else if (inMessage && line.match(/^← /)) {
      const match = line.match(/^← (\S+): (.+)/s)
      if (match) {
        messages.push({ from: match[1], content: match[2].trim() })
      }
    }
  }
  return messages
}

let pollCount = 0

async function loop() {
  while (true) {
    pollCount++
    const { output, error } = pollMessages()

    if (error) {
      console.error(`[Bridge] Poll #${pollCount} error: ${error}`)
    } else if (output) {
      const messages = parseMessages(output)
      if (messages.length > 0) {
        console.error(`[Bridge] Poll #${pollCount}: ${messages.length} message(s)`)

        for (const msg of messages) {
          console.error(`[Bridge] >>> From ${msg.from}: ${msg.content.substring(0, 80)}`)

          const reply = await callClaude(msg.from, msg.content)
          console.error(`[Bridge] <<< Reply: ${reply.substring(0, 80)}...`)

          const sent = sendMessage(msg.from, reply)
          console.error(`[Bridge]     Sent: ${sent ? 'OK' : 'FAILED'}`)
        }
      } else if (pollCount % 10 === 0) {
        console.error(`[Bridge] Poll #${pollCount}: idle`)
      }
    } else if (pollCount % 10 === 0) {
      console.error(`[Bridge] Poll #${pollCount}: idle`)
    }

    await new Promise((r) => setTimeout(r, 5000))
  }
}

loop().catch(console.error)

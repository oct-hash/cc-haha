/**
 * Simple WeChat Bridge (Node.js)
 * Poll messages and forward to Claude, then reply
 */

import axios from 'axios'
import { execSync } from 'child_process'

const CONFIG = {
  weixinAccountId: 'e87c180011fe-im-bot',
  claudeApiKey: process.env.ANTHROPIC_AUTH_TOKEN || '',
  claudeApiUrl:
    `${process.env.ANTHROPIC_BASE_URL?.endsWith('/v1')
      ? process.env.ANTHROPIC_BASE_URL
      : `${process.env.ANTHROPIC_BASE_URL}/v1`}/messages`,
  claudeModel: process.env.ANTHROPIC_MODEL || 'MiniMax-M2.7',
  pollIntervalMs: 5000,
  maxResponseTimeMs: 90000,
}

async function pollMessages() {
  try {
    // Direct path to avoid npx issues
    const weixinMcpBin = 'D:/npm-cache/_npx/7e052a239a18d57c/node_modules/weixin-mcp/dist/cli.js'
    console.error('[Bridge] [DEBUG] exec with WEIXIN_ACCOUNT_ID:', CONFIG.weixinAccountId)
    const output = execSync(`node "${weixinMcpBin}" poll`, {
      env: { ...process.env, WEIXIN_ACCOUNT_ID: CONFIG.weixinAccountId },
      timeout: 35000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })

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
  } catch (err) {
    const error = err
    if (String(error).includes('No new messages') || String(error).includes('timed out')) {
      return []
    }
    console.error('[Bridge] Poll error:', String(error).substring(0, 200))
    return []
  }
}

async function sendMessage(to, text) {
  try {
    const weixinMcpBin = 'D:/npm-cache/_npx/7e052a239a18d57c/node_modules/weixin-mcp/dist/cli.js'
    execSync(`node "${weixinMcpBin}" send ${to} "${text.replace(/"/g, '\\"')}"`, {
      env: { ...process.env, WEIXIN_ACCOUNT_ID: CONFIG.weixinAccountId },
      timeout: 10000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  } catch (err) {
    console.error('[Bridge] Send error:', String(err).substring(0, 200))
  }
}

async function callClaude(userId, message) {
  try {
    const response = await axios.post(
      CONFIG.claudeApiUrl,
      {
        model: CONFIG.claudeModel,
        max_tokens: 4096,
        messages: [{ role: 'user', content: `微信用户 (ID: ${userId}) 说: ${message}` }],
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${CONFIG.claudeApiKey}`,
          'anthropic-version': '2023-06-01',
        },
        timeout: CONFIG.maxResponseTimeMs,
      },
    )
    return response.data.content?.[0]?.text || '抱歉，没有收到回复。'
  } catch (err) {
    const error = err
    console.error('[Bridge] Claude error:', error.response?.data?.error?.message || error.message)
    throw err
  }
}

async function main() {
  console.error('[Bridge] Starting...')
  console.error(`[Bridge] Account: ${CONFIG.weixinAccountId}`)
  console.error(`[Bridge] API: ${CONFIG.claudeApiUrl}`)

  if (!CONFIG.claudeApiKey) {
    console.error('[Bridge] Error: Missing ANTHROPIC_AUTH_TOKEN')
    process.exit(1)
  }

  let pollCount = 0

  while (true) {
    try {
      pollCount++
      const messages = await pollMessages()

      if (messages.length > 0) {
        console.error(`[Bridge] Poll #${pollCount}: ${messages.length} message(s)`)

        for (const msg of messages) {
          console.error(`[Bridge] >>> From ${msg.from}: ${msg.content.substring(0, 80)}`)
          console.error(`[Bridge]     Calling Claude...`)

          try {
            const reply = await callClaude(msg.from, msg.content)
            console.error(`[Bridge] <<< Reply: ${reply.substring(0, 80)}...`)
            await sendMessage(msg.from, reply)
            console.error(`[Bridge]     Sent!`)
          } catch (err) {
            console.error(`[Bridge]     Failed: ${err}`)
            await sendMessage(msg.from, '抱歉，处理消息时遇到错误。')
          }
        }
      } else if (pollCount % 30 === 0) {
        console.error(`[Bridge] Poll #${pollCount}: idle...`)
      }
    } catch (err) {
      console.error(`[Bridge] Loop error: ${err}`)
    }

    await new Promise((r) => setTimeout(r, CONFIG.pollIntervalMs))
  }
}

main().catch(console.error)

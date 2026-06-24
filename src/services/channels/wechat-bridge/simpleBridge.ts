/**
 * Simple WeChat Bridge
 * Poll messages and forward to Claude, then reply
 */

import { execSync, spawn } from 'node:child_process'
import axios from 'axios'

const CONFIG = {
  weixinAccountId: 'e87c180011fe-im-bot',
  claudeApiKey: process.env.ANTHROPIC_AUTH_TOKEN || '',
  claudeApiUrl: process.env.ANTHROPIC_BASE_URL?.replace('/v1', '/v1') || 'https://api.minimaxi.com/anthropic/v1/messages',
  claudeModel: process.env.ANTHROPIC_MODEL || 'MiniMax-M2.7',
  pollIntervalMs: 5000,
  maxResponseTimeMs: 90000,
}

async function pollMessages(): Promise<Array<{ from: string; content: string }>> {
  try {
    const output = execSync(`npx weixin-mcp poll`, {
      env: { ...process.env, WEIXIN_ACCOUNT_ID: CONFIG.weixinAccountId },
      timeout: 35000,
      encoding: 'utf-8',
    })

    const messages: Array<{ from: string; content: string }> = []
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
  } catch (err: unknown) {
    const error = err as { message?: string }
    if (error.message?.includes('No new messages') || error.message?.includes('timed out')) {
      return []
    }
    console.error('[Bridge] Poll error:', error.message)
    return []
  }
}

async function sendMessage(to: string, text: string): Promise<void> {
  try {
    const output = execSync(`npx weixin-mcp send ${to} "${text.replace(/"/g, '\\"')}"`, {
      env: { ...process.env, WEIXIN_ACCOUNT_ID: CONFIG.weixinAccountId },
      timeout: 10000,
      encoding: 'utf-8',
    })
    console.error('[Bridge] Send result:', output.toString().trim())
  } catch (err: unknown) {
    const error = err as { stderr?: string }
    console.error('[Bridge] Send error:', error.stderr)
  }
}

async function callClaude(userId: string, message: string): Promise<string> {
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
          'Authorization': `Bearer ${CONFIG.claudeApiKey}`,
          'anthropic-version': '2023-06-01',
        },
        timeout: CONFIG.maxResponseTimeMs,
      },
    )
    return response.data.content?.[0]?.text || '抱歉，没有收到回复。'
  } catch (err: unknown) {
    const error = err as { response?: { data?: { error?: { message?: string } } }; message?: string }
    console.error('[Bridge] Claude error:', error.response?.data?.error?.message || error.message)
    throw err
  }
}

async function main() {
  console.error('[Bridge] Starting...')
  console.error(`[Bridge] Account: ${CONFIG.weixinAccountId}`)

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

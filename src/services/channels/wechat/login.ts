/**
 * WeChat ClawBot Login Flow
 * Handles QR code scanning and session persistence
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { logForDebugging } from '../../../utils/debug.js'
import { DEFAULT_BASE_URL, fetchQRCode, pollQRCodeStatus } from './api.js'
import type { QRCodeStatus, WechatAccount } from './types.js'

const ACCOUNTS_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || '~',
  '.weixin-mcp',
  'accounts',
)

/**
 * Parse a single account file. A corrupt file (invalid JSON) logs a warning
 * and returns null instead of throwing — so one bad file cannot abort the
 * whole account scan and drop every other valid session.
 */
function safeParseAccountFile(filePath: string): WechatAccount | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as WechatAccount
  } catch (err) {
    logForDebugging(
      `[wechat] skipping corrupt account file ${filePath}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
    return null
  }
}

export interface LoginResult {
  account: WechatAccount
  qrcode: string // Base64 QR code image
}

/**
 * Load existing account or initiate new login
 */
export async function loadOrLogin(accountId?: string): Promise<LoginResult> {
  // Try to load existing account
  const existing = loadAccount(accountId)
  if (existing) {
    return {
      account: existing,
      qrcode: '', // No QR code needed for existing session
    }
  }

  // Need to login
  return login()
}

/**
 * Initiate QR code login flow
 */
export async function login(): Promise<LoginResult> {
  // Ensure accounts directory exists
  await fs.promises.mkdir(ACCOUNTS_DIR, { recursive: true })

  // Fetch QR code
  const qrResponse = await fetchQRCode(DEFAULT_BASE_URL)

  // Poll for status (this is async, caller should handle polling)
  return {
    account: {
      token: '',
      baseUrl: DEFAULT_BASE_URL,
      userId: '',
      savedAt: new Date().toISOString(),
    },
    qrcode: qrResponse.qrcode,
  }
}

/**
 * Poll QR code status until confirmed
 */
export async function waitForQRCodeConfirm(
  qrcodeId: string,
  maxRetries = 30,
  pollIntervalMs = 2000,
): Promise<WechatAccount> {
  for (let i = 0; i < maxRetries; i++) {
    const status = await pollQRCodeStatus(DEFAULT_BASE_URL, qrcodeId)

    if (status.status === 'confirmed' && status.bot_token) {
      const account: WechatAccount = {
        token: status.bot_token,
        baseUrl: status.baseurl || DEFAULT_BASE_URL,
        userId: status.ilink_user_id || `wechat_${status.ilink_bot_id}`,
        savedAt: new Date().toISOString(),
      }

      // Save account
      await saveAccount(account)
      return account
    }

    if (status.status === 'expired') {
      throw new Error('QR code expired. Please try again.')
    }

    // Wait before next poll
    await sleep(pollIntervalMs)
  }

  throw new Error('QR code confirmation timeout. Please try again.')
}

/**
 * Load account from disk
 */
export function loadAccount(accountId?: string): WechatAccount | null {
  try {
    const dir = ACCOUNTS_DIR

    if (!fs.existsSync(dir)) {
      return null
    }

    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))

    if (accountId) {
      const filePath = path.join(dir, `${accountId}.json`)
      if (fs.existsSync(filePath)) {
        const data = safeParseAccountFile(filePath)
        if (data?.token) return data
      }
    }

    // Return first account with valid token
    for (const file of files) {
      const filePath = path.join(dir, file)
      const data = safeParseAccountFile(filePath)
      if (data?.token) return data
    }

    return null
  } catch {
    return null
  }
}

/**
 * Save account to disk
 */
export async function saveAccount(account: WechatAccount): Promise<void> {
  await fs.promises.mkdir(ACCOUNTS_DIR, { recursive: true })

  // Generate account ID from userId
  const accountId = account.userId.replace(/[@.]/g, '_')
  const filePath = path.join(ACCOUNTS_DIR, `${accountId}.json`)

  // Merge with existing data to preserve any additional fields
  let existing: Record<string, unknown> = {}
  if (fs.existsSync(filePath)) {
    existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  }

  const merged = { ...existing, ...account }
  await fs.promises.writeFile(filePath, JSON.stringify(merged, null, 2))
}

/**
 * Delete account from disk
 */
export async function deleteAccount(accountId: string): Promise<void> {
  const filePath = path.join(ACCOUNTS_DIR, `${accountId}.json`)
  if (fs.existsSync(filePath)) {
    await fs.promises.unlink(filePath)
  }
}

/**
 * List all saved accounts
 */
export function listAccounts(): WechatAccount[] {
  try {
    if (!fs.existsSync(ACCOUNTS_DIR)) {
      return []
    }

    const files = fs.readdirSync(ACCOUNTS_DIR).filter((f) => f.endsWith('.json'))
    const accounts: WechatAccount[] = []

    for (const file of files) {
      const filePath = path.join(ACCOUNTS_DIR, file)
      const data = safeParseAccountFile(filePath)
      if (data?.token) {
        accounts.push(data)
      }
    }

    return accounts
  } catch {
    return []
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * WeChat ClawBot API
 * Base URL: https://ilinkai.weixin.qq.com
 */

import axios, { type AxiosInstance } from 'axios'
import type {
  QRCodePollResponse,
  QRCodeResponse,
  QRCodeStatus,
  WechatAccount,
  WechatConfig,
  WechatContact,
  WechatMessage,
  WechatSendMessage,
  WechatUpdate,
} from './types.js'

// Generate random WECHAT-UIN header
function generateWechatUin(): string {
  const bytes = new Uint8Array(4)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
}

// Create authenticated axios instance
function createClient(token: string, baseUrl: string): AxiosInstance {
  return axios.create({
    baseURL: baseUrl,
    headers: {
      Authorization: `Bearer ${token}`,
      AuthorizationType: 'ilink_bot_token',
      'X-WECHAT-UIN': generateWechatUin(),
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  })
}

// ============ Login API ============

export async function fetchQRCode(baseUrl: string): Promise<QRCodeResponse> {
  const client = createClient('dummy', baseUrl)
  const response = await client.post('/ilink/bot/get_qrcode', {
    client_id: generateClientId(),
    client_type: 2,
  })
  return response.data
}

export async function pollQRCodeStatus(
  baseUrl: string,
  qrcodeId: string,
): Promise<QRCodePollResponse> {
  const client = createClient('dummy', baseUrl)
  const response = await client.post('/ilink/bot/get_qrcode_status', {
    qrcode_id: qrcodeId,
    client_id: generateClientId(),
    client_type: 2,
  })
  return response.data
}

// ============ Account API ============

export async function getAccountInfo(
  account: WechatAccount,
): Promise<{ ilink_user_id: string; ilink_bot_id: string }> {
  const client = createClient(account.token, account.baseUrl)
  const response = await client.post('/ilink/bot/getaccountinfo', {
    client_id: generateClientId(),
    client_type: 2,
  })
  return {
    ilink_user_id: response.data.ilink_user_id,
    ilink_bot_id: response.data.ilink_bot_id,
  }
}

// ============ Messaging API ============

export async function sendTextMessage(
  to: string,
  text: string,
  account: WechatAccount,
  contextToken?: string,
): Promise<{ message_id: string }> {
  const client = createClient(account.token, account.baseUrl)
  const response = await client.post('/ilink/bot/sendmessage', {
    to_ilink_user_id: to,
    msg: {
      client_id: generateClientId(),
      item_list: [{ type: 1, content: text }],
      message_type: 2,
      message_state: 2,
      ...(contextToken && { context_token: contextToken }),
    },
  })
  return { message_id: response.data.message_id }
}

export async function sendImageMessage(
  to: string,
  mediaId: string,
  account: WechatAccount,
  contextToken?: string,
): Promise<{ message_id: string }> {
  const client = createClient(account.token, account.baseUrl)
  const response = await client.post('/ilink/bot/sendmessage', {
    to_ilink_user_id: to,
    msg: {
      client_id: generateClientId(),
      item_list: [{ type: 2, media_id: mediaId }],
      message_type: 2,
      message_state: 2,
      ...(contextToken && { context_token: contextToken }),
    },
  })
  return { message_id: response.data.message_id }
}

export async function sendFileMessage(
  to: string,
  mediaId: string,
  fileName: string,
  account: WechatAccount,
  contextToken?: string,
): Promise<{ message_id: string }> {
  const client = createClient(account.token, account.baseUrl)
  const response = await client.post('/ilink/bot/sendmessage', {
    to_ilink_user_id: to,
    msg: {
      client_id: generateClientId(),
      item_list: [{ type: 4, media_id: mediaId, file_name: fileName }],
      message_type: 2,
      message_state: 2,
      ...(contextToken && { context_token: contextToken }),
    },
  })
  return { message_id: response.data.message_id }
}

export async function sendVideoMessage(
  to: string,
  mediaId: string,
  account: WechatAccount,
  contextToken?: string,
): Promise<{ message_id: string }> {
  const client = createClient(account.token, account.baseUrl)
  const response = await client.post('/ilink/bot/sendmessage', {
    to_ilink_user_id: to,
    msg: {
      client_id: generateClientId(),
      item_list: [{ type: 5, media_id: mediaId }],
      message_type: 2,
      message_state: 2,
      ...(contextToken && { context_token: contextToken }),
    },
  })
  return { message_id: response.data.message_id }
}

export async function sendTyping(
  to: string,
  typingTicket: string,
  status: boolean,
  account: WechatAccount,
): Promise<void> {
  const client = createClient(account.token, account.baseUrl)
  await client.post('/ilink/bot/sendtyping', {
    to_ilink_user_id: to,
    typing_ticket: typingTicket,
    typing_status: status ? 1 : 0,
  })
}

export async function getUpdates(account: WechatAccount, cursor?: string): Promise<WechatUpdate> {
  const client = createClient(account.token, account.baseUrl)
  const response = await client.post('/ilink/bot/getupdates', {
    client_id: generateClientId(),
    cursor: cursor || '',
  })
  return response.data
}

export async function getConfig(account: WechatAccount): Promise<WechatConfig> {
  const client = createClient(account.token, account.baseUrl)
  const response = await client.post('/ilink/bot/getconfig', {
    client_id: generateClientId(),
  })
  return response.data
}

// ============ Media API ============

export async function uploadMedia(
  data: Buffer,
  fileType: 'image' | 'file' | 'video',
  account: WechatAccount,
): Promise<{ media_id: string }> {
  const client = createClient(account.token, account.baseUrl)

  const formData = new FormData()
  formData.append('client_id', generateClientId())
  formData.append(
    'file',
    new Blob([data]),
    `file.${fileType === 'image' ? 'png' : fileType === 'video' ? 'mp4' : 'bin'}`,
  )
  formData.append('file_type', fileType === 'image' ? '2' : fileType === 'video' ? '5' : '4')

  const response = await client.post('/ilink/bot/uploadmedia', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
  return { media_id: response.data.media_id }
}

// ============ Contact API ============

export async function getContacts(account: WechatAccount): Promise<WechatContact[]> {
  const client = createClient(account.token, account.baseUrl)
  const response = await client.post('/ilink/bot/getcontactlist', {
    client_id: generateClientId(),
  })
  return response.data.contact_list || []
}

// ============ Utility ============

function generateClientId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export const DEFAULT_BASE_URL = 'https://ilinkai.weixin.qq.com'

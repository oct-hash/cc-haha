/**
 * WeChat ClawBot API Types
 * Based on https://github.com/bkmashiro/weixin-mcp
 */

export interface WechatAccount {
  token: string
  baseUrl: string
  userId: string
  savedAt: string
}

export interface WechatMessage {
  client_id: string
  item_list: WechatMessageItem[]
  message_type: number // 2 = BOT
  message_state: number // 2 = FINISH
  context_token?: string
  from_nickname?: string
  from_avatar_url?: string
  create_time?: number
}

export interface WechatMessageItem {
  type: number
  content?: string
  media_id?: string
  file_name?: string
  file_size?: number
  duration?: number // for video
}

export interface WechatSendMessage {
  client_id: string
  item_list: WechatMessageItem[]
  message_type: number
  message_state: number
  context_token?: string
}

export interface WechatUpdate {
  cursor?: string
  msg_list: WechatMessage[]
  sync_key?: string
}

export interface WechatConfig {
  typing_ticket?: string
  context_token?: string
}

export type QRCodeStatus = 'wait' | 'scaned' | 'confirmed' | 'expired'

export interface QRCodeResponse {
  qrcode_id: string
  qrcode: string // Base64 QR code image
  url: string // QR code URL for display
}

export interface QRCodePollResponse {
  status: QRCodeStatus
  bot_token?: string
  baseurl?: string
  ilink_user_id?: string
  ilink_bot_id?: string
}

export interface WechatContact {
  user_id: string
  nickname: string
  avatar_url?: string
}

// Tool input types
export interface SendTextInput {
  to: string
  text: string
}

export interface SendImageInput {
  to: string
  media_id: string
}

export interface SendFileInput {
  to: string
  media_id: string
  file_name: string
}

export interface SendVideoInput {
  to: string
  media_id: string
}

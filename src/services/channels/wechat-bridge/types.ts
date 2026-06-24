/**
 * WeChat Bridge Service Types
 *
 * Bridge between WeChat (via weixin-mcp) and Claude Code
 * - Poll WeChat messages
 * - Call Claude Code API
 * - Send responses back to WeChat
 */

export interface WechatMessage {
  from_user_id: string
  to_user_id: string
  message_id?: number
  create_time_ms?: number
  session_id?: string
  message_type: number
  message_state: number
  item_list: MessageItem[]
  context_token?: string
}

export interface MessageItem {
  type: number
  text_item?: { text: string }
  image_item?: ImageItem
  file_item?: FileItem
  video_item?: VideoItem
  voice_item?: VoiceItem
}

export interface ImageItem {
  encrypt_query_param: string
  aes_key: string
}

export interface FileItem {
  encrypt_query_param: string
  aes_key: string
  file_name?: string
}

export interface VideoItem {
  encrypt_query_param: string
  aes_key: string
}

export interface VoiceItem {
  encrypt_query_param: string
  aes_key: string
}

export interface PollResult {
  messages: WechatMessage[]
  cursor?: string
}

export interface BridgeConfig {
  weixinMcpUrl: string
  claudeApiUrl: string
  claudeApiKey: string
  claudeModel: string
  accountId: string
  pollIntervalMs: number
  typingDelayMs: number
}

export interface PendingRequest {
  message: WechatMessage
  replyTo: string
  contextToken?: string
  timestamp: number
}

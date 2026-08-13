import type { StdinMessage, StdoutMessage } from '../../entrypoints/sdk/controlTypes.js'

export type StreamClientEvent = {
  type: 'message' | 'error' | 'close'
  data?: StdoutMessage
  error?: Error
}

export type Transport = {
  connect(): Promise<void>
  disconnect(): Promise<void>
  send(message: StdinMessage): Promise<void>
  onMessage(handler: (message: StdoutMessage) => void): void
  onError(handler: (error: Error) => void): void
  onClose(handler: () => void): void
}

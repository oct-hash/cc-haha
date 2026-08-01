import { describe, expect, it, mock } from 'bun:test'
import { notifyCommandLifecycle, setCommandLifecycleListener } from '../commandLifecycle'

describe('commandLifecycle', () => {
  it('notifies listener with uuid and state', () => {
    const listener = mock<(uuid: string, state: string) => void>()
    setCommandLifecycleListener(listener)

    notifyCommandLifecycle('test-uuid', 'started')

    expect(listener).toHaveBeenCalledWith('test-uuid', 'started')
  })

  it('does not throw when no listener is set', () => {
    setCommandLifecycleListener(null)
    expect(() => notifyCommandLifecycle('uuid', 'completed')).not.toThrow()
  })

  it('notifies with completed state', () => {
    const listener = mock<(uuid: string, state: string) => void>()
    setCommandLifecycleListener(listener)

    notifyCommandLifecycle('another-uuid', 'completed')

    expect(listener).toHaveBeenCalledWith('another-uuid', 'completed')
  })

  it('can clear listener by setting null', () => {
    const listener = mock<(uuid: string, state: string) => void>()
    setCommandLifecycleListener(listener)
    setCommandLifecycleListener(null)

    notifyCommandLifecycle('uuid', 'started')

    expect(listener).not.toHaveBeenCalled()
  })

  it('replaces previous listener with new one', () => {
    const first = mock<(uuid: string, state: string) => void>()
    const second = mock<(uuid: string, state: string) => void>()

    setCommandLifecycleListener(first)
    setCommandLifecycleListener(second)

    notifyCommandLifecycle('uuid', 'started')

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith('uuid', 'started')
  })
})

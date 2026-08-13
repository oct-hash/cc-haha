import { beforeEach, describe, expect, it } from 'bun:test'
import { FlushGate } from '../flushGate'

describe('FlushGate', () => {
  let gate: FlushGate<string>

  beforeEach(() => {
    gate = new FlushGate<string>()
  })

  it('starts inactive', () => {
    expect(gate.active).toBe(false)
    expect(gate.pendingCount).toBe(0)
  })

  it('start activates the gate', () => {
    gate.start()
    expect(gate.active).toBe(true)
  })

  it('enqueue queues items when active', () => {
    gate.start()
    const queued = gate.enqueue('a', 'b')
    expect(queued).toBe(true)
    expect(gate.pendingCount).toBe(2)
  })

  it('enqueue returns false when inactive', () => {
    const queued = gate.enqueue('x')
    expect(queued).toBe(false)
    expect(gate.pendingCount).toBe(0)
  })

  it('end drains queued items and deactivates', () => {
    gate.start()
    gate.enqueue('hello', 'world')
    const drained = gate.end()
    expect(drained).toEqual(['hello', 'world'])
    expect(gate.active).toBe(false)
    expect(gate.pendingCount).toBe(0)
  })

  it('end returns empty array if nothing queued', () => {
    gate.start()
    expect(gate.end()).toEqual([])
  })

  it('drop discards items and returns count', () => {
    gate.start()
    gate.enqueue('a', 'b', 'c')
    const dropped = gate.drop()
    expect(dropped).toBe(3)
    expect(gate.active).toBe(false)
    expect(gate.pendingCount).toBe(0)
  })

  it('deactivate clears active flag without dropping items', () => {
    gate.start()
    gate.enqueue('keep-me')
    gate.deactivate()
    expect(gate.active).toBe(false)
    expect(gate.pendingCount).toBe(1)
  })

  it('after end, enqueue returns false again', () => {
    gate.start()
    gate.end()
    expect(gate.enqueue('late')).toBe(false)
  })

  it('multiple enqueue calls accumulate items', () => {
    gate.start()
    gate.enqueue('a')
    gate.enqueue('b', 'c')
    expect(gate.pendingCount).toBe(3)
  })
})

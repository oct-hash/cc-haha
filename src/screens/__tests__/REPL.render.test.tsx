import { describe, expect, it } from 'bun:test'
import { render } from 'ink-testing-library'
import React from 'react'
import { MainRender } from '../REPL.render'
import { createMockMainRenderProps } from './REPL.testHelpers'

describe('MainRender', () => {
  it('renders without throwing with default mock props', () => {
    const props = createMockMainRenderProps()
    // MainRender should return a React element (not throw)
    const element = MainRender(props)
    expect(element).toBeDefined()
    expect(React.isValidElement(element)).toBe(true)
  })

  it('produces output when rendered via ink-testing-library', () => {
    const props = createMockMainRenderProps()
    const { lastFrame, unmount } = render(MainRender(props) as React.ReactElement)
    const frame = lastFrame()
    // Should produce some terminal output
    expect(typeof frame).toBe('string')
    unmount()
  })

  it('renders in transcript screen mode without throwing', () => {
    const props = createMockMainRenderProps({ screen: 'transcript' })
    const element = MainRender(props)
    expect(React.isValidElement(element)).toBe(true)
  })

  it('renders in loading state without throwing', () => {
    const props = createMockMainRenderProps({ isLoading: true, showSpinner: true })
    const element = MainRender(props)
    expect(React.isValidElement(element)).toBe(true)
  })

  it('renders with displayed messages without throwing', () => {
    const props = createMockMainRenderProps({
      displayedMessages: [
        { type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'hello' }] } },
      ] as any,
    })
    const element = MainRender(props)
    expect(React.isValidElement(element)).toBe(true)
  })

  it('renders with toolJSX content without throwing', () => {
    const props = createMockMainRenderProps({
      toolJSX: { jsx: React.createElement('text', null, 'tool output'), isLocalJSXCommand: false },
    })
    const element = MainRender(props)
    expect(React.isValidElement(element)).toBe(true)
  })

  it('renders companion visible without throwing', () => {
    const props = createMockMainRenderProps({ companionVisible: true })
    const element = MainRender(props)
    expect(React.isValidElement(element)).toBe(true)
  })

  it('renders with tasksV2 enabled without throwing', () => {
    const props = createMockMainRenderProps({ tasksV2: true })
    const element = MainRender(props)
    expect(React.isValidElement(element)).toBe(true)
  })
})

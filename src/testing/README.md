# Testing Guide

## Framework

We use **Bun's built-in test runner** (`bun test`). No Jest, no Vitest.

## Structure

- `__tests__/` directory adjacent to source files
- Example: `src/utils/__tests__/array.test.ts` tests `src/utils/array.ts`

## Conventions

### AAA Pattern

```ts
import { describe, it, expect } from 'bun:test'

describe('functionName', () => {
  it('does X when given Y', () => {
    // Arrange
    const input = 'hello'
    // Act
    const result = capitalize(input)
    // Assert
    expect(result).toBe('Hello')
  })
})
```

### Mocking

Use `vi.mock()` for module-level mocking, `vi.fn()` for function spies.

```ts
import { vi } from 'bun:test'
vi.mock('../../utils/debug.js', () => ({ logForDebugging: vi.fn() }))
```

### Testing Rules

1. Test observable behavior, not implementation details
2. One assertion concept per test
3. No random data — use deterministic fixtures
4. No mocking of third-party libraries directly
5. Restore mocks in `afterEach`

### Shared Utilities

Import from `src/testing/`:
- `mockFactories.ts` — mock factories (mockEnv, createSpy)
- `fixtures.ts` — static test data

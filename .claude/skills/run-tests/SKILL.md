---
name: run-tests
description: 运行 claude-code-haha 测试套件
---

# Run Tests

Run tests for claude-code-haha.

## Commands

### All tests
```bash
bun test
```

### Watch mode
```bash
bun test:watch
```

### Specific test file
```bash
bun test src/tools/my-tool.test.ts
```

### With coverage
```bash
bun test:coverage
```

### E2E tests
```bash
bun test:e2e
```

### Specific category
```bash
bun test --filter unit
bun test --filter integration
bun test --filter e2e
```

## Test Structure

```
src/
├── *.test.ts          # Unit tests
├── *.e2e.test.ts      # E2E tests
└── test-helpers/      # Shared test utilities
```

## Writing Tests

```typescript
import { describe, it, expect } from 'vitest'

describe('my feature', () => {
  it('should work', () => {
    expect(true).toBe(true)
  })
})
```

## Debugging Failed Tests

```bash
bun test --reporter=verbose
bun test --reporter=json > test-output.json
```

// Global test setup — loaded via bunfig.toml [test] preload
import { afterEach } from 'bun:test';

// Restore process.env after each test to prevent cross-test pollution
const originalEnv = { ...process.env };

afterEach(() => {
  // Restore all original env keys and remove any added ones
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    } else if (process.env[key] !== originalEnv[key as keyof typeof originalEnv]) {
      process.env[key] = originalEnv[key as keyof typeof originalEnv];
    }
  }
});

// Suppress console noise during tests
const noop = () => {};
if (process.env.CI) {
  console.log = noop;
  console.warn = noop;
}

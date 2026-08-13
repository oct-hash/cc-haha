// Shared mock factories for test files


/** Create a mock environment with given variables, returning a cleanup function */
export function mockEnv(envVars: Record<string, string>): () => void {
  const original: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(envVars)) {
    original[key] = process.env[key]
    process.env[key] = value
  }
  return () => {
    for (const [key] of Object.entries(envVars)) {
      if (original[key] === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = original[key]
      }
    }
  }
}

/** Create a spy function that tracks calls and returns the given value */
export function createSpy<T extends (...args: any[]) => any>(
  returnValue?: ReturnType<T>,
): T & { calls: any[][] } {
  const calls: any[][] = []
  const fn = ((...args: any[]) => {
    calls.push(args)
    return returnValue
  }) as any
  fn.calls = calls
  fn.mockClear = () => (calls.length = 0)
  return fn
}

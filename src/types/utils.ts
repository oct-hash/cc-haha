// ============================================================================
// Utility types
// ============================================================================

/** Makes all properties deeply readonly (recursive). */
export type DeepImmutable<T> =
  T extends Map<infer K, infer V>
    ? ReadonlyMap<K, DeepImmutable<V>>
    : T extends Set<infer U>
      ? ReadonlySet<DeepImmutable<U>>
      : T extends (...args: infer A) => infer R
        ? (...args: A) => R
        : T extends object
          ? { readonly [P in keyof T]: DeepImmutable<T[P]> }
          : T

/**
 * Exhaustiveness helper for `satisfies` — verifies that a tuple/array
 * contains every member of the string union T at least once.
 */
export type Permutations<T extends string, U extends string = T> = [T] extends [never]
  ? []
  : T extends string
    ? [T, ...Permutations<Exclude<U, T>>]
    : []

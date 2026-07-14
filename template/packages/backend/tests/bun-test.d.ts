// ponytail: minimal bun:test surface so typecheck passes without adding the
// @types/bun devDependency; widen to the real package if the test API grows.
declare module "bun:test" {
  export const mock: {
    module(specifier: string, factory: () => unknown): void;
    restore(): void;
  };
  export function describe(name: string, fn: () => void): void;
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function expect(actual: unknown): {
    toBe(expected: unknown): void;
    toMatch(expected: RegExp | string): void;
    toBeGreaterThanOrEqual(expected: number): void;
    toBeLessThan(expected: number): void;
  };
}

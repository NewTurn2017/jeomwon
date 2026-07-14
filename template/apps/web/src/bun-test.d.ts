// ponytail: minimal bun:test surface so typecheck passes without adding the
// @types/bun devDependency. Keep this in sync with
// packages/backend/tests/bun-test.d.ts — the IDE merges ambient declarations
// of the same module across the workspace, so a narrower copy here would
// shadow matchers used by the backend tests.
declare module "bun:test" {
  export function describe(name: string, fn: () => void): void;
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function expect(actual: unknown): {
    toBe(expected: unknown): void;
    toMatch(expected: RegExp | string): void;
    toBeGreaterThanOrEqual(expected: number): void;
    toBeLessThan(expected: number): void;
  };
}

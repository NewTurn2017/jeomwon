declare module "bun:test" {
  type Matchers = {
    readonly not: Matchers;
    toBe(expected: unknown): void;
    toContain(expected: unknown): void;
    toEqual(expected: unknown): void;
    toMatchObject(expected: unknown): void;
  };

  export const mock: {
    module(specifier: string, factory: () => unknown): void;
  };
  export function describe(name: string, run: () => void): void;
  export function expect(actual: unknown): Matchers;
  export function test(name: string, run: () => void | Promise<void>): void;
}

/**
 * Ambient declarations for the `vitest` module so `tsc --noEmit`
 * doesn't fail on `import { describe, it, expect, vi } from "vitest"`
 * in our co-located unit tests when @types/vitest isn't wired in.
 *
 * The Zen test driver is `scripts/run-feature-tests.mjs` (Node ESM
 * scripts under `test/`), not vitest itself — these *.test.ts files
 * are co-located unit specifications next to the modules they test.
 * Vitest is not in our dependencies. This shim is purely for tsc.
 *
 * `expect` and `vi.fn()` are typed permissively (so test bodies can
 * chain the full chai-like matcher API — `expect(x).toBe(...)`,
 * `.toEqual(...)`, `.toThrow(...)`, etc. — and use the mock helpers
 * — `vi.fn()`, `vi.mocked(...).mockResolvedValue(...)`,
 * `.mockImplementation(...)` — without each call needing a typed
 * fixture). The trade-off is loss of static type-safety; the upside
 * is a single shim that scales to any future matcher or helper.
 *
 * Long-term: add vitest as a devDependency (`pnpm add -D vitest`)
 * and delete this shim in favour of the package's bundled types.
 */
declare module "vitest" {
  export function describe(
    name: string,
    fn: () => void | Promise<void>,
  ): void;
  export function it(
    name: string,
    fn: () => void | Promise<void>,
  ): void;
  /** Also accept `test` so older copy-pasted suites compile. */
  export function test(
    name: string,
    fn: () => void | Promise<void>,
  ): void;
  export function beforeAll(fn: () => void | Promise<void>): void;
  export function beforeEach(fn: () => void | Promise<void>): void;
  export function afterAll(fn: () => void | Promise<void>): void;
  export function afterEach(fn: () => void | Promise<void>): void;
  // Permissive so the chai-like matcher chain compiles.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const expect: any;

  /**
   * The double-return `MockFn` is what `vi.fn()` produces. The
   * overloads let test code chain `.mockResolvedValue(...)`,
   * `.mockImplementation(...)`, etc. without each call needing
   * a typed fixture.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export interface MockFn {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (...args: any[]): any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReturnValue(v: any): MockFn;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockResolvedValue(v: any): MockFn;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockRejectedValue(v: any): MockFn;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockImplementation(fn: (...args: any[]) => any): MockFn;
    mockClear(): MockFn;
    mockReset(): MockFn;
    mockRestore(): MockFn;
  }

  /**
   * The `vi` namespace exposes the test-time helpers we use across
   * the hook tests. `vi.fn()` returns a `MockFn`; `vi.mock(path,
   * factory)` registers an auto-hoisted module mock; `vi.mocked(obj)`
   * brings typed mock helpers onto a mocked function.
   *
   * `clearAllMocks` / `resetAllMocks` / `restoreAllMocks` are the
   * canonical cleanup hooks for `beforeEach`/`afterEach`.
   */
  export const vi: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fn: (impl?: (...args: any[]) => any) => MockFn;
    mock: (path: string, factory?: () => unknown) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mocked: <T>(obj: T) => any;
    clearAllMocks: () => void;
    resetAllMocks: () => void;
    restoreAllMocks: () => void;
    spyOn: (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      obj: any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      method: any,
    ) => MockFn;
  };
}

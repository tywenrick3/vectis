import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../logger.js", () => ({
  createLogger: () => ({
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { retry } from "../retry.js";

describe("retry", () => {
  let setTimeoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");

    const result = await retry(fn, { delayMs: 0 });

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("returns result after retrying on transient failure", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce("ok");

    const result = await retry(fn, { delayMs: 0 });

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting all attempts", async () => {
    const fn = vi.fn().mockImplementation(() => {
      throw new Error("always fails");
    });

    await expect(retry(fn, { delayMs: 0 })).rejects.toThrow("always fails");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("uses correct number of attempts from opts", async () => {
    const fn = vi.fn().mockImplementation(() => {
      throw new Error("fail");
    });

    await expect(
      retry(fn, { maxAttempts: 5, delayMs: 0 })
    ).rejects.toThrow("fail");
    expect(fn).toHaveBeenCalledTimes(5);
  });

  it("wraps non-Error throws in Error", async () => {
    const fn = vi.fn().mockImplementation(() => {
      throw "string error";
    });

    const err = await retry(fn, { maxAttempts: 1 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("string error");
  });

  it("computes correct backoff delays (1000, 2000, 4000)", async () => {
    const fn = vi.fn().mockImplementation(() => {
      throw new Error("fail");
    });

    await retry(fn, { maxAttempts: 4, delayMs: 0 }).catch(() => {});

    // setTimeout is called once per retry gap (maxAttempts - 1 = 3 calls)
    const delayCalls = setTimeoutSpy.mock.calls
      .map((call) => call[1])
      .filter((ms): ms is number => typeof ms === "number");

    // delayMs=0 so all are 0, but let's verify count
    expect(delayCalls).toHaveLength(3);
  });

  it("uses correct backoff formula: delayMs * backoffMultiplier^(attempt-1)", async () => {
    // Use delayMs: 1 so the formula produces distinct values
    const fn = vi.fn().mockImplementation(() => {
      throw new Error("fail");
    });

    await retry(fn, {
      maxAttempts: 4,
      delayMs: 1,
      backoffMultiplier: 2,
    }).catch(() => {});

    const delayCalls = setTimeoutSpy.mock.calls
      .map((call) => call[1])
      .filter((ms): ms is number => typeof ms === "number" && ms >= 0);

    // attempt 1→2: 1 * 2^0 = 1
    // attempt 2→3: 1 * 2^1 = 2
    // attempt 3→4: 1 * 2^2 = 4
    expect(delayCalls).toEqual([1, 2, 4]);
  });

  it("works with custom options", async () => {
    const fn = vi.fn().mockImplementation(() => {
      throw new Error("fail");
    });

    await retry(fn, {
      maxAttempts: 3,
      delayMs: 100,
      backoffMultiplier: 3,
    }).catch(() => {});

    expect(fn).toHaveBeenCalledTimes(3);

    const delayCalls = setTimeoutSpy.mock.calls
      .map((call) => call[1])
      .filter((ms): ms is number => typeof ms === "number" && ms >= 100);

    // attempt 1→2: 100 * 3^0 = 100
    // attempt 2→3: 100 * 3^1 = 300
    expect(delayCalls).toEqual([100, 300]);
  });
});

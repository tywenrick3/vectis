import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDb } from "@vectis/shared";
import { scoreTopics } from "../scoring";

vi.mock("@vectis/shared", () => ({
  getDb: vi.fn(),
  createLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

const mockedGetDb = vi.mocked(getDb);

/**
 * Build a mock Supabase client where `from(tableName)` returns a
 * chain whose terminal call resolves with the data/error you configure
 * per table.
 *
 * `tables` maps a table name to `{ data, error }`.  Every intermediate
 * method (select, gte, order, in, update, eq) returns `this` so the
 * chain keeps working, and also acts as a thenable that resolves to
 * `{ data, error }` so `await chain` works.
 */
function buildDb(tables: Record<string, { data: any; error: any }>) {
  function makeChain(result: { data: any; error: any }) {
    const chain: any = {};
    const methods = ["select", "gte", "order", "in", "update", "eq"];
    for (const m of methods) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    // Make chain thenable so `await db.from(...).select(...)...` resolves
    chain.then = (resolve: any, reject: any) =>
      Promise.resolve(result).then(resolve, reject);
    return chain;
  }

  const cachedChains = new Map<string, any>();
  const db: any = {
    from: vi.fn((table: string) => {
      if (!cachedChains.has(table)) {
        const result = tables[table] ?? { data: null, error: null };
        cachedChains.set(table, makeChain(result));
      }
      return cachedChains.get(table)!;
    }),
  };
  return db;
}

describe("scoreTopics", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Re-apply the module mock after restoreAllMocks clears it
    vi.mocked(getDb).mockReset();
  });

  it("returns 0 when no snapshots exist", async () => {
    const db = buildDb({
      analytics_snapshots: { data: [], error: null },
    });
    mockedGetDb.mockReturnValue(db);

    const result = await scoreTopics();
    expect(result).toBe(0);
  });

  it("throws when snapshots fetch errors", async () => {
    const db = buildDb({
      analytics_snapshots: {
        data: null,
        error: { message: "connection failed" },
      },
    });
    mockedGetDb.mockReturnValue(db);

    await expect(scoreTopics()).rejects.toThrow(
      "Failed to fetch snapshots: connection failed"
    );
  });

  it("deduplicates snapshots keeping the first (latest) per pipeline_run_id", async () => {
    // Two snapshots for the same run — only the first should be used
    const snapshots = [
      {
        pipeline_run_id: "run-1",
        views: 100,
        likes: 50,
        comments: 30,
        shares: 20,
      },
      {
        pipeline_run_id: "run-1",
        views: 10,
        likes: 5,
        comments: 3,
        shares: 2,
      },
    ];

    const runs = [{ id: "run-1", topic_id: "topic-1" }];

    // We need per-call results for `from`:
    // 1st call: analytics_snapshots -> snapshots
    // 2nd call: pipeline_runs -> runs
    // 3rd call: topics -> update success
    const fromResults: Record<string, { data: any; error: any }> = {
      analytics_snapshots: { data: snapshots, error: null },
      pipeline_runs: { data: runs, error: null },
      topics: { data: null, error: null },
    };

    const db = buildDb(fromResults);
    mockedGetDb.mockReturnValue(db);

    const result = await scoreTopics();
    expect(result).toBe(1);

    // With a single run, all normalized values are value/max = 1.0,
    // so score = 0.3 + 0.2 + 0.25 + 0.25 = 1.0 -> 100
    // Verify the update used the first snapshot's derived score (100)
    const topicsChain = db.from("topics");
    expect(topicsChain.update).toHaveBeenCalledWith({ score: 100 });
  });

  it("returns 0 when pipeline_runs query returns null", async () => {
    const snapshots = [
      {
        pipeline_run_id: "run-1",
        views: 100,
        likes: 50,
        comments: 30,
        shares: 20,
      },
    ];

    const db = buildDb({
      analytics_snapshots: { data: snapshots, error: null },
      pipeline_runs: { data: null, error: null },
    });
    mockedGetDb.mockReturnValue(db);

    const result = await scoreTopics();
    expect(result).toBe(0);
  });

  it("calculates correct weighted score for a single snapshot (score = 100)", async () => {
    const snapshots = [
      {
        pipeline_run_id: "run-1",
        views: 200,
        likes: 80,
        comments: 40,
        shares: 60,
      },
    ];
    const runs = [{ id: "run-1", topic_id: "topic-1" }];

    const db = buildDb({
      analytics_snapshots: { data: snapshots, error: null },
      pipeline_runs: { data: runs, error: null },
      topics: { data: null, error: null },
    });
    mockedGetDb.mockReturnValue(db);

    const result = await scoreTopics();
    expect(result).toBe(1);

    // Single snapshot: each metric normalized = metric/metric = 1.0
    // score = 1*0.3 + 1*0.2 + 1*0.25 + 1*0.25 = 1.0 -> round(1.0*100) = 100
    const topicsChain = db.from("topics");
    expect(topicsChain.update).toHaveBeenCalledWith({ score: 100 });
  });

  it("normalizes scores across multiple snapshots correctly", async () => {
    const snapshots = [
      {
        pipeline_run_id: "run-1",
        views: 100,
        likes: 100,
        comments: 100,
        shares: 100,
      },
      {
        pipeline_run_id: "run-2",
        views: 50,
        likes: 50,
        comments: 50,
        shares: 50,
      },
    ];
    const runs = [
      { id: "run-1", topic_id: "topic-1" },
      { id: "run-2", topic_id: "topic-2" },
    ];

    // Track update calls per topic to verify different scores
    const updateCalls: Array<{ score: number }> = [];
    const eqCalls: Array<string> = [];

    function makeTrackingChain() {
      const chain: any = {};
      const methods = ["select", "gte", "order", "in"];
      for (const m of methods) {
        chain[m] = vi.fn().mockReturnValue(chain);
      }
      chain.update = vi.fn((arg: any) => {
        updateCalls.push(arg);
        return chain;
      });
      chain.eq = vi.fn((_col: string, val: string) => {
        eqCalls.push(val);
        return chain;
      });
      chain.then = (resolve: any, reject: any) =>
        Promise.resolve({ data: null, error: null }).then(resolve, reject);
      return chain;
    }

    const chains: Record<string, any> = {};
    const db: any = {
      from: vi.fn((table: string) => {
        if (table === "analytics_snapshots") {
          const chain = makeTrackingChain();
          chain.then = (resolve: any, reject: any) =>
            Promise.resolve({ data: snapshots, error: null }).then(
              resolve,
              reject
            );
          return chain;
        }
        if (table === "pipeline_runs") {
          const chain = makeTrackingChain();
          chain.then = (resolve: any, reject: any) =>
            Promise.resolve({ data: runs, error: null }).then(resolve, reject);
          return chain;
        }
        // topics — each call gets its own chain
        const chain = makeTrackingChain();
        return chain;
      }),
    };
    mockedGetDb.mockReturnValue(db);

    const result = await scoreTopics();
    expect(result).toBe(2);

    // run-1: all metrics at max (100) -> normalized all 1.0
    //   score = 0.3 + 0.2 + 0.25 + 0.25 = 1.0 -> 100
    // run-2: all metrics at 50, max is 100 -> normalized all 0.5
    //   score = 0.5*0.3 + 0.5*0.2 + 0.5*0.25 + 0.5*0.25 = 0.5 -> 50
    expect(updateCalls).toContainEqual({ score: 100 });
    expect(updateCalls).toContainEqual({ score: 50 });
  });

  it("aggregates multiple runs for the same topic by averaging scores", async () => {
    const snapshots = [
      {
        pipeline_run_id: "run-1",
        views: 100,
        likes: 100,
        comments: 100,
        shares: 100,
      },
      {
        pipeline_run_id: "run-2",
        views: 50,
        likes: 50,
        comments: 50,
        shares: 50,
      },
    ];
    // Both runs belong to the same topic
    const runs = [
      { id: "run-1", topic_id: "topic-A" },
      { id: "run-2", topic_id: "topic-A" },
    ];

    const updateCalls: Array<{ score: number }> = [];

    function makeChainWithResult(result: { data: any; error: any }) {
      const chain: any = {};
      const methods = ["select", "gte", "order", "in"];
      for (const m of methods) {
        chain[m] = vi.fn().mockReturnValue(chain);
      }
      chain.update = vi.fn((arg: any) => {
        updateCalls.push(arg);
        return chain;
      });
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.then = (resolve: any, reject: any) =>
        Promise.resolve(result).then(resolve, reject);
      return chain;
    }

    const db: any = {
      from: vi.fn((table: string) => {
        if (table === "analytics_snapshots") {
          return makeChainWithResult({ data: snapshots, error: null });
        }
        if (table === "pipeline_runs") {
          return makeChainWithResult({ data: runs, error: null });
        }
        // topics update
        return makeChainWithResult({ data: null, error: null });
      }),
    };
    mockedGetDb.mockReturnValue(db);

    const result = await scoreTopics();
    expect(result).toBe(1); // one topic updated

    // run-1: normalized = 1.0 each -> score = 1.0
    // run-2: normalized = 0.5 each -> score = 0.5
    // avg = (1.0 + 0.5) / 2 = 0.75 -> round(0.75 * 100) = 75
    expect(updateCalls).toEqual([{ score: 75 }]);
  });

  it("skips runs without topic_id", async () => {
    const snapshots = [
      {
        pipeline_run_id: "run-1",
        views: 100,
        likes: 100,
        comments: 100,
        shares: 100,
      },
      {
        pipeline_run_id: "run-2",
        views: 50,
        likes: 50,
        comments: 50,
        shares: 50,
      },
    ];
    // run-2 has no topic_id
    const runs = [
      { id: "run-1", topic_id: "topic-1" },
      { id: "run-2", topic_id: null },
    ];

    const updateCalls: Array<{ score: number }> = [];

    const db: any = {
      from: vi.fn((table: string) => {
        const chain: any = {};
        const methods = ["select", "gte", "order", "in"];
        for (const m of methods) {
          chain[m] = vi.fn().mockReturnValue(chain);
        }
        chain.update = vi.fn((arg: any) => {
          updateCalls.push(arg);
          return chain;
        });
        chain.eq = vi.fn().mockReturnValue(chain);

        if (table === "analytics_snapshots") {
          chain.then = (resolve: any, reject: any) =>
            Promise.resolve({ data: snapshots, error: null }).then(
              resolve,
              reject
            );
        } else if (table === "pipeline_runs") {
          chain.then = (resolve: any, reject: any) =>
            Promise.resolve({ data: runs, error: null }).then(resolve, reject);
        } else {
          chain.then = (resolve: any, reject: any) =>
            Promise.resolve({ data: null, error: null }).then(resolve, reject);
        }
        return chain;
      }),
    };
    mockedGetDb.mockReturnValue(db);

    const result = await scoreTopics();
    // Only run-1 has a topic, so only 1 topic updated
    expect(result).toBe(1);
    // Only one update call should have been made
    expect(updateCalls).toHaveLength(1);
  });

  it("handles all-zero metrics without division by zero (scores as 0)", async () => {
    const snapshots = [
      {
        pipeline_run_id: "run-1",
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
      },
    ];
    const runs = [{ id: "run-1", topic_id: "topic-1" }];

    const updateCalls: Array<{ score: number }> = [];

    const db: any = {
      from: vi.fn((table: string) => {
        const chain: any = {};
        const methods = ["select", "gte", "order", "in"];
        for (const m of methods) {
          chain[m] = vi.fn().mockReturnValue(chain);
        }
        chain.update = vi.fn((arg: any) => {
          updateCalls.push(arg);
          return chain;
        });
        chain.eq = vi.fn().mockReturnValue(chain);

        if (table === "analytics_snapshots") {
          chain.then = (resolve: any, reject: any) =>
            Promise.resolve({ data: snapshots, error: null }).then(
              resolve,
              reject
            );
        } else if (table === "pipeline_runs") {
          chain.then = (resolve: any, reject: any) =>
            Promise.resolve({ data: runs, error: null }).then(resolve, reject);
        } else {
          chain.then = (resolve: any, reject: any) =>
            Promise.resolve({ data: null, error: null }).then(resolve, reject);
        }
        return chain;
      }),
    };
    mockedGetDb.mockReturnValue(db);

    const result = await scoreTopics();
    expect(result).toBe(1);

    // Math.max(1, 0) = 1 for all maxes, so 0/1 = 0 for each metric
    // score = 0*0.3 + 0*0.2 + 0*0.25 + 0*0.25 = 0 -> round(0*100) = 0
    expect(updateCalls).toEqual([{ score: 0 }]);
  });

  it("counts only successful updates (where updateError is null)", async () => {
    const snapshots = [
      {
        pipeline_run_id: "run-1",
        views: 100,
        likes: 100,
        comments: 100,
        shares: 100,
      },
      {
        pipeline_run_id: "run-2",
        views: 50,
        likes: 50,
        comments: 50,
        shares: 50,
      },
    ];
    const runs = [
      { id: "run-1", topic_id: "topic-1" },
      { id: "run-2", topic_id: "topic-2" },
    ];

    let topicCallCount = 0;

    const db: any = {
      from: vi.fn((table: string) => {
        const chain: any = {};
        const methods = ["select", "gte", "order", "in"];
        for (const m of methods) {
          chain[m] = vi.fn().mockReturnValue(chain);
        }
        chain.update = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);

        if (table === "analytics_snapshots") {
          chain.then = (resolve: any, reject: any) =>
            Promise.resolve({ data: snapshots, error: null }).then(
              resolve,
              reject
            );
        } else if (table === "pipeline_runs") {
          chain.then = (resolve: any, reject: any) =>
            Promise.resolve({ data: runs, error: null }).then(resolve, reject);
        } else {
          // topics: first update succeeds, second fails
          const callIndex = topicCallCount++;
          const error =
            callIndex === 0 ? null : { message: "update failed" };
          chain.then = (resolve: any, reject: any) =>
            Promise.resolve({ data: null, error }).then(resolve, reject);
        }
        return chain;
      }),
    };
    mockedGetDb.mockReturnValue(db);

    const result = await scoreTopics();
    // Only 1 of 2 updates succeeded
    expect(result).toBe(1);
  });
});

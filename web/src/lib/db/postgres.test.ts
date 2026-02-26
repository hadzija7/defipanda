import { beforeEach, describe, expect, it, vi } from "vitest";

const connectMock = vi.fn();
const poolOnMock = vi.fn();

vi.mock("pg", () => {
  return {
    Pool: vi.fn().mockImplementation(() => ({
      connect: connectMock,
      query: vi.fn(async () => ({ rows: [] })),
      on: poolOnMock,
    })),
  };
});

describe("ensureDatabaseReady", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.DATABASE_URL = "postgres://localhost:5432/test";
  });

  it("retries initialization after a transient connection failure", async () => {
    let attempts = 0;
    connectMock.mockImplementation(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("temporary database outage");
      }

      return {
        query: vi.fn(async () => ({ rows: [] })),
        release: vi.fn(),
      };
    });

    const db = await import("./postgres");

    await expect(db.ensureDatabaseReady()).rejects.toThrow("temporary database outage");
    await expect(db.ensureDatabaseReady()).resolves.toBeUndefined();
    expect(connectMock).toHaveBeenCalledTimes(2);
  });

  it("registers a pool error listener", async () => {
    connectMock.mockResolvedValue({
      query: vi.fn(async () => ({ rows: [] })),
      release: vi.fn(),
    });

    const db = await import("./postgres");
    await db.ensureDatabaseReady();

    expect(poolOnMock).toHaveBeenCalledWith("error", expect.any(Function));
  });
});

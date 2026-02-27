import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();

vi.mock("@/lib/db/postgres", () => ({
  query: queryMock,
}));

describe("Smart Account Linkage Store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getSmartAccountLinkage", () => {
    it("returns null when no linkage exists", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const { getSmartAccountLinkage } = await import("@/lib/auth/store");
      const result = await getSmartAccountLinkage("user-123", "1", "zerodev");

      expect(result).toBeNull();
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("SELECT"),
        ["user-123", "1", "zerodev"],
      );
    });

    it("returns linkage when it exists", async () => {
      const now = new Date();
      queryMock.mockResolvedValueOnce({
        rows: [{
          user_sub: "user-123",
          chain_id: "1",
          provider: "zerodev",
          smart_account_address: "0x1234567890123456789012345678901234567890",
          provisioning_status: "ready",
          last_error: null,
          created_at: now,
          updated_at: now,
        }],
      });

      const { getSmartAccountLinkage } = await import("@/lib/auth/store");
      const result = await getSmartAccountLinkage("user-123", "1", "zerodev");

      expect(result).toEqual({
        userSub: "user-123",
        chainId: "1",
        provider: "zerodev",
        smartAccountAddress: "0x1234567890123456789012345678901234567890",
        provisioningStatus: "ready",
        lastError: undefined,
        createdAt: now.getTime(),
        updatedAt: now.getTime(),
      });
    });
  });

  describe("upsertSmartAccountLinkagePending", () => {
    it("creates a new pending linkage", async () => {
      const now = new Date();
      queryMock.mockResolvedValueOnce({
        rows: [{
          user_sub: "user-456",
          chain_id: "1",
          provider: "zerodev",
          smart_account_address: null,
          provisioning_status: "pending",
          last_error: null,
          created_at: now,
          updated_at: now,
        }],
      });

      const { upsertSmartAccountLinkagePending } = await import("@/lib/auth/store");
      const result = await upsertSmartAccountLinkagePending("user-456", "1", "zerodev");

      expect(result.provisioningStatus).toBe("pending");
      expect(result.smartAccountAddress).toBeUndefined();
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining("INSERT"),
        ["user-456", "1", "zerodev"],
      );
    });

    it("does not overwrite ready status on conflict", async () => {
      const now = new Date();
      queryMock.mockResolvedValueOnce({
        rows: [{
          user_sub: "user-789",
          chain_id: "1",
          provider: "zerodev",
          smart_account_address: "0xabcd",
          provisioning_status: "ready",
          last_error: null,
          created_at: now,
          updated_at: now,
        }],
      });

      const { upsertSmartAccountLinkagePending } = await import("@/lib/auth/store");
      const result = await upsertSmartAccountLinkagePending("user-789", "1", "zerodev");

      expect(result.provisioningStatus).toBe("ready");
      expect(result.smartAccountAddress).toBe("0xabcd");
    });
  });

  describe("updateSmartAccountLinkageReady", () => {
    it("updates linkage to ready with address", async () => {
      const now = new Date();
      queryMock.mockResolvedValueOnce({
        rows: [{
          user_sub: "user-123",
          chain_id: "1",
          provider: "zerodev",
          smart_account_address: "0xnewaddress",
          provisioning_status: "ready",
          last_error: null,
          created_at: now,
          updated_at: now,
        }],
      });

      const { updateSmartAccountLinkageReady } = await import("@/lib/auth/store");
      const result = await updateSmartAccountLinkageReady("user-123", "1", "zerodev", "0xnewaddress");

      expect(result.provisioningStatus).toBe("ready");
      expect(result.smartAccountAddress).toBe("0xnewaddress");
      expect(result.lastError).toBeUndefined();
    });

    it("throws when linkage not found", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const { updateSmartAccountLinkageReady } = await import("@/lib/auth/store");

      await expect(
        updateSmartAccountLinkageReady("nonexistent", "1", "zerodev", "0x123"),
      ).rejects.toThrow("Smart account linkage not found");
    });
  });

  describe("updateSmartAccountLinkageFailed", () => {
    it("updates linkage to failed with error", async () => {
      const now = new Date();
      queryMock.mockResolvedValueOnce({
        rows: [{
          user_sub: "user-123",
          chain_id: "1",
          provider: "zerodev",
          smart_account_address: null,
          provisioning_status: "failed",
          last_error: "Network timeout",
          created_at: now,
          updated_at: now,
        }],
      });

      const { updateSmartAccountLinkageFailed } = await import("@/lib/auth/store");
      const result = await updateSmartAccountLinkageFailed("user-123", "1", "zerodev", "Network timeout");

      expect(result.provisioningStatus).toBe("failed");
      expect(result.lastError).toBe("Network timeout");
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSmartAccountLinkage = vi.fn();
const mockUpsertSmartAccountLinkagePending = vi.fn();
const mockUpdateSmartAccountLinkageReady = vi.fn();
const mockUpdateSmartAccountLinkageFailed = vi.fn();

vi.mock("@/lib/auth/store", () => ({
  getSmartAccountLinkage: mockGetSmartAccountLinkage,
  upsertSmartAccountLinkagePending: mockUpsertSmartAccountLinkagePending,
  updateSmartAccountLinkageReady: mockUpdateSmartAccountLinkageReady,
  updateSmartAccountLinkageFailed: mockUpdateSmartAccountLinkageFailed,
}));

const mockCreatePublicClient = vi.fn();
const mockHttp = vi.fn(() => "mock-transport");
const mockPrivateKeyToAccount = vi.fn();
const mockSignerToEcdsaValidator = vi.fn();
const mockCreateKernelAccount = vi.fn();

vi.mock("viem", () => ({
  createPublicClient: mockCreatePublicClient,
  http: mockHttp,
}));

vi.mock("viem/accounts", () => ({
  privateKeyToAccount: mockPrivateKeyToAccount,
}));

vi.mock("@zerodev/sdk", () => ({
  createKernelAccount: mockCreateKernelAccount,
}));

vi.mock("@zerodev/sdk/constants", () => ({
  KERNEL_V3_1: "v3.1",
  getEntryPoint: vi.fn(() => ({ address: "0xEntryPoint" })),
}));

vi.mock("@zerodev/ecdsa-validator", () => ({
  signerToEcdsaValidator: mockSignerToEcdsaValidator,
}));

describe("ensureSmartAccountForUser", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    process.env.ENABLE_SMART_ACCOUNT_PROVISIONING = "true";
    process.env.SMART_ACCOUNT_RPC_URL = "https://virtual.mainnet.rpc.tenderly.co/test";
    process.env.SMART_ACCOUNT_CHAIN_ID = "1";
    process.env.SMART_ACCOUNT_OWNER_PRIVATE_KEY = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

    mockCreatePublicClient.mockReturnValue({});
    mockPrivateKeyToAccount.mockReturnValue({ address: "0xOwner" });
    mockSignerToEcdsaValidator.mockResolvedValue({});
    mockCreateKernelAccount.mockResolvedValue({ address: "0xSmartAccount123" });
  });

  it("returns existing ready account without re-provisioning", async () => {
    const now = Date.now();
    mockGetSmartAccountLinkage.mockResolvedValueOnce({
      userSub: "user-123",
      chainId: "1",
      provider: "zerodev",
      smartAccountAddress: "0xExistingAccount",
      provisioningStatus: "ready",
      createdAt: now,
      updatedAt: now,
    });

    const { clearWalletConfigCache } = await import("./config");
    clearWalletConfigCache();

    const { ensureSmartAccountForUser } = await import("./provisioning");
    const result = await ensureSmartAccountForUser("user-123");

    expect(result).toEqual({
      status: "ready",
      address: "0xExistingAccount",
      chainId: "1",
      provider: "zerodev",
    });
    expect(mockUpsertSmartAccountLinkagePending).not.toHaveBeenCalled();
    expect(mockCreateKernelAccount).not.toHaveBeenCalled();
  });

  it("creates new account for user without existing linkage", async () => {
    const now = Date.now();
    mockGetSmartAccountLinkage.mockResolvedValueOnce(null);
    mockUpsertSmartAccountLinkagePending.mockResolvedValueOnce({
      userSub: "user-new",
      chainId: "1",
      provider: "zerodev",
      provisioningStatus: "pending",
      createdAt: now,
      updatedAt: now,
    });
    mockUpdateSmartAccountLinkageReady.mockResolvedValueOnce({
      userSub: "user-new",
      chainId: "1",
      provider: "zerodev",
      smartAccountAddress: "0xSmartAccount123",
      provisioningStatus: "ready",
      createdAt: now,
      updatedAt: now,
    });

    const { clearWalletConfigCache } = await import("./config");
    clearWalletConfigCache();

    const { ensureSmartAccountForUser } = await import("./provisioning");
    const result = await ensureSmartAccountForUser("user-new");

    expect(result).toEqual({
      status: "ready",
      address: "0xSmartAccount123",
      chainId: "1",
      provider: "zerodev",
    });
    expect(mockUpsertSmartAccountLinkagePending).toHaveBeenCalledWith("user-new", "1", "zerodev");
    expect(mockUpdateSmartAccountLinkageReady).toHaveBeenCalledWith("user-new", "1", "zerodev", "0xSmartAccount123");
  });

  it("retries provisioning for failed linkage", async () => {
    const now = Date.now();
    mockGetSmartAccountLinkage.mockResolvedValueOnce({
      userSub: "user-retry",
      chainId: "1",
      provider: "zerodev",
      provisioningStatus: "failed",
      lastError: "Previous error",
      createdAt: now,
      updatedAt: now,
    });
    mockUpsertSmartAccountLinkagePending.mockResolvedValueOnce({
      userSub: "user-retry",
      chainId: "1",
      provider: "zerodev",
      provisioningStatus: "pending",
      createdAt: now,
      updatedAt: now,
    });
    mockUpdateSmartAccountLinkageReady.mockResolvedValueOnce({
      userSub: "user-retry",
      chainId: "1",
      provider: "zerodev",
      smartAccountAddress: "0xSmartAccount123",
      provisioningStatus: "ready",
      createdAt: now,
      updatedAt: now,
    });

    const { clearWalletConfigCache } = await import("./config");
    clearWalletConfigCache();

    const { ensureSmartAccountForUser } = await import("./provisioning");
    const result = await ensureSmartAccountForUser("user-retry");

    expect(result.status).toBe("ready");
    expect(mockCreateKernelAccount).toHaveBeenCalled();
  });

  it("records failure when account creation fails", async () => {
    const now = Date.now();
    mockGetSmartAccountLinkage.mockResolvedValueOnce(null);
    mockUpsertSmartAccountLinkagePending.mockResolvedValueOnce({
      userSub: "user-fail",
      chainId: "1",
      provider: "zerodev",
      provisioningStatus: "pending",
      createdAt: now,
      updatedAt: now,
    });
    mockCreateKernelAccount.mockRejectedValueOnce(new Error("RPC connection failed"));
    mockUpdateSmartAccountLinkageFailed.mockResolvedValueOnce({
      userSub: "user-fail",
      chainId: "1",
      provider: "zerodev",
      provisioningStatus: "failed",
      lastError: "RPC connection failed",
      createdAt: now,
      updatedAt: now,
    });

    const { clearWalletConfigCache } = await import("./config");
    clearWalletConfigCache();

    const { ensureSmartAccountForUser } = await import("./provisioning");
    const result = await ensureSmartAccountForUser("user-fail");

    expect(result).toEqual({
      status: "failed",
      chainId: "1",
      provider: "zerodev",
      error: "RPC connection failed",
    });
    expect(mockUpdateSmartAccountLinkageFailed).toHaveBeenCalledWith(
      "user-fail", "1", "zerodev", "RPC connection failed",
    );
  });

  it("returns pending status when provisioning is disabled", async () => {
    process.env.ENABLE_SMART_ACCOUNT_PROVISIONING = "false";

    const { clearWalletConfigCache } = await import("./config");
    clearWalletConfigCache();

    vi.resetModules();

    const { ensureSmartAccountForUser } = await import("./provisioning");
    const result = await ensureSmartAccountForUser("user-disabled");

    expect(result.status).toBe("pending");
    expect(result.error).toContain("disabled");
    expect(mockCreateKernelAccount).not.toHaveBeenCalled();
  });
});

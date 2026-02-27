import { afterEach, describe, expect, it, vi } from "vitest";

describe("auth provider config", () => {
  const originalAuthProvider = process.env.AUTH_PROVIDER;

  afterEach(() => {
    vi.resetModules();
    process.env.AUTH_PROVIDER = originalAuthProvider;
  });

  it("defaults to google_oidc when AUTH_PROVIDER is unset", async () => {
    delete process.env.AUTH_PROVIDER;
    const { getAuthProvider } = await import("./provider");
    expect(getAuthProvider()).toBe("google_oidc");
  });

  it("returns zerodev_social when configured", async () => {
    process.env.AUTH_PROVIDER = "zerodev_social";
    const { getAuthProvider } = await import("./provider");
    expect(getAuthProvider()).toBe("zerodev_social");
  });

  it("falls back to google_oidc on invalid value", async () => {
    process.env.AUTH_PROVIDER = "invalid_provider";
    const { getAuthProvider } = await import("./provider");
    expect(getAuthProvider()).toBe("google_oidc");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const discoveryMock = vi.fn();
const calculatePKCECodeChallengeMock = vi.fn();
const buildAuthorizationUrlMock = vi.fn();

vi.mock("openid-client", () => {
  return {
    discovery: discoveryMock,
    calculatePKCECodeChallenge: calculatePKCECodeChallengeMock,
    buildAuthorizationUrl: buildAuthorizationUrlMock,
    randomState: vi.fn(() => "state"),
    randomNonce: vi.fn(() => "nonce"),
    randomPKCECodeVerifier: vi.fn(() => "verifier"),
  };
});

describe("getOidcConfig", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    process.env.GOOGLE_OAUTH_CLIENT_ID = "client-id";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "client-secret";

    calculatePKCECodeChallengeMock.mockResolvedValue("code-challenge");
    buildAuthorizationUrlMock.mockReturnValue(new URL("https://accounts.google.com/o/oauth2/v2/auth"));
  });

  it("retries discovery after a transient failure", async () => {
    discoveryMock
      .mockRejectedValueOnce(new Error("temporary oidc discovery failure"))
      .mockResolvedValueOnce({ issuer: "ok-config" });

    const oidcModule = await import("./google-oidc");
    const input = {
      originFromRequest: "http://localhost:3000",
      state: "state",
      nonce: "nonce",
      codeVerifier: "verifier",
    };

    await expect(oidcModule.buildGoogleAuthorizationUrl(input)).rejects.toThrow("temporary oidc discovery failure");
    await expect(oidcModule.buildGoogleAuthorizationUrl(input)).resolves.toBeInstanceOf(URL);
    expect(discoveryMock).toHaveBeenCalledTimes(2);
  });
});

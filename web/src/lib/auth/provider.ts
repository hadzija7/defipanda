export type AuthProvider = "google_oidc" | "zerodev_social";

const DEFAULT_AUTH_PROVIDER: AuthProvider = "google_oidc";

function normalizeProvider(raw: string | undefined): AuthProvider {
  if (raw === "zerodev_social") {
    return "zerodev_social";
  }
  return DEFAULT_AUTH_PROVIDER;
}

export function getAuthProvider(): AuthProvider {
  return normalizeProvider(process.env.AUTH_PROVIDER);
}

export function isGoogleOidcProvider(): boolean {
  return getAuthProvider() === "google_oidc";
}

export function isZeroDevSocialProvider(): boolean {
  return getAuthProvider() === "zerodev_social";
}

export function getAuthProviderDisplayName(provider: AuthProvider): string {
  if (provider === "zerodev_social") {
    return "ZeroDev Social Login";
  }
  return "Google OAuth";
}

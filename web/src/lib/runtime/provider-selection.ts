export type RuntimeAuthProvider =
  | "google_oidc"
  | "zerodev_social"
  | "walletconnect"
  | "reown_appkit"
  | "privy";

const DEFAULT_AUTH_PROVIDER: RuntimeAuthProvider = "reown_appkit";

export function normalizeRuntimeAuthProvider(
  raw: string | undefined,
): RuntimeAuthProvider {
  if (
    raw === "google_oidc" ||
    raw === "zerodev_social" ||
    raw === "walletconnect" ||
    raw === "reown_appkit" ||
    raw === "privy"
  ) {
    return raw;
  }

  return DEFAULT_AUTH_PROVIDER;
}

export function isReownRuntimeProvider(provider: RuntimeAuthProvider): boolean {
  return provider === "reown_appkit";
}

export function isPrivyRuntimeProvider(provider: RuntimeAuthProvider): boolean {
  return provider === "privy";
}

const DEFAULT_RETURN_TO = "/";

export function sanitizeReturnTo(input: string | null | undefined): string {
  if (!input) {
    return DEFAULT_RETURN_TO;
  }

  // Only allow same-origin absolute paths. This blocks protocol-relative
  // redirects like //evil.com and absolute URLs.
  if (!input.startsWith("/") || input.startsWith("//")) {
    return DEFAULT_RETURN_TO;
  }

  // Block alternate slash/control-character tricks. Tabs must also be blocked
  // because the URL parser strips them before host resolution.
  if (input.includes("\\") || input.includes("\t") || input.includes("\r") || input.includes("\n")) {
    return DEFAULT_RETURN_TO;
  }

  return input;
}

export type DcaExecutionProvider = "rhinestone" | "zerodev";
export type SmartAccountProvider = "reown_appkit" | "zerodev" | "walletconnect";

export function getDefaultSmartAccountProvider(): SmartAccountProvider {
  const raw = process.env.SMART_ACCOUNT_PROVIDER;
  if (raw === "reown_appkit" || raw === "walletconnect") {
    return raw;
  }
  return "zerodev";
}

export function resolveDcaExecutionProvider(): DcaExecutionProvider {
  const explicit = process.env.DCA_EXECUTION_PROVIDER;
  if (explicit === "zerodev") {
    return "zerodev";
  }
  if (explicit === "rhinestone") {
    return "rhinestone";
  }

  const smartAccountProvider = getDefaultSmartAccountProvider();
  if (smartAccountProvider === "reown_appkit") {
    return "rhinestone";
  }
  return "zerodev";
}


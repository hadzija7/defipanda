import { query } from "@/lib/db/postgres";

type OnboardingRow = {
  smart_account_address: string;
  smart_account_provider: string;
  completed_at: Date;
};

export async function isOnboardingCompleted(
  smartAccountAddress: string,
  smartAccountProvider: string,
): Promise<boolean> {
  const { rows } = await query<OnboardingRow>(
    `SELECT smart_account_address FROM user_onboarding
     WHERE smart_account_address = $1 AND smart_account_provider = $2`,
    [smartAccountAddress.toLowerCase(), smartAccountProvider.toLowerCase()],
  );
  return rows.length > 0;
}

export async function markOnboardingCompleted(
  smartAccountAddress: string,
  smartAccountProvider: string,
): Promise<void> {
  await query(
    `INSERT INTO user_onboarding (smart_account_address, smart_account_provider)
     VALUES ($1, $2)
     ON CONFLICT (smart_account_address, smart_account_provider) DO NOTHING`,
    [smartAccountAddress.toLowerCase(), smartAccountProvider.toLowerCase()],
  );
}

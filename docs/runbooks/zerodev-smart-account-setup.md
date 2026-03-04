# ZeroDev Smart Account Setup Runbook

## Overview
This runbook covers the setup and operation of ZeroDev smart account provisioning using Tenderly Virtualnet as the target chain.

## Architecture Summary
- Each Google OAuth user gets one deterministic smart account per chain/provider tuple
- Backend owns account creation and UserOp submission (no private keys in browser)
- Auth flow remains resilient: login succeeds even if provisioning fails
- Wallet status is exposed via `/auth/me` for UI feedback

## Environment Variables

### Required for Smart Account Provisioning

```bash
# Enable/disable provisioning (default: disabled)
ENABLE_SMART_ACCOUNT_PROVISIONING=true

# Tenderly Virtualnet RPC URL
SMART_ACCOUNT_RPC_URL=https://virtual.mainnet.eu.rpc.tenderly.co/<your-virtual-network-id>

# Chain ID for the virtual network (usually 1 for mainnet fork)
SMART_ACCOUNT_CHAIN_ID=1

# Server-managed owner private key (hex with 0x prefix)
# WARNING: Keep this secret! Never commit to version control.
BACKEND_SIGNER_PRIVATE_KEY=0x...

# Optional: ZeroDev bundler RPC (defaults to SMART_ACCOUNT_RPC_URL if not set)
# Use this if you want to use ZeroDev's bundler infrastructure
ZERODEV_RPC_URL=https://rpc.zerodev.app/api/v2/bundler/<your-project-id>
```

### Existing Auth Variables (Required)
```bash
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
AUTH_SESSION_SECRET=...
DATABASE_URL=postgres://...
```

## Tenderly Virtualnet Setup

### 1. Create a Virtual Network
1. Go to [Tenderly Dashboard](https://dashboard.tenderly.co/)
2. Navigate to Virtual TestNets
3. Click "Create Virtual TestNet"
4. Select "Mainnet" as the base chain
5. Copy the RPC URL for `SMART_ACCOUNT_RPC_URL`

### 2. Fund Test Accounts (if needed)
Tenderly Virtualnets allow you to set custom balances for any address:
1. In the Virtual TestNet dashboard, click "Add Balance"
2. Enter the smart account address and desired ETH balance
3. Save changes

Note: Smart account addresses are deterministic based on user sub and can be predicted before creation.

## Server Signer Key Management

### Development
For local development, generate a test private key:
```bash
openssl rand -hex 32 | sed 's/^/0x/'
```

### Production Considerations
The current implementation uses a single server-managed key for all accounts. This is suitable for MVP but has security implications:

1. **Key rotation**: Plan for how to rotate the key if compromised
2. **Backup**: Ensure the key is backed up securely
3. **Access control**: Limit who can access the key in your infrastructure
4. **Future migration**: Consider moving to KMS/HSM for production

Future improvements may include:
- Per-user derived keys
- Hardware security modules (HSM)
- Managed key services (AWS KMS, GCP Cloud KMS)

## Database Schema

The provisioning system uses a `smart_account_linkages` table:

```sql
CREATE TABLE smart_account_linkages (
  user_sub TEXT NOT NULL REFERENCES auth_users(sub) ON DELETE CASCADE,
  chain_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  smart_account_address TEXT,
  provisioning_status TEXT NOT NULL DEFAULT 'pending',
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_sub, chain_id, provider)
);
```

The table is auto-created on first database connection.

## Provisioning Flow

1. User completes Google OAuth login
2. After user upsert, `ensureSmartAccountForUser(userSub)` is called
3. If existing `ready` linkage exists → return immediately
4. Otherwise:
   a. Insert/update linkage to `pending`
   b. Create Kernel account via ZeroDev SDK
   c. On success → update to `ready` with address
   d. On failure → update to `failed` with error message
5. Auth session is created regardless of provisioning outcome

## API Reference

### GET /auth/me
Returns authenticated user profile with wallet status:

```json
{
  "authenticated": true,
  "user": {
    "sub": "google-user-id",
    "email": "user@example.com",
    "name": "User Name"
  },
  "wallet": {
    "status": "ready",
    "address": "0x...",
    "chainId": "1",
    "provider": "zerodev",
    "error": null
  }
}
```

Wallet status values:
- `ready`: Account provisioned successfully
- `pending`: Provisioning in progress
- `failed`: Provisioning failed (check `error` field)
- `null`: Provisioning disabled or not attempted

## Troubleshooting

### Provisioning stuck in "pending"
- Check server logs for errors during account creation
- Verify RPC URL is accessible
- Ensure private key is valid

### "Smart account provisioning is disabled" error
- Set `ENABLE_SMART_ACCOUNT_PROVISIONING=true`
- Restart the server

### RPC connection failures
- Verify Tenderly Virtualnet is active
- Check network connectivity
- Confirm RPC URL is correct

### Account address mismatch
This indicates the deterministic index calculation changed. This should not happen in normal operation. If it does:
1. Check that the user sub is consistent
2. Review any changes to the `hashUserSubToIndex` function
3. Consider database migration if algorithm changed

### UserOp submission failures
- Verify bundler RPC is configured correctly
- Check if account has sufficient gas (fund via Tenderly dashboard)
- Review UserOp calldata for encoding errors

## Monitoring Checklist

- [ ] Provisioning success rate (ready vs failed)
- [ ] Provisioning latency (time from login to ready)
- [ ] UserOp submission success rate
- [ ] RPC error rates
- [ ] Database connection health

## Feature Flag Rollout

1. Start with `ENABLE_SMART_ACCOUNT_PROVISIONING=false` in production
2. Enable for internal testing with specific user subs
3. Gradually enable for wider audience
4. Monitor metrics before full rollout
5. Have rollback plan ready (set flag to false)

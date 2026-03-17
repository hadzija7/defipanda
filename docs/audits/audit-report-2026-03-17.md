# 🔐 Security Review — DefiPandaDCA

**Date:** 2026-03-17  
**Auditor:** AI-assisted (Pashov Skills framework + ethskills checklist)  
**Repository:** DefiPanda  

---

## Scope

|                                  |                                                        |
| -------------------------------- | ------------------------------------------------------ |
| **Mode**                         | Default (all in-scope files)                           |
| **Files reviewed**               | `DefiPandaDCA.sol` · `DefiPandaReceiver.sol`           |
| **Interfaces (context)**         | `IDefiPandaDCA.sol` · `ISwapRouter02.sol` · `ReceiverTemplate.sol` |
| **Confidence threshold (1-100)** | 75                                                     |

---

## Findings

### [100] 1. Fee-on-Transfer Tokens Cause Incorrect Accounting and DoS in `executeDCA`

`DefiPandaDCA.executeDCA` · Confidence: 100

**Description**

The function calculates `fee` and `netAmount` from the `amountIn` parameter, not the actual tokens received. Fee-on-transfer tokens (e.g., PAXG, STA, deflationary tokens) deliver fewer tokens than `amountIn` to the contract, so the subsequent `safeTransfer(treasury, fee)` + `exactInputSingle(netAmount)` attempt to move more tokens than the contract holds, reverting every call — or silently draining residual token balances left from prior operations.

**Fix**

```diff
- IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
-
- uint256 fee = (amountIn * $.feeBps) / BPS_DENOMINATOR;
- uint256 netAmount = amountIn - fee;
+ uint256 balanceBefore = IERC20(tokenIn).balanceOf(address(this));
+ IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
+ uint256 received = IERC20(tokenIn).balanceOf(address(this)) - balanceBefore;
+
+ uint256 fee = (received * $.feeBps) / BPS_DENOMINATOR;
+ uint256 netAmount = received - fee;
```

---

### [100] 2. Missing Swap Deadline Allows Indefinite Transaction Delay and MEV Extraction

`DefiPandaDCA.executeDCA` · Confidence: 100

**Description**

The `ExactInputSingleParams` struct passed to Uniswap V3 SwapRouter02 contains no deadline, and `executeDCA` itself accepts no deadline parameter. SwapRouter02 only enforces deadlines through its `multicall(uint256 deadline, bytes[] data)` wrapper, which this contract does not use. A submitted transaction remains valid indefinitely in the mempool, allowing validators or MEV searchers to delay execution until price moves against the user within their `amountOutMinimum` tolerance.

**Fix**

```diff
  function executeDCA(
      address tokenIn,
      address tokenOut,
      uint256 amountIn,
      uint24 poolFee,
      uint256 amountOutMinimum,
-     address recipient
+     address recipient,
+     uint256 deadline
  ) external nonReentrant whenNotPaused returns (uint256 amountOut) {
      if (amountIn == 0) revert ZeroAmount();
      if (recipient == address(0)) revert ZeroAddress();
+     if (block.timestamp > deadline) revert DeadlineExpired();
```

---

### [80] 3. Push-Model Fee Transfer Causes Protocol-Wide DoS When Treasury Is Blacklisted

`DefiPandaDCA.executeDCA` · Confidence: 80

**Description**

The fee is sent to the treasury via a direct `safeTransfer` (push pattern) inside `executeDCA`. Because the contract accepts arbitrary ERC-20 tokens as `tokenIn` — including blacklistable tokens like USDC and USDT — if the treasury address is ever blacklisted by the token issuer, every `executeDCA` call for that token reverts, DoS-ing all DCA operations for that asset with no user-side workaround until the owner changes the treasury.

**Fix**

```diff
+ // Add to DCAStorage struct:
+ mapping(address => uint256) accruedFees;

  // In executeDCA, replace push transfer with accumulation:
- if (fee > 0) {
-     IERC20(tokenIn).safeTransfer($.treasury, fee);
- }
+ if (fee > 0) {
+     $.accruedFees[tokenIn] += fee;
+ }

+ /// @notice Treasury claims accumulated fees (pull pattern)
+ function claimFees(address token) external {
+     DCAStorage storage $ = _getDCAStorage();
+     uint256 amount = $.accruedFees[token];
+     if (amount == 0) revert ZeroAmount();
+     $.accruedFees[token] = 0;
+     IERC20(token).safeTransfer($.treasury, amount);
+ }
```

---

### [75] 4. Missing `maxFeeBps` Upper Bound Allows Permanent Contract DoS via Underflow

`DefiPandaDCA.initialize` · Confidence: 75

**Description**

`initialize` validates `initialFeeBps <= initialMaxFeeBps` but never validates `initialMaxFeeBps <= BPS_DENOMINATOR` (10,000). Since `maxFeeBps` is a `uint16` (max 65,535) and has no setter to correct it after deployment, a misconfigured deploy allows the owner to later call `setFeeBps` with a value above 10,000. When `executeDCA` computes `fee = amountIn * feeBps / 10000`, the fee exceeds `amountIn`, and `netAmount = amountIn - fee` underflows — permanently reverting all swaps.

*(Below confidence threshold — no fix block provided)*

---

## Findings Summary

| # | Confidence | Title |
|---|---|---|
| 1 | [100] | Fee-on-Transfer Tokens Cause Incorrect Accounting and DoS |
| 2 | [100] | Missing Swap Deadline Allows Indefinite Transaction Delay and MEV Extraction |
| 3 | [80] | Push-Model Fee Transfer Causes Protocol-Wide DoS When Treasury Is Blacklisted |
| | | **Below Confidence Threshold** |
| 4 | [75] | Missing `maxFeeBps` Upper Bound Allows Permanent Contract DoS via Underflow |

---

## ethskills Security Checklist Cross-Reference

### Passed

| Check | Status |
|-------|--------|
| SafeERC20 used throughout | ✅ |
| `forceApprove` for USDT compatibility | ✅ |
| Reentrancy guard (`nonReentrant` + CEI) | ✅ |
| UUPS proxy pattern with `_disableInitializers()` | ✅ |
| Access control (`onlyOwner` on all admin functions) | ✅ |
| Events emitted for every state change | ✅ |
| Input validation (zero address, zero amount, fee bounds) | ✅ |

### Flagged

| Check | Status | Finding |
|-------|--------|---------|
| MEV / Sandwich protection (deadline) | ⚠️ | #2 |
| Fee-on-transfer safe | ⚠️ | #1 |
| Pausable tradeoff | ⚠️ | Single key can freeze all users — recommend multisig or timelock |

---

## Disclaimer

> ⚠️ This review was performed by an AI assistant using the Pashov Skills auditor framework and ethskills security checklist. AI analysis can never verify the complete absence of vulnerabilities and no guarantee of security is given. Team security reviews, bug bounty programs, and on-chain monitoring are strongly recommended.

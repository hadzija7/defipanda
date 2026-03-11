// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @title IDefiPandaDCA - DefiPanda DCA Protocol Interface
/// @notice Interface for the fee-collecting DCA swap proxy
interface IDefiPandaDCA {
    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted when a DCA swap is executed
    event DCAExecuted(
        address indexed user,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 fee,
        uint256 amountOut,
        address recipient
    );

    /// @notice Emitted when the fee basis points is updated
    event FeeBpsUpdated(uint16 oldFeeBps, uint16 newFeeBps);

    /// @notice Emitted when the treasury address is updated
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);

    /// @notice Emitted when the swap router address is updated
    event SwapRouterUpdated(address indexed oldRouter, address indexed newRouter);

    /// @notice Emitted when tokens are rescued from the contract
    event TokensRescued(address indexed token, address indexed to, uint256 amount);

    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Thrown when a zero address is provided where not allowed
    error ZeroAddress();

    /// @notice Thrown when a zero amount is provided
    error ZeroAmount();

    /// @notice Thrown when fee exceeds the maximum allowed
    error FeeTooHigh(uint16 fee, uint16 maxFee);

    // ═══════════════════════════════════════════════════════════════════════════
    // CORE FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Execute a DCA swap with protocol fee deduction
    /// @param tokenIn The input token address
    /// @param tokenOut The output token address
    /// @param amountIn The amount of input tokens to swap
    /// @param poolFee The Uniswap V3 pool fee tier (e.g., 500, 3000, 10000)
    /// @param amountOutMinimum The minimum amount of output tokens to receive (slippage protection)
    /// @param recipient The address to receive the output tokens
    /// @return amountOut The amount of output tokens received
    function executeDCA(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint24 poolFee,
        uint256 amountOutMinimum,
        address recipient
    ) external returns (uint256 amountOut);

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Get the current fee in basis points
    function feeBps() external view returns (uint16);

    /// @notice Get the maximum allowed fee in basis points
    function maxFeeBps() external view returns (uint16);

    /// @notice Get the treasury address where fees are sent
    function treasury() external view returns (address);

    /// @notice Get the Uniswap V3 SwapRouter02 address
    function swapRouter() external view returns (address);

    /// @notice Calculate the fee for a given input amount
    /// @param amountIn The input amount
    /// @return fee The fee amount
    /// @return netAmount The amount after fee deduction
    function calculateFee(uint256 amountIn) external view returns (uint256 fee, uint256 netAmount);

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Set the protocol fee in basis points
    /// @param newFeeBps The new fee (must be <= maxFeeBps)
    function setFeeBps(uint16 newFeeBps) external;

    /// @notice Set the treasury address
    /// @param newTreasury The new treasury address (cannot be zero)
    function setTreasury(address newTreasury) external;

    /// @notice Set the swap router address
    /// @param newSwapRouter The new swap router address (cannot be zero)
    function setSwapRouter(address newSwapRouter) external;

    /// @notice Rescue tokens accidentally sent to this contract
    /// @param token The token address to rescue
    /// @param to The recipient address
    /// @param amount The amount to rescue
    function rescueTokens(address token, address to, uint256 amount) external;
}

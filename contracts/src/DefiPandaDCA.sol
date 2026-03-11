// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IDefiPandaDCA} from "./interfaces/IDefiPandaDCA.sol";
import {ISwapRouter02} from "./interfaces/ISwapRouter02.sol";

/// @title DefiPandaDCA - Fee-collecting DCA swap proxy
/// @notice UUPS-upgradeable contract that sits between user smart accounts and Uniswap V3,
///         atomically deducting a protocol fee on every DCA swap
/// @dev Uses ERC-7201 namespaced storage for upgrade safety
contract DefiPandaDCA is
    Initializable,
    OwnableUpgradeable,
    PausableUpgradeable,
    ReentrancyGuard,
    UUPSUpgradeable,
    IDefiPandaDCA
{
    using SafeERC20 for IERC20;

    // ═══════════════════════════════════════════════════════════════════════════
    // ERC-7201 NAMESPACED STORAGE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @custom:storage-location erc7201:defipanda.dca.v1
    struct DCAStorage {
        uint16 feeBps;
        uint16 maxFeeBps;
        address treasury;
        address swapRouter;
    }

    // keccak256(abi.encode(uint256(keccak256("defipanda.dca.v1")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant DCA_STORAGE_LOCATION =
        0x990829f72a3819c8b475f7e7f5c9fe724d5974ceedbc618dc26edb997ebc8c00;

    function _getDCAStorage() private pure returns (DCAStorage storage $) {
        assembly {
            $.slot := DCA_STORAGE_LOCATION
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    uint16 public constant BPS_DENOMINATOR = 10_000;

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR (IMPLEMENTATION LOCK)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INITIALIZER
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Initialize the DCA contract
    /// @param initialOwner The owner address (can set fees, pause, upgrade)
    /// @param initialTreasury The treasury address where fees are sent
    /// @param initialSwapRouter The Uniswap V3 SwapRouter02 address
    /// @param initialFeeBps The initial fee in basis points
    /// @param initialMaxFeeBps The maximum allowed fee in basis points
    function initialize(
        address initialOwner,
        address initialTreasury,
        address initialSwapRouter,
        uint16 initialFeeBps,
        uint16 initialMaxFeeBps
    ) external initializer {
        if (initialOwner == address(0)) revert ZeroAddress();
        if (initialTreasury == address(0)) revert ZeroAddress();
        if (initialSwapRouter == address(0)) revert ZeroAddress();
        if (initialFeeBps > initialMaxFeeBps) revert FeeTooHigh(initialFeeBps, initialMaxFeeBps);

        __Ownable_init(initialOwner);
        __Pausable_init();
        // ReentrancyGuard uses namespaced storage (@custom:stateless) - no init needed

        DCAStorage storage $ = _getDCAStorage();
        $.feeBps = initialFeeBps;
        $.maxFeeBps = initialMaxFeeBps;
        $.treasury = initialTreasury;
        $.swapRouter = initialSwapRouter;

        emit TreasuryUpdated(address(0), initialTreasury);
        emit SwapRouterUpdated(address(0), initialSwapRouter);
        emit FeeBpsUpdated(0, initialFeeBps);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CORE FUNCTION
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IDefiPandaDCA
    function executeDCA(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint24 poolFee,
        uint256 amountOutMinimum,
        address recipient
    ) external nonReentrant whenNotPaused returns (uint256 amountOut) {
        if (amountIn == 0) revert ZeroAmount();
        if (recipient == address(0)) revert ZeroAddress();

        DCAStorage storage $ = _getDCAStorage();

        // 1. Pull tokens from sender
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        // 2. Calculate and transfer fee
        uint256 fee = (amountIn * $.feeBps) / BPS_DENOMINATOR;
        uint256 netAmount = amountIn - fee;

        if (fee > 0) {
            IERC20(tokenIn).safeTransfer($.treasury, fee);
        }

        // 3. Approve swap router for net amount (using forceApprove for USDT compatibility)
        IERC20(tokenIn).forceApprove($.swapRouter, netAmount);

        // 4. Execute swap - output tokens go directly to recipient
        ISwapRouter02.ExactInputSingleParams memory params = ISwapRouter02.ExactInputSingleParams({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            fee: poolFee,
            recipient: recipient,
            amountIn: netAmount,
            amountOutMinimum: amountOutMinimum,
            sqrtPriceLimitX96: 0
        });

        amountOut = ISwapRouter02($.swapRouter).exactInputSingle(params);

        // 5. Clear any remaining approval (safety measure)
        IERC20(tokenIn).forceApprove($.swapRouter, 0);

        emit DCAExecuted(msg.sender, tokenIn, tokenOut, amountIn, fee, amountOut, recipient);

        return amountOut;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IDefiPandaDCA
    function feeBps() external view returns (uint16) {
        return _getDCAStorage().feeBps;
    }

    /// @inheritdoc IDefiPandaDCA
    function maxFeeBps() external view returns (uint16) {
        return _getDCAStorage().maxFeeBps;
    }

    /// @inheritdoc IDefiPandaDCA
    function treasury() external view returns (address) {
        return _getDCAStorage().treasury;
    }

    /// @inheritdoc IDefiPandaDCA
    function swapRouter() external view returns (address) {
        return _getDCAStorage().swapRouter;
    }

    /// @inheritdoc IDefiPandaDCA
    function calculateFee(uint256 amountIn) external view returns (uint256 fee, uint256 netAmount) {
        DCAStorage storage $ = _getDCAStorage();
        fee = (amountIn * $.feeBps) / BPS_DENOMINATOR;
        netAmount = amountIn - fee;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @inheritdoc IDefiPandaDCA
    function setFeeBps(uint16 newFeeBps) external onlyOwner {
        DCAStorage storage $ = _getDCAStorage();
        if (newFeeBps > $.maxFeeBps) revert FeeTooHigh(newFeeBps, $.maxFeeBps);

        uint16 oldFeeBps = $.feeBps;
        $.feeBps = newFeeBps;

        emit FeeBpsUpdated(oldFeeBps, newFeeBps);
    }

    /// @inheritdoc IDefiPandaDCA
    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();

        DCAStorage storage $ = _getDCAStorage();
        address oldTreasury = $.treasury;
        $.treasury = newTreasury;

        emit TreasuryUpdated(oldTreasury, newTreasury);
    }

    /// @inheritdoc IDefiPandaDCA
    function setSwapRouter(address newSwapRouter) external onlyOwner {
        if (newSwapRouter == address(0)) revert ZeroAddress();

        DCAStorage storage $ = _getDCAStorage();
        address oldRouter = $.swapRouter;
        $.swapRouter = newSwapRouter;

        emit SwapRouterUpdated(oldRouter, newSwapRouter);
    }

    /// @inheritdoc IDefiPandaDCA
    function rescueTokens(address token, address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();

        IERC20(token).safeTransfer(to, amount);

        emit TokensRescued(token, to, amount);
    }

    /// @notice Pause the contract - disables executeDCA
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpause the contract - re-enables executeDCA
    function unpause() external onlyOwner {
        _unpause();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // UUPS UPGRADE AUTHORIZATION
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Required by UUPS - only owner can upgrade
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}

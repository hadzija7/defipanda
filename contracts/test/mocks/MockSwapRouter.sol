// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ISwapRouter02} from "../../src/interfaces/ISwapRouter02.sol";

/// @title MockSwapRouter - Simulates Uniswap V3 SwapRouter02 for testing
/// @notice Returns a configurable exchange rate for swaps
contract MockSwapRouter is ISwapRouter02 {
    using SafeERC20 for IERC20;

    uint256 public exchangeRateNumerator = 1;
    uint256 public exchangeRateDenominator = 1000;

    bool public shouldRevert;
    string public revertMessage = "MockSwapRouter: swap failed";

    /// @notice Set the exchange rate for swaps
    /// @param numerator Output amount multiplier
    /// @param denominator Output amount divisor (amountOut = amountIn * numerator / denominator)
    function setExchangeRate(uint256 numerator, uint256 denominator) external {
        require(denominator > 0, "Denominator cannot be zero");
        exchangeRateNumerator = numerator;
        exchangeRateDenominator = denominator;
    }

    /// @notice Configure the router to revert on swaps
    function setShouldRevert(bool _shouldRevert, string memory _revertMessage) external {
        shouldRevert = _shouldRevert;
        revertMessage = _revertMessage;
    }

    /// @inheritdoc ISwapRouter02
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut) {
        if (shouldRevert) {
            revert(revertMessage);
        }

        // Pull input tokens from caller
        IERC20(params.tokenIn).safeTransferFrom(msg.sender, address(this), params.amountIn);

        // Calculate output amount based on exchange rate
        amountOut = (params.amountIn * exchangeRateNumerator) / exchangeRateDenominator;

        // Check slippage
        require(amountOut >= params.amountOutMinimum, "MockSwapRouter: insufficient output amount");

        // Mint output tokens to recipient (requires MockERC20)
        IMockMintable(params.tokenOut).mint(params.recipient, amountOut);

        return amountOut;
    }
}

interface IMockMintable {
    function mint(address to, uint256 amount) external;
}

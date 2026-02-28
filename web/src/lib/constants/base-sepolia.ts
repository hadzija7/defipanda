import type { Address } from "viem";
import { parseAbi } from "viem";

export const BASE_SEPOLIA_CHAIN_ID = 84532;

export const USDC_ADDRESS: Address = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const USDC_DECIMALS = 6;

export const WETH_ADDRESS: Address = "0x4200000000000000000000000000000000000006";
export const WETH_DECIMALS = 18;

export const UNISWAP_V3_SWAP_ROUTER_02: Address = "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4";
export const UNISWAP_V3_POOL_FEE = 3000; // 0.3% fee tier (most common for USDC/WETH)

export const swapRouter02Abi = parseAbi([
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)",
]);

export const CHAINLINK_ETH_USD_PRICE_FEED_SEPOLIA: Address =
  "0x694AA1769357215DE4FAC081bf1f309aDC325306";

export const chainlinkPriceFeedAbi = parseAbi([
  "function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function decimals() external view returns (uint8)",
]);

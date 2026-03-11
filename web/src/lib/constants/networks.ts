import type { Address } from "viem";
import type { Chain } from "viem/chains";
import { sepolia, baseSepolia } from "viem/chains";
import { parseAbi } from "viem";

// ---------------------------------------------------------------------------
// Shared ABIs (chain-agnostic)
// ---------------------------------------------------------------------------

export const swapRouter02Abi = parseAbi([
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)",
]);

export const defiPandaDcaAbi = parseAbi([
  "function executeDCA(address tokenIn, address tokenOut, uint256 amountIn, uint24 poolFee, uint256 amountOutMinimum, address recipient) external returns (uint256 amountOut)",
  "function feeBps() external view returns (uint16)",
  "function maxFeeBps() external view returns (uint16)",
  "function treasury() external view returns (address)",
  "function swapRouter() external view returns (address)",
  "function calculateFee(uint256 amountIn) external view returns (uint256 fee, uint256 netAmount)",
]);

export const chainlinkPriceFeedAbi = parseAbi([
  "function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function decimals() external view returns (uint8)",
]);

// ---------------------------------------------------------------------------
// Network config type
// ---------------------------------------------------------------------------

export type NetworkConfig = {
  chain: Chain;
  chainId: number;
  name: string;
  usdc: Address;
  usdcDecimals: number;
  weth: Address;
  wethDecimals: number;
  uniswapV3SwapRouter02: Address;
  uniswapV3PoolFee: number;
  defiPandaDCA: Address;
  chainlinkEthUsdPriceFeed: Address;
  creChainSelectorName: string;
};

// ---------------------------------------------------------------------------
// Network definitions
// ---------------------------------------------------------------------------

const ETH_SEPOLIA: NetworkConfig = {
  chain: sepolia,
  chainId: 11155111,
  name: "Ethereum Sepolia",
  usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  usdcDecimals: 6,
  weth: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
  wethDecimals: 18,
  uniswapV3SwapRouter02: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E",
  uniswapV3PoolFee: 3000,
  defiPandaDCA: "0x567e39581cE86aD92Aa3A0d45D8454921dBDaEa1",
  chainlinkEthUsdPriceFeed: "0x694AA1769357215DE4FAC081bf1f309aDC325306",
  creChainSelectorName: "ethereum-testnet-sepolia",
};

const BASE_SEPOLIA: NetworkConfig = {
  chain: baseSepolia,
  chainId: 84532,
  name: "Base Sepolia",
  usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  usdcDecimals: 6,
  weth: "0x4200000000000000000000000000000000000006",
  wethDecimals: 18,
  uniswapV3SwapRouter02: "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4",
  uniswapV3PoolFee: 3000,
  defiPandaDCA: "0x0000000000000000000000000000000000000000", // TODO: deploy to Base Sepolia
  chainlinkEthUsdPriceFeed: "0x4aDC67D868Fb689A8A7E1c363D8f984dA6cA0891",
  creChainSelectorName: "base-testnet-sepolia",
};

// ---------------------------------------------------------------------------
// Active network — change this single value to switch everything
// ---------------------------------------------------------------------------

export const NETWORKS = {
  ETH_SEPOLIA,
  BASE_SEPOLIA,
} as const;

export type NetworkId = keyof typeof NETWORKS;

export const ACTIVE_NETWORK_ID: NetworkId = "ETH_SEPOLIA";

export const activeNetwork: NetworkConfig = NETWORKS[ACTIVE_NETWORK_ID];

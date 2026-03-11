// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {DefiPandaDCA} from "../src/DefiPandaDCA.sol";

/// @title DeployDCA - Deploy DefiPandaDCA proxy contract
/// @notice Deploys the implementation and proxy, initializes with environment variables
/// @dev Required env vars:
///   - TREASURY_ADDRESS: where fees are sent
///   - SWAP_ROUTER: Uniswap V3 SwapRouter02 address
///   - FEE_BPS: fee in basis points (e.g., 30 = 0.30%)
///   - MAX_FEE_BPS: maximum fee cap (e.g., 500 = 5%)
///   - OWNER_ADDRESS: contract owner (defaults to deployer if not set)
contract DeployDCA is Script {
    // Default values for testnet deployment
    uint16 constant DEFAULT_FEE_BPS = 30; // 0.30%
    uint16 constant DEFAULT_MAX_FEE_BPS = 500; // 5%

    // Known SwapRouter02 addresses
    address constant SEPOLIA_SWAP_ROUTER = 0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E;
    address constant MAINNET_SWAP_ROUTER = 0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45;

    function run() external {
        // Load configuration from environment
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        address swapRouter = vm.envOr("SWAP_ROUTER", SEPOLIA_SWAP_ROUTER);
        uint16 feeBps = uint16(vm.envOr("FEE_BPS", uint256(DEFAULT_FEE_BPS)));
        uint16 maxFeeBps = uint16(vm.envOr("MAX_FEE_BPS", uint256(DEFAULT_MAX_FEE_BPS)));

        // Owner defaults to deployer
        address owner = vm.envOr("OWNER_ADDRESS", msg.sender);

        console.log("=== DefiPandaDCA Deployment ===");
        console.log("Owner:", owner);
        console.log("Treasury:", treasury);
        console.log("SwapRouter:", swapRouter);
        console.log("Fee BPS:", feeBps);
        console.log("Max Fee BPS:", maxFeeBps);

        vm.startBroadcast();

        // Deploy implementation
        DefiPandaDCA implementation = new DefiPandaDCA();
        console.log("Implementation deployed at:", address(implementation));

        // Prepare initialization data
        bytes memory initData = abi.encodeCall(
            DefiPandaDCA.initialize,
            (owner, treasury, swapRouter, feeBps, maxFeeBps)
        );

        // Deploy proxy
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), initData);
        console.log("Proxy deployed at:", address(proxy));

        // Verify deployment
        DefiPandaDCA dca = DefiPandaDCA(address(proxy));
        require(dca.owner() == owner, "Owner mismatch");
        require(dca.treasury() == treasury, "Treasury mismatch");
        require(dca.swapRouter() == swapRouter, "SwapRouter mismatch");
        require(dca.feeBps() == feeBps, "FeeBps mismatch");
        require(dca.maxFeeBps() == maxFeeBps, "MaxFeeBps mismatch");

        console.log("=== Deployment Verified ===");

        vm.stopBroadcast();
    }
}

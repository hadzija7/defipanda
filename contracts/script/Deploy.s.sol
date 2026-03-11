// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Script, console} from "forge-std/Script.sol";
import {DefiPandaReceiver} from "../src/DefiPandaReceiver.sol";

contract DeployScript is Script {
    function run() external {
        vm.startBroadcast();
        address forwarder = vm.envOr("FORWARDER_ADDRESS", address(0x1234));
        DefiPandaReceiver receiver = new DefiPandaReceiver(forwarder);
        console.log("DefiPandaReceiver deployed at", address(receiver));
        vm.stopBroadcast();
    }
}

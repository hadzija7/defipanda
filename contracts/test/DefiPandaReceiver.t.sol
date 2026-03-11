// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Test, console} from "forge-std/Test.sol";
import {DefiPandaReceiver} from "../src/DefiPandaReceiver.sol";

contract DefiPandaReceiverTest is Test {
    DefiPandaReceiver public receiver;
    address constant FORWARDER = address(0x1234);

    function setUp() public {
        receiver = new DefiPandaReceiver(FORWARDER);
    }

    function test_Deploy() public view {
        assertEq(receiver.getForwarderAddress(), FORWARDER);
        assertEq(receiver.owner(), address(this));
    }
}

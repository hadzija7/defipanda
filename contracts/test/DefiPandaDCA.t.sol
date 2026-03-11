// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

import {DefiPandaDCA} from "../src/DefiPandaDCA.sol";
import {IDefiPandaDCA} from "../src/interfaces/IDefiPandaDCA.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockSwapRouter} from "./mocks/MockSwapRouter.sol";

contract DefiPandaDCATest is Test {
    DefiPandaDCA public implementation;
    DefiPandaDCA public dca;
    MockERC20 public usdc;
    MockERC20 public weth;
    MockSwapRouter public swapRouter;

    address public owner = address(0x1);
    address public treasury = address(0x2);
    address public user = address(0x3);
    address public attacker = address(0x4);

    uint16 public constant FEE_BPS = 30; // 0.30%
    uint16 public constant MAX_FEE_BPS = 500; // 5%
    uint24 public constant POOL_FEE = 3000; // 0.3% pool fee

    event DCAExecuted(
        address indexed user,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 fee,
        uint256 amountOut,
        address recipient
    );
    event FeeBpsUpdated(uint16 oldFeeBps, uint16 newFeeBps);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event SwapRouterUpdated(address indexed oldRouter, address indexed newRouter);
    event TokensRescued(address indexed token, address indexed to, uint256 amount);

    function setUp() public {
        // Deploy mocks
        usdc = new MockERC20("USD Coin", "USDC", 6);
        weth = new MockERC20("Wrapped Ether", "WETH", 18);
        swapRouter = new MockSwapRouter();

        // Set exchange rate: 1 USDC = 0.0005 WETH (roughly $2000/ETH)
        swapRouter.setExchangeRate(1, 2000);

        // Deploy implementation
        implementation = new DefiPandaDCA();

        // Deploy proxy
        bytes memory initData = abi.encodeCall(
            DefiPandaDCA.initialize,
            (owner, treasury, address(swapRouter), FEE_BPS, MAX_FEE_BPS)
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), initData);
        dca = DefiPandaDCA(address(proxy));

        // Fund user with USDC
        usdc.mint(user, 10_000e6); // 10,000 USDC

        // Approve DCA contract
        vm.prank(user);
        usdc.approve(address(dca), type(uint256).max);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INITIALIZATION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_Initialize() public view {
        assertEq(dca.owner(), owner);
        assertEq(dca.treasury(), treasury);
        assertEq(dca.swapRouter(), address(swapRouter));
        assertEq(dca.feeBps(), FEE_BPS);
        assertEq(dca.maxFeeBps(), MAX_FEE_BPS);
    }

    function test_Initialize_RevertIf_ZeroOwner() public {
        DefiPandaDCA newImpl = new DefiPandaDCA();
        bytes memory initData = abi.encodeCall(
            DefiPandaDCA.initialize,
            (address(0), treasury, address(swapRouter), FEE_BPS, MAX_FEE_BPS)
        );
        vm.expectRevert(IDefiPandaDCA.ZeroAddress.selector);
        new ERC1967Proxy(address(newImpl), initData);
    }

    function test_Initialize_RevertIf_ZeroTreasury() public {
        DefiPandaDCA newImpl = new DefiPandaDCA();
        bytes memory initData = abi.encodeCall(
            DefiPandaDCA.initialize,
            (owner, address(0), address(swapRouter), FEE_BPS, MAX_FEE_BPS)
        );
        vm.expectRevert(IDefiPandaDCA.ZeroAddress.selector);
        new ERC1967Proxy(address(newImpl), initData);
    }

    function test_Initialize_RevertIf_ZeroSwapRouter() public {
        DefiPandaDCA newImpl = new DefiPandaDCA();
        bytes memory initData = abi.encodeCall(
            DefiPandaDCA.initialize,
            (owner, treasury, address(0), FEE_BPS, MAX_FEE_BPS)
        );
        vm.expectRevert(IDefiPandaDCA.ZeroAddress.selector);
        new ERC1967Proxy(address(newImpl), initData);
    }

    function test_Initialize_RevertIf_FeeExceedsMax() public {
        DefiPandaDCA newImpl = new DefiPandaDCA();
        bytes memory initData = abi.encodeCall(
            DefiPandaDCA.initialize,
            (owner, treasury, address(swapRouter), MAX_FEE_BPS + 1, MAX_FEE_BPS)
        );
        vm.expectRevert(abi.encodeWithSelector(IDefiPandaDCA.FeeTooHigh.selector, MAX_FEE_BPS + 1, MAX_FEE_BPS));
        new ERC1967Proxy(address(newImpl), initData);
    }

    function test_CannotReinitialize() public {
        vm.expectRevert();
        dca.initialize(owner, treasury, address(swapRouter), FEE_BPS, MAX_FEE_BPS);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EXECUTE DCA TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_ExecuteDCA() public {
        uint256 amountIn = 1000e6; // 1000 USDC
        uint256 expectedFee = (amountIn * FEE_BPS) / 10_000; // 3 USDC
        uint256 expectedNetAmount = amountIn - expectedFee; // 997 USDC
        uint256 expectedAmountOut = (expectedNetAmount * 1) / 2000; // ~0.0004985 WETH

        uint256 treasuryBalanceBefore = usdc.balanceOf(treasury);
        uint256 userUsdcBefore = usdc.balanceOf(user);
        uint256 userWethBefore = weth.balanceOf(user);

        vm.prank(user);
        vm.expectEmit(true, true, true, true);
        emit DCAExecuted(user, address(usdc), address(weth), amountIn, expectedFee, expectedAmountOut, user);
        uint256 amountOut = dca.executeDCA(address(usdc), address(weth), amountIn, POOL_FEE, 0, user);

        assertEq(amountOut, expectedAmountOut);
        assertEq(usdc.balanceOf(treasury), treasuryBalanceBefore + expectedFee);
        assertEq(usdc.balanceOf(user), userUsdcBefore - amountIn);
        assertEq(weth.balanceOf(user), userWethBefore + amountOut);
    }

    function test_ExecuteDCA_ZeroFee() public {
        // Set fee to 0
        vm.prank(owner);
        dca.setFeeBps(0);

        uint256 amountIn = 1000e6;
        uint256 treasuryBalanceBefore = usdc.balanceOf(treasury);

        vm.prank(user);
        dca.executeDCA(address(usdc), address(weth), amountIn, POOL_FEE, 0, user);

        // No fee should be collected
        assertEq(usdc.balanceOf(treasury), treasuryBalanceBefore);
    }

    function test_ExecuteDCA_DifferentRecipient() public {
        address recipient = address(0x999);
        uint256 amountIn = 1000e6;

        vm.prank(user);
        uint256 amountOut = dca.executeDCA(address(usdc), address(weth), amountIn, POOL_FEE, 0, recipient);

        assertEq(weth.balanceOf(recipient), amountOut);
        assertEq(weth.balanceOf(user), 0);
    }

    function test_ExecuteDCA_RevertIf_ZeroAmount() public {
        vm.prank(user);
        vm.expectRevert(IDefiPandaDCA.ZeroAmount.selector);
        dca.executeDCA(address(usdc), address(weth), 0, POOL_FEE, 0, user);
    }

    function test_ExecuteDCA_RevertIf_ZeroRecipient() public {
        vm.prank(user);
        vm.expectRevert(IDefiPandaDCA.ZeroAddress.selector);
        dca.executeDCA(address(usdc), address(weth), 1000e6, POOL_FEE, 0, address(0));
    }

    function test_ExecuteDCA_RevertIf_Paused() public {
        vm.prank(owner);
        dca.pause();

        vm.prank(user);
        vm.expectRevert(PausableUpgradeable.EnforcedPause.selector);
        dca.executeDCA(address(usdc), address(weth), 1000e6, POOL_FEE, 0, user);
    }

    function test_ExecuteDCA_RevertIf_SlippageExceeded() public {
        uint256 amountIn = 1000e6;
        uint256 unreasonableMinOut = 1e18; // Way too high

        vm.prank(user);
        vm.expectRevert("MockSwapRouter: insufficient output amount");
        dca.executeDCA(address(usdc), address(weth), amountIn, POOL_FEE, unreasonableMinOut, user);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FEE CALCULATION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_CalculateFee() public view {
        uint256 amountIn = 1000e6;
        (uint256 fee, uint256 netAmount) = dca.calculateFee(amountIn);

        assertEq(fee, (amountIn * FEE_BPS) / 10_000);
        assertEq(netAmount, amountIn - fee);
        assertEq(fee + netAmount, amountIn);
    }

    function testFuzz_CalculateFee(uint256 amountIn) public view {
        vm.assume(amountIn < type(uint256).max / FEE_BPS);

        (uint256 fee, uint256 netAmount) = dca.calculateFee(amountIn);

        assertEq(fee, (amountIn * FEE_BPS) / 10_000);
        assertEq(netAmount, amountIn - fee);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTION TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_SetFeeBps() public {
        uint16 newFee = 50;

        vm.prank(owner);
        vm.expectEmit(true, true, true, true);
        emit FeeBpsUpdated(FEE_BPS, newFee);
        dca.setFeeBps(newFee);

        assertEq(dca.feeBps(), newFee);
    }

    function test_SetFeeBps_RevertIf_NotOwner() public {
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, attacker));
        dca.setFeeBps(50);
    }

    function test_SetFeeBps_RevertIf_ExceedsMax() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IDefiPandaDCA.FeeTooHigh.selector, MAX_FEE_BPS + 1, MAX_FEE_BPS));
        dca.setFeeBps(MAX_FEE_BPS + 1);
    }

    function test_SetTreasury() public {
        address newTreasury = address(0x999);

        vm.prank(owner);
        vm.expectEmit(true, true, true, true);
        emit TreasuryUpdated(treasury, newTreasury);
        dca.setTreasury(newTreasury);

        assertEq(dca.treasury(), newTreasury);
    }

    function test_SetTreasury_RevertIf_NotOwner() public {
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, attacker));
        dca.setTreasury(address(0x999));
    }

    function test_SetTreasury_RevertIf_ZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(IDefiPandaDCA.ZeroAddress.selector);
        dca.setTreasury(address(0));
    }

    function test_SetSwapRouter() public {
        address newRouter = address(0x999);

        vm.prank(owner);
        vm.expectEmit(true, true, true, true);
        emit SwapRouterUpdated(address(swapRouter), newRouter);
        dca.setSwapRouter(newRouter);

        assertEq(dca.swapRouter(), newRouter);
    }

    function test_SetSwapRouter_RevertIf_NotOwner() public {
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, attacker));
        dca.setSwapRouter(address(0x999));
    }

    function test_SetSwapRouter_RevertIf_ZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(IDefiPandaDCA.ZeroAddress.selector);
        dca.setSwapRouter(address(0));
    }

    function test_RescueTokens() public {
        // Send some tokens to the contract accidentally
        usdc.mint(address(dca), 100e6);

        address rescueTo = address(0x999);
        uint256 rescueAmount = 100e6;

        vm.prank(owner);
        vm.expectEmit(true, true, true, true);
        emit TokensRescued(address(usdc), rescueTo, rescueAmount);
        dca.rescueTokens(address(usdc), rescueTo, rescueAmount);

        assertEq(usdc.balanceOf(rescueTo), rescueAmount);
        assertEq(usdc.balanceOf(address(dca)), 0);
    }

    function test_RescueTokens_RevertIf_NotOwner() public {
        usdc.mint(address(dca), 100e6);

        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, attacker));
        dca.rescueTokens(address(usdc), attacker, 100e6);
    }

    function test_RescueTokens_RevertIf_ZeroRecipient() public {
        usdc.mint(address(dca), 100e6);

        vm.prank(owner);
        vm.expectRevert(IDefiPandaDCA.ZeroAddress.selector);
        dca.rescueTokens(address(usdc), address(0), 100e6);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PAUSE TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_Pause() public {
        vm.prank(owner);
        dca.pause();

        assertTrue(dca.paused());
    }

    function test_Unpause() public {
        vm.prank(owner);
        dca.pause();

        vm.prank(owner);
        dca.unpause();

        assertFalse(dca.paused());
    }

    function test_Pause_RevertIf_NotOwner() public {
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, attacker));
        dca.pause();
    }

    function test_Unpause_RevertIf_NotOwner() public {
        vm.prank(owner);
        dca.pause();

        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, attacker));
        dca.unpause();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // UPGRADE TESTS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_Upgrade_RevertIf_NotOwner() public {
        DefiPandaDCA newImpl = new DefiPandaDCA();

        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, attacker));
        dca.upgradeToAndCall(address(newImpl), "");
    }

    function test_Upgrade_Success() public {
        DefiPandaDCA newImpl = new DefiPandaDCA();

        // Store state before upgrade
        address oldTreasury = dca.treasury();
        uint16 oldFeeBps = dca.feeBps();

        vm.prank(owner);
        dca.upgradeToAndCall(address(newImpl), "");

        // State should be preserved
        assertEq(dca.treasury(), oldTreasury);
        assertEq(dca.feeBps(), oldFeeBps);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {JobEscrow} from "../src/JobEscrow.sol";

/// @notice Deploys JobEscrow pointed at the chain's USDC.
/// @dev USDC_ADDRESS env var selects the token:
///      - Arc Testnet: 0x3600000000000000000000000000000000000000 (native USDC's ERC-20 view)
///      - local anvil: the MockUSDC deployed by the e2e script
contract DeployJobEscrow is Script {
    function run() external returns (JobEscrow escrow) {
        address usdcAddress = vm.envAddress("USDC_ADDRESS");
        // Key comes from the env (contracts/.env, gitignored) — never from a
        // plain-text CLI flag.
        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        escrow = new JobEscrow(usdcAddress);
        vm.stopBroadcast();
        console.log("JobEscrow deployed at", address(escrow));
        console.log("USDC", usdcAddress);
    }
}

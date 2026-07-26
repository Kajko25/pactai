// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IdentityRegistry} from "../src/erc8004/IdentityRegistry.sol";
import {JobReputationRegistry} from "../src/erc8004/JobReputationRegistry.sol";

/// @notice Deploys PactAI's own IdentityRegistry + JobReputationRegistry, pointed at the
///         already-deployed JobEscrow. Deliberately fresh registries -- not DAO-WARDEN's.
/// @dev JOB_ESCROW_ADDRESS env var selects the escrow (docs/deployed.json has the live one).
contract DeployERC8004 is Script {
    function run() external returns (IdentityRegistry identity, JobReputationRegistry reputation) {
        address jobEscrowAddress = vm.envAddress("JOB_ESCROW_ADDRESS");

        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        identity = new IdentityRegistry();
        reputation = new JobReputationRegistry(jobEscrowAddress, address(identity));
        vm.stopBroadcast();

        console.log("IdentityRegistry deployed at", address(identity));
        console.log("JobReputationRegistry deployed at", address(reputation));
        console.log("JobEscrow (existing)", jobEscrowAddress);
    }
}

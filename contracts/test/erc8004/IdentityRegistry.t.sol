// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IdentityRegistry} from "../../src/erc8004/IdentityRegistry.sol";

contract IdentityRegistryTest is Test {
    IdentityRegistry internal registry;

    address internal requester = makeAddr("requester");
    address internal executor = makeAddr("executor");
    address internal newWallet = makeAddr("newWallet");

    function setUp() public {
        registry = new IdentityRegistry();
    }

    function test_RegisterAssignsIncrementalIds() public {
        vm.prank(requester);
        uint256 id1 = registry.register("data:application/json,requester-card");
        vm.prank(executor);
        uint256 id2 = registry.register("data:application/json,executor-card");

        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(registry.totalRegistered(), 2);
        assertEq(registry.ownerOf(id1), requester);
        assertEq(registry.ownerOf(id2), executor);
    }

    function test_RegisterSetsReverseLookup() public {
        vm.prank(requester);
        uint256 id = registry.register("data:application/json,requester-card");
        assertEq(registry.agentIdOf(requester), id);
    }

    function test_UnregisteredWalletResolvesToZero() public view {
        assertEq(registry.agentIdOf(executor), 0);
    }

    function test_RegisterWithMetadata() public {
        IdentityRegistry.MetadataEntry[] memory metadata = new IdentityRegistry.MetadataEntry[](1);
        metadata[0] = IdentityRegistry.MetadataEntry({metadataKey: "role", metadataValue: bytes("executor")});

        vm.prank(executor);
        uint256 id = registry.register("data:application/json,executor-card", metadata);

        assertEq(registry.getMetadata(id, "role"), bytes("executor"));
    }

    function test_SetAgentURI_OnlyOwner() public {
        vm.prank(requester);
        uint256 id = registry.register("data:application/json,v1");

        vm.prank(requester);
        registry.setAgentURI(id, "data:application/json,v2");
        assertEq(registry.tokenURI(id), "data:application/json,v2");

        vm.prank(executor);
        vm.expectRevert("IdentityRegistry: not agent owner");
        registry.setAgentURI(id, "data:application/json,v3");
    }

    function test_SetAgentWallet_MovesReverseLookup() public {
        vm.prank(requester);
        uint256 id = registry.register("data:application/json,requester-card");

        vm.prank(requester);
        registry.setAgentWallet(id, newWallet);

        assertEq(registry.getAgentWallet(id), newWallet);
        assertEq(registry.agentIdOf(newWallet), id);
    }
}

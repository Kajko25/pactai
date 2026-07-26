// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {JobEscrow} from "../../src/JobEscrow.sol";
import {IdentityRegistry} from "../../src/erc8004/IdentityRegistry.sol";
import {JobReputationRegistry} from "../../src/erc8004/JobReputationRegistry.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract JobReputationRegistryTest is Test {
    MockUSDC internal usdc;
    JobEscrow internal escrow;
    IdentityRegistry internal identity;
    JobReputationRegistry internal reputation;

    address internal requester = makeAddr("requester");
    address internal executor = makeAddr("executor");
    address internal stranger = makeAddr("stranger");

    uint256 internal executorAgentId;
    uint256 internal constant AMOUNT = 2_000_000;

    function setUp() public {
        usdc = new MockUSDC();
        escrow = new JobEscrow(address(usdc));
        identity = new IdentityRegistry();
        reputation = new JobReputationRegistry(address(escrow), address(identity));

        usdc.mint(requester, 100_000_000);
        vm.prank(requester);
        usdc.approve(address(escrow), type(uint256).max);

        vm.prank(executor);
        executorAgentId = identity.register("data:application/json,executor-card");
    }

    function _fundedJob(bytes32 jobId, uint64 deadline) internal {
        vm.prank(requester);
        escrow.fund(jobId, executor, AMOUNT, deadline);
    }

    function test_RecordOutcome_Released() public {
        bytes32 jobId = keccak256("job-released");
        _fundedJob(jobId, uint64(block.timestamp + 1 days));

        vm.prank(executor);
        escrow.submitResult(jobId, keccak256("proof"));
        vm.prank(requester);
        escrow.release(jobId);

        (uint256 agentId, JobReputationRegistry.Outcome outcome) = reputation.recordOutcome(jobId);
        assertEq(agentId, executorAgentId);
        assertEq(uint8(outcome), uint8(JobReputationRegistry.Outcome.Released));

        (uint64 total, uint64 released, uint8 rate) = reputation.getSummary(executorAgentId);
        assertEq(total, 1);
        assertEq(released, 1);
        assertEq(rate, 100);
    }

    function test_RecordOutcome_Refunded() public {
        bytes32 jobId = keccak256("job-refunded");
        uint64 deadline = uint64(block.timestamp + 1 hours);
        _fundedJob(jobId, deadline);

        vm.warp(deadline + 1);
        escrow.refund(jobId);

        (uint256 agentId, JobReputationRegistry.Outcome outcome) = reputation.recordOutcome(jobId);
        assertEq(agentId, executorAgentId);
        assertEq(uint8(outcome), uint8(JobReputationRegistry.Outcome.Refunded));

        (uint64 total, uint64 released, uint8 rate) = reputation.getSummary(executorAgentId);
        assertEq(total, 1);
        assertEq(released, 0);
        assertEq(rate, 0);
    }

    function test_RecordOutcome_IsPermissionless() public {
        bytes32 jobId = keccak256("job-permissionless");
        _fundedJob(jobId, uint64(block.timestamp + 1 days));
        vm.prank(executor);
        escrow.submitResult(jobId, keccak256("proof"));
        vm.prank(requester);
        escrow.release(jobId);

        // A totally unrelated address can record the outcome -- nothing to game,
        // the state being read is already final on JobEscrow.
        vm.prank(stranger);
        reputation.recordOutcome(jobId);

        (uint64 total,,) = reputation.getSummary(executorAgentId);
        assertEq(total, 1);
    }

    function test_RecordOutcome_RevertsIfNotTerminal() public {
        bytes32 jobId = keccak256("job-pending");
        _fundedJob(jobId, uint64(block.timestamp + 1 days));

        vm.expectRevert(JobReputationRegistry.JobNotTerminal.selector);
        reputation.recordOutcome(jobId);
    }

    function test_RecordOutcome_RevertsIfAlreadyRecorded() public {
        bytes32 jobId = keccak256("job-double");
        _fundedJob(jobId, uint64(block.timestamp + 1 days));
        vm.prank(executor);
        escrow.submitResult(jobId, keccak256("proof"));
        vm.prank(requester);
        escrow.release(jobId);

        reputation.recordOutcome(jobId);
        vm.expectRevert(JobReputationRegistry.AlreadyRecorded.selector);
        reputation.recordOutcome(jobId);
    }

    function test_RecordOutcome_RevertsIfExecutorUnregistered() public {
        address unregisteredExecutor = makeAddr("unregisteredExecutor");
        bytes32 jobId = keccak256("job-unregistered");
        vm.prank(requester);
        escrow.fund(jobId, unregisteredExecutor, AMOUNT, uint64(block.timestamp + 1 days));

        vm.prank(unregisteredExecutor);
        escrow.submitResult(jobId, keccak256("proof"));
        vm.prank(requester);
        escrow.release(jobId);

        vm.expectRevert(JobReputationRegistry.ExecutorNotRegistered.selector);
        reputation.recordOutcome(jobId);
    }

    function test_GetSummary_MixedOutcomes() public {
        bytes32 jobA = keccak256("job-a");
        bytes32 jobB = keccak256("job-b");
        bytes32 jobC = keccak256("job-c");

        // A: released
        _fundedJob(jobA, uint64(block.timestamp + 1 days));
        vm.prank(executor);
        escrow.submitResult(jobA, keccak256("proof-a"));
        vm.prank(requester);
        escrow.release(jobA);
        reputation.recordOutcome(jobA);

        // B: released
        _fundedJob(jobB, uint64(block.timestamp + 1 days));
        vm.prank(executor);
        escrow.submitResult(jobB, keccak256("proof-b"));
        vm.prank(requester);
        escrow.release(jobB);
        reputation.recordOutcome(jobB);

        // C: refunded (timeout, never delivered)
        uint64 shortDeadline = uint64(block.timestamp + 1 hours);
        _fundedJob(jobC, shortDeadline);
        vm.warp(shortDeadline + 1);
        escrow.refund(jobC);
        reputation.recordOutcome(jobC);

        (uint64 total, uint64 released, uint8 rate) = reputation.getSummary(executorAgentId);
        assertEq(total, 3);
        assertEq(released, 2);
        assertEq(rate, 66); // 2/3 -> 66 (integer division)
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {JobEscrow} from "../src/JobEscrow.sol";

/// @dev Mimics Arc Testnet USDC: 6 decimals, plain ERC-20 interface.
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract JobEscrowTest is Test {
    MockUSDC internal usdc;
    JobEscrow internal escrow;

    address internal requester = makeAddr("requester");
    address internal executor = makeAddr("executor");
    address internal stranger = makeAddr("stranger");

    bytes32 internal constant JOB_ID = keccak256("job-1");
    bytes32 internal constant RESULT_HASH = keccak256("slot-proof-1");
    uint256 internal constant AMOUNT = 2_000_000; // 2 USDC (6 decimals)
    uint64 internal deadline;

    event JobFunded(bytes32 indexed jobId, address indexed requester, address indexed executor, uint256 amount, uint64 deadline);
    event ResultSubmitted(bytes32 indexed jobId, bytes32 resultHash);
    event JobReleased(bytes32 indexed jobId, address indexed executor, uint256 amount);
    event JobRefunded(bytes32 indexed jobId, address indexed requester, uint256 amount);

    function setUp() public {
        usdc = new MockUSDC();
        escrow = new JobEscrow(address(usdc));
        deadline = uint64(block.timestamp + 1 hours);

        usdc.mint(requester, 10_000_000); // 10 USDC
        vm.prank(requester);
        usdc.approve(address(escrow), type(uint256).max);
    }

    function fundJob() internal {
        vm.prank(requester);
        escrow.fund(JOB_ID, executor, AMOUNT, deadline);
    }

    // --- fund ---

    function test_Fund_MovesUsdcAndStoresJob() public {
        vm.expectEmit(true, true, true, true);
        emit JobFunded(JOB_ID, requester, executor, AMOUNT, deadline);
        fundJob();

        assertEq(usdc.balanceOf(address(escrow)), AMOUNT);
        assertEq(usdc.balanceOf(requester), 8_000_000);

        JobEscrow.Job memory job = escrow.getJob(JOB_ID);
        assertEq(job.requester, requester);
        assertEq(job.executor, executor);
        assertEq(job.amount, AMOUNT);
        assertEq(job.deadline, deadline);
        assertEq(uint8(job.state), uint8(JobEscrow.State.Funded));
        assertEq(job.resultHash, bytes32(0));
    }

    function test_Fund_RevertsOnDuplicateJobId() public {
        fundJob();
        vm.prank(requester);
        vm.expectRevert(JobEscrow.JobAlreadyExists.selector);
        escrow.fund(JOB_ID, executor, AMOUNT, deadline);
    }

    function test_Fund_RevertsOnZeroAmount() public {
        vm.prank(requester);
        vm.expectRevert(JobEscrow.ZeroAmount.selector);
        escrow.fund(JOB_ID, executor, 0, deadline);
    }

    function test_Fund_RevertsWithoutBalance() public {
        vm.prank(stranger);
        usdc.approve(address(escrow), type(uint256).max);
        vm.prank(stranger);
        vm.expectRevert();
        escrow.fund(JOB_ID, executor, AMOUNT, deadline);
    }

    // --- submitResult ---

    function test_SubmitResult_StoresHashAndMovesState() public {
        fundJob();
        vm.expectEmit(true, false, false, true);
        emit ResultSubmitted(JOB_ID, RESULT_HASH);
        vm.prank(executor);
        escrow.submitResult(JOB_ID, RESULT_HASH);

        JobEscrow.Job memory job = escrow.getJob(JOB_ID);
        assertEq(job.resultHash, RESULT_HASH);
        assertEq(uint8(job.state), uint8(JobEscrow.State.Delivered));
    }

    function test_SubmitResult_RevertsForNonExecutor() public {
        fundJob();
        vm.prank(stranger);
        vm.expectRevert(JobEscrow.NotExecutor.selector);
        escrow.submitResult(JOB_ID, RESULT_HASH);
    }

    function test_SubmitResult_RevertsOnUnknownJob() public {
        vm.prank(executor);
        vm.expectRevert(JobEscrow.JobNotFound.selector);
        escrow.submitResult(JOB_ID, RESULT_HASH);
    }

    function test_SubmitResult_RevertsWhenAlreadyDelivered() public {
        fundJob();
        vm.prank(executor);
        escrow.submitResult(JOB_ID, RESULT_HASH);
        vm.prank(executor);
        vm.expectRevert(JobEscrow.WrongState.selector);
        escrow.submitResult(JOB_ID, RESULT_HASH);
    }

    // --- release ---

    function test_Release_PaysExecutor() public {
        fundJob();
        vm.prank(executor);
        escrow.submitResult(JOB_ID, RESULT_HASH);

        vm.expectEmit(true, true, false, true);
        emit JobReleased(JOB_ID, executor, AMOUNT);
        vm.prank(requester);
        escrow.release(JOB_ID);

        assertEq(usdc.balanceOf(executor), AMOUNT);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertEq(uint8(escrow.getJob(JOB_ID).state), uint8(JobEscrow.State.Released));
    }

    function test_Release_RevertsForNonRequester() public {
        fundJob();
        vm.prank(executor);
        escrow.submitResult(JOB_ID, RESULT_HASH);
        vm.prank(executor);
        vm.expectRevert(JobEscrow.NotRequester.selector);
        escrow.release(JOB_ID);
    }

    function test_Release_RevertsBeforeDelivery() public {
        fundJob();
        vm.prank(requester);
        vm.expectRevert(JobEscrow.WrongState.selector);
        escrow.release(JOB_ID);
    }

    function test_Release_RevertsWhenAlreadyReleased() public {
        fundJob();
        vm.prank(executor);
        escrow.submitResult(JOB_ID, RESULT_HASH);
        vm.prank(requester);
        escrow.release(JOB_ID);
        vm.prank(requester);
        vm.expectRevert(JobEscrow.WrongState.selector);
        escrow.release(JOB_ID);
    }

    // --- refund ---

    function test_Refund_RequesterCancelsBeforeDelivery() public {
        fundJob();
        vm.expectEmit(true, true, false, true);
        emit JobRefunded(JOB_ID, requester, AMOUNT);
        vm.prank(requester);
        escrow.refund(JOB_ID);

        assertEq(usdc.balanceOf(requester), 10_000_000);
        assertEq(uint8(escrow.getJob(JOB_ID).state), uint8(JobEscrow.State.Refunded));
    }

    function test_Refund_RequesterCannotCancelAfterDeliveryBeforeDeadline() public {
        fundJob();
        vm.prank(executor);
        escrow.submitResult(JOB_ID, RESULT_HASH);
        vm.prank(requester);
        vm.expectRevert(JobEscrow.DeadlineNotReached.selector);
        escrow.refund(JOB_ID);
    }

    function test_Refund_AnyoneAfterDeadlineWhenFunded() public {
        fundJob();
        vm.warp(deadline);
        vm.prank(stranger);
        escrow.refund(JOB_ID);
        assertEq(usdc.balanceOf(requester), 10_000_000);
        assertEq(uint8(escrow.getJob(JOB_ID).state), uint8(JobEscrow.State.Refunded));
    }

    function test_Refund_AnyoneAfterDeadlineWhenDeliveredButNotReleased() public {
        fundJob();
        vm.prank(executor);
        escrow.submitResult(JOB_ID, RESULT_HASH);
        vm.warp(deadline);
        vm.prank(stranger);
        escrow.refund(JOB_ID);
        assertEq(usdc.balanceOf(requester), 10_000_000);
    }

    function test_Refund_RevertsForStrangerBeforeDeadline() public {
        fundJob();
        vm.prank(stranger);
        vm.expectRevert(JobEscrow.DeadlineNotReached.selector);
        escrow.refund(JOB_ID);
    }

    function test_Refund_RevertsOnUnknownJob() public {
        vm.prank(requester);
        vm.expectRevert(JobEscrow.JobNotFound.selector);
        escrow.refund(JOB_ID);
    }

    function test_Refund_RevertsAfterRelease() public {
        fundJob();
        vm.prank(executor);
        escrow.submitResult(JOB_ID, RESULT_HASH);
        vm.prank(requester);
        escrow.release(JOB_ID);
        vm.warp(deadline);
        vm.prank(requester);
        vm.expectRevert(JobEscrow.DeadlineNotReached.selector);
        escrow.refund(JOB_ID);
    }

    // --- full lifecycle sanity (mirrors the SlotScout demo paths) ---

    function test_Lifecycle_HappyPath() public {
        fundJob();
        vm.prank(executor);
        escrow.submitResult(JOB_ID, RESULT_HASH);
        vm.prank(requester);
        escrow.release(JOB_ID);
        assertEq(usdc.balanceOf(executor), AMOUNT);
        assertEq(usdc.balanceOf(requester), 8_000_000);
    }

    function test_Lifecycle_TimeoutNoSlotFound() public {
        fundJob();
        // executor never finds a slot; anyone can trigger the refund after the deadline
        vm.warp(deadline + 1);
        vm.prank(stranger);
        escrow.refund(JOB_ID);
        assertEq(usdc.balanceOf(requester), 10_000_000);
        assertEq(usdc.balanceOf(executor), 0);
    }
}

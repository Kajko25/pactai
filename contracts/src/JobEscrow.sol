// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title JobEscrow
/// @notice Holds USDC for a single agent-to-agent job until the executor
///         delivers a result and the requester (or a timeout) releases it.
///         This is PactAI's core primitive on top of Circle's x402
///         nanopayments: x402 settles pay-per-response instantly, JobEscrow
///         settles pay-per-completed-job, asynchronously.
/// @dev MVP-scope: single-arbiter (requester) approval + timeout refund.
///      No partial payments, no disputes yet — see docs/PLAN.md cut list.
contract JobEscrow {
    using SafeERC20 for IERC20;

    enum State {
        None,
        Funded,
        Delivered,
        Released,
        Refunded
    }

    struct Job {
        address requester;
        address executor;
        uint256 amount;
        uint64 deadline; // unix timestamp; refundable by anyone after this if not Released
        State state;
        bytes32 resultHash;
    }

    IERC20 public immutable usdc;
    mapping(bytes32 => Job) public jobs;

    event JobFunded(bytes32 indexed jobId, address indexed requester, address indexed executor, uint256 amount, uint64 deadline);
    event ResultSubmitted(bytes32 indexed jobId, bytes32 resultHash);
    event JobReleased(bytes32 indexed jobId, address indexed executor, uint256 amount);
    event JobRefunded(bytes32 indexed jobId, address indexed requester, uint256 amount);

    error JobAlreadyExists();
    error JobNotFound();
    error NotRequester();
    error NotExecutor();
    error WrongState();
    error DeadlineNotReached();
    error ZeroAmount();

    constructor(address usdcAddress) {
        usdc = IERC20(usdcAddress);
    }

    /// @notice Requester funds a new job, pulling `amount` USDC from their wallet.
    /// @param jobId Caller-generated unique id (e.g. keccak256 of job spec + nonce).
    function fund(bytes32 jobId, address executor, uint256 amount, uint64 deadline) external {
        if (jobs[jobId].state != State.None) revert JobAlreadyExists();
        if (amount == 0) revert ZeroAmount();

        jobs[jobId] = Job({
            requester: msg.sender,
            executor: executor,
            amount: amount,
            deadline: deadline,
            state: State.Funded,
            resultHash: bytes32(0)
        });

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit JobFunded(jobId, msg.sender, executor, amount, deadline);
    }

    /// @notice Executor submits proof of completed work (e.g. hash of a result URI).
    function submitResult(bytes32 jobId, bytes32 resultHash) external {
        Job storage job = jobs[jobId];
        if (job.state == State.None) revert JobNotFound();
        if (msg.sender != job.executor) revert NotExecutor();
        if (job.state != State.Funded) revert WrongState();

        job.resultHash = resultHash;
        job.state = State.Delivered;
        emit ResultSubmitted(jobId, resultHash);
    }

    /// @notice Requester approves the delivered result and releases payment.
    function release(bytes32 jobId) external {
        Job storage job = jobs[jobId];
        if (job.state == State.None) revert JobNotFound();
        if (msg.sender != job.requester) revert NotRequester();
        if (job.state != State.Delivered) revert WrongState();

        job.state = State.Released;
        usdc.safeTransfer(job.executor, job.amount);
        emit JobReleased(jobId, job.executor, job.amount);
    }

    /// @notice Refund path: requester can always cancel while still `Funded`
    ///         (before delivery); anyone can trigger a refund once the
    ///         deadline has passed and the job was never released.
    function refund(bytes32 jobId) external {
        Job storage job = jobs[jobId];
        if (job.state == State.None) revert JobNotFound();

        bool requesterCancelBeforeDelivery = msg.sender == job.requester && job.state == State.Funded;
        bool anyoneAfterDeadline = block.timestamp >= job.deadline && (job.state == State.Funded || job.state == State.Delivered);

        if (!requesterCancelBeforeDelivery && !anyoneAfterDeadline) {
            revert DeadlineNotReached();
        }

        job.state = State.Refunded;
        usdc.safeTransfer(job.requester, job.amount);
        emit JobRefunded(jobId, job.requester, job.amount);
    }

    function getJob(bytes32 jobId) external view returns (Job memory) {
        return jobs[jobId];
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {JobEscrow} from "../JobEscrow.sol";

interface IIdentityRegistryAgentId {
    function agentIdOf(address wallet) external view returns (uint256);
}

/// @title JobReputationRegistry
/// @notice PactAI's reputation signal -- deliberately different from DAO-WARDEN's
///         ValidationRegistry. There, an independent validator wallet scores the agent's
///         decision after the fact. Here, there is no validator: the signal comes straight
///         from JobEscrow's own terminal state. A job that reaches `Released` counts as a
///         success for the executor's agent; one that reaches `Refunded` counts as a miss.
///         `recordOutcome` is permissionless -- anyone can call it once JobEscrow has
///         already settled the job -- because the outcome being recorded is just JobEscrow's
///         own final, on-chain state. There's nothing to game.
/// @dev    The executor must already be registered in IdentityRegistry (`agentIdOf(executor)
///         != 0`) before its jobs can be recorded; `recordOutcome` reverts rather than
///         silently skipping, so it's obvious registration is the missing step.
contract JobReputationRegistry {
    enum Outcome {
        None,
        Released,
        Refunded
    }

    struct Record {
        uint256 agentId;
        Outcome outcome;
        uint256 recordedAt;
    }

    JobEscrow public immutable jobEscrow;
    IIdentityRegistryAgentId public immutable identityRegistry;

    mapping(bytes32 => Record) private _records;
    mapping(uint256 => bytes32[]) private _agentJobs;

    event OutcomeRecorded(bytes32 indexed jobId, uint256 indexed agentId, Outcome outcome);

    error JobNotTerminal();
    error AlreadyRecorded();
    error ExecutorNotRegistered();

    constructor(address jobEscrowAddress, address identityRegistryAddress) {
        jobEscrow = JobEscrow(jobEscrowAddress);
        identityRegistry = IIdentityRegistryAgentId(identityRegistryAddress);
    }

    /// @notice Records a terminal job's outcome against its executor's agent reputation.
    function recordOutcome(bytes32 jobId) external returns (uint256 agentId, Outcome outcome) {
        if (_records[jobId].outcome != Outcome.None) revert AlreadyRecorded();

        JobEscrow.Job memory job = jobEscrow.getJob(jobId);
        if (job.state == JobEscrow.State.Released) {
            outcome = Outcome.Released;
        } else if (job.state == JobEscrow.State.Refunded) {
            outcome = Outcome.Refunded;
        } else {
            revert JobNotTerminal();
        }

        agentId = identityRegistry.agentIdOf(job.executor);
        if (agentId == 0) revert ExecutorNotRegistered();

        _records[jobId] = Record({agentId: agentId, outcome: outcome, recordedAt: block.timestamp});
        _agentJobs[agentId].push(jobId);

        emit OutcomeRecorded(jobId, agentId, outcome);
    }

    function getRecord(bytes32 jobId) external view returns (Record memory) {
        return _records[jobId];
    }

    function getAgentJobs(uint256 agentId) external view returns (bytes32[] memory) {
        return _agentJobs[agentId];
    }

    /// @notice Reputation summary: total recorded jobs, how many released, and the release
    ///         rate out of 100 -- the executor's completion rate as a percentage.
    function getSummary(uint256 agentId) external view returns (uint64 totalJobs, uint64 released, uint8 releaseRate) {
        bytes32[] storage jobIds = _agentJobs[agentId];
        totalJobs = uint64(jobIds.length);
        for (uint256 i = 0; i < jobIds.length; i++) {
            if (_records[jobIds[i]].outcome == Outcome.Released) released++;
        }
        // casting to 'uint8' is safe because released <= totalJobs, so the ratio is always 0-100
        // forge-lint: disable-next-line(unsafe-typecast)
        releaseRate = totalJobs == 0 ? 0 : uint8((uint256(released) * 100) / totalJobs);
    }
}

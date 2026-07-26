// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

/// @title IdentityRegistry — an agent identity registry per ERC-8004 (Trustless Agents)
/// @notice PactAI's own registry: requester and executor agents each register once as an
///         ERC-721 token (`agentId` == `tokenId`, `tokenURI` == their AgentCard). Deployed
///         fresh for PactAI — deliberately not sharing DAO-WARDEN's registry, even though
///         both live in the same wallet cluster.
/// @dev    Same subset of the spec as DAO-WARDEN's reference implementation (register,
///         setAgentURI, getMetadata/setMetadata, getAgentWallet). Adds one thing DAO-WARDEN
///         didn't need: `agentIdOf(wallet)`, a reverse lookup from operating wallet to
///         agentId, so JobReputationRegistry can resolve "whose reputation is this job's
///         executor" permissionlessly from JobEscrow's own state, without the executor
///         having to self-report its agentId anywhere.
contract IdentityRegistry is ERC721URIStorage {
    struct MetadataEntry {
        string metadataKey;
        bytes metadataValue;
    }

    /// @dev agentIds are assigned incrementally from 1 (0 is reserved as "none").
    uint256 private _nextId = 1;

    mapping(uint256 => mapping(string => bytes)) private _metadata;
    mapping(uint256 => address) private _agentWallet;

    /// @dev wallet => agentId. Set once, at registration, to the registering wallet.
    ///      Only ever cleared/reset if that same agentId's wallet override changes it away
    ///      (see setAgentWallet) -- the old operating wallet no longer resolves to this agent.
    mapping(address => uint256) private _agentIdOf;

    event Registered(uint256 indexed agentId, string agentURI, address indexed owner);
    event MetadataSet(
        uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue
    );
    event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy);

    constructor() ERC721("ERC-8004 Trustless Agent (PactAI)", "PACTAGENT") {}

    modifier onlyAgentOwner(uint256 agentId) {
        require(_isAuthorized(_ownerOf(agentId), msg.sender, agentId), "IdentityRegistry: not agent owner");
        _;
    }

    // --- Registration --------------------------------------------------------

    function register(string calldata agentURI, MetadataEntry[] calldata metadata) external returns (uint256 agentId) {
        agentId = _register(agentURI);
        for (uint256 i = 0; i < metadata.length; i++) {
            _setMetadata(agentId, metadata[i].metadataKey, metadata[i].metadataValue);
        }
    }

    function register(string calldata agentURI) external returns (uint256 agentId) {
        return _register(agentURI);
    }

    function _register(string calldata agentURI) private returns (uint256 agentId) {
        agentId = _nextId++;
        _safeMint(msg.sender, agentId);
        _setTokenURI(agentId, agentURI);
        _agentIdOf[msg.sender] = agentId;
        emit Registered(agentId, agentURI, msg.sender);
    }

    // --- URI and metadata ----------------------------------------------------

    function setAgentURI(uint256 agentId, string calldata newURI) external onlyAgentOwner(agentId) {
        _setTokenURI(agentId, newURI);
        emit URIUpdated(agentId, newURI, msg.sender);
    }

    function setMetadata(uint256 agentId, string calldata metadataKey, bytes calldata metadataValue)
        external
        onlyAgentOwner(agentId)
    {
        _setMetadata(agentId, metadataKey, metadataValue);
    }

    function _setMetadata(uint256 agentId, string memory metadataKey, bytes memory metadataValue) private {
        _metadata[agentId][metadataKey] = metadataValue;
        emit MetadataSet(agentId, metadataKey, metadataKey, metadataValue);
    }

    function getMetadata(uint256 agentId, string calldata metadataKey) external view returns (bytes memory) {
        return _metadata[agentId][metadataKey];
    }

    // --- Agent wallet --------------------------------------------------------

    function getAgentWallet(uint256 agentId) external view returns (address) {
        address override_ = _agentWallet[agentId];
        return override_ == address(0) ? ownerOf(agentId) : override_;
    }

    /// @notice Points the agent's operating wallet elsewhere. Updates the reverse lookup:
    ///         the new wallet resolves to this agentId; the old one stops resolving to it
    ///         (unless it's still the token owner, in which case ownership still means
    ///         something -- but agentIdOf is about the *operating* wallet, so it moves).
    function setAgentWallet(uint256 agentId, address newWallet) external onlyAgentOwner(agentId) {
        _agentWallet[agentId] = newWallet;
        if (newWallet != address(0)) {
            _agentIdOf[newWallet] = agentId;
        }
    }

    /// @notice Reverse lookup: which agentId (if any) operates from this wallet. 0 = none.
    function agentIdOf(address wallet) external view returns (uint256) {
        return _agentIdOf[wallet];
    }

    // --- Helpers -------------------------------------------------------------

    function totalRegistered() external view returns (uint256) {
        return _nextId - 1;
    }
}

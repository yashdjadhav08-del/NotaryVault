// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title NotaryVaultRegistry
 * @notice Immutable blockchain document registry for NotaryVault on MST Chain.
 * @dev Stores SHA-256 cryptographic fingerprints, unique Document IDs, and timestamps.
 * 
 * IMPORTANT DISCLAIMER:
 * Registration records the cryptographic integrity fingerprint (SHA-256) of a document
 * at a specific block timestamp and associates it with the registrant's wallet address.
 * An on-chain record does NOT prove legal validity, official statutory notary authorization,
 * or government title ownership.
 */
contract NotaryVaultRegistry {

    /// @notice Document classification categories matching NotaryVault standards.
    enum DocumentType {
        PropertyDeed,        // 0
        SaleAgreement,       // 1
        RentalAgreement,     // 2
        Affidavit,           // 3
        PowerOfAttorney      // 4
    }

    /// @notice Core document record stored on-chain.
    struct DocumentEntry {
        bytes32 documentHash;     // 32-byte SHA-256 cryptographic digest
        address registrant;       // Wallet address that registered the document
        uint64 registeredAt;      // Block timestamp of registration
        DocumentType docType;     // Document classification enum
        bool isRevoked;           // Revocation status flag
        string docId;             // Canonical Document ID (e.g., "NV-2026-000101")
    }

    // --- State Variables ---

    /// @notice Contract administrator address (deployer).
    address public immutable admin;

    /// @notice Mapping from keccak256(docId) to DocumentEntry.
    mapping(bytes32 => DocumentEntry) private _documents;

    /// @notice Mapping from SHA-256 documentHash to Document ID string (unique hash policy).
    mapping(bytes32 => string) private _hashToDocId;

    /// @notice Total count of documents registered on-chain.
    uint256 public totalDocumentsRegistered;

    // --- Custom Errors ---

    error EmptyDocumentId();
    error ZeroDocumentHash();
    error DocumentAlreadyExists(string docId);
    error HashAlreadyRegistered(bytes32 documentHash, string existingDocId);
    error DocumentNotFound(string docId);
    error DocumentAlreadyRevoked(string docId);
    error UnauthorizedCaller(address caller);
    error InvalidDocumentType();

    // --- Events ---

    /**
     * @notice Emitted when a document is registered on-chain.
     */
    event DocumentRegistered(
        bytes32 indexed docIdKey,
        string docId,
        bytes32 indexed documentHash,
        address indexed registrant,
        uint8 docType,
        uint64 timestamp
    );

    /**
     * @notice Emitted when a document is revoked by the registrant or admin.
     */
    event DocumentRevoked(
        bytes32 indexed docIdKey,
        string docId,
        address indexed revokedBy,
        string reason,
        uint64 timestamp
    );

    /**
     * @notice Emitted when a document lifecycle audit event occurs (e.g. sharing or re-audit).
     * @dev Remarks are public on the blockchain; confidential data must never be passed.
     */
    event AuditEventRecorded(
        bytes32 indexed docIdKey,
        string docId,
        bytes32 indexed eventType,
        address indexed actor,
        string remarks,
        uint64 timestamp
    );

    // --- Constructor ---

    constructor() {
        admin = msg.sender;
    }

    // --- Modifiers ---

    modifier onlyAdmin() {
        if (msg.sender != admin) revert UnauthorizedCaller(msg.sender);
        _;
    }

    // --- Public Functions ---

    /**
     * @notice Registers a new document record with its SHA-256 integrity hash.
     * @dev Permissionless for the MVP. msg.sender is recorded as the registrant.
     * Enforces unique Document ID and unique SHA-256 file hash to prevent duplication.
     * @param docId The canonical human-readable identifier (e.g., "NV-2026-000101").
     * @param documentHash The 32-byte SHA-256 hash digest of the original document.
     * @param docType The document classification enum index (0-4).
     */
    function registerDocument(
        string calldata docId,
        bytes32 documentHash,
        uint8 docType
    ) external returns (bool) {
        if (bytes(docId).length == 0) revert EmptyDocumentId();
        if (documentHash == bytes32(0)) revert ZeroDocumentHash();
        if (docType > uint8(DocumentType.PowerOfAttorney)) revert InvalidDocumentType();

        bytes32 docKey = keccak256(bytes(docId));
        if (_documents[docKey].registeredAt != 0) {
            revert DocumentAlreadyExists(docId);
        }

        // Enforce duplicate hash policy for MVP
        string memory existingId = _hashToDocId[documentHash];
        if (bytes(existingId).length != 0) {
            revert HashAlreadyRegistered(documentHash, existingId);
        }

        uint64 nowTs = uint64(block.timestamp);

        _documents[docKey] = DocumentEntry({
            documentHash: documentHash,
            registrant: msg.sender,
            registeredAt: nowTs,
            docType: DocumentType(docType),
            isRevoked: false,
            docId: docId
        });

        _hashToDocId[documentHash] = docId;
        totalDocumentsRegistered += 1;

        emit DocumentRegistered(
            docKey,
            docId,
            documentHash,
            msg.sender,
            docType,
            nowTs
        );

        return true;
    }

    /**
     * @notice Revokes a previously registered document record.
     * @dev Permitted only for the original registrant or contract admin.
     * @param docId The Document ID to revoke.
     * @param reason Brief justification for revocation.
     */
    function revokeDocument(
        string calldata docId,
        string calldata reason
    ) external returns (bool) {
        bytes32 docKey = keccak256(bytes(docId));
        DocumentEntry storage entry = _documents[docKey];

        if (entry.registeredAt == 0) revert DocumentNotFound(docId);
        if (entry.isRevoked) revert DocumentAlreadyRevoked(docId);
        if (msg.sender != entry.registrant && msg.sender != admin) {
            revert UnauthorizedCaller(msg.sender);
        }

        entry.isRevoked = true;
        uint64 nowTs = uint64(block.timestamp);

        emit DocumentRevoked(
            docKey,
            docId,
            msg.sender,
            reason,
            nowTs
        );

        return true;
    }

    /**
     * @notice Records an on-chain audit event against a document ID.
     * @dev Restricted to the registrant or contract admin. Remarks are public on-chain.
     * @param docId The target Document ID.
     * @param eventType A 32-byte identifier for the event (e.g. keccak256("SHARED")).
     * @param remarks Public audit note. Do not include confidential personal information.
     */
    function recordAuditEvent(
        string calldata docId,
        bytes32 eventType,
        string calldata remarks
    ) external returns (bool) {
        bytes32 docKey = keccak256(bytes(docId));
        DocumentEntry storage entry = _documents[docKey];

        if (entry.registeredAt == 0) revert DocumentNotFound(docId);
        if (msg.sender != entry.registrant && msg.sender != admin) {
            revert UnauthorizedCaller(msg.sender);
        }

        uint64 nowTs = uint64(block.timestamp);

        emit AuditEventRecorded(
            docKey,
            docId,
            eventType,
            msg.sender,
            remarks,
            nowTs
        );

        return true;
    }

    // --- Read-Only Verification Functions ---

    /**
     * @notice Verifies a submitted SHA-256 hash against the on-chain recorded baseline.
     * @dev Zero-gas read-only call (eth_call).
     * @param docId The Document ID to verify.
     * @param submittedHash The SHA-256 hash computed from the document file under test.
     * @return isValid True if document exists, is not revoked, and hashes match exactly.
     * @return exists True if the Document ID is registered on-chain.
     * @return registrant The wallet address that registered the document.
     * @return registeredAt The block timestamp of registration.
     * @return isRevoked True if the document has been flagged as revoked.
     */
    function verifyDocument(
        string calldata docId,
        bytes32 submittedHash
    ) external view returns (
        bool isValid,
        bool exists,
        address registrant,
        uint64 registeredAt,
        bool isRevoked
    ) {
        bytes32 docKey = keccak256(bytes(docId));
        DocumentEntry storage entry = _documents[docKey];

        if (entry.registeredAt == 0) {
            return (false, false, address(0), 0, false);
        }

        bool matchHash = (entry.documentHash == submittedHash);
        bool valid = matchHash && (!entry.isRevoked);

        return (
            valid,
            true,
            entry.registrant,
            entry.registeredAt,
            entry.isRevoked
        );
    }

    /**
     * @notice Retrieves full document entry details by Document ID.
     * @param docId The Document ID string.
     */
    function getDocument(string calldata docId)
        external
        view
        returns (
            bytes32 documentHash,
            address registrant,
            uint64 registeredAt,
            uint8 docType,
            bool isRevoked,
            string memory id
        )
    {
        bytes32 docKey = keccak256(bytes(docId));
        DocumentEntry storage entry = _documents[docKey];

        if (entry.registeredAt == 0) revert DocumentNotFound(docId);

        return (
            entry.documentHash,
            entry.registrant,
            entry.registeredAt,
            uint8(entry.docType),
            entry.isRevoked,
            entry.docId
        );
    }

    /**
     * @notice Looks up a Document ID by its SHA-256 hash digest.
     * @param documentHash The 32-byte SHA-256 digest to query.
     * @return docId The associated Document ID (or empty string if not found).
     */
    function getDocumentIdByHash(bytes32 documentHash)
        external
        view
        returns (string memory docId)
    {
        return _hashToDocId[documentHash];
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title NotaryVaultRegistry
 * @notice Immutable blockchain document registry and hierarchical author authorization system for NotaryVault on MST Chain.
 * @dev Stores SHA-256 cryptographic fingerprints, unique Document IDs, timestamps, and on-chain author role access controls.
 * 
 * ROLE ARCHITECTURE:
 * 1. Super Author (Admin):
 *    - Initialized securely during contract deployment.
 *    - Full document registration, lifecycle, and management permissions.
 *    - Reviews, approves, or rejects Secondary Author applications on-chain.
 *    - Authorizes and deauthorizes Secondary Authors on-chain.
 *    - Can transfer Super Author role to a validated non-zero address.
 *    - Cannot renounce or leave the contract without an active Super Author.
 *
 * 2. Secondary Author:
 *    - Authorized only after approval by the Super Author.
 *    - Standard document operations: register documents, verify hashes, associate property IDs, generate QR codes.
 *    - Cannot authorize or deauthorize other authors, change Super Author, or grant themselves privileges.
 *    - Immediately loses protected privileges when deauthorized.
 *
 * 3. Public User:
 *    - Can verify publicly available document records (read-only zero-gas queries).
 *    - Can submit on-chain applications to become a Secondary Author.
 *    - Cannot register documents or perform author operations. Direct contract registration attempts revert.
 *
 * IMPORTANT DISCLAIMER:
 * Registration records the cryptographic integrity fingerprint (SHA-256) of a document
 * at a specific block timestamp and associates it with the registrant's wallet address.
 * An on-chain record does NOT prove statutory legal validity, official statutory notary authorization,
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

    /// @notice On-chain status of an author application.
    enum ApplicationStatus {
        None,       // 0 - Not submitted
        Pending,    // 1 - Awaiting Super Author review
        Approved,   // 2 - Approved and author privileges granted
        Rejected    // 3 - Application rejected
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

    /// @notice On-chain author application record.
    struct AuthorApplication {
        string appId;             // Unique application ID (e.g. "APP-2026-102901")
        address applicant;       // Applicant wallet address
        uint64 appliedAt;         // Submission timestamp
        uint64 reviewedAt;        // Super Author review timestamp
        ApplicationStatus status; // Current status (Pending, Approved, Rejected)
        string applicantName;     // Legal name or notary applicant title
        string organization;      // Notary office, firm, or registry organization
        string contactEmail;      // Secure contact email
        string justification;     // Professional credentials & jurisdiction summary
        string reviewNotes;       // Super Author decision remarks
    }

    // --- State Variables ---

    /// @notice Super Author address (contract administrator).
    address public admin;

    /// @notice Mapping of authorized Secondary Authors granted authoring privileges by Super Author.
    mapping(address => bool) public authorizedAuthors;

    /// @notice Total count of active authorized Secondary Authors.
    uint256 public totalAuthorsCount;

    /// @notice Mapping from applicant address to their AuthorApplication record.
    mapping(address => AuthorApplication) private _applications;

    /// @notice Total count of author applications submitted on-chain.
    uint256 public totalApplicationsCount;

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
    error UnauthorizedAuthor(address caller);
    error CannotAuthorizeZeroAddress();
    error CannotAuthorizeAdmin();
    error AuthorAlreadyAuthorized(address author);
    error AuthorNotAuthorized(address author);
    error InvalidDocumentType();
    error EmptyApplicationId();
    error ApplicantAlreadyAuthor(address applicant);
    error ApplicationAlreadyPending(address applicant, string existingAppId);
    error ApplicationNotFound(address applicant);
    error ApplicationNotPending(address applicant);
    error InvalidNewAdmin();

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

    /**
     * @notice Emitted when a Secondary Author is authorized by the Super Author.
     */
    event AuthorAuthorized(
        address indexed author,
        address indexed authorizedBy,
        uint64 timestamp
    );

    /**
     * @notice Emitted when a Secondary Author is deauthorized by the Super Author.
     */
    event AuthorDeauthorized(
        address indexed author,
        address indexed deauthorizedBy,
        uint64 timestamp
    );

    /**
     * @notice Emitted when Super Author administrative authority is transferred.
     */
    event SuperAuthorTransferred(
        address indexed previousSuperAuthor,
        address indexed newSuperAuthor,
        uint64 timestamp
    );

    /**
     * @notice Emitted when an author application is submitted on-chain.
     */
    event ApplicationSubmitted(
        string indexed appId,
        address indexed applicant,
        string applicantName,
        string organization,
        uint64 timestamp
    );

    /**
     * @notice Emitted when an author application is reviewed on-chain.
     */
    event ApplicationReviewed(
        string indexed appId,
        address indexed applicant,
        ApplicationStatus status,
        string reviewNotes,
        address indexed reviewedBy,
        uint64 timestamp
    );

    // --- Constructor ---

    /**
     * @notice Initializes the NotaryVaultRegistry contract with an explicit Super Author.
     * @param initialSuperAuthor The initial Super Author address (or address(0) to use msg.sender).
     */
    constructor(address initialSuperAuthor) {
        if (initialSuperAuthor != address(0)) {
            admin = initialSuperAuthor;
        } else {
            admin = msg.sender;
        }
        emit SuperAuthorTransferred(address(0), admin, uint64(block.timestamp));
    }

    // --- Modifiers ---

    /// @notice Restricts execution strictly to the Super Author (admin).
    modifier onlySuperAuthor() {
        if (msg.sender != admin) revert UnauthorizedCaller(msg.sender);
        _;
    }

    /// @notice Backward-compatible alias for Super Author.
    modifier onlyAdmin() {
        if (msg.sender != admin) revert UnauthorizedCaller(msg.sender);
        _;
    }

    /// @notice Restricts execution to authorized authors (Super Author or approved Secondary Author).
    modifier onlyAuthor() {
        if (msg.sender != admin && !authorizedAuthors[msg.sender]) {
            revert UnauthorizedAuthor(msg.sender);
        }
        _;
    }

    // --- Super Author Management Functions ---

    /**
     * @notice Transfers Super Author authority to a new validated address.
     * @dev Restricted strictly to the current Super Author. Cannot set to address(0).
     * @param newSuperAuthor The wallet address of the new Super Author.
     */
    function transferSuperAuthor(address newSuperAuthor) external onlySuperAuthor returns (bool) {
        if (newSuperAuthor == address(0)) revert CannotAuthorizeZeroAddress();
        if (newSuperAuthor == admin) revert InvalidNewAdmin();

        address oldAdmin = admin;
        admin = newSuperAuthor;

        // If the new Super Author was previously recorded as a Secondary Author, remove the redundant flag
        if (authorizedAuthors[newSuperAuthor]) {
            authorizedAuthors[newSuperAuthor] = false;
            totalAuthorsCount -= 1;
        }

        emit SuperAuthorTransferred(oldAdmin, newSuperAuthor, uint64(block.timestamp));
        return true;
    }

    // --- Author Management Functions ---

    /**
     * @notice Authorizes a new Secondary Author wallet address.
     * @dev Restricted strictly to Super Author (admin). Secondary Authors cannot authorize others.
     * @param author The wallet address to authorize as a Secondary Author.
     */
    function authorizeAuthor(address author) external onlySuperAuthor returns (bool) {
        if (author == address(0)) revert CannotAuthorizeZeroAddress();
        if (author == admin) revert CannotAuthorizeAdmin();
        if (authorizedAuthors[author]) revert AuthorAlreadyAuthorized(author);

        authorizedAuthors[author] = true;
        totalAuthorsCount += 1;

        // If author had a pending application, update status to Approved
        if (_applications[author].status == ApplicationStatus.Pending) {
            _applications[author].status = ApplicationStatus.Approved;
            _applications[author].reviewedAt = uint64(block.timestamp);
            _applications[author].reviewNotes = "Authorized directly by Super Author";
            emit ApplicationReviewed(
                _applications[author].appId,
                author,
                ApplicationStatus.Approved,
                "Authorized directly by Super Author",
                msg.sender,
                uint64(block.timestamp)
            );
        }

        emit AuthorAuthorized(author, msg.sender, uint64(block.timestamp));
        return true;
    }

    /**
     * @notice Deauthorizes an existing Secondary Author, revoking document authoring privileges immediately.
     * @dev Restricted strictly to Super Author (admin).
     * @param author The wallet address to deauthorize.
     */
    function deauthorizeAuthor(address author) external onlySuperAuthor returns (bool) {
        if (!authorizedAuthors[author]) revert AuthorNotAuthorized(author);

        authorizedAuthors[author] = false;
        totalAuthorsCount -= 1;

        emit AuthorDeauthorized(author, msg.sender, uint64(block.timestamp));
        return true;
    }

    /**
     * @notice Checks if an address is an authorized author (Super Author or active Secondary Author).
     * @param account The address to check.
     */
    function isAuthor(address account) external view returns (bool) {
        return account == admin || authorizedAuthors[account];
    }

    /**
     * @notice Checks if an address is the Super Author (admin).
     * @param account The address to check.
     */
    function isSuperAuthor(address account) external view returns (bool) {
        return account == admin;
    }

    // --- On-Chain Author Application Workflow ---

    /**
     * @notice Submits an on-chain application to become an authorized Secondary Author.
     * @dev Open to public users. Prevents duplicate pending applications for the same wallet.
     * @param appId Unique application identifier (e.g., "APP-2026-102901").
     * @param applicantName Legal name or notary applicant title.
     * @param organization Official notary office, firm, or agency.
     * @param contactEmail Official contact email for administrative communication.
     * @param justification Professional credentials, commission number, and jurisdiction summary.
     */
    function submitAuthorApplication(
        string calldata appId,
        string calldata applicantName,
        string calldata organization,
        string calldata contactEmail,
        string calldata justification
    ) external returns (bool) {
        if (bytes(appId).length == 0) revert EmptyApplicationId();
        if (msg.sender == admin || authorizedAuthors[msg.sender]) {
            revert ApplicantAlreadyAuthor(msg.sender);
        }
        if (_applications[msg.sender].status == ApplicationStatus.Pending) {
            revert ApplicationAlreadyPending(msg.sender, _applications[msg.sender].appId);
        }

        uint64 nowTs = uint64(block.timestamp);
        _applications[msg.sender] = AuthorApplication({
            appId: appId,
            applicant: msg.sender,
            appliedAt: nowTs,
            reviewedAt: 0,
            status: ApplicationStatus.Pending,
            applicantName: applicantName,
            organization: organization,
            contactEmail: contactEmail,
            justification: justification,
            reviewNotes: ""
        });

        totalApplicationsCount += 1;

        emit ApplicationSubmitted(
            appId,
            msg.sender,
            applicantName,
            organization,
            nowTs
        );

        return true;
    }

    /**
     * @notice Reviews a pending author application (Approve or Reject).
     * @dev Restricted strictly to Super Author. Approval grants Secondary Author privileges on-chain.
     * @param applicant The wallet address of the applicant to review.
     * @param approve True to approve and authorize author; false to reject.
     * @param reviewNotes Administrative justification or rejection explanation.
     */
    function reviewAuthorApplication(
        address applicant,
        bool approve,
        string calldata reviewNotes
    ) external onlySuperAuthor returns (bool) {
        if (applicant == address(0)) revert CannotAuthorizeZeroAddress();
        AuthorApplication storage app = _applications[applicant];
        if (app.status != ApplicationStatus.Pending) {
            revert ApplicationNotPending(applicant);
        }

        uint64 nowTs = uint64(block.timestamp);
        app.reviewedAt = nowTs;
        app.reviewNotes = reviewNotes;

        if (approve) {
            app.status = ApplicationStatus.Approved;
            if (!authorizedAuthors[applicant]) {
                authorizedAuthors[applicant] = true;
                totalAuthorsCount += 1;
                emit AuthorAuthorized(applicant, msg.sender, nowTs);
            }
        } else {
            app.status = ApplicationStatus.Rejected;
        }

        emit ApplicationReviewed(
            app.appId,
            applicant,
            app.status,
            reviewNotes,
            msg.sender,
            nowTs
        );

        return true;
    }

    /**
     * @notice Retrieves full on-chain author application details for an applicant.
     * @param applicant The wallet address of the applicant.
     */
    function getApplication(address applicant)
        external
        view
        returns (
            string memory appId,
            address applicantAddr,
            uint64 appliedAt,
            uint64 reviewedAt,
            uint8 status,
            string memory applicantName,
            string memory organization,
            string memory contactEmail,
            string memory justification,
            string memory reviewNotes
        )
    {
        AuthorApplication storage app = _applications[applicant];
        if (app.appliedAt == 0) revert ApplicationNotFound(applicant);

        return (
            app.appId,
            app.applicant,
            app.appliedAt,
            app.reviewedAt,
            uint8(app.status),
            app.applicantName,
            app.organization,
            app.contactEmail,
            app.justification,
            app.reviewNotes
        );
    }

    /**
     * @notice Returns the application status code for an applicant without reverting.
     * @param applicant The wallet address of the applicant.
     * @return status 0 = None, 1 = Pending, 2 = Approved, 3 = Rejected.
     */
    function getApplicationStatus(address applicant) external view returns (uint8) {
        return uint8(_applications[applicant].status);
    }

    // --- Public Functions ---

    /**
     * @notice Registers a new document record with its SHA-256 integrity hash.
     * @dev Restricted strictly to authorized authors (Super Author or approved Secondary Author) via onlyAuthor.
     * Enforces unique Document ID and unique SHA-256 file hash to prevent duplication.
     *
     * @param docId The canonical human-readable identifier (e.g., "NV-2026-000101").
     * @param documentHash The 32-byte SHA-256 hash digest of the original document.
     * @param docType The document classification enum index (0-4).
     */
    function registerDocument(
        string calldata docId,
        bytes32 documentHash,
        uint8 docType
    ) external onlyAuthor returns (bool) {
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
     * @dev Permitted only for the original registrant or Super Author (admin).
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
     * @dev Restricted to the registrant or Super Author (admin). Remarks are public on-chain.
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

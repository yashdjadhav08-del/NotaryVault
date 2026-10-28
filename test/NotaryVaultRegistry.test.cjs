const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NotaryVaultRegistry Unit & Integration Tests", function () {
  let registry;
  let admin, alice, bob, charlie;

  // Sample genuine 32-byte hashes
  const HASH_DEED = "0x8fa14cb7913cf6cdab67448d3db07f0f6244dfaa9960ff2862d887a07c3c52a1";
  const HASH_LEASE = "0x2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae";
  const HASH_MISMATCH = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
  const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";

  beforeEach(async function () {
    [admin, alice, bob, charlie] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("NotaryVaultRegistry");
    registry = await Factory.deploy();
    await registry.waitForDeployment();
  });

  describe("1. Deployment & Initial State", function () {
    it("should set deployer as admin", async function () {
      expect(await registry.admin()).to.equal(admin.address);
    });

    it("should start with 0 registered documents", async function () {
      expect(await registry.totalDocumentsRegistered()).to.equal(0);
    });
  });

  describe("2. Document Registration", function () {
    it("should register a document successfully and emit DocumentRegistered event", async function () {
      const tx = await registry.connect(alice).registerDocument("NV-2026-000101", HASH_DEED, 0);
      const receipt = await tx.wait();

      expect(await registry.totalDocumentsRegistered()).to.equal(1);

      // Verify event emission
      await expect(tx)
        .to.emit(registry, "DocumentRegistered")
        .withArgs(
          ethers.keccak256(ethers.toUtf8Bytes("NV-2026-000101")),
          "NV-2026-000101",
          HASH_DEED,
          alice.address,
          0,
          await getBlockTimestamp(receipt.blockNumber)
        );
    });

    it("should record the caller as registrant, not legal owner", async function () {
      await registry.connect(bob).registerDocument("NV-2026-000102", HASH_LEASE, 1);
      const doc = await registry.getDocument("NV-2026-000102");
      expect(doc.registrant).to.equal(bob.address);
      expect(doc.isRevoked).to.equal(false);
      expect(doc.documentHash).to.equal(HASH_LEASE);
      expect(doc.docType).to.equal(1);
    });

    it("should reject empty document ID", async function () {
      await expect(
        registry.connect(alice).registerDocument("", HASH_DEED, 0)
      ).to.be.revertedWithCustomError(registry, "EmptyDocumentId");
    });

    it("should reject zero document hash", async function () {
      await expect(
        registry.connect(alice).registerDocument("NV-2026-000103", ZERO_HASH, 0)
      ).to.be.revertedWithCustomError(registry, "ZeroDocumentHash");
    });

    it("should reject duplicate document ID", async function () {
      await registry.connect(alice).registerDocument("NV-2026-000101", HASH_DEED, 0);

      // Attempt second registration with same docId but different hash
      await expect(
        registry.connect(bob).registerDocument("NV-2026-000101", HASH_LEASE, 1)
      ).to.be.revertedWithCustomError(registry, "DocumentAlreadyExists")
        .withArgs("NV-2026-000101");
    });

    it("should reject duplicate hash registration under a different document ID", async function () {
      await registry.connect(alice).registerDocument("NV-2026-000101", HASH_DEED, 0);

      // Attempt second registration with same hash under new docId
      await expect(
        registry.connect(bob).registerDocument("NV-2026-000199", HASH_DEED, 2)
      ).to.be.revertedWithCustomError(registry, "HashAlreadyRegistered")
        .withArgs(HASH_DEED, "NV-2026-000101");
    });

    it("should reject invalid document type enum index", async function () {
      await expect(
        registry.connect(alice).registerDocument("NV-2026-000105", HASH_DEED, 99)
      ).to.be.revertedWithCustomError(registry, "InvalidDocumentType");
    });
  });

  describe("3. Document Verification (Read-Only View)", function () {
    beforeEach(async function () {
      await registry.connect(alice).registerDocument("NV-2026-000101", HASH_DEED, 0);
    });

    it("should verify matching document hash successfully", async function () {
      const res = await registry.verifyDocument("NV-2026-000101", HASH_DEED);
      expect(res.isValid).to.equal(true);
      expect(res.exists).to.equal(true);
      expect(res.registrant).to.equal(alice.address);
      expect(res.isRevoked).to.equal(false);
      expect(res.registeredAt).to.be.greaterThan(0);
    });

    it("should detect hash mismatch when submitted hash differs", async function () {
      const res = await registry.verifyDocument("NV-2026-000101", HASH_MISMATCH);
      expect(res.isValid).to.equal(false);
      expect(res.exists).to.equal(true);
      expect(res.registrant).to.equal(alice.address);
    });

    it("should return not found for unregistered document ID", async function () {
      const res = await registry.verifyDocument("NV-2026-UNKNOWN", HASH_DEED);
      expect(res.isValid).to.equal(false);
      expect(res.exists).to.equal(false);
      expect(res.registrant).to.equal(ethers.ZeroAddress);
      expect(res.registeredAt).to.equal(0);
    });
  });

  describe("4. Document Lookup by ID and Hash", function () {
    beforeEach(async function () {
      await registry.connect(alice).registerDocument("NV-2026-000101", HASH_DEED, 0);
    });

    it("should lookup full document entry by ID", async function () {
      const doc = await registry.getDocument("NV-2026-000101");
      expect(doc.id).to.equal("NV-2026-000101");
      expect(doc.documentHash).to.equal(HASH_DEED);
      expect(doc.registrant).to.equal(alice.address);
      expect(doc.docType).to.equal(0);
      expect(doc.isRevoked).to.equal(false);
    });

    it("should revert getDocument for non-existent ID", async function () {
      await expect(
        registry.getDocument("NV-DOES-NOT-EXIST")
      ).to.be.revertedWithCustomError(registry, "DocumentNotFound")
        .withArgs("NV-DOES-NOT-EXIST");
    });

    it("should lookup document ID by hash", async function () {
      const docId = await registry.getDocumentIdByHash(HASH_DEED);
      expect(docId).to.equal("NV-2026-000101");
    });

    it("should return empty string for unindexed hash", async function () {
      const docId = await registry.getDocumentIdByHash(HASH_MISMATCH);
      expect(docId).to.equal("");
    });
  });

  describe("5. Document Revocation & Access Control", function () {
    beforeEach(async function () {
      await registry.connect(alice).registerDocument("NV-2026-000101", HASH_DEED, 0);
    });

    it("should allow original registrant to revoke", async function () {
      const tx = await registry.connect(alice).revokeDocument("NV-2026-000101", "Superseded by new deed");
      await expect(tx)
        .to.emit(registry, "DocumentRevoked")
        .withArgs(
          ethers.keccak256(ethers.toUtf8Bytes("NV-2026-000101")),
          "NV-2026-000101",
          alice.address,
          "Superseded by new deed",
          await getBlockTimestamp((await tx.wait()).blockNumber)
        );

      const doc = await registry.getDocument("NV-2026-000101");
      expect(doc.isRevoked).to.equal(true);
    });

    it("should allow admin to revoke an invalid record", async function () {
      await registry.connect(admin).revokeDocument("NV-2026-000101", "Administrative court injunction");
      const doc = await registry.getDocument("NV-2026-000101");
      expect(doc.isRevoked).to.equal(true);
    });

    it("should reject revocation attempt by unauthorized third party", async function () {
      await expect(
        registry.connect(charlie).revokeDocument("NV-2026-000101", "Malicious revocation attempt")
      ).to.be.revertedWithCustomError(registry, "UnauthorizedCaller")
        .withArgs(charlie.address);
    });

    it("should reject double revocation", async function () {
      await registry.connect(alice).revokeDocument("NV-2026-000101", "Reason 1");
      await expect(
        registry.connect(alice).revokeDocument("NV-2026-000101", "Reason 2")
      ).to.be.revertedWithCustomError(registry, "DocumentAlreadyRevoked")
        .withArgs("NV-2026-000101");
    });

    it("should fail verification for revoked documents even with matching hash", async function () {
      await registry.connect(alice).revokeDocument("NV-2026-000101", "Canceled contract");
      const res = await registry.verifyDocument("NV-2026-000101", HASH_DEED);
      expect(res.isValid).to.equal(false);
      expect(res.isRevoked).to.equal(true);
      expect(res.exists).to.equal(true);
    });
  });

  describe("6. On-Chain Audit Events", function () {
    beforeEach(async function () {
      await registry.connect(alice).registerDocument("NV-2026-000101", HASH_DEED, 0);
    });

    it("should record an audit event by registrant and emit AuditEventRecorded", async function () {
      const eventType = ethers.keccak256(ethers.toUtf8Bytes("EXTERNAL_AUDIT"));
      const tx = await registry.connect(alice).recordAuditEvent("NV-2026-000101", eventType, "Inspected by Bank Auditor");

      await expect(tx)
        .to.emit(registry, "AuditEventRecorded")
        .withArgs(
          ethers.keccak256(ethers.toUtf8Bytes("NV-2026-000101")),
          "NV-2026-000101",
          eventType,
          alice.address,
          "Inspected by Bank Auditor",
          await getBlockTimestamp((await tx.wait()).blockNumber)
        );
    });

    it("should reject audit event logging by unauthorized party", async function () {
      const eventType = ethers.keccak256(ethers.toUtf8Bytes("EXTERNAL_AUDIT"));
      await expect(
        registry.connect(bob).recordAuditEvent("NV-2026-000101", eventType, "Unauthorized note")
      ).to.be.revertedWithCustomError(registry, "UnauthorizedCaller")
        .withArgs(bob.address);
    });
  });

  async function getBlockTimestamp(blockNumber) {
    const block = await ethers.provider.getBlock(blockNumber);
    return block.timestamp;
  }
});

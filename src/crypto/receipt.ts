/**
 * Cryptographic Receipt Module
 *
 * This module handles the creation and verification of authorization receipts.
 * Receipts are the primitive that makes Dotto an authority layer, not just a governance tool.
 *
 * Design principles:
 * - Receipts are cryptographically verifiable (HMAC-SHA256 or AWS KMS ECDSA)
 * - Receipts are immutable records of authorization decisions
 * - No production change without a valid receipt
 */

import crypto from "node:crypto";
import { HederaNFTService, type NftProof } from "../engine/proof/HederaNFTService.js";
import { KMSSigner } from "./kms-signer.js";

export type { NftProof } from "../engine/proof/HederaNFTService.js";

export type ReceiptVersion = "1.0" | "1.1";

export type HederaProof = {
  backend: "hedera";
  topic_id: string;
  sequence_number: string;
  transaction_id: string;
  timestamp: string;
  hashscan_link: string;
  demo?: boolean;
};

export type ReceiptAlgorithm = "hmac-sha256" | "kms-ecdsa-sha256";

export type AuthorizationReceipt = {
  // Metadata
  version: ReceiptVersion;
  issuer: string;
  algorithm: ReceiptAlgorithm;
  issued_at: string;
  expires_at: string | null;

  // Authorization data
  change_id: string;
  ruling: "approve" | "block" | "escalate";
  risk_level: "low" | "medium" | "high";
  auto_authorized: boolean;

  // Precedent (if auto-authorized)
  precedent_match?: {
    change_id: string;
    timestamp: string;
    similarity: number;
  };

  // Integrity
  artifacts_hash: string;
  signature: string;

  // KMS provenance (optional - only if signed via AWS KMS)
  kms_key_id?: string;

  // Agent identity (optional - only if HCS-10 agent is registered)
  agent_identity?: {
    account_id: string;
    inbound_topic: string;
    outbound_topic: string;
    network: string;
    registry: "HOL";
    demo?: boolean;
  };

  // Hedera proof (optional - only if anchored)
  hedera_proof?: HederaProof;

  // NFT proof (optional - only if minted on HTS)
  nft_proof?: NftProof;
};

export type ReceiptPayload = Omit<AuthorizationReceipt, "signature">;

export type VerificationResult = {
  valid: boolean;
  reason:
    | "verified"
    | "no_receipt"
    | "malformed_receipt"
    | "invalid_signature"
    | "expired"
    | "not_approved";
  message: string;
  receipt?: AuthorizationReceipt;
};

const DEFAULT_ISSUER = "dotto-ai/governor";
const DEFAULT_EXPIRY_HOURS = 24;

// ─── KMS Singleton ──────────────────────────────────────────────────────────

let kmsSigner: KMSSigner | null = null;

/**
 * Initialize AWS KMS signing if credentials are configured.
 * Returns true if KMS is active.
 */
export async function initializeKMS(): Promise<boolean> {
  const keyId = process.env.AWS_KMS_KEY_ID;
  const region = process.env.AWS_REGION;

  if (!keyId || !region) return false;

  try {
    kmsSigner = new KMSSigner(keyId, region);
    await kmsSigner.initialize();
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : "unknown error";
    console.error(`[KMS] Initialization failed: ${msg}`);
    kmsSigner = null;
    return false;
  }
}

/**
 * Get the KMS signer instance (for API endpoints and Hedera tx signing).
 */
export function getKMSSigner(): KMSSigner | null {
  return kmsSigner?.isReady() ? kmsSigner : null;
}

// ─── HMAC Signing (sync) ────────────────────────────────────────────────────

/**
 * Get the signing key from environment.
 * In production, this must be a secure secret.
 */
function getSigningKey(): string {
  const key = process.env.DOTTO_SIGNING_KEY;

  if (!key) {
    // In production, require a proper signing key
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "CRITICAL: DOTTO_SIGNING_KEY must be set in production. " +
          "Generate with: openssl rand -base64 32"
      );
    }

    // Only allow demo key in development
    console.warn("[SECURITY WARNING] Using demo signing key. NOT FOR PRODUCTION.");
    return "dotto-demo-key";
  }

  // Validate key strength (at least 32 characters)
  if (key.length < 32) {
    throw new Error("DOTTO_SIGNING_KEY must be at least 32 characters");
  }

  return key;
}

/**
 * Sign a receipt payload using HMAC-SHA256 (sync).
 */
function hmacSign(payload: ReceiptPayload): string {
  const secret = getSigningKey();
  return crypto.createHmac("sha256", secret).update(JSON.stringify(payload)).digest("hex");
}

/**
 * Compute SHA-256 hash of artifacts for integrity verification.
 */
export function computeArtifactsHash(artifacts: unknown): string {
  const content = JSON.stringify(artifacts);
  return crypto.createHash("sha256").update(content).digest("hex");
}

// ─── Dual-Path Signing ──────────────────────────────────────────────────────

/**
 * Sign a receipt payload. Uses KMS ECDSA when available, HMAC-SHA256 otherwise.
 */
export async function signPayload(payload: ReceiptPayload): Promise<string> {
  if (kmsSigner?.isReady()) {
    return kmsSigner.sign(JSON.stringify(payload));
  }
  return hmacSign(payload);
}

/**
 * Verify a receipt signature. Detects algorithm and uses the correct path.
 */
export function verifySignature(receipt: AuthorizationReceipt): boolean {
  const { signature, ...payload } = receipt;

  if (receipt.algorithm === "kms-ecdsa-sha256") {
    const signer = getKMSSigner();
    if (!signer) {
      throw new Error("KMS not configured but receipt requires KMS verification");
    }
    return signer.verify(JSON.stringify(payload), signature);
  }

  // HMAC path (sync)
  const expectedSignature = hmacSign(payload as ReceiptPayload);
  return crypto.timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(expectedSignature, "hex")
  );
}

/**
 * Check if a receipt has expired.
 */
export function isExpired(receipt: AuthorizationReceipt): boolean {
  if (!receipt.expires_at) return false;
  return new Date(receipt.expires_at) < new Date();
}

export type CreateReceiptOptions = {
  change_id: string;
  ruling: "approve" | "block" | "escalate";
  risk_level: "low" | "medium" | "high";
  auto_authorized?: boolean;
  artifacts: unknown;
  precedent_match?: {
    change_id: string;
    timestamp: string;
    similarity: number;
  };
  issuer?: string;
  expiry_hours?: number | null;
};

/**
 * Create a new authorization receipt.
 * Uses AWS KMS ECDSA signing when configured, HMAC-SHA256 otherwise.
 */
export async function createReceipt(options: CreateReceiptOptions): Promise<AuthorizationReceipt> {
  const now = new Date();
  const expiryHours = options.expiry_hours ?? DEFAULT_EXPIRY_HOURS;
  const useKMS = kmsSigner?.isReady() ?? false;

  const payload: ReceiptPayload = {
    version: "1.1",
    issuer: options.issuer ?? DEFAULT_ISSUER,
    algorithm: useKMS ? "kms-ecdsa-sha256" : "hmac-sha256",
    issued_at: now.toISOString(),
    expires_at: expiryHours
      ? new Date(now.getTime() + expiryHours * 60 * 60 * 1000).toISOString()
      : null,
    change_id: options.change_id,
    ruling: options.ruling,
    risk_level: options.risk_level,
    auto_authorized: options.auto_authorized ?? false,
    precedent_match: options.precedent_match,
    artifacts_hash: computeArtifactsHash(options.artifacts),
  };

  const signature = useKMS ? await kmsSigner!.sign(JSON.stringify(payload)) : hmacSign(payload);

  return {
    ...payload,
    signature,
    ...(useKMS ? { kms_key_id: kmsSigner!.getKeyInfo().keyId } : {}),
  };
}

/**
 * Verify a receipt completely: signature, expiry, and ruling.
 */
export function verifyReceipt(
  receipt: AuthorizationReceipt | null | undefined,
  options?: { require_approval?: boolean }
): VerificationResult {
  const requireApproval = options?.require_approval ?? true;

  // Check receipt exists
  if (!receipt) {
    return {
      valid: false,
      reason: "no_receipt",
      message: "Receipt is required. No production state change without authorization.",
    };
  }

  // Check required fields
  const requiredFields = [
    "version",
    "issued_at",
    "change_id",
    "ruling",
    "artifacts_hash",
    "signature",
  ];
  for (const field of requiredFields) {
    if (!(field in receipt) || receipt[field as keyof AuthorizationReceipt] === undefined) {
      return {
        valid: false,
        reason: "malformed_receipt",
        message: `Receipt is missing required field: ${field}`,
      };
    }
  }

  // Verify signature
  try {
    if (!verifySignature(receipt)) {
      return {
        valid: false,
        reason: "invalid_signature",
        message: "Receipt signature does not match. Authorization cannot be verified.",
      };
    }
  } catch {
    return {
      valid: false,
      reason: "invalid_signature",
      message: "Receipt signature verification failed.",
    };
  }

  // Check expiry
  if (isExpired(receipt)) {
    return {
      valid: false,
      reason: "expired",
      message: `Receipt expired at ${receipt.expires_at}. Re-run governance to obtain a new receipt.`,
    };
  }

  // Check ruling (if approval required)
  if (requireApproval && receipt.ruling !== "approve") {
    return {
      valid: false,
      reason: "not_approved",
      message: `Receipt ruling is '${receipt.ruling}', not 'approve'. Deployment blocked.`,
      receipt,
    };
  }

  return {
    valid: true,
    reason: "verified",
    message: "Receipt verified. Deployment authorized.",
    receipt,
  };
}

/**
 * Format a receipt for display (truncate signature for readability).
 */
export function formatReceiptForDisplay(receipt: AuthorizationReceipt): string {
  const lines = [
    `Version:        ${receipt.version}`,
    `Issuer:         ${receipt.issuer}`,
    `Algorithm:      ${receipt.algorithm}`,
    `Issued:         ${receipt.issued_at}`,
    `Expires:        ${receipt.expires_at || "Never"}`,
    ``,
    `Change ID:      ${receipt.change_id}`,
    `Ruling:         ${receipt.ruling.toUpperCase()}`,
    `Risk Level:     ${receipt.risk_level}`,
    `Auto-Auth:      ${receipt.auto_authorized ? "Yes (via precedent)" : "No"}`,
  ];

  if (receipt.precedent_match) {
    lines.push(
      `Precedent:      ${receipt.precedent_match.change_id} (${Math.round(receipt.precedent_match.similarity * 100)}% match)`
    );
  }

  lines.push(
    ``,
    `Artifacts Hash: ${receipt.artifacts_hash.slice(0, 16)}...`,
    `Signature:      ${receipt.signature.slice(0, 16)}...`
  );

  return lines.join("\n");
}

/**
 * Convert legacy v1.0 receipt to v1.1 format.
 */
export function upgradeLegacyReceipt(legacy: {
  version?: string;
  timestamp?: string;
  change_id: string;
  ruling: "approve" | "block" | "escalate";
  risk_level: "low" | "medium" | "high";
  auto_authorized?: boolean;
  precedent_match?: {
    change_id: string;
    timestamp: string;
    similarity: number;
  };
  artifacts_hash: string;
  signature: string;
}): AuthorizationReceipt {
  return {
    version: "1.1",
    issuer: DEFAULT_ISSUER,
    algorithm: "hmac-sha256",
    issued_at: legacy.timestamp || new Date().toISOString(),
    expires_at: null, // Legacy receipts don't expire
    change_id: legacy.change_id,
    ruling: legacy.ruling,
    risk_level: legacy.risk_level,
    auto_authorized: legacy.auto_authorized ?? false,
    precedent_match: legacy.precedent_match,
    artifacts_hash: legacy.artifacts_hash,
    signature: legacy.signature,
  };
}

/**
 * Anchor a receipt to Hedera Consensus Service.
 * Returns the receipt with hedera_proof populated.
 */
export async function anchorReceiptToHedera(
  receipt: AuthorizationReceipt
): Promise<AuthorizationReceipt> {
  // Check if Hedera credentials are configured
  const accountId = process.env.HEDERA_ACCOUNT_ID;
  const privateKey = process.env.HEDERA_PRIVATE_KEY;
  const topicId = process.env.HEDERA_TOPIC_ID;

  if (!accountId || !privateKey || !topicId) {
    console.warn(
      "Hedera not configured - receipt will not be anchored. Set HEDERA_ACCOUNT_ID, HEDERA_PRIVATE_KEY, and HEDERA_TOPIC_ID in .env"
    );
    return receipt;
  }

  try {
    // Dynamic import to avoid issues if @hashgraph/sdk is not installed
    const { Client, TopicMessageSubmitTransaction, AccountId, PrivateKey, PublicKey } =
      await import("@hashgraph/sdk");

    const network = process.env.HEDERA_NETWORK || "testnet";
    const client = network === "testnet" ? Client.forTestnet() : Client.forMainnet();

    client.setOperator(AccountId.fromString(accountId), PrivateKey.fromString(privateKey));

    // Create message with receipt data
    const message = JSON.stringify({
      type: "authorization-receipt",
      version: receipt.version,
      change_id: receipt.change_id,
      ruling: receipt.ruling,
      risk_level: receipt.risk_level,
      artifacts_hash: receipt.artifacts_hash,
      signature: receipt.signature,
      issued_at: receipt.issued_at,
      ...(receipt.kms_key_id ? { kms_key_id: receipt.kms_key_id } : {}),
    });

    const transaction = new TopicMessageSubmitTransaction({
      topicId: topicId,
      message: message,
    });

    // Sign with KMS if available, otherwise use operator key
    let response;
    if (kmsSigner?.isReady()) {
      const pubKeyDer = kmsSigner.getPublicKeyDer();
      const publicKey = PublicKey.fromBytesECDSA(pubKeyDer);
      const frozenTx = transaction.freezeWith(client);
      // Use SDK's signWith — it passes the correct transaction body hash
      await frozenTx.signWith(publicKey, async (message: Uint8Array) => {
        const digest = crypto.createHash("sha256").update(message).digest();
        return kmsSigner!.signBytes(digest);
      });
      response = await frozenTx.execute(client);
      console.log("[KMS] Hedera transaction signed via AWS KMS");
    } else {
      response = await transaction.execute(client);
    }

    const txReceipt = await response.getReceipt(client);

    const transactionId = response.transactionId.toString();
    const sequenceNumber = txReceipt.topicSequenceNumber?.toString() || "unknown";

    await client.close();

    // Add Hedera proof to receipt
    const anchoredReceipt: AuthorizationReceipt = {
      ...receipt,
      hedera_proof: {
        backend: "hedera",
        topic_id: topicId,
        sequence_number: sequenceNumber,
        transaction_id: transactionId,
        timestamp: new Date().toISOString(),
        hashscan_link: `https://hashscan.io/${network}/transaction/${transactionId}`,
      },
    };

    console.log(`✅ Receipt anchored to Hedera: ${anchoredReceipt.hedera_proof!.hashscan_link}`);

    // Mint NFT for approved receipts
    if (receipt.ruling === "approve") {
      try {
        const nftResult = await mintReceiptNFT(anchoredReceipt);
        if (nftResult) {
          anchoredReceipt.nft_proof = nftResult;
        }
      } catch (nftError) {
        console.error("Failed to mint receipt NFT:", nftError);
        // Continue without NFT - HCS anchor is the primary proof
      }
    }

    return anchoredReceipt;
  } catch (error) {
    console.error("Failed to anchor receipt to Hedera:", error);
    return receipt;
  }
}

// Singleton NFT service instance (initialized lazily)
let nftService: HederaNFTService | null = null;
let nftInitPromise: Promise<void> | null = null;

/**
 * Get or initialize the NFT service singleton.
 */
async function getNFTService(): Promise<HederaNFTService | null> {
  if (nftService?.isReady()) return nftService;

  // Prevent concurrent initialization
  if (nftInitPromise) {
    await nftInitPromise;
    return nftService;
  }

  try {
    nftService = new HederaNFTService();
    nftInitPromise = nftService.initialize();
    await nftInitPromise;
    nftInitPromise = null;
    return nftService;
  } catch (error) {
    console.warn("[NFT] Service initialization failed:", error);
    nftInitPromise = null;
    nftService = null;
    return null;
  }
}

/**
 * Mint a governance receipt as an NFT on Hedera Token Service.
 */
async function mintReceiptNFT(receipt: AuthorizationReceipt): Promise<NftProof | null> {
  const service = await getNFTService();
  if (!service) return null;

  const baseUrl = process.env.DOTTO_BASE_URL || `http://localhost:${process.env.PORT || 5000}`;

  return service.mintGovernanceReceipt({
    change_id: receipt.change_id,
    ruling: receipt.ruling,
    risk_level: receipt.risk_level,
    receipt_url: `${baseUrl}/receipts/${encodeURIComponent(receipt.change_id)}`,
  });
}

/**
 * Get the NFT service instance (for API endpoints).
 */
export function getNFTServiceInstance(): HederaNFTService | null {
  return nftService;
}

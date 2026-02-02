/**
 * Cryptographic Receipt Module
 *
 * This module handles the creation and verification of authorization receipts.
 * Receipts are the primitive that makes Dotto an authority layer, not just a governance tool.
 *
 * Design principles:
 * - Receipts are cryptographically verifiable (HMAC-SHA256, upgradeable to asymmetric)
 * - Receipts are immutable records of authorization decisions
 * - No production change without a valid receipt
 */

import crypto from "node:crypto";

export type ReceiptVersion = "1.0" | "1.1";

export type AuthorizationReceipt = {
  // Metadata
  version: ReceiptVersion;
  issuer: string;
  algorithm: "hmac-sha256";
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

/**
 * Get the signing key from environment or use demo key.
 * In production, this should be a secure secret.
 */
function getSigningKey(): string {
  return process.env.DOTTO_SIGNING_KEY || "dotto-demo-key";
}

/**
 * Compute SHA-256 hash of artifacts for integrity verification.
 */
export function computeArtifactsHash(artifacts: unknown): string {
  const content = JSON.stringify(artifacts);
  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * Sign a receipt payload using HMAC-SHA256.
 */
export function signPayload(payload: ReceiptPayload): string {
  const secret = getSigningKey();
  return crypto.createHmac("sha256", secret).update(JSON.stringify(payload)).digest("hex");
}

/**
 * Verify a receipt signature.
 */
export function verifySignature(receipt: AuthorizationReceipt): boolean {
  const { signature, ...payload } = receipt;
  const expectedSignature = signPayload(payload as ReceiptPayload);
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
 */
export function createReceipt(options: CreateReceiptOptions): AuthorizationReceipt {
  const now = new Date();
  const expiryHours = options.expiry_hours ?? DEFAULT_EXPIRY_HOURS;

  const payload: ReceiptPayload = {
    version: "1.1",
    issuer: options.issuer ?? DEFAULT_ISSUER,
    algorithm: "hmac-sha256",
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

  const signature = signPayload(payload);

  return {
    ...payload,
    signature,
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

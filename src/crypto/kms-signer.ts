/**
 * AWS KMS Signer
 *
 * Wraps AWS KMS for receipt signing and Hedera transaction signing.
 * Private keys never leave the HSM — signing happens entirely within KMS.
 *
 * Key spec: ECC_SECG_P256K1 (secp256k1, Hedera-compatible)
 * Signing algorithm: ECDSA_SHA_256
 */

import {
  KMSClient,
  SignCommand,
  GetPublicKeyCommand,
  DescribeKeyCommand,
  type SigningAlgorithmSpec,
} from "@aws-sdk/client-kms";
import crypto from "node:crypto";

const SIGNING_ALGORITHM: SigningAlgorithmSpec = "ECDSA_SHA_256";

export class KMSSigner {
  private client: KMSClient;
  private keyId: string;
  private region: string;
  private publicKeyDer: Buffer | null = null;
  private ready = false;

  constructor(keyId: string, region: string) {
    this.keyId = keyId;
    this.region = region;
    this.client = new KMSClient({ region });
  }

  /**
   * Fetch and cache the public key from KMS.
   * Must be called before sign/verify operations.
   */
  async initialize(): Promise<void> {
    const command = new GetPublicKeyCommand({ KeyId: this.keyId });
    const response = await this.client.send(command);

    if (!response.PublicKey) {
      throw new Error("KMS returned no public key");
    }

    this.publicKeyDer = Buffer.from(response.PublicKey);
    this.ready = true;

    console.log(`[KMS] Initialized with key ${this.keyId.slice(0, 20)}... in ${this.region}`);
  }

  /**
   * Sign a string payload (e.g. JSON-serialized receipt).
   * Returns hex-encoded DER signature.
   */
  async sign(data: string): Promise<string> {
    if (!this.ready) throw new Error("KMS signer not initialized");

    // Hash the data locally — KMS expects a pre-hashed message for ECDSA
    const digest = crypto.createHash("sha256").update(data).digest();

    const command = new SignCommand({
      KeyId: this.keyId,
      Message: digest,
      MessageType: "DIGEST",
      SigningAlgorithm: SIGNING_ALGORITHM,
    });

    const response = await this.client.send(command);

    if (!response.Signature) {
      throw new Error("KMS returned no signature");
    }

    return Buffer.from(response.Signature).toString("hex");
  }

  /**
   * Verify a signature using the cached public key.
   * No KMS round-trip needed — verification is local.
   */
  verify(data: string, signatureHex: string): boolean {
    if (!this.publicKeyDer) throw new Error("KMS signer not initialized");

    const signature = Buffer.from(signatureHex, "hex");

    return crypto.verify(
      "sha256",
      Buffer.from(data),
      { key: this.publicKeyDer, format: "der", type: "spki" },
      signature
    );
  }

  /**
   * Sign raw bytes for Hedera transaction signing.
   * The caller should pass the SHA-256 hash of the transaction body.
   */
  async signBytes(digest: Uint8Array): Promise<Buffer> {
    if (!this.ready) throw new Error("KMS signer not initialized");

    if (digest.length !== 32) {
      throw new Error(`Invalid digest length: expected 32 bytes (SHA-256), got ${digest.length}`);
    }

    const command = new SignCommand({
      KeyId: this.keyId,
      Message: digest,
      MessageType: "DIGEST",
      SigningAlgorithm: SIGNING_ALGORITHM,
    });

    const response = await this.client.send(command);

    if (!response.Signature) {
      throw new Error("KMS returned no signature");
    }

    return Buffer.from(response.Signature);
  }

  /**
   * Get the cached public key in DER format.
   * Use with Hedera's PublicKey.fromBytesECDSA().
   */
  getPublicKeyDer(): Buffer {
    if (!this.publicKeyDer) throw new Error("KMS signer not initialized");
    return this.publicKeyDer;
  }

  /**
   * Get key info for API responses and audit.
   */
  getKeyInfo(): { keyId: string; region: string; algorithm: string } {
    return {
      keyId: this.keyId,
      region: this.region,
      algorithm: SIGNING_ALGORITHM,
    };
  }

  isReady(): boolean {
    return this.ready;
  }
}

/**
 * Hedera Consensus Service proof backend
 * Records immutable proofs on HCS testnet
 */

import { ProofBackend } from "./ProofBackend.js";
import { ProofRef, ProofEvent } from "../core/types.js";
import { EpochManager, Epoch } from "./EpochManager.js";
import { Client, TopicMessageSubmitTransaction, AccountId, PrivateKey } from "@hashgraph/sdk";
import * as dotenv from "dotenv";

dotenv.config();

export class HederaBackend implements ProofBackend {
  readonly name = "hedera";
  private client: Client | null = null;
  private topicId: string;
  private epochManager: EpochManager;
  private batchMode: boolean;
  private epochTimer: ReturnType<typeof setInterval> | null = null;
  private epochHistory: Array<{ epoch: Epoch; proof: ProofRef }> = [];

  constructor(batchMode: boolean = false, epochIntervalMinutes: number = 15) {
    this.topicId = process.env.HEDERA_TOPIC_ID || "";
    this.epochManager = new EpochManager(epochIntervalMinutes);
    this.batchMode = batchMode;
  }

  async initialize(): Promise<void> {
    const accountId = process.env.HEDERA_ACCOUNT_ID;
    const privateKey = process.env.HEDERA_PRIVATE_KEY;

    if (!accountId || !privateKey) {
      throw new Error(
        "Hedera credentials not configured. Set HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY in .env"
      );
    }

    if (!this.topicId) {
      throw new Error("HEDERA_TOPIC_ID not configured in .env");
    }

    const network = process.env.HEDERA_NETWORK || "testnet";
    this.client = network === "testnet" ? Client.forTestnet() : Client.forMainnet();

    this.client.setOperator(AccountId.fromString(accountId), PrivateKey.fromString(privateKey));
  }

  async record(event: ProofEvent): Promise<ProofRef> {
    if (this.batchMode) {
      // Add to epoch batch
      const severity = this.determineSeverity(event);
      this.epochManager.addArtifact(event, severity);

      return {
        backend: this.name,
        id: `pending-epoch-${this.epochManager.getCurrentEpochSize()}`,
        timestamp: new Date().toISOString(),
        link: "",
      };
    } else {
      // Direct submission (legacy mode)
      return await this.submitSingle(event);
    }
  }

  /**
   * Submit single event directly (non-batched)
   */
  private async submitSingle(event: ProofEvent): Promise<ProofRef> {
    if (!this.client) {
      await this.initialize();
    }

    if (!this.client) {
      throw new Error("Hedera client not initialized");
    }

    const message = JSON.stringify({
      artifact: event.nodeId,
      hash: event.hash,
      eventType: event.eventType,
      timestamp: event.timestamp,
      metadata: event.metadata,
    });

    const transaction = new TopicMessageSubmitTransaction({
      topicId: this.topicId,
      message: message,
    });

    const response = await transaction.execute(this.client);
    const receipt = await response.getReceipt(this.client);

    const transactionId = response.transactionId.toString();
    const txId = `${this.topicId}@${receipt.topicSequenceNumber}`;

    return {
      backend: this.name,
      id: txId,
      timestamp: new Date().toISOString(),
      link: `https://hashscan.io/testnet/transaction/${transactionId}`,
    };
  }

  /**
   * Submit current epoch to HCS
   */
  async submitEpoch(): Promise<{ epoch: Epoch; proof: ProofRef } | null> {
    const epoch = this.epochManager.finalizeEpoch();

    if (!epoch) {
      return null;
    }

    if (!this.client) {
      await this.initialize();
    }

    if (!this.client) {
      throw new Error("Hedera client not initialized");
    }

    // Submit only Merkle root + metadata (keep message small)
    const message = JSON.stringify({
      version: "1.0",
      type: "epoch",
      epoch_id: epoch.epoch_id,
      timestamp: epoch.timestamp,
      merkle_root: epoch.merkle_root,
      artifact_count: epoch.artifacts.length,
      artifacts: epoch.artifacts.map((a) => ({
        id: a.id,
        hash: a.hash,
        severity: a.severity,
      })),
    });

    const transaction = new TopicMessageSubmitTransaction({
      topicId: this.topicId,
      message: message,
    });

    const response = await transaction.execute(this.client);
    const receipt = await response.getReceipt(this.client);

    const transactionId = response.transactionId.toString();
    const txId = `${this.topicId}@${receipt.topicSequenceNumber}`;

    const network = process.env.HEDERA_NETWORK || "testnet";
    const proof: ProofRef = {
      backend: this.name,
      id: txId,
      timestamp: new Date().toISOString(),
      link: `https://hashscan.io/${network}/transaction/${transactionId}`,
    };

    this.epochHistory.push({ epoch, proof });

    return { epoch, proof };
  }

  /**
   * Determine severity from event metadata
   */
  private determineSeverity(event: ProofEvent): "breaking" | "warning" | "info" {
    if (event.metadata?.breaking) {
      return "breaking";
    }
    if (event.metadata?.warning) {
      return "warning";
    }
    return "info";
  }

  /**
   * Get epoch manager for external access
   */
  getEpochManager(): EpochManager {
    return this.epochManager;
  }

  /**
   * Start automatic epoch submission on a timer.
   */
  startEpochTimer(): void {
    if (this.epochTimer) return;

    const intervalMs = this.epochManager.getStats().intervalMinutes * 60 * 1000;
    console.log(
      `[Hedera] Epoch timer started (every ${this.epochManager.getStats().intervalMinutes} min)`
    );

    this.epochTimer = setInterval(async () => {
      if (this.epochManager.getCurrentEpochSize() === 0) return;

      try {
        const result = await this.submitEpoch();
        if (result) {
          console.log(
            `[Hedera] Epoch #${result.epoch.epoch_id} submitted (${result.epoch.artifacts.length} artifacts, root: ${result.epoch.merkle_root.slice(0, 16)}...)`
          );
        }
      } catch (err) {
        console.error("[Hedera] Epoch submission failed:", err);
      }
    }, intervalMs);
  }

  /**
   * Stop the epoch timer.
   */
  stopEpochTimer(): void {
    if (this.epochTimer) {
      clearInterval(this.epochTimer);
      this.epochTimer = null;
      console.log("[Hedera] Epoch timer stopped");
    }
  }

  /**
   * Get history of submitted epochs with their proofs.
   */
  getSubmittedEpochs(): Array<{ epoch: Epoch; proof: ProofRef }> {
    return [...this.epochHistory];
  }

  async verify(ref: ProofRef): Promise<boolean> {
    // Verification would query HCS for the message
    // For now, we trust the reference format
    return ref.backend === this.name && ref.id.includes("@");
  }

  getLink(ref: ProofRef): string {
    return ref.link || `https://hashscan.io/testnet/transaction/${ref.id}`;
  }

  async close(): Promise<void> {
    this.stopEpochTimer();

    // Flush any pending epoch artifacts
    if (this.epochManager.getCurrentEpochSize() > 0) {
      try {
        const result = await this.submitEpoch();
        if (result) {
          console.log(
            `[Hedera] Flushed final epoch #${result.epoch.epoch_id} (${result.epoch.artifacts.length} artifacts)`
          );
        }
      } catch (err) {
        console.error("[Hedera] Failed to flush final epoch:", err);
      }
    }

    if (this.client) {
      await this.client.close();
      this.client = null;
    }
  }
}

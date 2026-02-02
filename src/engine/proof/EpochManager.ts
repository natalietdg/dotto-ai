/**
 * Epoch Manager - Batch artifacts into epochs with Merkle trees
 * Optimizes HCS costs by batching multiple changes into single submission
 */

import crypto from "crypto";
import { ProofEvent } from "../core/types.js";

export interface EpochArtifact {
  id: string;
  hash: string;
  eventType: string;
  timestamp: string;
  severity?: "breaking" | "warning" | "info";
}

export interface Epoch {
  epoch_id: number;
  timestamp: string;
  artifacts: EpochArtifact[];
  merkle_root: string;
  merkle_tree: string[][];
}

export class EpochManager {
  private currentEpoch: EpochArtifact[] = [];
  private epochCounter: number = 0;
  private epochInterval: number = 15 * 60 * 1000; // 15 minutes default

  constructor(intervalMinutes: number = 15) {
    this.epochInterval = intervalMinutes * 60 * 1000;
  }

  /**
   * Add artifact to current epoch
   */
  addArtifact(event: ProofEvent, severity?: "breaking" | "warning" | "info"): void {
    this.currentEpoch.push({
      id: event.nodeId,
      hash: event.hash,
      eventType: event.eventType,
      timestamp: event.timestamp,
      severity,
    });
  }

  /**
   * Build Merkle tree from artifacts
   */
  private buildMerkleTree(artifacts: EpochArtifact[]): string[][] {
    if (artifacts.length === 0) {
      return [];
    }

    // Leaf level: hash each artifact
    let currentLevel = artifacts.map((artifact) =>
      this.hashString(
        JSON.stringify({
          id: artifact.id,
          hash: artifact.hash,
          eventType: artifact.eventType,
          timestamp: artifact.timestamp,
        })
      )
    );

    const tree: string[][] = [currentLevel];

    // Build tree bottom-up
    while (currentLevel.length > 1) {
      const nextLevel: string[] = [];

      for (let i = 0; i < currentLevel.length; i += 2) {
        if (i + 1 < currentLevel.length) {
          // Pair exists
          const combined = currentLevel[i] + currentLevel[i + 1];
          nextLevel.push(this.hashString(combined));
        } else {
          // Odd node, promote to next level
          nextLevel.push(currentLevel[i]);
        }
      }

      tree.push(nextLevel);
      currentLevel = nextLevel;
    }

    return tree;
  }

  /**
   * Finalize current epoch and return for submission
   */
  finalizeEpoch(): Epoch | null {
    if (this.currentEpoch.length === 0) {
      return null;
    }

    const tree = this.buildMerkleTree(this.currentEpoch);
    const merkleRoot = tree[tree.length - 1][0];

    const epoch: Epoch = {
      epoch_id: ++this.epochCounter,
      timestamp: new Date().toISOString(),
      artifacts: [...this.currentEpoch],
      merkle_root: merkleRoot,
      merkle_tree: tree,
    };

    // Reset for next epoch
    this.currentEpoch = [];

    return epoch;
  }

  /**
   * Get current epoch size
   */
  getCurrentEpochSize(): number {
    return this.currentEpoch.length;
  }

  /**
   * Verify artifact is in epoch using Merkle proof
   */
  verifyArtifactInEpoch(artifact: EpochArtifact, epoch: Epoch, proofPath: number[]): boolean {
    const artifactHash = this.hashString(
      JSON.stringify({
        id: artifact.id,
        hash: artifact.hash,
        eventType: artifact.eventType,
        timestamp: artifact.timestamp,
      })
    );

    let currentHash = artifactHash;

    // Walk up the tree using proof path
    for (let level = 0; level < proofPath.length; level++) {
      const siblingIndex = proofPath[level];
      const siblingHash = epoch.merkle_tree[level][siblingIndex];

      if (!siblingHash) {
        return false;
      }

      // Combine with sibling
      const combined = currentHash + siblingHash;
      currentHash = this.hashString(combined);
    }

    return currentHash === epoch.merkle_root;
  }

  /**
   * Generate Merkle proof for artifact
   */
  generateMerkleProof(artifact: EpochArtifact, epoch: Epoch): number[] | null {
    // Find artifact index in leaf level
    const leafIndex = epoch.artifacts.findIndex(
      (a) => a.id === artifact.id && a.hash === artifact.hash
    );

    if (leafIndex === -1) {
      return null;
    }

    const proofPath: number[] = [];
    let currentIndex = leafIndex;

    // Walk up tree, recording sibling indices
    for (let level = 0; level < epoch.merkle_tree.length - 1; level++) {
      const isRightNode = currentIndex % 2 === 1;
      const siblingIndex = isRightNode ? currentIndex - 1 : currentIndex + 1;

      proofPath.push(siblingIndex);
      currentIndex = Math.floor(currentIndex / 2);
    }

    return proofPath;
  }

  /**
   * Calculate cost savings from batching
   */
  calculateCostSavings(
    artifactCount: number,
    costPerTx: number = 0.0001
  ): {
    individualCost: number;
    batchedCost: number;
    savings: number;
    savingsPct: number;
  } {
    const individualCost = artifactCount * costPerTx;
    const batchedCost = costPerTx; // Single epoch submission
    const savings = individualCost - batchedCost;
    const savingsPct = (savings / individualCost) * 100;

    return {
      individualCost,
      batchedCost,
      savings,
      savingsPct,
    };
  }

  /**
   * Hash helper
   */
  private hashString(data: string): string {
    return crypto.createHash("sha256").update(data).digest("hex");
  }

  /**
   * Get epoch statistics
   */
  getStats(): {
    totalEpochs: number;
    currentEpochSize: number;
    intervalMinutes: number;
  } {
    return {
      totalEpochs: this.epochCounter,
      currentEpochSize: this.currentEpoch.length,
      intervalMinutes: this.epochInterval / (60 * 1000),
    };
  }
}

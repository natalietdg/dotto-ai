/**
 * Intent Drift Detector
 * Full semantic similarity scoring with multiple algorithms
 */

import { GraphNode } from "../core/types.js";

export interface IntentDrift {
  nodeId: string;
  oldIntent: string | undefined;
  newIntent: string | undefined;
  similarity: number;
  severity: "low" | "medium" | "high";
  analysis: {
    jaccard: number;
    cosine: number;
    levenshtein: number;
  };
}

export class IntentDriftDetector {
  private readonly JACCARD_WEIGHT = 0.4;
  private readonly COSINE_WEIGHT = 0.4;
  private readonly LEVENSHTEIN_WEIGHT = 0.2;

  /**
   * Detect intent drift between two versions of a node
   */
  detectDrift(oldNode: GraphNode | undefined, newNode: GraphNode | undefined): IntentDrift | null {
    if (!oldNode && !newNode) return null;

    const nodeId = (newNode || oldNode)!.id;
    const oldIntent = oldNode?.intent;
    const newIntent = newNode?.intent;

    // No drift if intents are identical
    if (oldIntent === newIntent) return null;

    // Calculate similarity scores
    const jaccard = this.jaccardSimilarity(oldIntent || "", newIntent || "");
    const cosine = this.cosineSimilarity(oldIntent || "", newIntent || "");
    const levenshtein = this.levenshteinSimilarity(oldIntent || "", newIntent || "");

    // Weighted average
    const similarity =
      jaccard * this.JACCARD_WEIGHT +
      cosine * this.COSINE_WEIGHT +
      levenshtein * this.LEVENSHTEIN_WEIGHT;

    // Determine severity
    let severity: "low" | "medium" | "high";
    if (similarity >= 0.7) {
      severity = "low"; // Similar intents
    } else if (similarity >= 0.4) {
      severity = "medium"; // Somewhat different
    } else {
      severity = "high"; // Very different or missing intent
    }

    return {
      nodeId,
      oldIntent,
      newIntent,
      similarity,
      severity,
      analysis: {
        jaccard,
        cosine,
        levenshtein,
      },
    };
  }

  /**
   * Detect drift for multiple nodes
   */
  detectBatchDrift(
    oldNodes: Map<string, GraphNode>,
    newNodes: Map<string, GraphNode>
  ): IntentDrift[] {
    const drifts: IntentDrift[] = [];
    const allNodeIds = new Set([...oldNodes.keys(), ...newNodes.keys()]);

    for (const nodeId of allNodeIds) {
      const oldNode = oldNodes.get(nodeId);
      const newNode = newNodes.get(nodeId);

      const drift = this.detectDrift(oldNode, newNode);
      if (drift) {
        drifts.push(drift);
      }
    }

    return drifts.sort((a, b) => a.similarity - b.similarity); // Most drifted first
  }

  /**
   * Jaccard similarity - set overlap of words
   */
  private jaccardSimilarity(a: string, b: string): number {
    if (!a && !b) return 1;
    if (!a || !b) return 0;

    const setA = new Set(this.tokenize(a));
    const setB = new Set(this.tokenize(b));

    const intersection = new Set([...setA].filter((x) => setB.has(x)));
    const union = new Set([...setA, ...setB]);

    if (union.size === 0) return 1;
    return intersection.size / union.size;
  }

  /**
   * Cosine similarity - vector space model
   */
  private cosineSimilarity(a: string, b: string): number {
    if (!a && !b) return 1;
    if (!a || !b) return 0;

    const tokensA = this.tokenize(a);
    const tokensB = this.tokenize(b);

    // Build vocabulary
    const vocab = new Set([...tokensA, ...tokensB]);

    // Build frequency vectors
    const vecA = this.buildFrequencyVector(tokensA, vocab);
    const vecB = this.buildFrequencyVector(tokensB, vocab);

    // Calculate cosine similarity
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Levenshtein similarity - edit distance based
   */
  private levenshteinSimilarity(a: string, b: string): number {
    if (!a && !b) return 1;
    if (!a || !b) return 0;

    const distance = this.levenshteinDistance(a.toLowerCase(), b.toLowerCase());
    const maxLen = Math.max(a.length, b.length);

    if (maxLen === 0) return 1;
    return 1 - distance / maxLen;
  }

  /**
   * Calculate Levenshtein edit distance
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= a.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= b.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1, // deletion
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }

    return matrix[a.length][b.length];
  }

  /**
   * Tokenize text into words
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 0);
  }

  /**
   * Build frequency vector for tokens against vocabulary
   */
  private buildFrequencyVector(tokens: string[], vocab: Set<string>): number[] {
    const freqMap = new Map<string, number>();
    for (const token of tokens) {
      freqMap.set(token, (freqMap.get(token) || 0) + 1);
    }

    const vector: number[] = [];
    for (const word of vocab) {
      vector.push(freqMap.get(word) || 0);
    }

    return vector;
  }

  /**
   * Format drift report
   */
  formatDriftReport(drifts: IntentDrift[]): string {
    if (drifts.length === 0) {
      return "\n✅ No intent drift detected\n";
    }

    let report = `\n⚠️  Intent Drift Analysis (${drifts.length} change(s)):\n\n`;

    const highSeverity = drifts.filter((d) => d.severity === "high");
    const mediumSeverity = drifts.filter((d) => d.severity === "medium");
    const lowSeverity = drifts.filter((d) => d.severity === "low");

    if (highSeverity.length > 0) {
      report += `🔴 High Drift (${highSeverity.length}):\n`;
      for (const drift of highSeverity) {
        report += this.formatSingleDrift(drift);
      }
      report += "\n";
    }

    if (mediumSeverity.length > 0) {
      report += `🟡 Medium Drift (${mediumSeverity.length}):\n`;
      for (const drift of mediumSeverity) {
        report += this.formatSingleDrift(drift);
      }
      report += "\n";
    }

    if (lowSeverity.length > 0) {
      report += `🟢 Low Drift (${lowSeverity.length}):\n`;
      for (const drift of lowSeverity) {
        report += this.formatSingleDrift(drift);
      }
      report += "\n";
    }

    return report;
  }

  private formatSingleDrift(drift: IntentDrift): string {
    const similarity = (drift.similarity * 100).toFixed(0);
    let report = `  - ${drift.nodeId}\n`;
    report += `    Similarity: ${similarity}%\n`;
    report += `    Old: "${drift.oldIntent || "(none)"}\n`;
    report += `    New: "${drift.newIntent || "(none)"}\n`;
    report += `    Scores: Jaccard=${(drift.analysis.jaccard * 100).toFixed(0)}%, `;
    report += `Cosine=${(drift.analysis.cosine * 100).toFixed(0)}%, `;
    report += `Levenshtein=${(drift.analysis.levenshtein * 100).toFixed(0)}%\n`;
    return report;
  }
}

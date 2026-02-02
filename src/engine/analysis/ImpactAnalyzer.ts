/**
 * Impact analysis engine
 * Identifies downstream effects of schema changes
 */

import { GraphEngine } from "../graph/GraphEngine.js";
import { ImpactAnalysis } from "../core/types.js";

export class ImpactAnalyzer {
  private graphEngine: GraphEngine;

  constructor(graphEngine: GraphEngine) {
    this.graphEngine = graphEngine;
  }

  analyze(nodeId: string, maxDepth: number = 3): ImpactAnalysis {
    const node = this.graphEngine.getNode(nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    const downstream = this.graphEngine.getDownstream(nodeId, maxDepth);

    return {
      nodeId,
      depth: maxDepth,
      impacted: downstream.map((item) => ({
        nodeId: item.nodeId,
        distance: item.distance,
        path: item.path,
        confidence: this.calculateConfidence(item.path),
      })),
    };
  }

  private calculateConfidence(path: string[]): number {
    // Confidence decreases with distance
    // Direct dependency = 1.0, each hop reduces by 0.15
    const distance = path.length - 1;
    return Math.max(0.4, 1.0 - distance * 0.15);
  }

  formatImpactReport(analysis: ImpactAnalysis): string {
    const node = this.graphEngine.getNode(analysis.nodeId);
    if (!node) return "Node not found";

    let report = `\n📊 Impact Analysis for: ${node.name}\n`;
    report += `   Type: ${node.type}\n`;
    report += `   File: ${node.filePath}\n\n`;

    if (analysis.impacted.length === 0) {
      report += "✓ No downstream dependencies found\n";
      return report;
    }

    report += `⚠️  ${analysis.impacted.length} downstream dependent(s):\n\n`;

    // Group by distance
    const byDistance = new Map<number, typeof analysis.impacted>();
    for (const item of analysis.impacted) {
      if (!byDistance.has(item.distance)) {
        byDistance.set(item.distance, []);
      }
      byDistance.get(item.distance)!.push(item);
    }

    for (const [distance, items] of Array.from(byDistance.entries()).sort((a, b) => a[0] - b[0])) {
      report += `  Distance ${distance}:\n`;
      for (const item of items) {
        const depNode = this.graphEngine.getNode(item.nodeId);
        if (depNode) {
          const confidence = (item.confidence * 100).toFixed(0);
          report += `    • ${depNode.name} (${depNode.type}) [confidence: ${confidence}%]\n`;
          report += `      ${depNode.filePath}\n`;
        }
      }
      report += "\n";
    }

    return report;
  }
}

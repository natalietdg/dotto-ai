/**
 * Provenance chain analyzer
 * Traces reverse dependencies and origins
 */

import { GraphEngine } from "../graph/GraphEngine.js";
import { ProvenanceChain } from "../core/types.js";

export class ProvenanceAnalyzer {
  private graphEngine: GraphEngine;

  constructor(graphEngine: GraphEngine) {
    this.graphEngine = graphEngine;
  }

  analyze(nodeId: string): ProvenanceChain {
    const node = this.graphEngine.getNode(nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    const provenance = this.graphEngine.getProvenance(nodeId);

    return {
      nodeId,
      chain: provenance.map((item) => ({
        nodeId: item.nodeId,
        relationship: item.relationship,
        confidence: 0.9, // High confidence for direct relationships
      })),
    };
  }

  formatProvenanceReport(chain: ProvenanceChain): string {
    const node = this.graphEngine.getNode(chain.nodeId);
    if (!node) return "Node not found";

    let report = `\n🔍 Provenance Chain for: ${node.name}\n`;
    report += `   Type: ${node.type}\n`;
    report += `   File: ${node.filePath}\n\n`;

    if (chain.chain.length === 0) {
      report += "✓ No upstream dependencies (root node)\n";
      return report;
    }

    report += `📜 ${chain.chain.length} upstream source(s):\n\n`;

    for (const item of chain.chain) {
      const sourceNode = this.graphEngine.getNode(item.nodeId);
      if (sourceNode) {
        report += `  • ${sourceNode.name} (${sourceNode.type})\n`;
        report += `    Relationship: ${item.relationship}\n`;
        report += `    File: ${sourceNode.filePath}\n`;
        if (sourceNode.intent) {
          report += `    Intent: ${sourceNode.intent}\n`;
        }
        report += "\n";
      }
    }

    return report;
  }
}

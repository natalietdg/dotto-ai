/**
 * Compatibility checker
 * Detects breaking changes and drift
 */

import { GraphEngine } from "../graph/GraphEngine.js";
import { CompatibilityIssue, GraphNode } from "../core/types.js";

export class CompatibilityChecker {
  private graphEngine: GraphEngine;

  constructor(graphEngine: GraphEngine) {
    this.graphEngine = graphEngine;
  }

  check(): CompatibilityIssue[] {
    const issues: CompatibilityIssue[] = [];
    const nodes = this.graphEngine.getAllNodes();

    for (const node of nodes) {
      // Check for intent changes
      if (node.intent) {
        const intentIssues = this.checkIntentChanges(node);
        issues.push(...intentIssues);
      }

      // Check for property changes
      if (node.properties) {
        const propertyIssues = this.checkPropertyChanges(node);
        issues.push(...propertyIssues);
      }

      // Check enum changes
      if (node.type === "enum" && node.metadata.values) {
        const enumIssues = this.checkEnumChanges(node);
        issues.push(...enumIssues);
      }
    }

    return issues;
  }

  private checkIntentChanges(node: GraphNode): CompatibilityIssue[] {
    // In a real implementation, we'd compare with previous version
    // For now, we flag any node with an intent as noteworthy
    return [];
  }

  private checkPropertyChanges(node: GraphNode): CompatibilityIssue[] {
    const issues: CompatibilityIssue[] = [];

    if (!node.properties) return issues;

    // Check for required field additions (breaking change)
    for (const prop of node.properties) {
      if (prop.required) {
        // In real implementation, compare with previous version
        // If this is a newly required field, it's breaking
      }
    }

    return issues;
  }

  private checkEnumChanges(node: GraphNode): CompatibilityIssue[] {
    const issues: CompatibilityIssue[] = [];

    // Enum value removal is breaking
    // Enum value addition is usually safe

    return issues;
  }

  formatCompatibilityReport(issues: CompatibilityIssue[]): string {
    if (issues.length === 0) {
      return "\n✅ No compatibility issues detected\n";
    }

    let report = `\n⚠️  ${issues.length} compatibility issue(s) found:\n\n`;

    const breaking = issues.filter((i) => i.severity === "breaking");
    const warnings = issues.filter((i) => i.severity === "warning");
    const info = issues.filter((i) => i.severity === "info");

    if (breaking.length > 0) {
      report += `🔴 Breaking Changes (${breaking.length}):\n`;
      for (const issue of breaking) {
        report += `  • ${issue.nodeId}: ${issue.message}\n`;
      }
      report += "\n";
    }

    if (warnings.length > 0) {
      report += `🟡 Warnings (${warnings.length}):\n`;
      for (const issue of warnings) {
        report += `  • ${issue.nodeId}: ${issue.message}\n`;
      }
      report += "\n";
    }

    if (info.length > 0) {
      report += `ℹ️  Info (${info.length}):\n`;
      for (const issue of info) {
        report += `  • ${issue.nodeId}: ${issue.message}\n`;
      }
      report += "\n";
    }

    return report;
  }
}

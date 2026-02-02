/**
 * Schema Diff Engine
 * Computes structured diffs between schema versions
 */

import { GraphNode, PropertyInfo } from "../core/types.js";

export interface SchemaDiff {
  nodeId: string;
  name: string;
  type: string;
  changeType: "added" | "removed" | "modified" | "unchanged";
  breaking: boolean;
  changes: SchemaChange[];
  oldVersion?: GraphNode;
  newVersion?: GraphNode;
}

export interface SchemaChange {
  type:
    | "field_added"
    | "field_removed"
    | "field_type_changed"
    | "field_required_changed"
    | "intent_changed"
    | "enum_value_changed";
  path: string;
  oldValue?: any;
  newValue?: any;
  breaking: boolean;
  description: string;
}

export class SchemaDiffer {
  /**
   * Compare two versions of the same schema
   */
  diff(oldNode: GraphNode | undefined, newNode: GraphNode | undefined): SchemaDiff {
    if (!oldNode && !newNode) {
      throw new Error("At least one node version must be provided");
    }

    const nodeId = (newNode || oldNode)!.id;
    const name = (newNode || oldNode)!.name;
    const type = (newNode || oldNode)!.type;

    // Determine change type
    let changeType: "added" | "removed" | "modified" | "unchanged";
    if (!oldNode) {
      changeType = "added";
    } else if (!newNode) {
      changeType = "removed";
    } else if (oldNode.fileHash === newNode.fileHash) {
      changeType = "unchanged";
    } else {
      changeType = "modified";
    }

    const changes: SchemaChange[] = [];

    // Compare properties if both versions exist
    if (oldNode && newNode) {
      const propertyChanges = this.compareProperties(
        oldNode.properties || [],
        newNode.properties || []
      );
      changes.push(...propertyChanges);

      // Compare intent
      if (oldNode.intent !== newNode.intent) {
        changes.push({
          type: "intent_changed",
          path: "@intent",
          oldValue: oldNode.intent,
          newValue: newNode.intent,
          breaking: false, // Intent changes are warnings, not breaking
          description: `Intent changed from "${oldNode.intent || "none"}" to "${newNode.intent || "none"}"`,
        });
      }

      // Compare enum values
      if (type === "enum") {
        const enumChanges = this.compareEnumValues(
          oldNode.metadata?.values || [],
          newNode.metadata?.values || []
        );
        changes.push(...enumChanges);
      }
    }

    const breaking = changes.some((c) => c.breaking) || changeType === "removed";

    return {
      nodeId,
      name,
      type,
      changeType,
      breaking,
      changes,
      oldVersion: oldNode,
      newVersion: newNode,
    };
  }

  /**
   * Compare properties between two schema versions
   */
  private compareProperties(oldProps: PropertyInfo[], newProps: PropertyInfo[]): SchemaChange[] {
    const changes: SchemaChange[] = [];
    const oldPropMap = new Map(oldProps.map((p) => [p.name, p]));
    const newPropMap = new Map(newProps.map((p) => [p.name, p]));

    // Check for removed properties
    for (const [name, oldProp] of oldPropMap) {
      if (!newPropMap.has(name)) {
        changes.push({
          type: "field_removed",
          path: name,
          oldValue: oldProp,
          breaking: true,
          description: `Property "${name}" was removed`,
        });
      }
    }

    // Check for added and modified properties
    for (const [name, newProp] of newPropMap) {
      const oldProp = oldPropMap.get(name);

      if (!oldProp) {
        // Property added
        const breaking = newProp.required === true;
        changes.push({
          type: "field_added",
          path: name,
          newValue: newProp,
          breaking,
          description: breaking
            ? `Required property "${name}" was added (breaking)`
            : `Optional property "${name}" was added`,
        });
      } else {
        // Check for type changes
        if (oldProp.type !== newProp.type) {
          changes.push({
            type: "field_type_changed",
            path: name,
            oldValue: oldProp.type,
            newValue: newProp.type,
            breaking: true,
            description: `Property "${name}" type changed from "${oldProp.type}" to "${newProp.type}"`,
          });
        }

        // Check for required changes
        if (oldProp.required !== newProp.required) {
          const breaking = newProp.required === true;
          changes.push({
            type: "field_required_changed",
            path: name,
            oldValue: oldProp.required,
            newValue: newProp.required,
            breaking,
            description: breaking
              ? `Property "${name}" is now required (breaking)`
              : `Property "${name}" is now optional`,
          });
        }
      }
    }

    return changes;
  }

  /**
   * Compare enum values
   */
  private compareEnumValues(oldValues: string[], newValues: string[]): SchemaChange[] {
    const changes: SchemaChange[] = [];
    const oldSet = new Set(oldValues);
    const newSet = new Set(newValues);

    // Check for removed values (breaking)
    for (const value of oldValues) {
      if (!newSet.has(value)) {
        changes.push({
          type: "enum_value_changed",
          path: `values.${value}`,
          oldValue: value,
          breaking: true,
          description: `Enum value "${value}" was removed (breaking)`,
        });
      }
    }

    // Check for added values (non-breaking)
    for (const value of newValues) {
      if (!oldSet.has(value)) {
        changes.push({
          type: "enum_value_changed",
          path: `values.${value}`,
          newValue: value,
          breaking: false,
          description: `Enum value "${value}" was added`,
        });
      }
    }

    return changes;
  }

  /**
   * Batch diff multiple nodes
   */
  diffMany(oldNodes: Map<string, GraphNode>, newNodes: Map<string, GraphNode>): SchemaDiff[] {
    const diffs: SchemaDiff[] = [];
    const allNodeIds = new Set([...oldNodes.keys(), ...newNodes.keys()]);

    for (const nodeId of allNodeIds) {
      const oldNode = oldNodes.get(nodeId);
      const newNode = newNodes.get(nodeId);

      const diff = this.diff(oldNode, newNode);
      if (diff.changeType !== "unchanged") {
        diffs.push(diff);
      }
    }

    return diffs;
  }

  /**
   * Format diff report for CLI output
   */
  formatDiffReport(diffs: SchemaDiff[]): string {
    const lines: string[] = [];

    lines.push("\n📊 Schema Diff Report\n");

    const breaking = diffs.filter((d) => d.breaking);
    const nonBreaking = diffs.filter((d) => !d.breaking);

    if (breaking.length > 0) {
      lines.push(`⚠️  ${breaking.length} breaking change(s):\n`);
      for (const diff of breaking) {
        lines.push(`  ❌ ${diff.name} (${diff.changeType})`);
        for (const change of diff.changes.filter((c) => c.breaking)) {
          lines.push(`     • ${change.description}`);
        }
        lines.push("");
      }
    }

    if (nonBreaking.length > 0) {
      lines.push(`✓ ${nonBreaking.length} non-breaking change(s):\n`);
      for (const diff of nonBreaking) {
        lines.push(`  ℹ️  ${diff.name} (${diff.changeType})`);
        for (const change of diff.changes) {
          lines.push(`     • ${change.description}`);
        }
        lines.push("");
      }
    }

    if (diffs.length === 0) {
      lines.push("✓ No schema changes detected\n");
    }

    return lines.join("\n");
  }
}

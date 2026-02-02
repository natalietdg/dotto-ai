#!/usr/bin/env npx tsx
/**
 * dotto local scan - Compare two TypeScript files and generate drift.json
 *
 * Usage:
 *   npx tsx src/cli/dotto-local-scan.ts --before before.ts --after after.ts [--output drift.json]
 *
 * This is separate from `dotto scan` which is git-based.
 * Use this for demo scenarios or local file comparisons.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as ts from "typescript";

interface FieldInfo {
  name: string;
  type: string;
  required: boolean;
}

interface InterfaceInfo {
  name: string;
  fields: FieldInfo[];
  file: string;
}

interface SchemaChange {
  type: string;
  field?: string;
  oldField?: string;
  newField?: string;
  oldType?: string;
  newType?: string;
  description: string;
}

interface DriftDiff {
  nodeId: string;
  name: string;
  type: string;
  changeType: "added" | "removed" | "modified";
  breaking: boolean;
  changes: SchemaChange[];
  file?: string;
}

interface DriftOutput {
  timestamp: string;
  baseFile: string;
  headFile: string;
  diffs: DriftDiff[];
  summary: {
    totalChanges: number;
    breakingChanges: number;
    nonBreakingChanges: number;
  };
}

function getArgValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  const next = process.argv[idx + 1];
  if (!next || next.startsWith("--")) return null;
  return next;
}

function parseTypeScript(content: string, fileName: string): InterfaceInfo[] {
  const sourceFile = ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true);

  const interfaces: InterfaceInfo[] = [];

  function visit(node: ts.Node) {
    if (ts.isInterfaceDeclaration(node)) {
      const name = node.name.text;
      const fields: FieldInfo[] = [];

      node.members.forEach((member) => {
        if (ts.isPropertySignature(member) && member.name) {
          const fieldName = member.name.getText(sourceFile);
          const fieldType = member.type ? member.type.getText(sourceFile) : "unknown";
          const required = !member.questionToken;

          fields.push({
            name: fieldName,
            type: fieldType,
            required,
          });
        }
      });

      interfaces.push({ name, fields, file: fileName });
    }

    // Also handle type aliases that define object shapes
    if (ts.isTypeAliasDeclaration(node)) {
      const name = node.name.text;
      if (ts.isTypeLiteralNode(node.type)) {
        const fields: FieldInfo[] = [];

        node.type.members.forEach((member) => {
          if (ts.isPropertySignature(member) && member.name) {
            const fieldName = member.name.getText(sourceFile);
            const fieldType = member.type ? member.type.getText(sourceFile) : "unknown";
            const required = !member.questionToken;

            fields.push({
              name: fieldName,
              type: fieldType,
              required,
            });
          }
        });

        interfaces.push({ name, fields, file: fileName });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return interfaces;
}

function compareInterfaces(
  beforeInterfaces: InterfaceInfo[],
  afterInterfaces: InterfaceInfo[],
  beforeFile: string,
  afterFile: string
): DriftDiff[] {
  const diffs: DriftDiff[] = [];

  const beforeMap = new Map(beforeInterfaces.map((i) => [i.name, i]));
  const afterMap = new Map(afterInterfaces.map((i) => [i.name, i]));

  // Check for removed interfaces
  for (const [name, beforeInterface] of beforeMap) {
    if (!afterMap.has(name)) {
      diffs.push({
        nodeId: `${afterFile}:${name}`,
        name,
        type: "schema",
        changeType: "removed",
        breaking: true,
        changes: [
          {
            type: "interface_removed",
            description: `Interface "${name}" was removed`,
          },
        ],
        file: beforeFile,
      });
    }
  }

  // Check for added interfaces
  for (const [name, afterInterface] of afterMap) {
    if (!beforeMap.has(name)) {
      diffs.push({
        nodeId: `${afterFile}:${name}`,
        name,
        type: "schema",
        changeType: "added",
        breaking: false,
        changes: [
          {
            type: "interface_added",
            description: `Interface "${name}" was added`,
          },
        ],
        file: afterFile,
      });
    }
  }

  // Check for modified interfaces
  for (const [name, beforeInterface] of beforeMap) {
    const afterInterface = afterMap.get(name);
    if (!afterInterface) continue;

    const changes: SchemaChange[] = [];
    const beforeFields = new Map(beforeInterface.fields.map((f) => [f.name, f]));
    const afterFields = new Map(afterInterface.fields.map((f) => [f.name, f]));

    // Check for removed fields
    for (const [fieldName, beforeField] of beforeFields) {
      if (!afterFields.has(fieldName)) {
        // Check if it was renamed (similar type exists with different name)
        const possibleRename = Array.from(afterFields.values()).find(
          (f) => !beforeFields.has(f.name) && f.type === beforeField.type
        );

        if (possibleRename) {
          changes.push({
            type: "field_renamed",
            oldField: fieldName,
            newField: possibleRename.name,
            description: `Field "${fieldName}" renamed to "${possibleRename.name}"`,
          });
          // Mark the new field as handled
          afterFields.delete(possibleRename.name);
        } else {
          changes.push({
            type: "field_removed",
            field: fieldName,
            description: `Field "${fieldName}" was removed`,
          });
        }
      }
    }

    // Check for added fields
    for (const [fieldName, afterField] of afterFields) {
      if (!beforeFields.has(fieldName)) {
        const isBreaking = afterField.required;
        changes.push({
          type: isBreaking ? "field_added_required" : "field_added",
          field: fieldName,
          newType: afterField.type,
          description: `Field "${fieldName}" was added${isBreaking ? " (required)" : " (optional)"}`,
        });
      }
    }

    // Check for type changes
    for (const [fieldName, beforeField] of beforeFields) {
      const afterField = afterFields.get(fieldName);
      if (!afterField) continue;

      if (beforeField.type !== afterField.type) {
        changes.push({
          type: "field_type_changed",
          field: fieldName,
          oldType: beforeField.type,
          newType: afterField.type,
          description: `Field "${fieldName}" type changed from "${beforeField.type}" to "${afterField.type}"`,
        });
      }

      // Check for required/optional changes
      if (beforeField.required !== afterField.required) {
        if (afterField.required) {
          changes.push({
            type: "field_made_required",
            field: fieldName,
            description: `Field "${fieldName}" changed from optional to required`,
          });
        } else {
          changes.push({
            type: "field_made_optional",
            field: fieldName,
            description: `Field "${fieldName}" changed from required to optional`,
          });
        }
      }
    }

    if (changes.length > 0) {
      const hasBreaking = changes.some((c) =>
        [
          "field_removed",
          "field_renamed",
          "field_type_changed",
          "field_made_required",
          "field_added_required",
        ].includes(c.type)
      );

      diffs.push({
        nodeId: `${afterFile}:${name}`,
        name,
        type: "schema",
        changeType: "modified",
        breaking: hasBreaking,
        changes,
        file: afterFile,
      });
    }
  }

  return diffs;
}

async function main(): Promise<void> {
  const beforePath = getArgValue("--before");
  const afterPath = getArgValue("--after");
  const outputPath = getArgValue("--output") ?? "drift.json";

  if (!beforePath || !afterPath) {
    console.error("Usage: dotto-local-scan --before <file> --after <file> [--output <file>]");
    console.error("");
    console.error("Compare two TypeScript files and generate drift.json");
    console.error("");
    console.error("Options:");
    console.error("  --before <file>   Base TypeScript file (before changes)");
    console.error("  --after <file>    Head TypeScript file (after changes)");
    console.error("  --output <file>   Output drift.json path (default: drift.json)");
    process.exit(1);
  }

  try {
    const beforeContent = await readFile(beforePath, "utf8");
    const afterContent = await readFile(afterPath, "utf8");

    const beforeInterfaces = parseTypeScript(beforeContent, path.basename(beforePath));
    const afterInterfaces = parseTypeScript(afterContent, path.basename(afterPath));

    const diffs = compareInterfaces(
      beforeInterfaces,
      afterInterfaces,
      path.basename(beforePath),
      path.basename(afterPath)
    );

    const breakingCount = diffs.filter((d) => d.breaking).length;
    const nonBreakingCount = diffs.filter((d) => !d.breaking).length;

    const output: DriftOutput = {
      timestamp: new Date().toISOString(),
      baseFile: beforePath,
      headFile: afterPath,
      diffs,
      summary: {
        totalChanges: diffs.length,
        breakingChanges: breakingCount,
        nonBreakingChanges: nonBreakingCount,
      },
    };

    await writeFile(outputPath, JSON.stringify(output, null, 2) + "\n", "utf8");
    console.log(`✓ Generated ${outputPath}`);
    console.log(
      `  ${diffs.length} changes (${breakingCount} breaking, ${nonBreakingCount} non-breaking)`
    );
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main();

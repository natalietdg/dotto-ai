/**
 * TypeScript file scanner
 * Extracts schemas, DTOs, interfaces, and dependencies
 */

import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";
import { GraphNode, GraphEdge, PropertyInfo } from "../core/types.js";

import { GraphEngine } from "../graph/GraphEngine.js";

export class TypeScriptScanner {
  private graphEngine?: GraphEngine;

  setGraphEngine(engine: GraphEngine) {
    this.graphEngine = engine;
  }

  scan(filePath: string, fileHash: string): { nodes: GraphNode[]; edges: GraphEdge[] } {
    const content = fs.readFileSync(filePath, "utf-8");

    // Normalize to relative path
    const relativePath = this.toRelativePath(filePath);

    const sourceFile = ts.createSourceFile(relativePath, content, ts.ScriptTarget.Latest, true);

    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const importedTypes: Map<string, string> = new Map(); // type name -> file path

    const visit = (node: ts.Node) => {
      // Extract @intent from JSDoc
      const intent = this.extractIntent(node, sourceFile);

      // Parse interfaces
      if (ts.isInterfaceDeclaration(node) && node.name) {
        const interfaceNode = this.parseInterface(node, sourceFile, relativePath, fileHash, intent);
        nodes.push(interfaceNode);
      }

      // Parse classes (DTOs)
      if (ts.isClassDeclaration(node) && node.name) {
        const classNode = this.parseClass(node, sourceFile, relativePath, fileHash, intent);
        nodes.push(classNode);
      }

      // Parse type aliases
      if (ts.isTypeAliasDeclaration(node) && node.name) {
        const typeNode = this.parseTypeAlias(node, sourceFile, relativePath, fileHash, intent);
        nodes.push(typeNode);
      }

      // Parse enums
      if (ts.isEnumDeclaration(node) && node.name) {
        const enumNode = this.parseEnum(node, sourceFile, relativePath, fileHash, intent);
        nodes.push(enumNode);
      }

      // Extract imports for dependencies
      if (ts.isImportDeclaration(node)) {
        const moduleSpecifier = node.moduleSpecifier;
        if (ts.isStringLiteral(moduleSpecifier)) {
          const importPath = moduleSpecifier.text;
          if (importPath.startsWith(".") || importPath.startsWith("/")) {
            // Extract imported names
            if (
              node.importClause?.namedBindings &&
              ts.isNamedImports(node.importClause.namedBindings)
            ) {
              node.importClause.namedBindings.elements.forEach((element) => {
                const typeName = element.name.text;
                const resolvedPath = this.resolveImportPath(importPath, filePath);
                importedTypes.set(typeName, resolvedPath);
              });
            }
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    // Layer 0: Type-level edges (cheap + reliable)
    // If OrderDto has property trade: TradeDto, create edge TradeDto → OrderDto
    nodes.forEach((targetNode) => {
      if (!targetNode.properties) return;

      targetNode.properties.forEach((prop) => {
        importedTypes.forEach((importFilePath, typeName) => {
          // Extract base type from complex types: TradeDto[], TradeDto | null, Record<string, TradeDto>
          const baseType = this.extractBaseType(prop.type);

          if (baseType === typeName) {
            const sourceNodeId = `${importFilePath}:${typeName}`;
            edges.push({
              id: `${sourceNodeId}-to-${targetNode.id}`,
              source: sourceNodeId,
              target: targetNode.id,
              type: "uses",
              confidence: 1.0,
              metadata: {
                layer: "type_reference",
                propertyName: prop.name,
                propertyType: prop.type,
              },
            });
          }
        });
      });
    });

    // Layer 1: Field-level via transparent schema references
    // If OrderDto.total: Money, create field-path edges for each Money field
    if (this.graphEngine) {
      nodes.forEach((targetNode) => {
        if (!targetNode.properties) return;

        targetNode.properties.forEach((targetProp) => {
          importedTypes.forEach((importFilePath, typeName) => {
            const baseType = this.extractBaseType(targetProp.type);

            // Check if this property is a direct reference to an imported type
            if (baseType === typeName) {
              const sourceNodeId = `${importFilePath}:${typeName}`;
              const sourceNode = this.graphEngine!.getNode(sourceNodeId);

              // If source type has properties, create field-path edges
              if (sourceNode && sourceNode.properties) {
                sourceNode.properties.forEach((sourceField) => {
                  edges.push({
                    id: `${sourceNodeId}:${sourceField.name}-to-${targetNode.id}:${targetProp.name}.${sourceField.name}`,
                    source: sourceNodeId,
                    target: targetNode.id,
                    type: "uses",
                    confidence: 0.95,
                    metadata: {
                      layer: "field_path",
                      sourceField: sourceField.name,
                      targetProperty: targetProp.name,
                      targetFieldPath: `${targetProp.name}.${sourceField.name}`,
                      note: `${targetNode.name}.${targetProp.name} is ${typeName}, so ${typeName}.${sourceField.name} changes affect ${targetNode.name}.${targetProp.name}.${sourceField.name}`,
                    },
                  });
                });
              }
            }
          });
        });
      });
    }

    return { nodes, edges };
  }

  private extractIntent(node: ts.Node, sourceFile: ts.SourceFile): string | undefined {
    const jsDoc = (node as any).jsDoc;
    if (!jsDoc || jsDoc.length === 0) return undefined;

    for (const doc of jsDoc) {
      const comment = doc.comment;
      if (typeof comment === "string") {
        const intentMatch = comment.match(/@intent\s+(.+)/);
        if (intentMatch) {
          return intentMatch[1].trim();
        }
      }
    }

    return undefined;
  }

  private parseInterface(
    node: ts.InterfaceDeclaration,
    sourceFile: ts.SourceFile,
    filePath: string,
    fileHash: string,
    intent?: string
  ): GraphNode {
    const name = node.name.text;
    const properties = this.extractProperties(node.members, sourceFile);

    return {
      id: this.generateId(filePath, name),
      type: "schema",
      name,
      filePath,
      fileHash,
      intent,
      metadata: { kind: "interface" },
      properties,
      lastModified: new Date().toISOString(),
    };
  }

  private parseClass(
    node: ts.ClassDeclaration,
    sourceFile: ts.SourceFile,
    filePath: string,
    fileHash: string,
    intent?: string
  ): GraphNode {
    const name = node.name?.text || "AnonymousClass";
    const properties = this.extractProperties(node.members, sourceFile);

    return {
      id: this.generateId(filePath, name),
      type: "dto",
      name,
      filePath,
      fileHash,
      intent,
      metadata: { kind: "class" },
      properties,
      lastModified: new Date().toISOString(),
    };
  }

  private parseTypeAlias(
    node: ts.TypeAliasDeclaration,
    sourceFile: ts.SourceFile,
    filePath: string,
    fileHash: string,
    intent?: string
  ): GraphNode {
    const name = node.name.text;
    let properties: PropertyInfo[] = [];

    if (ts.isTypeLiteralNode(node.type)) {
      properties = this.extractProperties(node.type.members, sourceFile);
    }

    return {
      id: this.generateId(filePath, name),
      type: "schema",
      name,
      filePath,
      fileHash,
      intent,
      metadata: { kind: "type" },
      properties,
      lastModified: new Date().toISOString(),
    };
  }

  private parseEnum(
    node: ts.EnumDeclaration,
    sourceFile: ts.SourceFile,
    filePath: string,
    fileHash: string,
    intent?: string
  ): GraphNode {
    const name = node.name.text;
    const values = node.members.map((m) => m.name.getText(sourceFile));

    return {
      id: this.generateId(filePath, name),
      type: "enum",
      name,
      filePath,
      fileHash,
      intent,
      metadata: { kind: "enum", values },
      lastModified: new Date().toISOString(),
    };
  }

  private extractProperties(
    members: ts.NodeArray<ts.TypeElement | ts.ClassElement>,
    sourceFile: ts.SourceFile
  ): PropertyInfo[] {
    const properties: PropertyInfo[] = [];

    members.forEach((member) => {
      if (ts.isPropertySignature(member) || ts.isPropertyDeclaration(member)) {
        if (member.name) {
          const name = member.name.getText(sourceFile);
          const type = member.type ? member.type.getText(sourceFile) : "any";
          const required = !member.questionToken;

          // Extract JSDoc comment for field-level intent
          const description = this.extractPropertyDescription(member, sourceFile);

          properties.push({ name, type, required, description });
        }
      }
    });

    return properties;
  }

  private extractPropertyDescription(node: ts.Node, sourceFile: ts.SourceFile): string | undefined {
    const jsDoc = (node as any).jsDoc;
    if (!jsDoc || jsDoc.length === 0) return undefined;

    for (const doc of jsDoc) {
      const comment = doc.comment;
      if (typeof comment === "string") {
        return comment.trim();
      }
    }
    return undefined;
  }

  private extractBaseType(typeStr: string): string {
    typeStr = typeStr.replace(/\[\]/g, "");
    const arrayMatch = typeStr.match(/Array<([^>]+)>/);
    if (arrayMatch) return arrayMatch[1].trim();
    const recordMatch = typeStr.match(/Record<[^,]+,\s*([^>]+)>/);
    if (recordMatch) return recordMatch[1].trim();
    typeStr = typeStr.split("|")[0].trim();
    typeStr = typeStr.replace(/\?/g, "").trim();
    return typeStr;
  }

  private generateId(filePath: string, name: string): string {
    const relativePath = filePath.replace(process.cwd(), "").replace(/^\//, "");
    return `${relativePath}:${name}`.replace(/[^a-zA-Z0-9:/_.-]/g, "_");
  }

  private resolveImportPath(importPath: string, fromFile: string): string {
    const dir = path.dirname(fromFile);
    let resolved = path.resolve(dir, importPath);

    // Add .ts extension if not present
    if (!resolved.endsWith(".ts") && !resolved.endsWith(".tsx")) {
      resolved += ".ts";
    }

    return resolved.replace(process.cwd() + "/", "");
  }

  /**
   * Convert absolute path to relative path from project root
   */
  private toRelativePath(absolutePath: string): string {
    const cwd = process.cwd();
    if (absolutePath.startsWith(cwd)) {
      return absolutePath.substring(cwd.length + 1);
    }
    return absolutePath;
  }
}

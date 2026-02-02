/**
 * OpenAPI/Swagger scanner
 * Extracts API endpoints and schema definitions
 */

import * as fs from "fs";
import * as yaml from "js-yaml";
import { GraphNode, GraphEdge } from "../core/types.js";

export class OpenAPIScanner {
  async scan(
    filePath: string,
    fileHash: string
  ): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    const content = fs.readFileSync(filePath, "utf-8");

    // Normalize to relative path
    const relativePath = this.toRelativePath(filePath);

    const spec = filePath.endsWith(".json") ? JSON.parse(content) : yaml.load(content);

    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    // Extract schemas/components
    if (spec.components?.schemas) {
      for (const [name, schema] of Object.entries(spec.components.schemas)) {
        const node = this.parseSchema(name, schema as any, relativePath, fileHash);
        nodes.push(node);
      }
    }

    // Extract API endpoints
    if (spec.paths) {
      for (const [pathStr, pathItem] of Object.entries(spec.paths)) {
        for (const [method, operation] of Object.entries(pathItem as any)) {
          if (["get", "post", "put", "delete", "patch"].includes(method)) {
            const apiNode = this.parseOperation(pathStr, method, operation, relativePath, fileHash);
            nodes.push(apiNode);

            // Create edges to referenced schemas
            const refs = this.extractSchemaRefs(operation);
            refs.forEach((ref) => {
              edges.push({
                id: `${apiNode.id}-uses-${ref}`,
                source: apiNode.id,
                target: `${relativePath}:${ref}`,
                type: "uses",
                confidence: 1.0,
              });
            });
          }
        }
      }
    }

    return { nodes, edges };
  }

  private parseSchema(name: string, schema: any, filePath: string, fileHash: string): GraphNode {
    const properties = schema.properties
      ? Object.entries(schema.properties).map(([propName, propSchema]: [string, any]) => ({
          name: propName,
          type: propSchema.type || "object",
          required: schema.required?.includes(propName) || false,
          description: propSchema.description,
        }))
      : [];

    return {
      id: `${filePath}:${name}`,
      type: "schema",
      name,
      filePath,
      fileHash,
      metadata: {
        kind: "openapi-schema",
        description: schema.description,
      },
      properties,
      lastModified: new Date().toISOString(),
    };
  }

  private parseOperation(
    path: string,
    method: string,
    operation: any,
    filePath: string,
    fileHash: string
  ): GraphNode {
    const operationId = operation.operationId || `${method}_${path.replace(/\//g, "_")}`;

    return {
      id: `${filePath}:${operationId}`,
      type: "api",
      name: operationId,
      filePath,
      fileHash,
      metadata: {
        kind: "openapi-operation",
        path,
        method: method.toUpperCase(),
        summary: operation.summary,
        description: operation.description,
      },
      lastModified: new Date().toISOString(),
    };
  }

  private extractSchemaRefs(obj: any, refs: Set<string> = new Set()): string[] {
    if (typeof obj !== "object" || obj === null) {
      return Array.from(refs);
    }

    if (obj.$ref && typeof obj.$ref === "string") {
      // Extract schema name from #/components/schemas/SchemaName
      const match = obj.$ref.match(/#\/components\/schemas\/(.+)/);
      if (match) {
        refs.add(match[1]);
      }
    }

    for (const value of Object.values(obj)) {
      this.extractSchemaRefs(value, refs);
    }

    return Array.from(refs);
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

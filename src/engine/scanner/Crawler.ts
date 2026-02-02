/**
 * Orchestrates file scanning and graph updates
 * Implements incremental crawling with diff detection
 */

import fg from "fast-glob";
import { GraphEngine } from "../graph/GraphEngine.js";
import { TypeScriptScanner } from "./TypeScriptScanner.js";
import { OpenAPIScanner } from "./OpenAPIScanner.js";
import { CrawlResult, GraphNode } from "../core/types.js";

export class Crawler {
  private graphEngine: GraphEngine;
  private tsScanner: TypeScriptScanner;
  private apiScanner: OpenAPIScanner;

  constructor(graphEngine: GraphEngine) {
    this.graphEngine = graphEngine;
    this.tsScanner = new TypeScriptScanner();
    this.tsScanner.setGraphEngine(graphEngine); // Enable field-level tracking
    this.apiScanner = new OpenAPIScanner();
  }

  async crawl(options: { diff?: boolean; patterns?: string[] } = {}): Promise<CrawlResult> {
    const startTime = Date.now();
    const patterns = options.patterns || [
      "**/*.dto.ts",
      "**/*Dto.ts",
      "**/*.schema.ts",
      "**/*Schema.ts",
      "**/*.interface.ts",
      "**/*Interface.ts",
      "**/*.openapi.{json,yaml,yml}",
      "**/*.swagger.{json,yaml,yml}",
      "**/openapi.{json,yaml,yml}",
    ];

    const files = await fg(patterns, {
      ignore: ["node_modules/**", "dist/**", ".git/**"],
      absolute: true,
    });

    const added: GraphNode[] = [];
    const modified: GraphNode[] = [];
    const removed: string[] = [];
    let unchanged = 0;

    // Track existing nodes
    const existingNodeIds = new Set(this.graphEngine.getAllNodes().map((n) => n.id));
    const processedNodeIds = new Set<string>();

    for (const file of files) {
      const fileHash = this.graphEngine.computeFileHash(file);

      let scanResult: { nodes: GraphNode[]; edges: any[] };

      if (file.match(/\.(json|yaml|yml)$/)) {
        scanResult = await this.apiScanner.scan(file, fileHash);
      } else {
        scanResult = this.tsScanner.scan(file, fileHash);
      }

      for (const node of scanResult.nodes) {
        processedNodeIds.add(node.id);

        if (options.diff && !this.graphEngine.hasNodeChanged(node.id, fileHash)) {
          unchanged++;
          continue;
        }

        const existing = this.graphEngine.getNode(node.id);
        if (existing) {
          modified.push(node);
        } else {
          added.push(node);
        }

        this.graphEngine.addNode(node);
      }

      for (const edge of scanResult.edges) {
        this.graphEngine.addEdge(edge);
      }
    }

    // Find removed nodes
    for (const nodeId of existingNodeIds) {
      if (!processedNodeIds.has(nodeId)) {
        removed.push(nodeId);
        this.graphEngine.removeNode(nodeId);
      }
    }

    this.graphEngine.updateLastCrawl();
    this.graphEngine.saveGraph();

    const duration = Date.now() - startTime;

    return {
      added,
      modified,
      removed,
      unchanged,
      duration,
    };
  }
}

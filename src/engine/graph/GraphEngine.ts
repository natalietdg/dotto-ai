/**
 * Incremental dependency graph engine
 * Handles diff detection and efficient updates
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { DependencyGraph, GraphNode, GraphEdge, CrawlResult } from "../core/types.js";

export class GraphEngine {
  private graph: DependencyGraph;
  private graphPath: string;

  constructor(graphPath: string = "graph.json") {
    this.graphPath = graphPath;
    this.graph = this.loadGraph();
  }

  private loadGraph(): DependencyGraph {
    if (fs.existsSync(this.graphPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.graphPath, "utf-8"));
        return {
          nodes: new Map(Object.entries(data.nodes || {})),
          edges: new Map(Object.entries(data.edges || {})),
          version: data.version || "1.1.0",
          lastCrawl: data.lastCrawl || new Date().toISOString(),
        };
      } catch (error) {
        console.warn("Failed to load graph, starting fresh");
      }
    }

    return {
      nodes: new Map(),
      edges: new Map(),
      version: "1.1.0",
      lastCrawl: new Date().toISOString(),
    };
  }

  saveGraph(): void {
    const data = {
      nodes: Object.fromEntries(this.graph.nodes),
      edges: Object.fromEntries(this.graph.edges),
      version: this.graph.version,
      lastCrawl: this.graph.lastCrawl,
    };

    fs.writeFileSync(this.graphPath, JSON.stringify(data, null, 2), "utf-8");
  }

  computeFileHash(filePath: string): string {
    const content = fs.readFileSync(filePath, "utf-8");
    return crypto.createHash("sha256").update(content).digest("hex");
  }

  hasNodeChanged(nodeId: string, currentHash: string): boolean {
    const existing = this.graph.nodes.get(nodeId);
    return !existing || existing.fileHash !== currentHash;
  }

  addNode(node: GraphNode): void {
    this.graph.nodes.set(node.id, node);
  }

  removeNode(nodeId: string): void {
    this.graph.nodes.delete(nodeId);
    // Remove associated edges
    for (const [edgeId, edge] of this.graph.edges) {
      if (edge.source === nodeId || edge.target === nodeId) {
        this.graph.edges.delete(edgeId);
      }
    }
  }

  addEdge(edge: GraphEdge): void {
    this.graph.edges.set(edge.id, edge);
  }

  getNode(nodeId: string): GraphNode | undefined {
    return this.graph.nodes.get(nodeId);
  }

  getAllNodes(): GraphNode[] {
    return Array.from(this.graph.nodes.values());
  }

  getAllEdges(): GraphEdge[] {
    return Array.from(this.graph.edges.values());
  }

  getOutgoingEdges(nodeId: string): GraphEdge[] {
    return this.getAllEdges().filter((e) => e.source === nodeId);
  }

  getIncomingEdges(nodeId: string): GraphEdge[] {
    return this.getAllEdges().filter((e) => e.target === nodeId);
  }

  /**
   * Get all downstream dependents (BFS)
   */
  getDownstream(
    nodeId: string,
    maxDepth: number = 3
  ): Array<{ nodeId: string; distance: number; path: string[] }> {
    const visited = new Set<string>();
    const queue: Array<{ id: string; distance: number; path: string[] }> = [
      { id: nodeId, distance: 0, path: [nodeId] },
    ];
    const result: Array<{ nodeId: string; distance: number; path: string[] }> = [];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (visited.has(current.id) || current.distance > maxDepth) {
        continue;
      }

      visited.add(current.id);

      if (current.id !== nodeId) {
        result.push({
          nodeId: current.id,
          distance: current.distance,
          path: current.path,
        });
      }

      // Add dependents
      const outgoing = this.getOutgoingEdges(current.id);
      for (const edge of outgoing) {
        if (!visited.has(edge.target)) {
          queue.push({
            id: edge.target,
            distance: current.distance + 1,
            path: [...current.path, edge.target],
          });
        }
      }
    }

    return result;
  }

  /**
   * Get reverse provenance chain
   */
  getProvenance(nodeId: string): Array<{ nodeId: string; relationship: string }> {
    const visited = new Set<string>();
    const result: Array<{ nodeId: string; relationship: string }> = [];

    const traverse = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);

      const incoming = this.getIncomingEdges(id);
      for (const edge of incoming) {
        result.push({
          nodeId: edge.source,
          relationship: edge.type,
        });
        traverse(edge.source);
      }
    };

    traverse(nodeId);
    return result;
  }

  updateLastCrawl(): void {
    this.graph.lastCrawl = new Date().toISOString();
  }
}

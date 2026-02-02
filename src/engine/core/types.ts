/**
 * Core type definitions for dotto
 * Enterprise-grade schema dependency analysis
 */

export type NodeType = "schema" | "service" | "api" | "dto" | "enum";
export type EdgeType = "uses" | "defines" | "calls" | "extends" | "implements";

export interface GraphNode {
  id: string;
  type: NodeType;
  name: string;
  filePath: string;
  fileHash: string;
  intent?: string; // Parsed from @intent comments
  metadata: Record<string, any>;
  properties?: PropertyInfo[];
  lastModified: string;
}

export interface PropertyInfo {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

export interface GraphEdge {
  id: string;
  source: string; // Node ID
  target: string; // Node ID
  type: EdgeType;
  confidence: number; // 0-1
  metadata?: Record<string, any>;
}

export interface DependencyGraph {
  nodes: Map<string, GraphNode>;
  edges: Map<string, GraphEdge>;
  version: string;
  lastCrawl: string;
}

export interface CrawlResult {
  added: GraphNode[];
  modified: GraphNode[];
  removed: string[]; // Node IDs
  unchanged: number;
  duration: number; // ms
}

export interface ImpactAnalysis {
  nodeId: string;
  depth: number;
  impacted: Array<{
    nodeId: string;
    distance: number;
    path: string[];
    confidence: number;
  }>;
}

export interface ProvenanceChain {
  nodeId: string;
  chain: Array<{
    nodeId: string;
    relationship: string;
    confidence: number;
  }>;
}

export interface CompatibilityIssue {
  nodeId: string;
  type: "type_change" | "enum_change" | "required_change" | "intent_change";
  severity: "breaking" | "warning" | "info";
  message: string;
  before?: any;
  after?: any;
}

export interface ProofRef {
  backend: string;
  id: string;
  timestamp: string;
  link?: string;
}

export interface ProofEvent {
  nodeId: string;
  eventType: "created" | "modified" | "deleted";
  hash: string;
  metadata: Record<string, any>;
  timestamp: string;
}

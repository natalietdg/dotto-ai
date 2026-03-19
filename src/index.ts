/**
 * dotto-ai — Governance protocol for software change.
 * AI assists. Humans authorize. Receipts enforce.
 *
 * @packageDocumentation
 */

// Core engine
export {
  generateArtifacts,
  loadArtifacts,
  assertDottoInstalled,
  GraphEngine,
  Crawler,
  SchemaDiffer,
  GitScanner,
  ImpactAnalyzer,
  IntentDriftDetector,
} from "./engine/dotto.js";

export type { DottoArtifacts, DottoGenerateConfig } from "./engine/dotto.js";

export type { SchemaDiff } from "./engine/diff/SchemaDiffer.js";
export type { IntentDrift } from "./engine/analysis/IntentDriftDetector.js";

// Core types
export type {
  NodeType,
  EdgeType,
  GraphNode,
  PropertyInfo,
  GraphEdge,
  DependencyGraph,
  CrawlResult,
  ImpactAnalysis,
  ProvenanceChain,
  CompatibilityIssue,
  ProofRef,
  ProofEvent,
} from "./engine/core/types.js";

// Proof backends
export {
  HederaBackend,
  NoneBackend,
  EpochManager,
  HederaNFTService,
  createProofBackend,
} from "./engine/proof/index.js";

export type { NftProof } from "./engine/proof/HederaNFTService.js";
export type { Epoch, EpochArtifact } from "./engine/proof/EpochManager.js";

// HCS-10 agent
export { HCS10AgentManager } from "./engine/hcs10/HCS10AgentManager.js";

export type { AgentState, GovernanceEvent, ActiveConnection } from "./engine/hcs10/types.js";

// Cryptographic receipts
export {
  createReceipt,
  verifyReceipt,
  anchorReceiptToHedera,
  formatReceiptForDisplay,
  upgradeLegacyReceipt,
  computeArtifactsHash,
  signPayload,
  verifySignature,
  isExpired,
  initializeKMS,
  getKMSSigner,
  getNFTServiceInstance,
} from "./crypto/receipt.js";

export type {
  AuthorizationReceipt,
  ReceiptVersion,
  ReceiptAlgorithm,
  HederaProof,
  ReceiptPayload,
  VerificationResult,
  CreateReceiptOptions,
} from "./crypto/receipt.js";

// KMS signer
export { KMSSigner } from "./crypto/kms-signer.js";

// AI Governor
export { runGovernor, extractChangeSignature, extractDriftVectors } from "./gemini/governor.js";

export type {
  GovernorDecision,
  GovernorRunConfig,
  GovernorRunContext,
  DriftVector,
} from "./gemini/governor.js";

// Intent utilities
export { extractIntentsFromContent, intentCoversChange } from "./engine/intent.js";

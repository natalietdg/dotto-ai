/**
 * HCS-10 Agent types for dotto governance integration
 */

export type AgentState = {
  accountId: string;
  // privateKey intentionally NOT persisted — loaded from HEDERA_PRIVATE_KEY env var at runtime
  operatorId: string;
  inboundTopicId: string;
  outboundTopicId: string;
  profileTopicId: string;
  registeredAt: string;
  network: string;
};

export type GovernanceEvent = {
  type: "decision" | "receipt" | "nft_mint" | "epoch";
  change_id: string;
  ruling?: string;
  risk_level?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
};

export type ActiveConnection = {
  connectionTopicId: string;
  remoteAccountId: string;
  connectedAt: string;
  lastMessageAt?: string;
};

/**
 * HCS-10 Agent Manager for dotto governance
 *
 * Registers dotto as a discoverable AI governance agent on the Hedera network
 * via the HCS-10 OpenConvAI protocol and Hashgraph Online Registry.
 *
 * Capabilities:
 * - Agent registration and discovery via HOL Registry
 * - Accept connection requests from other agents
 * - Respond to governance queries via HCS-10 messaging
 * - Log governance events to outbound topic for public auditability
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AgentState, GovernanceEvent, ActiveConnection } from "./types.js";

// The @hashgraphonline/standards-sdk is dynamically imported at runtime
// to avoid build-time resolution issues. We type the client as any.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HCS10ClientType = any;

const STATE_DIR = path.resolve(".dotto");
const STATE_FILE = path.join(STATE_DIR, "hcs10-agent.json");

const AGENT_NAME = "dotto-ai";
const AGENT_DESCRIPTION =
  "Autonomous change-control governance agent. Analyzes schema changes, " +
  "assesses impact, and issues cryptographic authorization receipts. " +
  "No deployment without a valid receipt.";

const POLL_INTERVAL_MS = 15_000; // 15 seconds

export class HCS10AgentManager {
  private client: HCS10ClientType | null = null;
  private agentState: AgentState | null = null;
  private connections: Map<string, ActiveConnection> = new Map();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastProcessedTimestamp: number = 0;

  /**
   * Initialize the agent: register or rehydrate from saved state.
   */
  async initialize(): Promise<void> {
    const accountId = process.env.HEDERA_ACCOUNT_ID;
    const privateKey = process.env.HEDERA_PRIVATE_KEY;

    if (!accountId || !privateKey) {
      throw new Error(
        "Hedera credentials not configured. Set HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY in .env"
      );
    }

    const network = (process.env.HEDERA_NETWORK || "testnet") as "testnet" | "mainnet";

    // Dynamic import to avoid requiring the package at build time
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { HCS10Client } = (await import("@hashgraphonline/standards-sdk")) as any;

    this.client = new HCS10Client({
      network,
      operatorId: accountId,
      operatorPrivateKey: privateKey,
      logLevel: "warn",
    });

    // Try to load saved agent state
    const saved = await this.loadState();
    if (saved && saved.network === network) {
      this.agentState = saved;
      console.log(`[HCS-10] Loaded agent: ${saved.accountId} (inbound: ${saved.inboundTopicId})`);
      return;
    }

    // Register new agent
    await this.registerAgent();
  }

  /**
   * Register dotto as an HCS-10 agent in the HOL Registry.
   */
  private async registerAgent(): Promise<void> {
    if (!this.client) throw new Error("Client not initialized");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { AgentBuilder, AIAgentCapability } =
      (await import("@hashgraphonline/standards-sdk")) as any;

    console.log("[HCS-10] Registering dotto as governance agent...");

    const agentBuilder = new AgentBuilder()
      .setName(AGENT_NAME)
      .setDescription(AGENT_DESCRIPTION)
      .setAgentType("manual")
      .setCapabilities([AIAgentCapability.TEXT_GENERATION, AIAgentCapability.KNOWLEDGE_RETRIEVAL])
      .setModel("gemini-2.0-flash")
      .setNetwork((process.env.HEDERA_NETWORK || "testnet") as "testnet" | "mainnet")
      .setMetadata({
        creator: "dotto-ai",
        properties: {
          specialization: "schema governance",
          capabilities: [
            "drift detection",
            "impact analysis",
            "governance decisions",
            "authorization receipts",
          ],
        },
      });

    const result = await this.client.createAndRegisterAgent(agentBuilder, {
      progressCallback: (progress: { stage: string; progressPercent: number }) => {
        console.log(`[HCS-10] ${progress.stage}: ${progress.progressPercent}%`);
      },
    });

    if (!result.success || !result.metadata) {
      throw new Error(`Agent registration failed: ${result.error || "unknown error"}`);
    }

    this.agentState = {
      accountId: result.metadata.accountId,
      // privateKey NOT stored — loaded from env var at runtime
      operatorId: result.metadata.operatorId,
      inboundTopicId: result.metadata.inboundTopicId,
      outboundTopicId: result.metadata.outboundTopicId,
      profileTopicId: result.metadata.profileTopicId,
      registeredAt: new Date().toISOString(),
      network: process.env.HEDERA_NETWORK || "testnet",
    };

    await this.saveState(this.agentState);

    console.log(
      `[HCS-10] Agent registered: ${this.agentState.accountId} ` +
        `(inbound: ${this.agentState.inboundTopicId}, outbound: ${this.agentState.outboundTopicId})`
    );
  }

  /**
   * Start polling for inbound connection requests and messages.
   */
  startPolling(): void {
    if (this.pollTimer || !this.client || !this.agentState) return;

    console.log("[HCS-10] Polling started");

    this.pollTimer = setInterval(async () => {
      try {
        await this.pollInbound();
        await this.pollConnections();
      } catch (err) {
        console.error("[HCS-10] Poll error:", err);
      }
    }, POLL_INTERVAL_MS);
  }

  /**
   * Poll inbound topic for connection requests and direct messages.
   */
  private async pollInbound(): Promise<void> {
    if (!this.client || !this.agentState) return;

    const { messages } = await this.client.getMessages(this.agentState.inboundTopicId);

    const newMessages = messages.filter(
      (msg: { consensus_timestamp: number }) =>
        msg.consensus_timestamp > this.lastProcessedTimestamp
    );

    for (const msg of newMessages) {
      const op = (msg as { op: string }).op;
      const timestamp = (msg as { consensus_timestamp: number }).consensus_timestamp;

      try {
        if (op === "connection_request") {
          await this.handleConnectionRequest(msg);
        } else if (op === "message") {
          // Direct message on inbound topic (no prior connection required)
          await this.handleDirectMessage(msg);
        }
      } catch (err) {
        console.error(`[HCS-10] Failed to handle inbound ${op}:`, err);
      }

      this.lastProcessedTimestamp = Math.max(this.lastProcessedTimestamp, timestamp);
    }
  }

  /**
   * Handle an inbound connection request — accept and send welcome.
   */
  private async handleConnectionRequest(request: unknown): Promise<void> {
    if (!this.client || !this.agentState) return;

    const requestingAccountId = (request as { operator_id: string }).operator_id.split("@")[1];
    const connectionRequestId = (request as { sequence_number: number }).sequence_number;

    console.log(`[HCS-10] Connection request from ${requestingAccountId}`);

    const response = await this.client.handleConnectionRequest(
      this.agentState.inboundTopicId,
      requestingAccountId,
      connectionRequestId
    );

    if (response.connectionTopicId) {
      this.connections.set(response.connectionTopicId, {
        connectionTopicId: response.connectionTopicId,
        remoteAccountId: requestingAccountId,
        connectedAt: new Date().toISOString(),
      });

      // Send welcome message
      await this.sendTopicMessage(
        response.connectionTopicId,
        JSON.stringify({
          type: "welcome",
          agent: AGENT_NAME,
          description: AGENT_DESCRIPTION,
          commands: [
            "What's your governance status?",
            "Show me the latest receipt",
            "What decisions have you made?",
            "How do I request a governance review?",
          ],
        })
      );

      console.log(`[HCS-10] Connected: ${response.connectionTopicId}`);
    }
  }

  /**
   * Handle a direct message on the inbound topic.
   * Any agent can send a query without a connection — dotto responds
   * on the outbound topic so all subscribers see the answer.
   */
  private async handleDirectMessage(msg: unknown): Promise<void> {
    if (!this.agentState) return;

    const content = (msg as { data: string }).data;
    const sender = (msg as { operator_id?: string }).operator_id || "unknown";

    console.log(`[HCS-10] Direct message from ${sender}: ${content.slice(0, 80)}...`);

    // Validate inbound message before processing
    if (!this.isMessageSafe(content)) {
      console.warn(`[HCS-10] Rejected unsafe direct message from ${sender}`);
      return;
    }

    const response = await this.generateGovernanceResponse(content);

    // Respond on outbound topic — publicly visible to all subscribers
    await this.sendTopicMessage(
      this.agentState.outboundTopicId,
      JSON.stringify({
        protocol: "dotto-governance",
        type: "query_response",
        in_reply_to: sender,
        query: content.slice(0, 200),
        response: JSON.parse(response),
        timestamp: new Date().toISOString(),
      })
    );

    console.log(`[HCS-10] Responded to ${sender} on outbound topic`);
  }

  /**
   * Poll active connections for new messages.
   * Responds on the connection topic (private) AND outbound topic (public).
   */
  private async pollConnections(): Promise<void> {
    if (!this.client || !this.agentState) return;

    for (const [topicId, conn] of this.connections) {
      try {
        const { messages } = await this.client.getMessages(topicId);

        const newMessages = messages.filter(
          (msg: { op: string; consensus_timestamp: number; operator_id: string }) =>
            msg.op === "message" &&
            msg.consensus_timestamp >
              (conn.lastMessageAt ? new Date(conn.lastMessageAt).getTime() / 1000 : 0) &&
            !msg.operator_id.includes(this.agentState?.accountId || "")
        );

        for (const msg of newMessages) {
          const content = (msg as { data: string }).data;

          // Validate inbound message before processing
          if (!this.isMessageSafe(content)) {
            console.warn(`[HCS-10] Rejected unsafe message from ${conn.remoteAccountId}`);
            await this.sendTopicMessage(
              topicId,
              JSON.stringify({ type: "error", message: "Message rejected: invalid content." })
            );
            conn.lastMessageAt = new Date().toISOString();
            continue;
          }

          const response = await this.generateGovernanceResponse(content);

          // Reply on private connection topic
          await this.sendTopicMessage(topicId, response);

          // Also broadcast to outbound topic for subscribers
          await this.sendTopicMessage(
            this.agentState.outboundTopicId,
            JSON.stringify({
              protocol: "dotto-governance",
              type: "query_response",
              connection: topicId,
              response: JSON.parse(response),
              timestamp: new Date().toISOString(),
            })
          );

          conn.lastMessageAt = new Date().toISOString();
        }
      } catch (err) {
        console.error(`[HCS-10] Error polling connection ${topicId}:`, err);
      }
    }
  }

  /**
   * Validate that an inbound message is safe to process.
   * Rejects messages that are too large, contain injection attempts,
   * or look like malicious payloads.
   */
  private isMessageSafe(content: string): boolean {
    // Size limit — 2KB max for a governance query
    if (content.length > 2048) return false;

    // Reject embedded script/HTML injection
    if (/<script[\s>]/i.test(content)) return false;
    if (/javascript:/i.test(content)) return false;

    // Reject common prompt injection markers
    if (/ignore previous instructions/i.test(content)) return false;
    if (/system:\s*you are/i.test(content)) return false;
    if (/\bsudo\b.*\brm\b/i.test(content)) return false;

    // Reject path traversal attempts
    if (/\.\.[/\\]/.test(content)) return false;

    return true;
  }

  /**
   * Generate a governance response using Gemini for natural language understanding.
   * Falls back to structured responses if Gemini is unavailable.
   */
  private async generateGovernanceResponse(message: string): Promise<string> {
    // Try Gemini-powered natural language response
    const nlResponse = await this.generateNLResponse(message);
    if (nlResponse) return nlResponse;

    // Fallback: structured keyword responses with real data
    return await this.generateFallbackResponse(message);
  }

  /**
   * Use Gemini to generate a natural language governance response.
   */
  private async generateNLResponse(message: string): Promise<string | null> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;

    try {
      // Load recent governance context
      const context = await this.loadGovernanceContext();
      const baseUrl = process.env.DOTTO_BASE_URL || `http://localhost:${process.env.PORT || 5000}`;

      const modelName = process.env.GEMINI_MODEL || "gemini-2.0-flash";
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: modelName });

      const systemPrompt = `You are dotto-ai, an autonomous governance agent for software change control registered on the Hedera network via HCS-10.

Your identity:
- Agent: ${AGENT_NAME}
- Account: ${this.agentState?.accountId || "unknown"}
- Inbound topic: ${this.agentState?.inboundTopicId || "unknown"}
- Outbound topic: ${this.agentState?.outboundTopicId || "unknown"}
- Network: ${this.agentState?.network || "testnet"}
- Status: operational
- Active connections: ${this.connections.size}

Your capabilities:
- Detect schema drift (API contracts, database schemas, config changes)
- Analyze blast radius and downstream impact
- Make governance decisions: APPROVE (safe), BLOCK (dangerous), ESCALATE (needs human)
- Issue cryptographic authorization receipts (HMAC-SHA256)
- Anchor receipts to Hedera Consensus Service (immutable proof)
- Mint governance receipts as NFTs on Hedera Token Service
- Batch governance events into Merkle epochs for cost-efficient anchoring

How governance works:
1. Developer submits a code change
2. Dotto scans for schema drift and breaking changes
3. AI evaluates risk against policy and precedent
4. Decision issued: APPROVE / BLOCK / ESCALATE
5. Cryptographic receipt generated and anchored to Hedera
6. No deployment without a valid receipt

API endpoints:
- POST ${baseUrl}/run — trigger governance analysis
- POST ${baseUrl}/feedback — record human feedback on decisions
- GET ${baseUrl}/hedera/proof — view full Hedera proof chain
- GET ${baseUrl}/hedera/agent — agent registration info
- GET ${baseUrl}/hedera/epochs — Merkle epoch history
- Viewer UI: ${baseUrl}

${context}

Instructions:
- Respond conversationally and helpfully in plain text (not JSON)
- Keep responses concise (2-4 sentences for simple queries, more for complex ones)
- If asked to perform a governance review, explain how to submit via the API
- If asked about decision history, share what you know from the context
- If asked about your Hedera integration, explain the proof chain
- Always be honest about what you can and cannot do
- You are speaking to another agent or developer via HCS-10 messaging`;

      const result = await model.generateContent({
        contents: [
          { role: "user", parts: [{ text: systemPrompt }] },
          {
            role: "model",
            parts: [{ text: "Understood. I'm ready to respond as dotto-ai governance agent." }],
          },
          { role: "user", parts: [{ text: message }] },
        ],
      });

      const text = result.response.text().trim();
      if (!text) return null;

      return JSON.stringify({
        type: "governance_response",
        agent: AGENT_NAME,
        message: text,
      });
    } catch (err) {
      console.error("[HCS-10] Gemini response failed, using fallback:", err);
      return null;
    }
  }

  /**
   * Load recent governance context for Gemini prompts.
   */
  private async loadGovernanceContext(): Promise<string> {
    const lines: string[] = [];

    try {
      const decisionsPath = path.resolve("src/memory/decisions.json");
      const raw = await readFile(decisionsPath, "utf8");
      const memory = JSON.parse(raw) as {
        decisions?: Array<{
          timestamp: string;
          change_id: string;
          decision: string;
          risk_level: string;
          reasoning: string[];
          human_feedback?: { outcome: string; override_decision?: string };
        }>;
      };

      const decisions = memory.decisions || [];
      const recent = decisions.slice(-5); // Last 5 decisions

      if (recent.length > 0) {
        lines.push(`Recent governance decisions (last ${recent.length}):`);
        for (const d of recent) {
          const feedback = d.human_feedback
            ? ` → Human: ${d.human_feedback.outcome}${d.human_feedback.override_decision ? ` (override: ${d.human_feedback.override_decision})` : ""}`
            : "";
          lines.push(
            `  - ${d.change_id}: ${d.decision.toUpperCase()} (${d.risk_level} risk)${feedback}`
          );
          if (d.reasoning?.[0]) lines.push(`    Reason: ${d.reasoning[0]}`);
        }
        lines.push(`Total decisions in memory: ${decisions.length}`);
      } else {
        lines.push("No governance decisions recorded yet.");
      }
    } catch {
      lines.push("Decision history unavailable.");
    }

    return lines.join("\n");
  }

  /**
   * Fallback structured response when Gemini is unavailable.
   * Returns real governance data from disk when available.
   */
  private async generateFallbackResponse(message: string): Promise<string> {
    const lower = message.toLowerCase();

    if (lower.includes("status") || lower.includes("health")) {
      const decisions = await this.loadDecisionsSummary();
      return JSON.stringify({
        type: "status",
        agent: AGENT_NAME,
        account: this.agentState?.accountId || "unknown",
        network: this.agentState?.network || "testnet",
        status: "operational",
        capabilities: [
          "drift detection",
          "impact analysis",
          "governance decisions",
          "receipt anchoring",
        ],
        active_connections: this.connections.size,
        total_decisions: decisions.total,
        last_decision: decisions.latest,
        message: "Dotto governance agent is operational. Send a schema change for review.",
      });
    }

    if (lower.includes("receipt") || lower.includes("proof") || lower.includes("anchor")) {
      const receipt = await this.loadLatestReceipt();
      if (receipt) {
        return JSON.stringify({
          type: "receipt",
          agent: AGENT_NAME,
          message: "Latest authorization receipt:",
          receipt: {
            change_id: receipt.change_id,
            ruling: receipt.ruling,
            risk_level: receipt.risk_level,
            timestamp: receipt.timestamp,
            algorithm: receipt.algorithm,
            hedera_proof: receipt.hedera_proof || null,
            nft_proof: receipt.nft_proof || null,
          },
        });
      }
      return JSON.stringify({
        type: "info",
        agent: AGENT_NAME,
        message: "No receipts anchored yet. Trigger a governance review to generate one.",
      });
    }

    if (lower.includes("review") || lower.includes("analyze") || lower.includes("deploy")) {
      const baseUrl = process.env.DOTTO_BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
      return JSON.stringify({
        type: "governance_info",
        agent: AGENT_NAME,
        message:
          "To request a governance review, submit a change via the dotto API. " +
          "The agent will analyze drift, assess impact, and issue an authorization receipt.",
        api_endpoint: `${baseUrl}/run`,
        proof_endpoint: `${baseUrl}/hedera/proof`,
        viewer_url: baseUrl,
      });
    }

    if (lower.includes("history") || lower.includes("decision")) {
      const decisions = await this.loadDecisionsSummary();
      return JSON.stringify({
        type: "decision_history",
        agent: AGENT_NAME,
        total_decisions: decisions.total,
        recent: decisions.recent,
        message: `${decisions.total} governance decisions recorded. Showing last ${decisions.recent.length}.`,
      });
    }

    return JSON.stringify({
      type: "help",
      agent: AGENT_NAME,
      account: this.agentState?.accountId || "unknown",
      message:
        "I am dotto-ai, a governance agent for software schema changes. " +
        "Ask me: 'What is your status?', 'Show me the latest receipt', " +
        "'What decisions have you made?', or 'How do I request a review?'",
    });
  }

  /**
   * Load the latest authorization receipt from disk.
   */
  private async loadLatestReceipt(): Promise<Record<string, unknown> | null> {
    try {
      const receiptPath = path.resolve("artifacts", "authorization-receipt.json");
      const raw = await readFile(receiptPath, "utf8");
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  /**
   * Load a summary of governance decisions from memory.
   */
  private async loadDecisionsSummary(): Promise<{
    total: number;
    latest: Record<string, unknown> | null;
    recent: Array<{ change_id: string; decision: string; risk_level: string; timestamp: string }>;
  }> {
    try {
      const decisionsPath = path.resolve("src/memory/decisions.json");
      const raw = await readFile(decisionsPath, "utf8");
      const memory = JSON.parse(raw) as {
        decisions?: Array<{
          timestamp: string;
          change_id: string;
          decision: string;
          risk_level: string;
          human_feedback?: { outcome: string; override_decision?: string };
        }>;
      };

      const decisions = memory.decisions || [];
      const recent = decisions.slice(-5).map((d) => ({
        change_id: d.change_id,
        decision: d.decision,
        risk_level: d.risk_level,
        timestamp: d.timestamp,
        human_override: d.human_feedback?.override_decision || null,
      }));

      return {
        total: decisions.length,
        latest:
          decisions.length > 0
            ? (decisions[decisions.length - 1] as Record<string, unknown>)
            : null,
        recent: recent as Array<{
          change_id: string;
          decision: string;
          risk_level: string;
          timestamp: string;
        }>,
      };
    } catch {
      return { total: 0, latest: null, recent: [] };
    }
  }

  /**
   * Send a message to an HCS topic using the Hedera SDK directly.
   * Bypasses HCS10Client.sendMessage to avoid the HCS-11 memo lookup
   * on the operator account (which may differ from the registered agent account).
   */
  private async sendTopicMessage(topicId: string, message: string): Promise<void> {
    const accountId = process.env.HEDERA_ACCOUNT_ID;
    const privateKey = process.env.HEDERA_PRIVATE_KEY;
    if (!accountId || !privateKey) return;

    const { Client, TopicMessageSubmitTransaction, AccountId, PrivateKey } =
      await import("@hashgraph/sdk");

    const network = (process.env.HEDERA_NETWORK || "testnet") as "testnet" | "mainnet";
    const client = network === "testnet" ? Client.forTestnet() : Client.forMainnet();
    client.setOperator(AccountId.fromString(accountId), PrivateKey.fromString(privateKey));

    await new TopicMessageSubmitTransaction({ topicId, message }).execute(client);
    await client.close();
  }

  /**
   * Log a governance event to the outbound topic for public auditability.
   */
  async logGovernanceEvent(event: GovernanceEvent): Promise<void> {
    if (!this.agentState) return;

    try {
      await this.sendTopicMessage(
        this.agentState.outboundTopicId,
        JSON.stringify({ protocol: "dotto-governance", ...event })
      );
    } catch (err) {
      console.error("[HCS-10] Failed to log governance event:", err);
    }
  }

  /**
   * Get agent info for API responses.
   */
  getAgentInfo(): {
    registered: boolean;
    accountId: string | null;
    inboundTopicId: string | null;
    outboundTopicId: string | null;
    network: string | null;
    registeredAt: string | null;
    activeConnections: number;
  } {
    return {
      registered: this.agentState !== null,
      accountId: this.agentState?.accountId || null,
      inboundTopicId: this.agentState?.inboundTopicId || null,
      outboundTopicId: this.agentState?.outboundTopicId || null,
      network: this.agentState?.network || null,
      registeredAt: this.agentState?.registeredAt || null,
      activeConnections: this.connections.size,
    };
  }

  /**
   * Stop polling and clean up.
   */
  async stop(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    console.log("[HCS-10] Agent stopped");
  }

  private async loadState(): Promise<AgentState | null> {
    try {
      const raw = await readFile(STATE_FILE, "utf8");
      return JSON.parse(raw) as AgentState;
    } catch {
      return null;
    }
  }

  private async saveState(state: AgentState): Promise<void> {
    await mkdir(STATE_DIR, { recursive: true });
    await writeFile(STATE_FILE, JSON.stringify(state, null, 2) + "\n", "utf8");
  }
}

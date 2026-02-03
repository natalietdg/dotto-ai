import { readFile } from "node:fs/promises";
import path from "node:path";
import { GoogleGenerativeAI } from "@google/generative-ai";

import type { DottoArtifacts } from "../engine/dotto.js";

export type GovernorDecision = {
  decision: "approve" | "block" | "escalate";
  risk_level: "low" | "medium" | "high";
  insight?: string; // Key finding quote from Gemini - the headline shown to humans
  reasoning: string[];
  conditions: string[];
  thinking?: string; // Raw chain-of-thought from Gemini
  auto_authorized?: boolean;
  precedent_match?: {
    change_id: string;
    timestamp: string;
    similarity: number;
  };
};

export type GovernorRunConfig = {
  artifactsDir: string;
  policyPath: string;
  memoryPath: string;
  model?: string;
};

export type GovernorRunContext = {
  change_id?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(p: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  const timeout = new Promise<never>((_resolve, reject) => {
    const id = setTimeout(() => {
      clearTimeout(id);
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  return Promise.race([p, timeout]);
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

async function readJson(filePath: string): Promise<unknown> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

// Drift as vector, not string
type DriftVector = {
  entity: string;
  breaking: boolean;
  changeType: "added" | "modified" | "removed";
};

type StoredDecision = {
  timestamp: string;
  change_id: string;
  decision: "approve" | "block" | "escalate";
  risk_level: "low" | "medium" | "high";
  reasoning: string[];
  drift_vectors?: DriftVector[]; // Structured for precedent matching
  human_feedback: {
    outcome: "accepted" | "overridden";
    override_decision?: "approve" | "block";
  };
};

type PrecedentMatch = {
  change_id: string;
  timestamp: string;
  similarity: number;
  decision: "approve" | "block";
};

// Explicit weights for similarity scoring
const SIMILARITY_WEIGHTS = {
  entity: 0.5,
  breaking: 0.25,
  changeType: 0.25,
};

function normalizeEntity(nodeId: string): string {
  // Extract base entity name
  let pattern = nodeId.split(":").pop() || nodeId;
  // Remove common suffixes
  pattern = pattern.replace(/Request|Response|DTO|Schema/gi, "");
  // Collapse related suffixes to base entity
  pattern = pattern.replace(/(Metadata|Amount|Method|Config|Settings)$/i, "");
  return pattern.toLowerCase();
}

function extractDriftVectors(drift: unknown): DriftVector[] {
  if (!drift || typeof drift !== "object") return [];

  const driftObj = drift as Record<string, unknown>;
  const diffs = Array.isArray(driftObj.diffs) ? driftObj.diffs : [];

  const vectors: DriftVector[] = [];
  for (const diff of diffs) {
    if (diff && typeof diff === "object") {
      const d = diff as Record<string, unknown>;
      const nodeId = typeof d.nodeId === "string" ? d.nodeId : "";
      const breaking = d.breaking === true;
      const rawChangeType = typeof d.changeType === "string" ? d.changeType : "modified";

      // Normalize changeType to our enum
      let changeType: "added" | "modified" | "removed" = "modified";
      if (rawChangeType === "added") changeType = "added";
      else if (rawChangeType === "removed" || rawChangeType === "deleted") changeType = "removed";

      vectors.push({
        entity: normalizeEntity(nodeId),
        breaking,
        changeType,
      });
    }
  }
  return vectors;
}

// Compare two drift vectors
function vectorSimilarity(a: DriftVector, b: DriftVector): number {
  let score = 0;

  if (a.entity === b.entity) {
    score += SIMILARITY_WEIGHTS.entity;
  }

  if (a.breaking === b.breaking) {
    score += SIMILARITY_WEIGHTS.breaking;
  }

  if (a.changeType === b.changeType) {
    score += SIMILARITY_WEIGHTS.changeType;
  }

  return score;
}

// Compare two sets of drift vectors
function setSimilarity(current: DriftVector[], prior: DriftVector[]): number {
  if (current.length === 0) return 0;

  let total = 0;
  for (const c of current) {
    let best = 0;
    for (const p of prior) {
      best = Math.max(best, vectorSimilarity(c, p));
    }
    total += best;
  }

  return total / current.length;
}

// Legacy support: extract string signatures for backwards compatibility
function extractChangeSignature(drift: unknown): string[] {
  const vectors = extractDriftVectors(drift);
  return vectors.map((v) => `${v.entity}:${v.breaking ? "breaking" : "safe"}:${v.changeType}`);
}

function findPrecedentMatch(
  currentDrift: unknown,
  memory: unknown,
  threshold: number = 0.6
): PrecedentMatch | null {
  const currentVectors = extractDriftVectors(currentDrift);
  if (currentVectors.length === 0) return null;

  // Get approved decisions from memory
  if (!memory || typeof memory !== "object") return null;
  const memoryObj = memory as Record<string, unknown>;
  const decisions = Array.isArray(memoryObj.decisions)
    ? (memoryObj.decisions as StoredDecision[])
    : [];

  // Only consider decisions that resulted in approval (either direct or override)
  const approvedDecisions = decisions.filter((d) => {
    if (d.human_feedback.outcome === "accepted" && d.decision === "approve") return true;
    if (
      d.human_feedback.outcome === "overridden" &&
      d.human_feedback.override_decision === "approve"
    )
      return true;
    return false;
  });

  if (approvedDecisions.length === 0) return null;

  let bestMatch: PrecedentMatch | null = null;

  for (const prior of approvedDecisions) {
    let similarity = 0;

    // If prior decision has stored drift vectors, use weighted similarity
    if (prior.drift_vectors && prior.drift_vectors.length > 0) {
      similarity = setSimilarity(currentVectors, prior.drift_vectors);
    } else {
      // No drift vectors stored - skip this decision for auto-authorization
      // Text-based matching is too unreliable for precedent matching
      // This decision can still inform Gemini's reasoning, just not auto-authorize
      continue;
    }

    if (similarity >= threshold && (!bestMatch || similarity > bestMatch.similarity)) {
      bestMatch = {
        change_id: prior.change_id,
        timestamp: prior.timestamp,
        similarity,
        decision: "approve",
      };
    }
  }

  return bestMatch;
}

// Export for use in server when storing decisions
export { extractChangeSignature, extractDriftVectors, DriftVector };

function coerceDecision(obj: unknown): GovernorDecision | null {
  if (!obj || typeof obj !== "object") return null;
  const anyObj = obj as Record<string, unknown>;

  const decision = anyObj.decision;
  const risk = anyObj.risk_level;
  const insight = anyObj.insight;
  const reasoning = anyObj.reasoning;
  const conditions = anyObj.conditions;

  const isDecision = decision === "approve" || decision === "block" || decision === "escalate";
  const isRisk = risk === "low" || risk === "medium" || risk === "high";
  const isInsight = typeof insight === "string" || insight === undefined;
  const isReasoning = Array.isArray(reasoning) && reasoning.every((x) => typeof x === "string");
  const isConditions = Array.isArray(conditions) && conditions.every((x) => typeof x === "string");

  if (!isDecision || !isRisk || !isInsight || !isReasoning || !isConditions) return null;

  return {
    decision,
    risk_level: risk,
    insight: typeof insight === "string" ? insight : undefined,
    reasoning,
    conditions,
  };
}

function governorPrompt(inputs: {
  artifacts: DottoArtifacts;
  policy: unknown;
  memory: unknown;
  context?: GovernorRunContext;
}): string {
  return `You are Dotto-AI, an autonomous change-control governor for software systems.

CRITICAL: You do NOT analyze code. Deterministic tools have already done that.
Your role is to make JUDGMENT CALLS UNDER UNCERTAINTY that rule-based systems cannot make.

You receive machine-verified inputs from a deterministic system called dotto:
- graph.json: Dependency graph of schemas, APIs, DTOs, services
- drift.json: Structured diff between Git states (what changed)
- impact.json: Computed blast radius (what systems are affected)
- intent.json: Developer's stated purpose for the change
- policy.json: Governance rules (what's allowed/restricted/forbidden)
- memory.json: Past decisions and human feedback (precedents)

YOUR GOVERNANCE RESPONSIBILITIES:

1. POLICY CONFLICT RESOLUTION
   - Do multiple policies apply? Do they conflict?
   - Example: Security policy allows, but compliance policy forbids
   - You must weigh tradeoffs and decide which takes precedence

2. PRECEDENT REASONING
   - Have similar changes been approved/blocked before?
   - Does past human feedback suggest a pattern?
   - If precedent is ambiguous, acknowledge the uncertainty

3. INTENT VALIDATION
   - Does the developer's stated intent match the actual changes?
   - Are there undisclosed breaking changes?
   - Is the intent clear enough to evaluate?

4. RISK TRADEOFF ANALYSIS
   - Blast radius vs. deployment velocity
   - Short-term risk vs. long-term technical debt
   - Breaking change severity vs. business justification

DECISION OUTPUT:
- APPROVE: Changes align with policy, acceptable risk, clear precedent
- BLOCK: Policy violation, unacceptable risk, or clear counter-precedent
- ESCALATE: Policy conflict, ambiguous precedent, unclear intent, or judgment needed beyond deterministic rules

FORMAT YOUR RESPONSE AS:

<reasoning>
## Change Analysis
[What changed? Breaking or non-breaking?]

## Policy Evaluation
[Which policies apply? Any conflicts?]

## Precedent Check
[Similar past decisions? Human feedback patterns?]

## Risk Assessment
[Blast radius? Severity? Tradeoffs?]

## Intent Validation
[Does stated intent match changes?]

## Judgment
[Your decision rationale - especially note any UNCERTAINTY]
</reasoning>

<decision>
{
  "decision": "approve | block | escalate",
  "risk_level": "low | medium | high",
  "insight": "One sentence key finding that explains WHY this decision was made. This is the headline quote shown to humans.",
  "reasoning": ["summary point 1", "summary point 2", ...],
  "conditions": ["condition 1 if any", ...]
}
</decision>

INPUTS:
${JSON.stringify(inputs, null, 2)}
`;
}

export async function runGovernor(
  config: GovernorRunConfig,
  artifacts: DottoArtifacts,
  context?: GovernorRunContext
): Promise<GovernorDecision> {
  const policy = await readJson(config.policyPath);
  const memory = await readJson(config.memoryPath);

  // Check for precedent match before calling Gemini
  // If a similar change was previously approved, auto-authorize
  const precedentMatch = findPrecedentMatch(artifacts.drift, memory);
  if (precedentMatch && precedentMatch.decision === "approve") {
    return {
      decision: "approve",
      risk_level: "low",
      reasoning: [
        `Auto-authorized via precedent match.`,
        `Prior ruling: ${precedentMatch.change_id} (${new Date(precedentMatch.timestamp).toLocaleDateString()})`,
        `Similarity: ${Math.round(precedentMatch.similarity * 100)}%`,
      ],
      conditions: [
        "This change matches a previously approved pattern.",
        "Human review was not required.",
      ],
      auto_authorized: true,
      precedent_match: {
        change_id: precedentMatch.change_id,
        timestamp: precedentMatch.timestamp,
        similarity: precedentMatch.similarity,
      },
    };
  }

  // Collect all available API keys for fallback on rate limits
  const apiKeys: string[] = [];
  if (process.env.GEMINI_API_KEY) apiKeys.push(process.env.GEMINI_API_KEY);
  if (process.env.GEMINI_API_KEY_2) apiKeys.push(process.env.GEMINI_API_KEY_2);
  if (process.env.GEMINI_API_KEY_3) apiKeys.push(process.env.GEMINI_API_KEY_3);

  if (apiKeys.length === 0) {
    return {
      decision: "escalate",
      risk_level: "high",
      reasoning: [
        "GEMINI_API_KEY is not set, so the governor cannot perform policy and precedent reasoning.",
        `Artifacts loaded from: ${config.artifactsDir}`,
        `Policy loaded from: ${path.resolve(config.policyPath)}`,
        `Memory loaded from: ${path.resolve(config.memoryPath)}`,
      ],
      conditions: ["Set GEMINI_API_KEY in the CI environment to enable Gemini reasoning."],
    };
  }

  const modelName = config.model ?? process.env.GEMINI_MODEL ?? "gemini-3-flash-preview";
  let currentKeyIndex = 0;
  let genAI = new GoogleGenerativeAI(apiKeys[currentKeyIndex]);
  let model = genAI.getGenerativeModel({ model: modelName });

  const prompt = governorPrompt({ artifacts, policy, memory, context });

  const timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS ?? 100000);
  const maxRetries = Number(process.env.GEMINI_MAX_RETRIES ?? 2);

  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await withTimeout(model.generateContent(prompt), timeoutMs, "Gemini request");
      const text = result.response.text();

      console.log({ text });
      // Extract reasoning/thinking and decision from the response
      // Support both <reasoning> (new) and <thinking> (legacy) tags
      const reasoningMatch =
        text.match(/<reasoning>([\s\S]*?)<\/reasoning>/i) ||
        text.match(/<thinking>([\s\S]*?)<\/thinking>/i);
      const decisionMatch = text.match(/<decision>([\s\S]*?)<\/decision>/i);

      const thinking = reasoningMatch ? reasoningMatch[1].trim() : null;
      const decisionText = decisionMatch ? decisionMatch[1].trim() : text;

      let parsed: unknown;
      try {
        const cleaned = decisionText
          .trim()
          .replace(/^```json\s*|^```\s*|```$/gm, "")
          .trim();
        parsed = JSON.parse(cleaned);
      } catch (error) {
        console.log({ error });
        // Fail closed: require a machine-readable output.
        return {
          decision: "escalate",
          risk_level: "high",
          reasoning: ["Gemini response was not valid JSON and cannot be consumed by CI/CD safely."],
          conditions: [
            "Ensure the model is configured to output strict JSON only.",
            `Raw output: ${text}`,
          ],
          thinking: thinking || undefined,
        };
      }

      const decision = coerceDecision(parsed);
      if (!decision) {
        return {
          decision: "escalate",
          risk_level: "high",
          reasoning: ["Gemini returned JSON that does not match the required decision schema."],
          conditions: [
            "Fix the governor prompt or model settings to match the required schema exactly.",
            `Raw JSON: ${text}`,
          ],
          thinking: thinking || undefined,
        };
      }

      // Include the thinking in the decision
      if (thinking) {
        decision.thinking = thinking;
      }

      return decision;
    } catch (err) {
      console.log({ err });
      lastErr = err;

      // Check if this is a rate limit error (429)
      // Google SDK errors have status property directly on the error object
      const errObj = err as { status?: number; statusText?: string; message?: string };
      const errStr = String(err);
      const isRateLimitError =
        errObj.status === 429 ||
        errObj.statusText === "Too Many Requests" ||
        errStr.includes("429") ||
        errStr.includes("Too Many Requests") ||
        errStr.includes("Quota exceeded");

      console.log({
        isRateLimitError,
        status: errObj.status,
        currentKeyIndex,
        totalKeys: apiKeys.length,
      });

      if (isRateLimitError && currentKeyIndex < apiKeys.length - 1) {
        // Switch to next API key
        currentKeyIndex++;
        console.log(
          `Rate limit hit, switching to API key ${currentKeyIndex + 1} of ${apiKeys.length}`
        );
        genAI = new GoogleGenerativeAI(apiKeys[currentKeyIndex]);
        model = genAI.getGenerativeModel({ model: modelName });
        // Don't count this as a retry, try immediately with new key
        attempt--;
        continue;
      }

      // Exponential backoff: 500ms, 1000ms, 2000ms...
      const backoff = 500 * Math.pow(2, attempt);
      if (attempt < maxRetries) await sleep(backoff);
    }
  }

  return {
    decision: "escalate",
    risk_level: "high",
    reasoning: [
      "Gemini request failed and could not be completed within the configured retry/timeout budget.",
      `model=${modelName}`,
      `error=${formatError(lastErr)}`,
      `API keys tried: ${currentKeyIndex + 1} of ${apiKeys.length}`,
    ],
    conditions: [
      "Retry the pipeline when network connectivity is stable.",
      "If this persists, increase GEMINI_TIMEOUT_MS or GEMINI_MAX_RETRIES in CI, or investigate outbound network/proxy settings.",
      apiKeys.length > 1
        ? "All available API keys were exhausted due to rate limits."
        : "Consider adding GEMINI_API_KEY_2 or GEMINI_API_KEY_3 for rate limit fallback.",
    ],
  };
}

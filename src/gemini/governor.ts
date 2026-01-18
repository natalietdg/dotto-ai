import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { GoogleGenerativeAI } from '@google/generative-ai';

import type { DottoArtifacts } from '../engine/dotto.js';

export type GovernorDecision = {
  decision: 'approve' | 'block' | 'escalate';
  risk_level: 'low' | 'medium' | 'high';
  reasoning: string[];
  conditions: string[];
  thinking?: string; // Raw chain-of-thought from Gemini
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
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

function coerceDecision(obj: unknown): GovernorDecision | null {
  if (!obj || typeof obj !== 'object') return null;
  const anyObj = obj as Record<string, unknown>;

  const decision = anyObj.decision;
  const risk = anyObj.risk_level;
  const reasoning = anyObj.reasoning;
  const conditions = anyObj.conditions;

  const isDecision = decision === 'approve' || decision === 'block' || decision === 'escalate';
  const isRisk = risk === 'low' || risk === 'medium' || risk === 'high';
  const isReasoning = Array.isArray(reasoning) && reasoning.every((x) => typeof x === 'string');
  const isConditions = Array.isArray(conditions) && conditions.every((x) => typeof x === 'string');

  if (!isDecision || !isRisk || !isReasoning || !isConditions) return null;

  return {
    decision,
    risk_level: risk,
    reasoning,
    conditions
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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      decision: 'escalate',
      risk_level: 'high',
      reasoning: [
        'GEMINI_API_KEY is not set, so the governor cannot perform policy and precedent reasoning.',
        `Artifacts loaded from: ${config.artifactsDir}`,
        `Policy loaded from: ${path.resolve(config.policyPath)}`,
        `Memory loaded from: ${path.resolve(config.memoryPath)}`
      ],
      conditions: ['Set GEMINI_API_KEY in the CI environment to enable Gemini reasoning.']
    };
  }

  const modelName = config.model ?? process.env.GEMINI_MODEL ?? 'gemini-3-flash-preview';
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });

  const prompt = governorPrompt({ artifacts, policy, memory, context });

  const timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS ?? 45000);
  const maxRetries = Number(process.env.GEMINI_MAX_RETRIES ?? 2);

  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await withTimeout(model.generateContent(prompt), timeoutMs, 'Gemini request');
      const text = result.response.text();

      // Extract reasoning/thinking and decision from the response
      // Support both <reasoning> (new) and <thinking> (legacy) tags
      const reasoningMatch = text.match(/<reasoning>([\s\S]*?)<\/reasoning>/i)
        || text.match(/<thinking>([\s\S]*?)<\/thinking>/i);
      const decisionMatch = text.match(/<decision>([\s\S]*?)<\/decision>/i);

      const thinking = reasoningMatch ? reasoningMatch[1].trim() : null;
      const decisionText = decisionMatch ? decisionMatch[1].trim() : text;

      let parsed: unknown;
      try {
        const cleaned = decisionText.trim().replace(/^```json\s*|^```\s*|```$/gm, '').trim();
        parsed = JSON.parse(cleaned);
      } catch {
        // Fail closed: require a machine-readable output.
        return {
          decision: 'escalate',
          risk_level: 'high',
          reasoning: ['Gemini response was not valid JSON and cannot be consumed by CI/CD safely.'],
          conditions: ['Ensure the model is configured to output strict JSON only.', `Raw output: ${text}`],
          thinking: thinking || undefined
        };
      }

      const decision = coerceDecision(parsed);
      if (!decision) {
        return {
          decision: 'escalate',
          risk_level: 'high',
          reasoning: ['Gemini returned JSON that does not match the required decision schema.'],
          conditions: ['Fix the governor prompt or model settings to match the required schema exactly.', `Raw JSON: ${text}`],
          thinking: thinking || undefined
        };
      }

      // Include the thinking in the decision
      if (thinking) {
        decision.thinking = thinking;
      }

      return decision;
    } catch (err) {
      lastErr = err;
      // Exponential backoff: 500ms, 1000ms, 2000ms...
      const backoff = 500 * Math.pow(2, attempt);
      if (attempt < maxRetries) await sleep(backoff);
    }
  }

  return {
    decision: 'escalate',
    risk_level: 'high',
    reasoning: [
      'Gemini request failed and could not be completed within the configured retry/timeout budget.',
      `model=${modelName}`,
      `error=${formatError(lastErr)}`
    ],
    conditions: [
      'Retry the pipeline when network connectivity is stable.',
      'If this persists, increase GEMINI_TIMEOUT_MS or GEMINI_MAX_RETRIES in CI, or investigate outbound network/proxy settings.'
    ]
  };
}

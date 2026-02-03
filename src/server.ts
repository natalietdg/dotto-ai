import "dotenv/config";
import http from "node:http";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import path from "node:path";

import {
  assertDottoInstalled,
  generateArtifacts,
  loadArtifacts,
  GraphEngine,
  ImpactAnalyzer,
} from "./engine/dotto.js";
import {
  runGovernor,
  GovernorDecision,
  extractDriftVectors,
  DriftVector,
} from "./gemini/governor.js";
import {
  createReceipt,
  verifyReceipt,
  formatReceiptForDisplay,
  upgradeLegacyReceipt,
  anchorReceiptToHedera,
  AuthorizationReceipt,
} from "./crypto/receipt.js";

type StoredDecision = {
  timestamp: string;
  change_id: string;
  decision: "approve" | "block" | "escalate";
  risk_level: "low" | "medium" | "high";
  reasoning: string[];
  drift_vectors?: DriftVector[]; // Structured for precedent matching
  human_feedback: {
    outcome: "accepted" | "overridden" | "modified";
    override_decision?: "approve" | "block";
    notes?: string;
  };
};

async function generateAuthorizationReceipt(
  decision: GovernorDecision,
  changeId: string,
  artifacts: unknown
): Promise<AuthorizationReceipt> {
  const receipt = createReceipt({
    change_id: changeId,
    ruling: decision.decision,
    risk_level: decision.risk_level,
    auto_authorized: decision.auto_authorized,
    artifacts,
    precedent_match: decision.precedent_match,
  });

  // Anchor to Hedera if configured (for approved decisions)
  if (decision.decision === "approve") {
    return await anchorReceiptToHedera(receipt);
  }

  return receipt;
}

async function writeAuthorizationReceipt(
  artifactsDir: string,
  receipt: AuthorizationReceipt
): Promise<void> {
  const receiptPath = path.join(artifactsDir, "authorization-receipt.json");
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + "\n", "utf8");
}

async function appendMemoryDecision(memoryPath: string, record: StoredDecision): Promise<void> {
  let memory: unknown;
  try {
    const raw = await readFile(memoryPath, "utf8");
    memory = JSON.parse(raw);
  } catch {
    memory = { decisions: [] };
  }

  const obj = (
    memory && typeof memory === "object" ? (memory as Record<string, unknown>) : {}
  ) as Record<string, unknown>;
  const decisions = Array.isArray(obj.decisions) ? (obj.decisions as unknown[]) : [];
  decisions.push(record);
  obj.decisions = decisions;

  await writeFile(memoryPath, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

function getArgValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  const next = process.argv[idx + 1];
  if (!next || next.startsWith("--")) return null;
  return next;
}

function getDefaultDescription(state: "pending" | "success" | "failure" | "error"): string {
  switch (state) {
    case "pending":
      return "Governance review in progress";
    case "success":
      return "Approved — deployment authorized";
    case "failure":
      return "Blocked — authorization denied";
    case "error":
      return "Escalated — human review required";
  }
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

async function runOnce(): Promise<number> {
  await assertDottoInstalled();

  const artifactsDir = getArgValue("--artifacts") ?? path.resolve("artifacts");
  const policyPath = getArgValue("--policy") ?? path.resolve("src/policy/rules.json");
  const memoryPath = getArgValue("--memory") ?? path.resolve("src/memory/decisions.json");
  const changeId =
    getArgValue("--change-id") ??
    process.env.CHANGE_ID ??
    process.env.GITHUB_SHA ??
    process.env.CI_COMMIT_SHA ??
    undefined;

  let artifacts;
  try {
    artifacts = await loadArtifacts(artifactsDir);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stdout.write(
      JSON.stringify(
        {
          decision: "escalate",
          risk_level: "high",
          reasoning: ["Failed to load dotto artifacts.", `artifactsDir=${artifactsDir}`, msg],
          conditions: [
            "Ensure graph.json, drift.json, impact.json, and intent.json exist in the artifacts directory.",
            "If you intended to generate artifacts, run the deterministic dotto step before the governor.",
          ],
        },
        null,
        2
      ) + "\n"
    );
    return 2;
  }

  const decision = await runGovernor(
    {
      artifactsDir,
      policyPath,
      memoryPath,
    },
    artifacts,
    { change_id: changeId }
  );

  process.stdout.write(JSON.stringify(decision, null, 2) + "\n");

  if (decision.decision === "block") {
    process.stdout.write("\n══════════════════════════════════════════════════════════════\n");
    process.stdout.write("  GOVERNANCE DECISION: BLOCK\n");
    process.stdout.write("  This change has been rejected. Deployment is not permitted.\n");
    process.stdout.write("══════════════════════════════════════════════════════════════\n\n");
    return 1;
  }
  if (decision.decision === "escalate") {
    process.stdout.write("\n══════════════════════════════════════════════════════════════\n");
    process.stdout.write("  GOVERNANCE DECISION: ESCALATE\n");
    process.stdout.write("  This decision exceeds automation authority.\n");
    process.stdout.write("  Dotto blocks deployment until a human ruling is recorded.\n");
    process.stdout.write("══════════════════════════════════════════════════════════════\n\n");
    return 2;
  }

  process.stdout.write("\n══════════════════════════════════════════════════════════════\n");
  process.stdout.write("  GOVERNANCE DECISION: APPROVE\n");
  process.stdout.write("  This change is approved. Deployment may proceed.\n");
  process.stdout.write("══════════════════════════════════════════════════════════════\n\n");
  return 0;
}

async function startServer(): Promise<void> {
  const port = Number(process.env.PORT ?? 5000);

  // Ensure decisions.json exists (don't require it to be committed)
  const memoryDir = path.resolve("src/memory");
  const decisionsPath = path.join(memoryDir, "decisions.json");
  try {
    await mkdir(memoryDir, { recursive: true });
    try {
      await access(decisionsPath);
    } catch {
      // File doesn't exist, create empty decisions
      await writeFile(decisionsPath, JSON.stringify({ decisions: [] }, null, 2));
      console.log("Created empty decisions.json");
    }
  } catch (err) {
    console.error("Failed to initialize decisions.json:", err);
  }

  // Generate artifacts on startup (dotto scan)
  console.log("Scanning codebase for artifacts...");
  try {
    await generateArtifacts({ artifactsDir: path.resolve("artifacts") });
    console.log("Artifacts generated successfully");
  } catch (err) {
    console.error("Failed to generate artifacts:", err);
  }

  const server = http.createServer(async (req: http.IncomingMessage, res: http.ServerResponse) => {
    // CORS headers for cross-domain requests (Netlify frontend -> Render backend)
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      const parsedUrl = req.url
        ? new URL(req.url, `http://${req.headers.host ?? "localhost"}`)
        : null;
      const pathname = parsedUrl?.pathname ?? req.url ?? "/";

      if (req.method === "GET" && req.url === "/healthz") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (req.method === "GET" && pathname.startsWith("/artifacts/")) {
        // Decode URI to handle encoded traversal attempts (%2e%2e%2f = ../)
        let rel: string;
        try {
          rel = decodeURIComponent(pathname.replace("/artifacts/", ""));
        } catch {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "invalid_request" }));
          return;
        }

        // Check for path traversal after decoding
        if (!rel || rel.includes("..") || rel.includes("\\") || rel.startsWith("/")) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "invalid_request" }));
          return;
        }

        const artifactsRoot = path.resolve("artifacts");
        const filePath = path.resolve(artifactsRoot, rel);

        // Double-check resolved path is still within allowed directory
        if (!filePath.startsWith(artifactsRoot + path.sep) && filePath !== artifactsRoot) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "invalid_request" }));
          return;
        }

        try {
          const raw = await readFile(filePath, "utf8");
          res.writeHead(200, { "content-type": "application/json" });
          res.end(raw);
        } catch {
          res.writeHead(404, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "not_found" }));
        }
        return;
      }

      // Serve all files from examples/ folder (demo scenarios, base artifacts, etc.)
      if (req.method === "GET" && pathname.startsWith("/examples/")) {
        let rel: string;
        try {
          rel = decodeURIComponent(pathname.replace("/examples/", ""));
        } catch {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "invalid_request" }));
          return;
        }

        if (!rel || rel.includes("..") || rel.includes("\\") || rel.startsWith("/")) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "invalid_request" }));
          return;
        }

        const examplesRoot = path.resolve("examples");
        const filePath = path.resolve(examplesRoot, rel);
        if (!filePath.startsWith(examplesRoot + path.sep) && filePath !== examplesRoot) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "invalid_request" }));
          return;
        }

        try {
          const raw = await readFile(filePath, "utf8");
          res.writeHead(200, { "content-type": "application/json" });
          res.end(raw);
        } catch {
          res.writeHead(404, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "not_found" }));
        }
        return;
      }

      // Serve memory files (decisions.json for learning loop)
      if (req.method === "GET" && pathname.startsWith("/memory/")) {
        let rel: string;
        try {
          rel = decodeURIComponent(pathname.replace("/memory/", ""));
        } catch {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "invalid_request" }));
          return;
        }

        if (!rel || rel.includes("..") || rel.includes("\\") || rel.startsWith("/")) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "invalid_request" }));
          return;
        }

        const memoryRoot = path.resolve("src/memory");
        const filePath = path.resolve(memoryRoot, rel);
        if (!filePath.startsWith(memoryRoot + path.sep) && filePath !== memoryRoot) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "invalid_request" }));
          return;
        }

        try {
          const raw = await readFile(filePath, "utf8");
          res.writeHead(200, { "content-type": "application/json" });
          res.end(raw);
        } catch {
          res.writeHead(404, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "not_found" }));
        }
        return;
      }

      if (req.method === "POST" && pathname === "/dotto/run") {
        try {
          await assertDottoInstalled();

          const body = (await readJsonBody(req)) as {
            artifactsDir?: string;
            baseRef?: string;
            change_id?: string;
            intent?: unknown;
          };

          const artifactsDir = body.artifactsDir ?? path.resolve("artifacts");
          const changeId = body.change_id ?? process.env.GITHUB_SHA ?? `local-${Date.now()}`;

          await generateArtifacts({
            artifactsDir,
            baseRef: body.baseRef,
            change_id: changeId,
            intent: body.intent,
          });

          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true, artifactsDir, change_id: changeId }));
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("tracingChannel") || msg.includes("diagChan")) {
            res.writeHead(500, { "content-type": "application/json" });
            res.end(
              JSON.stringify({
                error: "node_version_incompatible",
                message: `dotto CLI requires Node.js v20+. Current: ${process.version}. Please upgrade Node.js or use pre-generated artifacts.`,
              })
            );
          } else {
            res.writeHead(500, { "content-type": "application/json" });
            res.end(JSON.stringify({ error: "internal_error", message: msg }));
          }
        }
        return;
      }

      if (req.method === "GET" && req.url === "/health") {
        return { health: true, message: "OK" };
      }

      if (req.method === "POST" && req.url === "/run") {
        const body = (await readJsonBody(req)) as {
          artifactsDir?: string;
          policyPath?: string;
          memoryPath?: string;
          model?: string;
          change_id?: string;
          // Simulated data from viewer (overrides file-based artifacts)
          simulated?: {
            drift?: unknown;
            intent?: string[];
          };
        };

        const artifactsDir = body.artifactsDir ?? path.resolve("artifacts");
        const policyPath = body.policyPath ?? path.resolve("src/policy/rules.json");
        const memoryPath = body.memoryPath ?? path.resolve("src/memory/decisions.json");

        // Load artifacts from files, then override with simulated data if provided
        const artifacts = await loadArtifacts(artifactsDir);
        if (body.simulated?.drift) {
          artifacts.drift = body.simulated.drift;

          // Recalculate impact based on simulated drift
          try {
            const graphPath = path.join(artifactsDir, "graph.json");
            const graphEngine = new GraphEngine(graphPath);
            const impactAnalyzer = new ImpactAnalyzer(graphEngine);
            const analyses = [];

            const driftObj = body.simulated.drift as {
              diffs?: Array<{
                nodeId: string;
                changeType: string;
                breaking: boolean;
                name?: string;
              }>;
            };
            const diffs = driftObj.diffs || [];

            for (const diff of diffs) {
              if (diff.changeType !== "unchanged") {
                try {
                  const impact = impactAnalyzer.analyze(diff.nodeId, 3);
                  analyses.push({
                    sourceNodeId: diff.nodeId,
                    sourceName: diff.name || diff.nodeId,
                    changeType: diff.changeType,
                    breaking: diff.breaking,
                    downstream: impact.impacted,
                  });
                } catch {
                  // Node might not exist in current graph
                }
              }
            }

            artifacts.impact = {
              timestamp: new Date().toISOString(),
              analyses,
              summary: {
                totalChanges: diffs.length,
                breakingChanges: diffs.filter((d) => d.breaking).length,
                totalImpactedNodes: new Set(
                  analyses.flatMap((a) => a.downstream.map((d: { nodeId: string }) => d.nodeId))
                ).size,
              },
            };
          } catch (e) {
            console.log("Could not recalculate impact for simulated drift:", e);
            // Keep original impact if recalculation fails
          }
        }
        if (body.simulated?.intent) {
          artifacts.intent = {
            timestamp: new Date().toISOString(),
            intents: body.simulated.intent,
            summary: body.simulated.intent.join("; "),
          };
        }
        const changeId = body.change_id ?? `local-${Date.now()}`;
        const decision = await runGovernor(
          {
            artifactsDir,
            policyPath,
            memoryPath,
            model: body.model,
          },
          artifacts,
          { change_id: changeId }
        );

        // Generate and write authorization receipt (with Hedera anchoring if configured)
        const receipt = await generateAuthorizationReceipt(decision, changeId, artifacts);
        await writeAuthorizationReceipt(artifactsDir, receipt);

        // Post GitHub status if token is available and changeId looks like a SHA
        const githubToken = process.env.GITHUB_TOKEN;
        const githubOwner = process.env.GITHUB_OWNER || "natalietdg";
        const githubRepo = process.env.GITHUB_REPO || "dotto-ai";
        const isValidSha = changeId && /^[a-f0-9]{7,40}$/i.test(changeId);

        if (githubToken && isValidSha) {
          try {
            const ghState =
              decision.decision === "approve"
                ? "success"
                : decision.decision === "block"
                  ? "failure"
                  : "error";
            const ghDescription =
              decision.decision === "approve"
                ? decision.auto_authorized
                  ? "Auto-authorized via precedent"
                  : "Approved — deployment authorized"
                : decision.decision === "block"
                  ? "Blocked — authorization denied"
                  : "Escalated — human review required";

            const statusUrl = `https://api.github.com/repos/${githubOwner}/${githubRepo}/statuses/${changeId}`;
            await fetch(statusUrl, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${githubToken}`,
                Accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                state: ghState,
                description: ghDescription,
                context: "dotto-ai/governance",
              }),
            });
          } catch (err) {
            // Log but don't fail the request if GitHub status post fails
            console.error("Failed to post GitHub status:", err);
          }
        }

        // Include receipt in response
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ...decision, receipt }));
        return;
      }

      if (req.method === "POST" && req.url === "/feedback") {
        const body = (await readJsonBody(req)) as {
          memoryPath?: string;
          artifactsDir?: string;
          change_id: string;
          governor: {
            decision: "approve" | "block" | "escalate";
            risk_level: "low" | "medium" | "high";
            reasoning: string[];
          };
          human: {
            outcome: "accepted" | "overridden" | "modified";
            override_decision?: "approve" | "block";
            notes?: string;
          };
          // Allow client to pass drift data directly (for demo scenarios)
          drift?: unknown;
        };

        if (!body?.change_id || typeof body.change_id !== "string") {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              error: "invalid_request",
              message: "change_id is required",
            })
          );
          return;
        }

        const memoryPath = body.memoryPath ?? path.resolve("src/memory/decisions.json");
        const artifactsDir = body.artifactsDir ?? path.resolve("artifacts");

        // Extract drift vectors - prefer client-provided drift (for demo scenarios),
        // fall back to artifacts/drift.json
        let driftVectors: DriftVector[] | undefined;
        if (body.drift) {
          driftVectors = extractDriftVectors(body.drift);
        }
        if (!driftVectors || driftVectors.length === 0) {
          try {
            const driftPath = path.join(artifactsDir, "drift.json");
            const driftRaw = await readFile(driftPath, "utf8");
            const drift = JSON.parse(driftRaw);
            driftVectors = extractDriftVectors(drift);
          } catch {
            // If drift can't be loaded, proceed without vectors
          }
        }

        await appendMemoryDecision(memoryPath, {
          timestamp: new Date().toISOString(),
          change_id: body.change_id,
          decision: body.governor.decision,
          risk_level: body.governor.risk_level,
          reasoning: body.governor.reasoning,
          drift_vectors: driftVectors,
          human_feedback: {
            outcome: body.human.outcome,
            override_decision: body.human.override_decision,
            notes: body.human.notes,
          },
        });

        // Determine final ruling based on human feedback
        const finalRuling: "approve" | "block" | "escalate" =
          body.human.outcome === "overridden" && body.human.override_decision
            ? body.human.override_decision
            : body.governor.decision;

        // Load artifacts to generate receipt (with Hedera anchoring if configured)
        try {
          const artifacts = await loadArtifacts(artifactsDir);
          const receipt = await generateAuthorizationReceipt(
            {
              decision: finalRuling,
              risk_level: body.governor.risk_level,
              reasoning: body.governor.reasoning,
              conditions: [],
            },
            body.change_id,
            artifacts
          );
          await writeAuthorizationReceipt(artifactsDir, receipt);
        } catch (err) {
          console.error("Failed to write receipt after feedback:", err);
        }

        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      // GitHub commit status check - makes governance visible in PRs
      if (req.method === "POST" && req.url === "/github/status") {
        const body = (await readJsonBody(req)) as {
          owner: string;
          repo: string;
          sha: string;
          state: "pending" | "success" | "failure" | "error";
          description?: string;
          target_url?: string;
        };

        if (!body.owner || !body.repo || !body.sha || !body.state) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              error: "invalid_request",
              message: "owner, repo, sha, and state are required",
            })
          );
          return;
        }

        const githubToken = process.env.GITHUB_TOKEN;
        if (!githubToken) {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              error: "no_token",
              message: "GITHUB_TOKEN not configured",
            })
          );
          return;
        }

        const statusUrl = `https://api.github.com/repos/${body.owner}/${body.repo}/statuses/${body.sha}`;
        const statusPayload = {
          state: body.state,
          description: body.description || getDefaultDescription(body.state),
          context: "dotto-ai/governance",
          target_url: body.target_url,
        };

        const response = await fetch(statusUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${githubToken}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(statusPayload),
        });

        if (!response.ok) {
          const errorText = await response.text();
          res.writeHead(response.status, {
            "content-type": "application/json",
          });
          res.end(JSON.stringify({ error: "github_api_error", message: errorText }));
          return;
        }

        const result = (await response.json()) as { url: string };
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, status_url: result.url }));
        return;
      }

      // Get latest workflow runs from repo (no commit SHA required)
      if (req.method === "GET" && pathname === "/github/runs") {
        const githubToken = process.env.GITHUB_TOKEN;
        const owner = process.env.GITHUB_OWNER || "natalietdg";
        const repo = process.env.GITHUB_REPO || "dotto-ai";

        if (!githubToken) {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              error: "no_token",
              message: "GITHUB_TOKEN not configured",
            })
          );
          return;
        }

        const headers = {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        };

        // Fetch recent workflow runs
        const runsUrl = `https://api.github.com/repos/${owner}/${repo}/actions/runs?per_page=10`;
        const runsResponse = await fetch(runsUrl, { headers });

        if (!runsResponse.ok) {
          const errorText = await runsResponse.text();
          res.writeHead(runsResponse.status, {
            "content-type": "application/json",
          });
          res.end(JSON.stringify({ error: "github_api_error", message: errorText }));
          return;
        }

        const runsData = (await runsResponse.json()) as {
          workflow_runs: Array<{
            id: number;
            name: string;
            head_sha: string;
            head_branch: string;
            status: string;
            conclusion: string | null;
            html_url: string;
            created_at: string;
            updated_at: string;
          }>;
        };

        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            owner,
            repo,
            runs: runsData.workflow_runs.map((r) => ({
              id: r.id,
              name: r.name,
              sha: r.head_sha,
              branch: r.head_branch,
              status: r.status,
              conclusion: r.conclusion,
              html_url: r.html_url,
              created_at: r.created_at,
            })),
          })
        );
        return;
      }

      // Get GitHub commit status - fetch current governance status AND workflow runs
      if (req.method === "GET" && pathname.startsWith("/github/status/")) {
        const parts = pathname.replace("/github/status/", "").split("/");
        if (parts.length < 3) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              error: "invalid_request",
              message: "Expected /github/status/:owner/:repo/:sha",
            })
          );
          return;
        }

        const [owner, repo, sha] = parts;
        const githubToken = process.env.GITHUB_TOKEN;

        if (!githubToken) {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              error: "no_token",
              message: "GITHUB_TOKEN not configured",
            })
          );
          return;
        }

        const headers = {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        };

        // Fetch combined status for the commit
        const statusUrl = `https://api.github.com/repos/${owner}/${repo}/commits/${sha}/status`;
        const statusResponse = await fetch(statusUrl, { headers });

        let combined = null;
        if (statusResponse.ok) {
          combined = (await statusResponse.json()) as {
            state: string;
            statuses: Array<{
              context: string;
              state: string;
              description: string;
              target_url: string;
              created_at: string;
            }>;
            sha: string;
            repository: { full_name: string; html_url: string };
          };
        }

        // Fetch workflow runs for this commit (GitHub Actions)
        const runsUrl = `https://api.github.com/repos/${owner}/${repo}/actions/runs?head_sha=${sha}`;
        const runsResponse = await fetch(runsUrl, { headers });

        let workflowRuns: Array<{
          id: number;
          name: string;
          status: string;
          conclusion: string | null;
          html_url: string;
          created_at: string;
        }> = [];

        if (runsResponse.ok) {
          const runsData = (await runsResponse.json()) as {
            workflow_runs: Array<{
              id: number;
              name: string;
              status: string;
              conclusion: string | null;
              html_url: string;
              created_at: string;
            }>;
          };
          workflowRuns = runsData.workflow_runs || [];
        }

        // Find dotto-specific status
        const dottoStatus = combined?.statuses?.find(
          (s: { context: string }) => s.context === "dotto-ai/governance"
        );

        // Find governance-related workflow run (look for 'governance' or 'dotto' in name)
        const governanceRun =
          workflowRuns.find(
            (r) =>
              r.name.toLowerCase().includes("governance") || r.name.toLowerCase().includes("dotto")
          ) || workflowRuns[0]; // Fallback to first run

        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            sha,
            combined_state: combined?.state || null,
            dotto_status: dottoStatus || null,
            commit_url: `https://github.com/${owner}/${repo}/commit/${sha}`,
            workflow_run: governanceRun
              ? {
                  id: governanceRun.id,
                  name: governanceRun.name,
                  status: governanceRun.status,
                  conclusion: governanceRun.conclusion,
                  html_url: governanceRun.html_url,
                }
              : null,
            all_runs: workflowRuns.map((r) => ({
              id: r.id,
              name: r.name,
              status: r.status,
              conclusion: r.conclusion,
              html_url: r.html_url,
            })),
          })
        );
        return;
      }

      // Verification endpoint for CI/runtime enforcement
      // This makes the receipt a REQUIREMENT, not just evidence
      if (req.method === "POST" && req.url === "/verify-receipt") {
        const body = (await readJsonBody(req)) as {
          receipt?: Record<string, unknown>;
        };

        // Handle legacy v1.0 receipts by upgrading them
        let receipt: AuthorizationReceipt | null = null;
        if (body?.receipt) {
          const raw = body.receipt;
          if (!raw.version || raw.version === "1.0") {
            receipt = upgradeLegacyReceipt(raw as Parameters<typeof upgradeLegacyReceipt>[0]);
          } else {
            receipt = raw as AuthorizationReceipt;
          }
        }

        // Use the crypto module for verification
        const result = verifyReceipt(receipt, { require_approval: true });

        if (!result.valid) {
          const statusCode = result.reason === "not_approved" ? 403 : 400;
          res.writeHead(statusCode, { "content-type": "application/json" });
          res.end(JSON.stringify(result));
          return;
        }

        // Valid receipt with approve ruling
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            ...result,
            change_id: receipt?.change_id,
            ruling: receipt?.ruling,
            auto_authorized: receipt?.auto_authorized,
          })
        );
        return;
      }

      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not_found" }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "internal_error", message: msg }));
    }
  });

  server.listen(port, () => {
    process.stdout.write(`dotto-ai server listening on :${port}\n`);
  });
}

async function runEnforce(): Promise<number> {
  const artifactsDir = getArgValue("--artifacts") ?? path.resolve("artifacts");
  const receiptPath = path.join(artifactsDir, "authorization-receipt.json");

  process.stdout.write("\n");
  process.stdout.write("══════════════════════════════════════════════════════════════\n");
  process.stdout.write("  DOTTO ENFORCEMENT GATE\n");
  process.stdout.write("══════════════════════════════════════════════════════════════\n\n");

  // Load receipt
  let receipt: AuthorizationReceipt | null = null;
  try {
    const raw = await readFile(receiptPath, "utf8");
    const parsed = JSON.parse(raw);
    // Handle legacy v1.0 format
    if (!parsed.version || parsed.version === "1.0") {
      receipt = upgradeLegacyReceipt(parsed);
    } else {
      receipt = parsed as AuthorizationReceipt;
    }
  } catch {
    process.stdout.write("  ❌ Missing authorization receipt\n\n");
    process.stdout.write("  No deployment without authorization.\n");
    process.stdout.write("  Run governance and obtain human approval first.\n\n");
    process.stdout.write("══════════════════════════════════════════════════════════════\n\n");
    return 2;
  }

  // Use the crypto module for verification
  const result = verifyReceipt(receipt, { require_approval: true });

  if (!result.valid) {
    if (result.reason === "invalid_signature") {
      process.stdout.write("  ❌ Invalid receipt signature\n\n");
      process.stdout.write("  Receipt has been tampered with or is corrupted.\n");
      process.stdout.write("  Re-run governance to obtain a valid receipt.\n\n");
    } else if (result.reason === "expired") {
      process.stdout.write("  ❌ Receipt expired\n\n");
      process.stdout.write(`  Expired at: ${receipt.expires_at}\n`);
      process.stdout.write("  Re-run governance to obtain a fresh receipt.\n\n");
    } else if (result.reason === "not_approved") {
      if (receipt.ruling === "block") {
        process.stdout.write("  ❌ Authorization denied\n\n");
        process.stdout.write(`  Ruling: ${receipt.ruling.toUpperCase()}\n`);
        process.stdout.write(`  Change: ${receipt.change_id}\n`);
        process.stdout.write("  Deployment is not permitted.\n\n");
      } else {
        process.stdout.write("  ⚠ Awaiting human ruling\n\n");
        process.stdout.write(`  Ruling: ${receipt.ruling.toUpperCase()}\n`);
        process.stdout.write(`  Change: ${receipt.change_id}\n`);
        process.stdout.write("  Human review required before deployment.\n\n");
      }
    } else {
      process.stdout.write(`  ❌ ${result.message}\n\n`);
    }
    process.stdout.write("══════════════════════════════════════════════════════════════\n\n");
    return result.reason === "not_approved" && receipt.ruling === "block" ? 1 : 2;
  }

  // Approved
  process.stdout.write("  ✅ Authorization verified\n\n");
  process.stdout.write(
    formatReceiptForDisplay(receipt)
      .split("\n")
      .map((line) => `  ${line}`)
      .join("\n") + "\n\n"
  );
  process.stdout.write("  Deployment authorized. Proceed.\n\n");
  process.stdout.write("══════════════════════════════════════════════════════════════\n\n");
  return 0;
}

const once = process.argv.includes("--once");
const enforce = process.argv.includes("enforce") || process.argv.includes("--enforce");

if (enforce) {
  runEnforce()
    .then((code) => process.exit(code))
    .catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(msg + "\n");
      process.exit(2);
    });
} else if (once) {
  runOnce()
    .then((code) => process.exit(code))
    .catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(msg + "\n");
      process.exit(2);
    });
} else {
  startServer().catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(msg + "\n");
    process.exit(1);
  });
}

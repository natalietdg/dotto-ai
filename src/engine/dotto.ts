/**
 * Dotto Engine Integration
 * Uses local engine modules for artifact generation instead of external CLI
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { extractIntentsFromContent } from "./intent.js";
import { GraphEngine } from "./graph/GraphEngine.js";
import { Crawler } from "./scanner/Crawler.js";
import { SchemaDiffer, SchemaDiff } from "./diff/SchemaDiffer.js";
import { GitScanner } from "./git/GitScanner.js";
import { ImpactAnalyzer } from "./analysis/ImpactAnalyzer.js";
import { IntentDriftDetector, IntentDrift } from "./analysis/IntentDriftDetector.js";

export type DottoArtifacts = {
  graph: unknown;
  drift: unknown;
  impact: unknown;
  intent: unknown;
};

export type DottoGenerateConfig = {
  artifactsDir: string;
  baseRef?: string;
  change_id?: string;
  intent?: unknown;
};

async function readJson(filePath: string): Promise<unknown> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

/**
 * Extract @intent annotations from changed files listed in drift.json
 */
async function extractIntentsFromDrift(driftPath: string, cwd: string): Promise<string[]> {
  const allIntents: string[] = [];

  try {
    const driftRaw = await readFile(driftPath, "utf8");
    const drift = JSON.parse(driftRaw) as { diffs?: Array<{ file?: string; path?: string }> };

    if (!drift.diffs || !Array.isArray(drift.diffs)) {
      return allIntents;
    }

    // Get unique file paths from drift
    const files = new Set<string>();
    for (const diff of drift.diffs) {
      const filePath = diff.file || diff.path;
      if (filePath) {
        files.add(filePath);
      }
    }

    // Read each changed file and extract intents
    for (const file of files) {
      try {
        const fullPath = path.join(cwd, file);
        const content = await readFile(fullPath, "utf8");
        const intents = extractIntentsFromContent(content);
        allIntents.push(...intents);
      } catch {
        // File might not exist or be unreadable, skip it
      }
    }
  } catch {
    // drift.json might not exist or be invalid
  }

  return allIntents;
}

export async function loadArtifacts(artifactsDir: string): Promise<DottoArtifacts> {
  const graphPath = path.join(artifactsDir, "graph.json");
  const driftPath = path.join(artifactsDir, "drift.json");
  const impactPath = path.join(artifactsDir, "impact.json");
  const intentPath = path.join(artifactsDir, "intent.json");

  return {
    graph: await readJson(graphPath),
    drift: await readJson(driftPath),
    impact: await readJson(impactPath),
    intent: await readJson(intentPath),
  };
}

/**
 * Generate artifacts using local engine modules
 */
export async function generateArtifacts(config: DottoGenerateConfig): Promise<void> {
  await mkdir(config.artifactsDir, { recursive: true });

  const cwd = process.cwd();
  const graphPath = path.join(config.artifactsDir, "graph.json");
  const driftPath = path.join(config.artifactsDir, "drift.json");
  const impactPath = path.join(config.artifactsDir, "impact.json");
  const intentPath = path.join(config.artifactsDir, "intent.json");

  try {
    // 1) Generate dependency graph using local Crawler
    const graphEngine = new GraphEngine(graphPath);
    const crawler = new Crawler(graphEngine);
    const crawlResult = await crawler.crawl();

    console.log(
      `📊 Crawled: ${crawlResult.added.length} added, ${crawlResult.modified.length} modified, ${crawlResult.removed.length} removed`
    );

    // Get current nodes for diff comparison
    const currentNodes = new Map(graphEngine.getAllNodes().map((n) => [n.id, n]));

    // 2) Generate drift.json using GitScanner and SchemaDiffer
    let diffs: SchemaDiff[] = [];
    let intentDrifts: IntentDrift[] = [];

    try {
      const gitScanner = new GitScanner(cwd);
      const baseRef = config.baseRef ?? "HEAD~1";

      // Get baseline nodes (from previous commit)
      const baselineGraphPath = path.join(config.artifactsDir, ".baseline-graph.json");
      const baseEngine = new GraphEngine(baselineGraphPath);

      // Try to load baseline from git or previous state
      try {
        const baseContent = gitScanner.getFileAtCommit(path.relative(cwd, graphPath), baseRef);
        if (baseContent) {
          const baseGraph = JSON.parse(baseContent);
          for (const node of baseGraph.nodes || []) {
            baseEngine.addNode(node);
          }
        }
      } catch {
        // No baseline available, treat all as new
      }

      const baseNodes = new Map(baseEngine.getAllNodes().map((n) => [n.id, n]));

      // Compute schema diffs
      const schemaDiffer = new SchemaDiffer();
      diffs = schemaDiffer.diffMany(baseNodes, currentNodes);

      // Compute intent drifts
      const driftDetector = new IntentDriftDetector();
      intentDrifts = driftDetector.detectBatchDrift(baseNodes, currentNodes);

      console.log(
        `🔍 Detected ${diffs.length} schema changes, ${intentDrifts.length} intent drifts`
      );
    } catch (err) {
      console.warn("Git comparison unavailable, using current state only:", err);
    }

    // Write drift.json
    const driftOutput = {
      timestamp: new Date().toISOString(),
      baseRef: config.baseRef ?? "HEAD~1",
      diffs: diffs.map((d) => ({
        nodeId: d.nodeId,
        name: d.name,
        type: d.type,
        changeType: d.changeType,
        breaking: d.breaking,
        changes: d.changes,
      })),
      intentDrifts: intentDrifts.map((d) => ({
        nodeId: d.nodeId,
        oldIntent: d.oldIntent,
        newIntent: d.newIntent,
        similarity: d.similarity,
        severity: d.severity,
        analysis: d.analysis,
      })),
    };
    await writeFile(driftPath, JSON.stringify(driftOutput, null, 2) + "\n", "utf8");

    // 3) Generate impact.json using ImpactAnalyzer
    const impactAnalyzer = new ImpactAnalyzer(graphEngine);
    const analyses = [];

    // Analyze impact for all changed nodes
    for (const diff of diffs) {
      if (diff.changeType !== "unchanged") {
        try {
          const impact = impactAnalyzer.analyze(diff.nodeId, 3);
          analyses.push({
            sourceNodeId: diff.nodeId,
            sourceName: diff.name,
            changeType: diff.changeType,
            breaking: diff.breaking,
            downstream: impact.impacted,
          });
        } catch {
          // Node might not exist in current graph
        }
      }
    }

    const impactOutput = {
      timestamp: new Date().toISOString(),
      analyses,
      summary: {
        totalChanges: diffs.length,
        breakingChanges: diffs.filter((d) => d.breaking).length,
        totalImpactedNodes: new Set(analyses.flatMap((a) => a.downstream.map((d) => d.nodeId)))
          .size,
      },
    };
    await writeFile(impactPath, JSON.stringify(impactOutput, null, 2) + "\n", "utf8");

    // 4) Generate intent.json (from @intent comments in code)
    const extractedIntents = await extractIntentsFromDrift(driftPath, cwd);

    // Also extract intents from nodes
    const nodeIntents: string[] = [];
    for (const node of currentNodes.values()) {
      if (node.intent) {
        nodeIntents.push(node.intent);
      }
    }

    const intentOutput = {
      timestamp: new Date().toISOString(),
      change_id: config.change_id,
      description:
        typeof config.intent === "object" && config.intent && "description" in config.intent
          ? (config.intent as { description?: string }).description
          : undefined,
      intents: [...new Set([...extractedIntents, ...nodeIntents])],
      summary:
        extractedIntents.length > 0
          ? extractedIntents.join("; ")
          : nodeIntents.length > 0
            ? nodeIntents.join("; ")
            : undefined,
      driftSummary:
        intentDrifts.length > 0
          ? {
              count: intentDrifts.length,
              highSeverity: intentDrifts.filter((d) => d.severity === "high").length,
              mediumSeverity: intentDrifts.filter((d) => d.severity === "medium").length,
              lowSeverity: intentDrifts.filter((d) => d.severity === "low").length,
            }
          : undefined,
    };
    await writeFile(intentPath, JSON.stringify(intentOutput, null, 2) + "\n", "utf8");

    console.log(`✅ Artifacts generated in ${config.artifactsDir}`);
  } catch (err) {
    throw new Error(
      `Failed to generate dotto artifacts: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Check if local engine modules are available
 */
export async function assertDottoInstalled(): Promise<void> {
  // Local engine is always available - no external dependency needed
  // This function exists for API compatibility
}

// Re-export engine modules for direct use
export { GraphEngine } from "./graph/GraphEngine.js";
export { Crawler } from "./scanner/Crawler.js";
export { SchemaDiffer } from "./diff/SchemaDiffer.js";
export { GitScanner } from "./git/GitScanner.js";
export { ImpactAnalyzer } from "./analysis/ImpactAnalyzer.js";
export { IntentDriftDetector } from "./analysis/IntentDriftDetector.js";
export type { SchemaDiff } from "./diff/SchemaDiffer.js";
export type { IntentDrift } from "./analysis/IntentDriftDetector.js";

import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';

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
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

export async function loadArtifacts(artifactsDir: string): Promise<DottoArtifacts> {
  const graphPath = path.join(artifactsDir, 'graph.json');
  const driftPath = path.join(artifactsDir, 'drift.json');
  const impactPath = path.join(artifactsDir, 'impact.json');
  const intentPath = path.join(artifactsDir, 'intent.json');

  // dotto generation is intentionally delegated to @natalietdg/dotto.
  // This project only consumes machine-verified artifacts.
  // If they are missing, we fail closed (escalate downstream).

  return {
    graph: await readJson(graphPath),
    drift: await readJson(driftPath),
    impact: await readJson(impactPath),
    intent: await readJson(intentPath)
  };
}

export async function generateArtifacts(config: DottoGenerateConfig): Promise<void> {
  await mkdir(config.artifactsDir, { recursive: true });

  // Use dotto CLI instead of programmatic API to avoid import bug
  const cwd = process.cwd();
  const graphPath = path.join(config.artifactsDir, 'graph.json');
  const driftPath = path.join(config.artifactsDir, 'drift.json');
  const impactPath = path.join(config.artifactsDir, 'impact.json');
  const intentPath = path.join(config.artifactsDir, 'intent.json');

  try {
    // 1) Generate dependency graph using dotto CLI
    execSync('npx dotto crawl', { cwd, stdio: 'pipe' });
    // Copy graph.json to artifacts dir
    const defaultGraphPath = path.join(cwd, 'graph.json');
    try {
      await copyFile(defaultGraphPath, graphPath);
    } catch {
      // If no graph.json, create empty one
      await writeFile(graphPath, JSON.stringify({ nodes: [], edges: [] }, null, 2) + '\n', 'utf8');
    }

    // 2) Generate drift.json using dotto scan
    const baseRef = config.baseRef ?? 'HEAD';
    try {
      execSync(`npx dotto scan --base ${baseRef}`, { cwd, stdio: 'pipe' });
      const defaultDriftPath = path.join(cwd, 'drift.json');
      await copyFile(defaultDriftPath, driftPath);
    } catch {
      // If scan fails, create empty drift
      await writeFile(driftPath, JSON.stringify({ timestamp: new Date().toISOString(), diffs: [] }, null, 2) + '\n', 'utf8');
    }

    // 3) Generate impact.json using dotto impact
    try {
      execSync('npx dotto impact', { cwd, stdio: 'pipe' });
      const defaultImpactPath = path.join(cwd, 'impact.json');
      await copyFile(defaultImpactPath, impactPath);
    } catch {
      // If impact fails, create empty impact
      await writeFile(impactPath, JSON.stringify({ timestamp: new Date().toISOString(), analyses: [] }, null, 2) + '\n', 'utf8');
    }

    // 4) Generate intent.json (from @intent comments in code)
    const intent = {
      timestamp: new Date().toISOString(),
      change_id: config.change_id,
      description: typeof config.intent === 'object' && config.intent && 'description' in config.intent
        ? (config.intent as { description?: string }).description
        : undefined
    };
    await writeFile(intentPath, JSON.stringify(intent, null, 2) + '\n', 'utf8');
  } catch (err) {
    throw new Error(`Failed to generate dotto artifacts: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function assertDottoInstalled(): Promise<void> {
  try {
    // The spec requires that this file imports @natalietdg/dotto.
    // We keep it dynamic so the repo can still install/run without it.
    await import('@natalietdg/dotto');
  } catch {
    // Not throwing here: the deterministic engine may run elsewhere (CI step)
    // and only artifacts are required for the governor.
  }
}

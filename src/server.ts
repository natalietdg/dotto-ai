import 'dotenv/config';
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { assertDottoInstalled, generateArtifacts, loadArtifacts } from './engine/dotto.js';
import { runGovernor } from './gemini/governor.js';

type StoredDecision = {
  timestamp: string;
  change_id: string;
  decision: 'approve' | 'block' | 'escalate';
  risk_level: 'low' | 'medium' | 'high';
  reasoning: string[];
  human_feedback: {
    outcome: 'accepted' | 'overridden' | 'modified';
    override_decision?: 'approve' | 'block';
    notes?: string;
  };
};

async function appendMemoryDecision(memoryPath: string, record: StoredDecision): Promise<void> {
  let memory: unknown;
  try {
    const raw = await readFile(memoryPath, 'utf8');
    memory = JSON.parse(raw);
  } catch {
    memory = { decisions: [] };
  }

  const obj = (memory && typeof memory === 'object' ? (memory as Record<string, unknown>) : {}) as Record<
    string,
    unknown
  >;
  const decisions = Array.isArray(obj.decisions) ? (obj.decisions as unknown[]) : [];
  decisions.push(record);
  obj.decisions = decisions;

  await writeFile(memoryPath, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function getArgValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  const next = process.argv[idx + 1];
  if (!next || next.startsWith('--')) return null;
  return next;
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  return JSON.parse(raw);
}

async function runOnce(): Promise<number> {
  await assertDottoInstalled();

  const artifactsDir = getArgValue('--artifacts') ?? path.resolve('artifacts');
  const policyPath = getArgValue('--policy') ?? path.resolve('src/policy/rules.json');
  const memoryPath = getArgValue('--memory') ?? path.resolve('src/memory/decisions.json');
  const changeId =
    getArgValue('--change-id') ?? process.env.CHANGE_ID ?? process.env.GITHUB_SHA ?? process.env.CI_COMMIT_SHA ?? undefined;

  let artifacts;
  try {
    artifacts = await loadArtifacts(artifactsDir);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stdout.write(
      JSON.stringify(
        {
          decision: 'escalate',
          risk_level: 'high',
          reasoning: ['Failed to load dotto artifacts.', `artifactsDir=${artifactsDir}`, msg],
          conditions: [
            'Ensure graph.json, drift.json, impact.json, and intent.json exist in the artifacts directory.',
            'If you intended to generate artifacts, run the deterministic dotto step before the governor.'
          ]
        },
        null,
        2
      ) + '\n'
    );
    return 2;
  }

  const decision = await runGovernor(
    {
      artifactsDir,
      policyPath,
      memoryPath
    },
    artifacts,
    { change_id: changeId }
  );

  process.stdout.write(JSON.stringify(decision, null, 2) + '\n');

  if (decision.decision === 'block') return 1;
  if (decision.decision === 'escalate') return 2;
  return 0;
}

async function startServer(): Promise<void> {
  const port = Number(process.env.PORT ?? 5000);
  const server = http.createServer(async (req: http.IncomingMessage, res: http.ServerResponse) => {
    try {
      const parsedUrl = req.url ? new URL(req.url, `http://${req.headers.host ?? 'localhost'}`) : null;
      const pathname = parsedUrl?.pathname ?? req.url ?? '/';

      if (req.method === 'GET' && req.url === '/healthz') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (req.method === 'GET' && pathname.startsWith('/artifacts/')) {
        const rel = pathname.replace('/artifacts/', '');
        if (!rel || rel.includes('..') || rel.includes('\\') || rel.startsWith('/')) {
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid_request' }));
          return;
        }

        const artifactsRoot = path.resolve('artifacts');
        const filePath = path.resolve(artifactsRoot, rel);
        if (!filePath.startsWith(artifactsRoot)) {
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid_request' }));
          return;
        }

        try {
          const raw = await readFile(filePath, 'utf8');
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(raw);
        } catch {
          res.writeHead(404, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'not_found' }));
        }
        return;
      }

      // Serve memory files (decisions.json for learning loop)
      if (req.method === 'GET' && pathname.startsWith('/memory/')) {
        const rel = pathname.replace('/memory/', '');
        if (!rel || rel.includes('..') || rel.includes('\\') || rel.startsWith('/')) {
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid_request' }));
          return;
        }

        const memoryRoot = path.resolve('src/memory');
        const filePath = path.resolve(memoryRoot, rel);
        if (!filePath.startsWith(memoryRoot)) {
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid_request' }));
          return;
        }

        try {
          const raw = await readFile(filePath, 'utf8');
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(raw);
        } catch {
          res.writeHead(404, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'not_found' }));
        }
        return;
      }

      if (req.method === 'POST' && pathname === '/dotto/run') {
        try {
          await assertDottoInstalled();

          const body = (await readJsonBody(req)) as {
            artifactsDir?: string;
            baseRef?: string;
            change_id?: string;
            intent?: unknown;
          };

          const artifactsDir = body.artifactsDir ?? path.resolve('artifacts');
          const changeId = body.change_id ?? process.env.GITHUB_SHA ?? `local-${Date.now()}`;

          await generateArtifacts({
            artifactsDir,
            baseRef: body.baseRef,
            change_id: changeId,
            intent: body.intent
          });

          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: true, artifactsDir, change_id: changeId }));
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('tracingChannel') || msg.includes('diagChan')) {
            res.writeHead(500, { 'content-type': 'application/json' });
            res.end(JSON.stringify({
              error: 'node_version_incompatible',
              message: `@natalietdg/dotto requires Node.js v20+. Current: ${process.version}. Please upgrade Node.js or use pre-generated artifacts.`
            }));
          } else {
            res.writeHead(500, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: 'internal_error', message: msg }));
          }
        }
        return;
      }

      if (req.method === 'POST' && req.url === '/run') {
        const body = (await readJsonBody(req)) as {
          artifactsDir?: string;
          policyPath?: string;
          memoryPath?: string;
          model?: string;
          change_id?: string;
        };

        const artifactsDir = body.artifactsDir ?? path.resolve('artifacts');
        const policyPath = body.policyPath ?? path.resolve('src/policy/rules.json');
        const memoryPath = body.memoryPath ?? path.resolve('src/memory/decisions.json');

        const artifacts = await loadArtifacts(artifactsDir);
        const decision = await runGovernor(
          {
            artifactsDir,
            policyPath,
            memoryPath,
            model: body.model
          },
          artifacts,
          { change_id: body.change_id }
        );

        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(decision));
        return;
      }

      if (req.method === 'POST' && req.url === '/feedback') {
        const body = (await readJsonBody(req)) as {
          memoryPath?: string;
          change_id: string;
          governor: {
            decision: 'approve' | 'block' | 'escalate';
            risk_level: 'low' | 'medium' | 'high';
            reasoning: string[];
          };
          human: {
            outcome: 'accepted' | 'overridden' | 'modified';
            override_decision?: 'approve' | 'block';
            notes?: string;
          };
        };

        if (!body?.change_id || typeof body.change_id !== 'string') {
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid_request', message: 'change_id is required' }));
          return;
        }

        const memoryPath = body.memoryPath ?? path.resolve('src/memory/decisions.json');

        await appendMemoryDecision(memoryPath, {
          timestamp: new Date().toISOString(),
          change_id: body.change_id,
          decision: body.governor.decision,
          risk_level: body.governor.risk_level,
          reasoning: body.governor.reasoning,
          human_feedback: {
            outcome: body.human.outcome,
            override_decision: body.human.override_decision,
            notes: body.human.notes
          }
        });

        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not_found' }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'internal_error', message: msg }));
    }
  });

  server.listen(port, () => {
    process.stdout.write(`dotto-ai server listening on :${port}\n`);
  });
}

const once = process.argv.includes('--once');
if (once) {
  runOnce()
    .then((code) => process.exit(code))
    .catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(msg + '\n');
      process.exit(2);
    });
} else {
  startServer().catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(msg + '\n');
    process.exit(1);
  });
}

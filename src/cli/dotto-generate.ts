import path from "node:path";
import { readFile } from "node:fs/promises";

import { generateArtifacts } from "../engine/dotto.js";

function getArgValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  const next = process.argv[idx + 1];
  if (!next || next.startsWith("--")) return null;
  return next;
}

async function main(): Promise<void> {
  const artifactsDir = getArgValue("--artifacts") ?? path.resolve("artifacts");
  const baseRef = getArgValue("--base-ref") ?? undefined;
  const changeId = getArgValue("--change-id") ?? process.env.GITHUB_SHA ?? undefined;
  const intentPath = getArgValue("--intent-path") ?? null;

  let intent: unknown = {};
  if (intentPath) {
    const raw = await readFile(intentPath, "utf8");
    intent = JSON.parse(raw);
  }

  await generateArtifacts({
    artifactsDir,
    baseRef,
    change_id: changeId,
    intent,
  });
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(msg + "\n");
  process.exit(1);
});

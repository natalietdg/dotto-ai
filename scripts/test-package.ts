#!/usr/bin/env tsx
/**
 * dotto-ai package smoke test
 *
 * Verifies that the published package surface works:
 *   1. Main barrel import
 *   2. Subpath imports (engine, crypto, governor, proof, hcs10, types)
 *   3. CLI executables exist and have shebangs
 *   4. .d.ts type declarations exist
 *   5. Core functionality: createReceipt → verifyReceipt round-trip
 *   6. Core functionality: generateArtifacts + loadArtifacts
 *   7. npm pack dry-run (correct files included/excluded)
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const DIST = path.join(ROOT, "dist");

interface TestResult {
  name: string;
  passed: boolean;
  detail: string;
}

const results: TestResult[] = [];

function test(name: string, fn: () => string) {
  try {
    const detail = fn();
    results.push({ name, passed: true, detail });
    console.log(`  ✅ ${name}`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    results.push({ name, passed: false, detail: msg });
    console.log(`  ❌ ${name}: ${msg}`);
  }
}

// ──────────────────────────────────────────
// Step 1: Build check
// ──────────────────────────────────────────
console.log("\n🔨 Step 1 — Build");

test("dist/ directory exists", () => {
  if (!existsSync(DIST)) throw new Error("dist/ not found — run npm run build first");
  return "dist/ exists";
});

test("dist/index.js exists", () => {
  if (!existsSync(path.join(DIST, "index.js"))) throw new Error("missing");
  return "present";
});

test("dist/index.d.ts exists", () => {
  if (!existsSync(path.join(DIST, "index.d.ts"))) throw new Error("missing");
  return "present";
});

test("dist/index.d.ts.map exists", () => {
  if (!existsSync(path.join(DIST, "index.d.ts.map"))) throw new Error("missing");
  return "present";
});

// ──────────────────────────────────────────
// Step 2: Main barrel import
// ──────────────────────────────────────────
console.log("\n📦 Step 2 — Main barrel import");

test("import('dotto-ai') resolves all exports", async () => {
  const mod = await import(path.join(DIST, "index.js"));
  const keys = Object.keys(mod);

  const required = [
    "generateArtifacts",
    "loadArtifacts",
    "GraphEngine",
    "Crawler",
    "SchemaDiffer",
    "GitScanner",
    "ImpactAnalyzer",
    "IntentDriftDetector",
    "HederaBackend",
    "NoneBackend",
    "EpochManager",
    "HederaNFTService",
    "createProofBackend",
    "HCS10AgentManager",
    "createReceipt",
    "verifyReceipt",
    "anchorReceiptToHedera",
    "computeArtifactsHash",
    "signPayload",
    "verifySignature",
    "isExpired",
    "KMSSigner",
    "runGovernor",
    "extractChangeSignature",
    "extractDriftVectors",
    "extractIntentsFromContent",
    "intentCoversChange",
  ];

  const missing = required.filter((k) => !keys.includes(k));
  if (missing.length > 0) throw new Error(`Missing exports: ${missing.join(", ")}`);
  return `${keys.length} exports found`;
});

// ──────────────────────────────────────────
// Step 3: Subpath imports
// ──────────────────────────────────────────
console.log("\n🔀 Step 3 — Subpath imports");

const subpaths = [
  { name: "engine", file: "engine/dotto.js", expect: "generateArtifacts" },
  { name: "crypto", file: "crypto/receipt.js", expect: "createReceipt" },
  { name: "governor", file: "gemini/governor.js", expect: "runGovernor" },
  { name: "proof", file: "engine/proof/index.js", expect: "HederaBackend" },
  { name: "hcs10", file: "engine/hcs10/HCS10AgentManager.js", expect: "HCS10AgentManager" },
  { name: "types", file: "engine/core/types.js", expect: null },
];

for (const sp of subpaths) {
  test(`import('dotto-ai/${sp.name}')`, async () => {
    const mod = await import(path.join(DIST, sp.file));
    if (sp.expect && !(sp.expect in mod)) {
      throw new Error(`Expected export '${sp.expect}' not found`);
    }
    return `ok — ${Object.keys(mod).length} exports`;
  });
}

// ──────────────────────────────────────────
// Step 4: CLI executables
// ──────────────────────────────────────────
console.log("\n⚡ Step 4 — CLI executables");

const clis = [
  { bin: "dotto-verify", file: "cli/dotto-verify.js" },
  { bin: "dotto-generate", file: "cli/dotto-generate.js" },
  { bin: "dotto-scan", file: "cli/dotto-local-scan.js" },
];

for (const cli of clis) {
  test(`${cli.bin} exists with shebang`, () => {
    const fp = path.join(DIST, cli.file);
    if (!existsSync(fp)) throw new Error(`${cli.file} not found`);
    const content = readFileSync(fp, "utf8");
    if (!content.startsWith("#!/usr/bin/env node")) {
      throw new Error(`Missing or wrong shebang: ${content.split("\n")[0]}`);
    }
    return "#!/usr/bin/env node";
  });
}

// ──────────────────────────────────────────
// Step 5: Type declarations
// ──────────────────────────────────────────
console.log("\n📝 Step 5 — Type declarations (.d.ts)");

const declFiles = [
  "index.d.ts",
  "engine/dotto.d.ts",
  "crypto/receipt.d.ts",
  "gemini/governor.d.ts",
  "engine/proof/index.d.ts",
  "engine/hcs10/HCS10AgentManager.d.ts",
  "engine/core/types.d.ts",
  "crypto/kms-signer.d.ts",
];

for (const df of declFiles) {
  test(`dist/${df}`, () => {
    const fp = path.join(DIST, df);
    if (!existsSync(fp)) throw new Error("not found");
    const content = readFileSync(fp, "utf8");
    if (content.length < 10) throw new Error("file is suspiciously small");
    return `${content.length} bytes`;
  });
}

// ──────────────────────────────────────────
// Step 6: Receipt round-trip
// ──────────────────────────────────────────
console.log("\n🔐 Step 6 — createReceipt → verifyReceipt round-trip");

test("Create and verify a receipt", async () => {
  const { createReceipt, verifyReceipt } = await import(path.join(DIST, "crypto/receipt.js"));

  const receipt = await createReceipt({
    change_id: "test-package-smoke",
    ruling: "approve",
    risk_level: "low",
    reasoning: ["Smoke test — package verification"],
    affected_systems: ["test"],
    artifacts_hash: "sha256:test1234567890",
  });

  if (!receipt) throw new Error("createReceipt returned null");
  if (!receipt.signature) throw new Error("receipt missing signature");
  if (receipt.ruling !== "approve") throw new Error(`expected approve, got ${receipt.ruling}`);

  const verification = verifyReceipt(receipt);
  if (!verification.valid) throw new Error(`verification failed: ${verification.reason}`);

  return `Receipt created (${receipt.version}) and verified: ${verification.reason}`;
});

// ──────────────────────────────────────────
// Step 7: npm pack dry-run
// ──────────────────────────────────────────
console.log("\n📋 Step 7 — npm pack --dry-run");

test("Package includes only intended files", () => {
  const output = execSync("npm pack --dry-run 2>&1", { cwd: ROOT, encoding: "utf8" });

  // Should include
  const mustInclude = ["dist/index.js", "dist/index.d.ts", "package.json"];
  for (const f of mustInclude) {
    if (!output.includes(f)) throw new Error(`Missing: ${f}`);
  }

  // Should NOT include
  const mustExclude = ["src/server.ts", "tsconfig.json", "PRD-", "src/viewer/"];
  for (const f of mustExclude) {
    if (output.includes(f)) throw new Error(`Should be excluded: ${f}`);
  }

  const sizeMatch = output.match(/package size:\s+([\d.]+\s+\w+)/);
  return `Pack OK — ${sizeMatch ? sizeMatch[1] : "size unknown"}`;
});

// ──────────────────────────────────────────
// Summary
// ──────────────────────────────────────────
// Wait for any pending async tests
await new Promise((r) => setTimeout(r, 500));

const passed = results.filter((r) => r.passed).length;
const failed = results.filter((r) => !r.passed).length;

console.log("\n══════════════════════════════════════════");
console.log(`  PACKAGE TEST RESULTS: ${passed} passed, ${failed} failed`);
console.log("══════════════════════════════════════════");

if (failed > 0) {
  console.log("\nFailures:");
  for (const r of results.filter((r) => !r.passed)) {
    console.log(`  ❌ ${r.name}: ${r.detail}`);
  }
  process.exit(1);
} else {
  console.log("\n  ✅ All tests passed. Package is ready for npm publish.\n");
  process.exit(0);
}

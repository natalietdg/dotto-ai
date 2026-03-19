/**
 * Dotto Protocol — Hedera Testnet Verification
 *
 * Validates the full dotto governance protocol on Hedera testnet:
 *
 * Protocol Steps:
 *   1. Governance Anchor    — HCS message submission
 *   2. Receipt NFT          — HTS collection creation + minting
 *   3. Epoch Proof          — Merkle tree batching + root submission
 *   4. Receipt Chain        — Full receipt flow (HCS + NFT anchor)
 *   5. Agent Identity       — HCS-10 registration in HOL Registry
 *   6. KMS Signing          — AWS KMS ECDSA signing (optional)
 *   7. Governance Simulation — End-to-end: change → AI ruling → receipt → anchor → NFT
 *
 * Outputs:
 *   - Console: protocol step results with Hashscan links
 *   - File:    hedera-test-report.json (structured proof artifact)
 *
 * Prerequisites:
 *   - HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY in .env (testnet account)
 *   - HEDERA_TOPIC_ID in .env (existing HCS topic for receipts)
 *   - npm install (all dependencies)
 *
 * Usage:
 *   npx tsx scripts/test-hedera-integration.ts
 *   npx tsx scripts/test-hedera-integration.ts --skip-hcs10   # Skip HCS-10 (slow)
 *   npx tsx scripts/test-hedera-integration.ts --only nft     # Run one test
 */

import "dotenv/config";
import crypto from "node:crypto";
import { writeFile } from "node:fs/promises";

// ─── Helpers ───────────────────────────────────────────────────────────────

const PASS = "\x1b[32m✓\x1b[0m";
const FAIL = "\x1b[31m✗\x1b[0m";
const SKIP = "\x1b[33m⊘\x1b[0m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

type TestResult = {
  name: string;
  status: "pass" | "fail" | "skip";
  detail: string;
  link?: string;
  data?: Record<string, unknown>;
};
const results: TestResult[] = [];

function log(msg: string) {
  process.stdout.write(msg + "\n");
}

function header(title: string) {
  log(`\n${BOLD}═══ ${title} ═══${RESET}\n`);
}

async function runTest(
  name: string,
  fn: () => Promise<{ detail: string; link?: string; data?: Record<string, unknown> }>
): Promise<void> {
  try {
    log(`  Testing: ${name}...`);
    const { detail, link, data } = await fn();
    results.push({ name, status: "pass", detail, link, data });
    log(`  ${PASS} ${name}: ${detail}`);
    if (link) log(`    → ${link}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ name, status: "fail", detail: msg });
    log(`  ${FAIL} ${name}: ${msg}`);
  }
}

function skipTest(name: string, reason: string) {
  results.push({ name, status: "skip", detail: reason });
  log(`  ${SKIP} ${name}: ${reason}`);
}

// ─── Environment Check ────────────────────────────────────────────────────

function checkNodeVersion(): boolean {
  const major = parseInt(process.version.slice(1).split(".")[0], 10);
  if (major < 20) {
    log(`${FAIL} Node.js ${process.version} detected — @hashgraph/sdk v2.51+ requires Node.js 20+`);
    log(`  The 'tracingChannel' API used by the SDK was added in Node 20.`);
    log(`  Upgrade Node.js: nvm install 20 && nvm use 20`);
    log(`  Or: brew install node@20`);
    return false;
  }
  log(`${PASS} Node.js ${process.version} (>= 20 required)`);
  return true;
}

function checkEnv(): boolean {
  const required = ["HEDERA_ACCOUNT_ID", "HEDERA_PRIVATE_KEY"];
  const missing = required.filter((k) => !process.env[k]);

  if (missing.length > 0) {
    log(`${FAIL} Missing environment variables: ${missing.join(", ")}`);
    log(`  Create a .env file with your Hedera testnet credentials.`);
    log(`  Get a free testnet account at https://portal.hedera.com/`);
    return false;
  }

  log(`${PASS} Hedera credentials configured`);
  log(`  Account: ${process.env.HEDERA_ACCOUNT_ID}`);
  log(`  Network: ${process.env.HEDERA_NETWORK || "testnet"}`);
  if (process.env.HEDERA_TOPIC_ID) {
    log(`  Topic:   ${process.env.HEDERA_TOPIC_ID}`);
  }
  return true;
}

// ─── Protocol Step 1: Governance Anchor ──────────────────────────────────

async function testHCSSubmission(): Promise<{
  detail: string;
  link?: string;
  data?: Record<string, unknown>;
}> {
  const { Client, TopicMessageSubmitTransaction, AccountId, PrivateKey } =
    await import("@hashgraph/sdk");

  const topicId = process.env.HEDERA_TOPIC_ID;
  if (!topicId) throw new Error("HEDERA_TOPIC_ID not set — skip HCS test");

  const network = process.env.HEDERA_NETWORK || "testnet";
  const client = network === "testnet" ? Client.forTestnet() : Client.forMainnet();
  client.setOperator(
    AccountId.fromString(process.env.HEDERA_ACCOUNT_ID!),
    PrivateKey.fromString(process.env.HEDERA_PRIVATE_KEY!)
  );

  const testMessage = JSON.stringify({
    type: "test-verification",
    source: "dotto-ai/hedera-integration-test",
    timestamp: new Date().toISOString(),
    change_id: `test-${Date.now()}`,
  });

  const tx = new TopicMessageSubmitTransaction({ topicId, message: testMessage });
  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);

  const seqNum = receipt.topicSequenceNumber?.toString() || "unknown";
  const txId = response.transactionId.toString();

  await client.close();

  const link = `https://hashscan.io/${network}/transaction/${txId}`;
  return {
    detail: `Message #${seqNum} submitted (tx: ${txId})`,
    link,
    data: { topic_id: topicId, sequence_number: seqNum, transaction_id: txId, hashscan: link },
  };
}

// ─── Protocol Step 2: Receipt NFT ────────────────────────────────────────

async function testNFTMinting(): Promise<{
  detail: string;
  link?: string;
  data?: Record<string, unknown>;
}> {
  const { HederaNFTService } = await import("../src/engine/proof/HederaNFTService.js");

  const nftService = new HederaNFTService();
  await nftService.initialize();

  const info = nftService.getCollectionInfo();
  log(`    Collection: ${info.token_id} (${info.name})`);

  const nftProof = await nftService.mintGovernanceReceipt({
    change_id: `test-${Date.now()}`,
    ruling: "approve",
    risk_level: "low",
    receipt_url: "https://dotto-ai.example.com/receipts/test",
  });

  await nftService.close();

  return {
    detail: `NFT #${nftProof.serial_number} minted on token ${nftProof.token_id}`,
    link: nftProof.hashscan_link,
    data: {
      token_id: nftProof.token_id,
      serial_number: nftProof.serial_number,
      collection: info.name,
      hashscan: nftProof.hashscan_link,
    },
  };
}

// ─── Protocol Step 3: Epoch Proof ────────────────────────────────────────

async function testEpochBatching(): Promise<{
  detail: string;
  link?: string;
  data?: Record<string, unknown>;
}> {
  const { HederaBackend } = await import("../src/engine/proof/HederaBackend.js");

  if (!process.env.HEDERA_TOPIC_ID) throw new Error("HEDERA_TOPIC_ID not set — skip epoch test");

  const backend = new HederaBackend(true, 15);
  await backend.initialize();

  // Add 3 test events to epoch batch
  for (let i = 1; i <= 3; i++) {
    await backend.record({
      nodeId: `test-node-${i}`,
      eventType: "modified",
      hash: crypto.createHash("sha256").update(`test-data-${i}`).digest("hex"),
      metadata: { ruling: "approve", risk_level: "low", breaking: false },
      timestamp: new Date().toISOString(),
    });
  }

  // Submit epoch
  const result = await backend.submitEpoch();
  await backend.close();

  if (!result) throw new Error("No epoch was produced (empty batch?)");

  return {
    detail: `Epoch #${result.epoch.epoch_id}: ${result.epoch.artifacts.length} artifacts, root: ${result.epoch.merkle_root.slice(0, 16)}...`,
    link: result.proof.link,
    data: {
      epoch_id: result.epoch.epoch_id,
      artifact_count: result.epoch.artifacts.length,
      merkle_root: result.epoch.merkle_root,
      hashscan: result.proof.link,
    },
  };
}

// ─── Protocol Step 4: Receipt Chain ──────────────────────────────────────

async function testReceiptFlow(): Promise<{
  detail: string;
  link?: string;
  data?: Record<string, unknown>;
}> {
  const { createReceipt, anchorReceiptToHedera } = await import("../src/crypto/receipt.js");

  // Create a receipt
  const receipt = await createReceipt({
    change_id: `integration-test-${Date.now()}`,
    ruling: "approve",
    risk_level: "low",
    artifacts: { test: true, timestamp: new Date().toISOString() },
  });

  log(`    Receipt created: ${receipt.change_id}`);
  log(`    Signature: ${receipt.signature.slice(0, 16)}...`);

  // Anchor to Hedera (HCS + NFT)
  const anchored = await anchorReceiptToHedera(receipt);

  const parts: string[] = [];
  if (anchored.hedera_proof) parts.push(`HCS seq#${anchored.hedera_proof.sequence_number}`);
  if (anchored.nft_proof) parts.push(`NFT #${anchored.nft_proof.serial_number}`);

  if (parts.length === 0) {
    throw new Error("Receipt was not anchored — check Hedera env vars");
  }

  return {
    detail: `Receipt anchored: ${parts.join(" + ")}`,
    link: anchored.hedera_proof?.hashscan_link || anchored.nft_proof?.hashscan_link,
    data: {
      receipt_id: anchored.change_id,
      ruling: anchored.ruling,
      hcs_sequence: anchored.hedera_proof?.sequence_number,
      hcs_topic: anchored.hedera_proof?.topic_id,
      hcs_tx: anchored.hedera_proof?.transaction_id,
      hcs_hashscan: anchored.hedera_proof?.hashscan_link,
      nft_token: anchored.nft_proof?.token_id,
      nft_serial: anchored.nft_proof?.serial_number,
      nft_hashscan: anchored.nft_proof?.hashscan_link,
    },
  };
}

// ─── Protocol Step 5: Agent Identity ─────────────────────────────────────

async function testHCS10Agent(): Promise<{
  detail: string;
  link?: string;
  data?: Record<string, unknown>;
}> {
  const { HCS10AgentManager } = await import("../src/engine/hcs10/HCS10AgentManager.js");

  const agent = new HCS10AgentManager();
  await agent.initialize();

  const info = agent.getAgentInfo();

  if (!info.registered) {
    throw new Error("Agent registration failed");
  }

  await agent.stop();

  const network = process.env.HEDERA_NETWORK || "testnet";

  const link = info.inboundTopicId
    ? `https://hashscan.io/${network}/topic/${info.inboundTopicId}`
    : undefined;

  return {
    detail: `Agent ${info.accountId} registered (inbound: ${info.inboundTopicId})`,
    link,
    data: {
      account_id: info.accountId,
      inbound_topic: info.inboundTopicId,
      outbound_topic: info.outboundTopicId,
      network,
      hashscan: link,
    },
  };
}

// ─── Protocol Step 6: KMS Signing ────────────────────────────────────────

async function testKMSSigning(): Promise<{
  detail: string;
  link?: string;
  data?: Record<string, unknown>;
}> {
  const { KMSSigner } = await import("../src/crypto/kms-signer.js");

  const keyId = process.env.AWS_KMS_KEY_ID!;
  const region = process.env.AWS_REGION!;

  const signer = new KMSSigner(keyId, region);
  await signer.initialize();

  log(`    KMS key: ${keyId}`);
  log(`    Region:  ${region}`);

  // Test 1: Sign and verify a payload
  const testPayload = JSON.stringify({
    change_id: `kms-test-${Date.now()}`,
    ruling: "approve",
    timestamp: new Date().toISOString(),
  });

  const signature = await signer.sign(testPayload);
  log(`    Signature: ${signature.slice(0, 32)}...`);

  const valid = signer.verify(testPayload, signature);
  if (!valid) throw new Error("KMS signature verification failed");

  // Test 2: Verify tampered data fails
  const tamperedValid = signer.verify(testPayload + "x", signature);
  if (tamperedValid) throw new Error("KMS accepted tampered data — verification is broken");

  return {
    detail: `Sign + verify OK (key: ${keyId.slice(0, 20)}...)`,
    data: { key_id: keyId, region, algorithm: "ECDSA_SHA_256" },
  };
}

// ─── Protocol Step 7: Governance Simulation ──────────────────────────────

async function testGovernanceSimulation(): Promise<{
  detail: string;
  link?: string;
  data?: Record<string, unknown>;
}> {
  const { createReceipt, verifyReceipt, anchorReceiptToHedera } =
    await import("../src/crypto/receipt.js");

  const changeId = `gov-sim-${Date.now()}`;
  const steps: string[] = [];

  // Step 1: Simulate change detection
  const simulatedDrift = {
    nodeId: "UserProfile",
    changeType: "modified",
    breaking: true,
    changes: [
      { type: "field_type_changed", field: "email", oldType: "string", newType: "string | null" },
    ],
  };
  steps.push("change detected");
  log(`    1. Change detected: ${simulatedDrift.nodeId} — breaking schema change`);

  // Step 2: Simulate AI ruling (deterministic for test — no Gemini call)
  const ruling = simulatedDrift.breaking ? ("escalate" as const) : ("approve" as const);
  const riskLevel = simulatedDrift.breaking ? ("high" as const) : ("low" as const);
  steps.push(`AI ruling: ${ruling}`);
  log(`    2. AI ruling: ${ruling.toUpperCase()} (risk: ${riskLevel})`);

  // Step 3: Simulate human override (approve the escalation)
  const finalRuling = "approve" as const;
  const finalRisk = "medium" as const;
  steps.push("human override: approve");
  log(`    3. Human override: APPROVE (developer reviewed and approved)`);

  // Step 4: Create signed receipt
  const receipt = await createReceipt({
    change_id: changeId,
    ruling: finalRuling,
    risk_level: finalRisk,
    artifacts: simulatedDrift,
  });
  steps.push(`receipt signed (${receipt.algorithm})`);
  log(`    4. Receipt signed: ${receipt.change_id} (${receipt.algorithm})`);

  // Step 5: Verify receipt integrity
  const verification = verifyReceipt(receipt, { require_approval: true });
  if (!verification.valid) throw new Error(`Receipt verification failed: ${verification.message}`);
  steps.push("receipt verified");
  log(`    5. Receipt verified: signature intact, ruling approved`);

  // Step 6: Anchor to Hedera (if configured)
  let hcsLink: string | undefined;
  let nftSerial: string | undefined;
  if (process.env.HEDERA_ACCOUNT_ID && process.env.HEDERA_PRIVATE_KEY) {
    const anchored = await anchorReceiptToHedera(receipt);
    if (anchored.hedera_proof) {
      hcsLink = anchored.hedera_proof.hashscan_link;
      steps.push(`HCS anchor: seq #${anchored.hedera_proof.sequence_number}`);
      log(`    6. HCS anchor: seq #${anchored.hedera_proof.sequence_number}`);
    }
    if (anchored.nft_proof) {
      nftSerial = anchored.nft_proof.serial_number;
      steps.push(`NFT minted: serial #${anchored.nft_proof.serial_number}`);
      log(`    7. NFT minted: serial #${anchored.nft_proof.serial_number}`);
    }
  } else {
    steps.push("Hedera anchor: skipped (no credentials)");
    log(`    6. Hedera anchor: skipped (no credentials)`);
  }

  return {
    detail: `Full governance flow completed (${steps.length} steps)`,
    link: hcsLink,
    data: {
      change_id: changeId,
      simulated_change: simulatedDrift.nodeId,
      initial_ruling: ruling,
      human_override: true,
      final_ruling: finalRuling,
      risk_level: finalRisk,
      receipt_algorithm: receipt.algorithm,
      hcs_hashscan: hcsLink,
      nft_serial: nftSerial,
      steps,
    },
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const skipHCS10 = args.includes("--skip-hcs10");
  const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;

  log(`\n${BOLD}╔══════════════════════════════════════════════════════════╗${RESET}`);
  log(`${BOLD}║    Dotto Protocol — Hedera Testnet Verification         ║${RESET}`);
  log(`${BOLD}╚══════════════════════════════════════════════════════════╝${RESET}\n`);

  // Environment check
  header("Environment");
  if (!checkNodeVersion()) {
    process.exit(1);
  }
  if (!checkEnv()) {
    process.exit(1);
  }

  // Protocol Step 1: Governance Anchor
  if (!only || only === "hcs") {
    header("Protocol Step 1 — Governance Anchor");
    if (process.env.HEDERA_TOPIC_ID) {
      await runTest("Submit governance message to HCS topic", testHCSSubmission);
    } else {
      skipTest("Governance anchor", "HEDERA_TOPIC_ID not set");
    }
  }

  // Protocol Step 2: Receipt NFT
  if (!only || only === "nft") {
    header("Protocol Step 2 — Receipt NFT");
    await runTest("Create NFT collection + mint governance receipt", testNFTMinting);
  }

  // Protocol Step 3: Epoch Proof
  if (!only || only === "epoch") {
    header("Protocol Step 3 — Epoch Proof");
    if (process.env.HEDERA_TOPIC_ID) {
      await runTest("Batch 3 events → submit epoch Merkle root", testEpochBatching);
    } else {
      skipTest("Epoch proof", "HEDERA_TOPIC_ID not set");
    }
  }

  // Protocol Step 4: Receipt Chain
  if (!only || only === "receipt") {
    header("Protocol Step 4 — Receipt Chain");
    await runTest("Create receipt → anchor HCS → mint NFT", testReceiptFlow);
  }

  // Protocol Step 5: Agent Identity
  if (!only || only === "hcs10") {
    header("Protocol Step 5 — Agent Identity");
    if (skipHCS10) {
      skipTest("Agent identity", "Skipped via --skip-hcs10 flag");
    } else {
      await runTest("Register governance agent in HOL Registry", testHCS10Agent);
    }
  }

  // Protocol Step 6: KMS Signing
  if (!only || only === "kms") {
    header("Protocol Step 6 — KMS Signing");
    if (process.env.AWS_KMS_KEY_ID && process.env.AWS_REGION) {
      await runTest("KMS ECDSA sign + verify", testKMSSigning);
    } else {
      skipTest("KMS signing", "AWS_KMS_KEY_ID or AWS_REGION not set");
    }
  }

  // Protocol Step 7: Governance Simulation
  if (!only || only === "governance") {
    header("Protocol Step 7 — Governance Simulation");
    await runTest("Full flow: change → ruling → receipt → anchor → NFT", testGovernanceSimulation);
  }

  // Summary
  header("Summary");
  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const skipped = results.filter((r) => r.status === "skip").length;

  for (const r of results) {
    const icon = r.status === "pass" ? PASS : r.status === "fail" ? FAIL : SKIP;
    log(`  ${icon} ${r.name}`);
    if (r.link) log(`    → ${r.link}`);
  }

  log(`\n  ${BOLD}Results: ${passed} passed, ${failed} failed, ${skipped} skipped${RESET}\n`);

  // Write structured report artifact
  const report = {
    timestamp: new Date().toISOString(),
    network: process.env.HEDERA_NETWORK || "testnet",
    account: process.env.HEDERA_ACCOUNT_ID,
    summary: { passed, failed, skipped, total: results.length },
    tests: Object.fromEntries(
      results.map((r) => [
        r.name
          .replace(/[^a-zA-Z0-9]+/g, "_")
          .toLowerCase()
          .replace(/^_|_$/g, ""),
        {
          status: r.status,
          detail: r.detail,
          ...(r.link ? { hashscan: r.link } : {}),
          ...(r.data ?? {}),
        },
      ])
    ),
  };

  const reportPath = "hedera-test-report.json";
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  log(`  ${PASS} Report saved: ${reportPath}`);

  if (failed > 0) {
    log(`\n${FAIL} Some steps failed. Check Hedera credentials and network connectivity.\n`);
    process.exit(1);
  }

  if (passed > 0) {
    log(`\n${PASS} All protocol steps verified on testnet!\n`);
    log(`  Proof artifact: ${reportPath}`);
    log(`  Next steps:`);
    log(`  1. Check Hashscan links above to verify on-chain data`);
    log(`  2. Run the full server: npm run dev`);
    log(`  3. Trigger a governance decision from the viewer UI\n`);
  }

  process.exit(0);
}

main().catch((err) => {
  log(`\n${FAIL} Fatal error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});

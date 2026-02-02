#!/usr/bin/env node
/**
 * Dotto Receipt Verification CLI
 *
 * This is the enforcement gate that makes authorization non-bypassable.
 * If this command fails, CI/CD must fail. No exceptions.
 *
 * Usage:
 *   npx tsx src/cli/dotto-verify.ts --receipt artifacts/authorization-receipt.json
 *   npx tsx src/cli/dotto-verify.ts --artifacts artifacts/
 *
 * Exit codes:
 *   0 - Receipt valid and approved
 *   1 - Receipt valid but not approved (blocked/escalate)
 *   2 - Receipt invalid, missing, or tampered
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  AuthorizationReceipt,
  verifyReceipt,
  formatReceiptForDisplay,
  upgradeLegacyReceipt,
} from "../crypto/receipt.js";

function getArgValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  const next = process.argv[idx + 1];
  if (!next || next.startsWith("--")) return null;
  return next;
}

const HELP_TEXT = `
Dotto Receipt Verification CLI

USAGE:
  dotto-verify --receipt <path>     Verify a specific receipt file
  dotto-verify --artifacts <dir>    Verify receipt in artifacts directory
  dotto-verify --help               Show this help message

OPTIONS:
  --receipt <path>    Path to authorization-receipt.json
  --artifacts <dir>   Directory containing authorization-receipt.json
  --json              Output result as JSON (for CI integration)
  --allow-expired     Allow expired receipts (not recommended)

EXIT CODES:
  0  Receipt is valid and ruling is APPROVE
  1  Receipt is valid but ruling is BLOCK or ESCALATE
  2  Receipt is missing, invalid, or tampered

EXAMPLES:
  # Verify receipt before deployment
  dotto-verify --artifacts ./artifacts

  # In CI/CD pipeline
  dotto-verify --artifacts ./artifacts --json || exit 1

  # Verify specific receipt file
  dotto-verify --receipt ./my-receipt.json
`;

async function main(): Promise<number> {
  // Handle help
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    process.stdout.write(HELP_TEXT);
    return 0;
  }

  const receiptPath = getArgValue("--receipt");
  const artifactsDir = getArgValue("--artifacts");
  const jsonOutput = process.argv.includes("--json");
  const allowExpired = process.argv.includes("--allow-expired");

  // Determine receipt path
  let resolvedReceiptPath: string;
  if (receiptPath) {
    resolvedReceiptPath = path.resolve(receiptPath);
  } else if (artifactsDir) {
    resolvedReceiptPath = path.resolve(artifactsDir, "authorization-receipt.json");
  } else {
    // Default to artifacts/
    resolvedReceiptPath = path.resolve("artifacts", "authorization-receipt.json");
  }

  // Header
  if (!jsonOutput) {
    process.stdout.write("\n");
    process.stdout.write("══════════════════════════════════════════════════════════════\n");
    process.stdout.write("  DOTTO AUTHORIZATION VERIFICATION\n");
    process.stdout.write("══════════════════════════════════════════════════════════════\n\n");
    process.stdout.write(`  Receipt: ${resolvedReceiptPath}\n\n`);
  }

  // Load receipt
  let receipt: AuthorizationReceipt | null = null;
  try {
    const raw = await readFile(resolvedReceiptPath, "utf8");
    const parsed = JSON.parse(raw);

    // Handle legacy v1.0 format
    if (!parsed.version || parsed.version === "1.0") {
      receipt = upgradeLegacyReceipt(parsed);
    } else {
      receipt = parsed as AuthorizationReceipt;
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    if (jsonOutput) {
      process.stdout.write(
        JSON.stringify({
          valid: false,
          reason: "no_receipt",
          message: `Failed to load receipt: ${errorMessage}`,
          path: resolvedReceiptPath,
        }) + "\n"
      );
    } else {
      process.stdout.write("  ❌ FAILED: Missing or unreadable receipt\n\n");
      process.stdout.write(`  Error: ${errorMessage}\n\n`);
      process.stdout.write("  No deployment without authorization.\n");
      process.stdout.write("  Run governance and obtain human approval first.\n\n");
      process.stdout.write("══════════════════════════════════════════════════════════════\n\n");
    }
    return 2;
  }

  // Verify receipt
  const result = verifyReceipt(receipt, { require_approval: true });

  // Handle expired receipts if --allow-expired is set
  if (!result.valid && result.reason === "expired" && allowExpired) {
    // Re-verify without expiry check
    const expiryBypassResult = verifyReceipt(
      { ...receipt, expires_at: null },
      { require_approval: true }
    );
    if (expiryBypassResult.valid) {
      if (!jsonOutput) {
        process.stdout.write("  ⚠ WARNING: Receipt is expired but --allow-expired was set\n\n");
      }
      // Continue with the bypassed result
      Object.assign(result, expiryBypassResult);
      result.message = "Receipt verified (expiry bypassed). Deployment authorized.";
    }
  }

  // Output result
  if (jsonOutput) {
    process.stdout.write(
      JSON.stringify({
        ...result,
        path: resolvedReceiptPath,
      }) + "\n"
    );
  } else {
    if (result.valid) {
      process.stdout.write("  ✅ VERIFIED: Authorization confirmed\n\n");
      process.stdout.write(
        formatReceiptForDisplay(receipt)
          .split("\n")
          .map((line) => `  ${line}`)
          .join("\n") + "\n\n"
      );
      process.stdout.write("  Deployment authorized. Proceed.\n\n");
    } else {
      const icon = result.reason === "not_approved" ? "⛔" : "❌";
      process.stdout.write(`  ${icon} FAILED: ${result.message}\n\n`);

      if (result.reason === "invalid_signature") {
        process.stdout.write("  The receipt has been tampered with or is corrupted.\n");
        process.stdout.write("  Re-run governance to obtain a valid receipt.\n\n");
      } else if (result.reason === "expired") {
        process.stdout.write(`  Receipt expired at: ${receipt.expires_at}\n`);
        process.stdout.write("  Re-run governance to obtain a fresh receipt.\n\n");
      } else if (result.reason === "not_approved") {
        process.stdout.write(`  Ruling: ${receipt.ruling.toUpperCase()}\n`);
        process.stdout.write(`  Change: ${receipt.change_id}\n\n`);
        if (receipt.ruling === "escalate") {
          process.stdout.write("  Human review is required before deployment.\n\n");
        } else {
          process.stdout.write("  This change has been rejected. Deployment is not permitted.\n\n");
        }
      }
    }
    process.stdout.write("══════════════════════════════════════════════════════════════\n\n");
  }

  // Return appropriate exit code
  if (result.valid) {
    return 0;
  } else if (result.reason === "not_approved") {
    return 1;
  } else {
    return 2;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${msg}\n`);
    process.exit(2);
  });

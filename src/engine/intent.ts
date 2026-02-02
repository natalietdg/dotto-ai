/**
 * Intent parsing utilities for dotto governance system.
 * Pure functions with no Node.js dependencies - can be used in browser or server.
 */

/**
 * Extract @intent annotations from source file content.
 * Supports both line comments (// @intent ...) and JSDoc comments (* @intent ...)
 */
export function extractIntentsFromContent(content: string): string[] {
  const intents: string[] = [];
  // Match // @intent ... or * @intent ...
  const intentRegex = /(?:\/\/|\/?\*)\s*@intent\s+(.+?)(?:\n|\r|$|\*\/)/gi;
  let match;
  while ((match = intentRegex.exec(content)) !== null) {
    const intent = match[1].trim();
    if (intent) {
      intents.push(intent);
    }
  }
  return intents;
}

/**
 * Check if declared intents cover a specific code change.
 * Returns true if any intent mentions relevant field names or change patterns.
 */
export function intentCoversChange(
  intents: string[],
  change: { type: string; field: string; from?: string; to?: string }
): boolean {
  const intentText = intents.join(" ").toLowerCase();
  const field = change.field.toLowerCase();
  const from = change.from?.toLowerCase() || "";
  const to = change.to?.toLowerCase() || "";

  // Check if intent mentions the field or the rename
  if (intentText.includes(field)) return true;
  if (from && intentText.includes(from)) return true;
  if (to && intentText.includes(to)) return true;

  // Check for common rename patterns
  if (change.type === "field_removed" || change.type === "field_added") {
    if (intentText.includes("rename")) return true;
  }
  if (change.type === "type_changed") {
    if (intentText.includes("type") || intentText.includes("change")) return true;
  }

  return false;
}

export type IntentAlignment = "ALIGNED" | "PARTIAL" | "UNCLEAR";

/**
 * Analyze intent alignment against detected changes.
 * Returns alignment status and details about which changes are covered.
 */
export function analyzeIntentAlignment(
  intents: string[],
  changes: Array<{ type: string; field: string; from?: string; to?: string; breaking: boolean }>
): {
  status: IntentAlignment;
  coveredChanges: string[];
  uncoveredChanges: string[];
} {
  if (!intents || intents.length === 0) {
    return {
      status: "UNCLEAR",
      coveredChanges: [],
      uncoveredChanges: changes.filter((c) => c.breaking).map((c) => c.field),
    };
  }

  const breakingChanges = changes.filter((c) => c.breaking);
  const coveredChanges: string[] = [];
  const uncoveredChanges: string[] = [];

  for (const change of breakingChanges) {
    if (intentCoversChange(intents, change)) {
      coveredChanges.push(change.field);
    } else {
      uncoveredChanges.push(change.field);
    }
  }

  let status: IntentAlignment;
  if (uncoveredChanges.length === 0 && coveredChanges.length > 0) {
    status = "ALIGNED";
  } else if (coveredChanges.length > 0) {
    status = "PARTIAL";
  } else {
    status = "UNCLEAR";
  }

  return { status, coveredChanges, uncoveredChanges };
}

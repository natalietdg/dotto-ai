/**
 * Proof backend factory
 */

import { ProofBackend } from "./ProofBackend.js";
import { NoneBackend } from "./NoneBackend.js";
import { HederaBackend } from "./HederaBackend.js";

export { ProofBackend } from "./ProofBackend.js";
export { NoneBackend } from "./NoneBackend.js";
export { HederaBackend } from "./HederaBackend.js";
export { EpochManager, Epoch, EpochArtifact } from "./EpochManager.js";

export function createProofBackend(type: string): ProofBackend {
  switch (type.toLowerCase()) {
    case "none":
      return new NoneBackend();
    case "hedera":
      return new HederaBackend();
    default:
      throw new Error(`Unknown proof backend: ${type}`);
  }
}

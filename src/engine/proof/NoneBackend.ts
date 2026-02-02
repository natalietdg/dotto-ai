/**
 * No-op proof backend (default)
 * Records nothing, always returns success
 */

import { ProofBackend } from "./ProofBackend.js";
import { ProofRef, ProofEvent } from "../core/types.js";

export class NoneBackend implements ProofBackend {
  readonly name = "none";

  async record(event: ProofEvent): Promise<ProofRef> {
    return {
      backend: this.name,
      id: `local-${Date.now()}`,
      timestamp: new Date().toISOString(),
    };
  }

  async verify(ref: ProofRef): Promise<boolean> {
    return true;
  }

  getLink(ref: ProofRef): string {
    return `No proof backend configured (${ref.id})`;
  }
}

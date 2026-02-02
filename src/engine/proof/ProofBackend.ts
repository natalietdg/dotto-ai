/**
 * Pluggable proof backend interface
 * Enables verification without exposing implementation details
 */

import { ProofRef, ProofEvent } from "../core/types.js";

export interface ProofBackend {
  readonly name: string;

  /**
   * Record a proof event
   * @returns Reference to the recorded proof
   */
  record(event: ProofEvent): Promise<ProofRef>;

  /**
   * Verify a proof reference
   * @returns true if proof is valid and verifiable
   */
  verify(ref: ProofRef): Promise<boolean>;

  /**
   * Get human-readable link to proof
   * @returns URL or description of proof location
   */
  getLink(ref: ProofRef): string;

  /**
   * Initialize the backend (optional)
   */
  initialize?(): Promise<void>;

  /**
   * Cleanup resources (optional)
   */
  close?(): Promise<void>;
}

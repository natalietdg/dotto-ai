/**
 * Hedera Token Service - NFT minting for governance receipts
 *
 * Each approved governance receipt is minted as an NFT on Hedera,
 * creating a verifiable on-chain proof of authorization.
 *
 * The NFT collection (DOTTO-GOV-RECEIPT / DGR) is created once
 * and persisted to .dotto/nft-token.json for reuse across restarts.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  Client,
  AccountId,
  PrivateKey,
  TokenCreateTransaction,
  TokenMintTransaction,
  TokenType,
  TokenSupplyType,
} from "@hashgraph/sdk";

export type NftProof = {
  token_id: string;
  serial_number: string;
  hashscan_link: string;
  demo?: boolean;
};

type NftTokenState = {
  token_id: string;
  created_at: string;
  network: string;
};

const STATE_DIR = path.resolve(".dotto");
const STATE_FILE = path.join(STATE_DIR, "nft-token.json");

const TOKEN_NAME = "DOTTO-GOV-RECEIPT";
const TOKEN_SYMBOL = "DGR";
const MAX_SUPPLY = 10_000;

export class HederaNFTService {
  private client: Client | null = null;
  private tokenId: string | null = null;
  private supplyKey: PrivateKey | null = null;
  private network: string;
  private treasuryId: string;

  constructor() {
    this.network = process.env.HEDERA_NETWORK || "testnet";
    this.treasuryId = process.env.HEDERA_ACCOUNT_ID || "";
  }

  /**
   * Initialize: set up Hedera client, load or create NFT collection.
   */
  async initialize(): Promise<void> {
    const accountId = process.env.HEDERA_ACCOUNT_ID;
    const privateKey = process.env.HEDERA_PRIVATE_KEY;

    if (!accountId || !privateKey) {
      throw new Error(
        "Hedera credentials not configured. Set HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY in .env"
      );
    }

    this.client = this.network === "testnet" ? Client.forTestnet() : Client.forMainnet();
    this.client.setOperator(AccountId.fromString(accountId), PrivateKey.fromString(privateKey));

    // Use the operator key as supply key for minting
    this.supplyKey = PrivateKey.fromString(privateKey);

    // Try to load existing token ID
    const loaded = await this.loadTokenState();
    if (loaded) {
      this.tokenId = loaded.token_id;
      console.log(`[NFT] Loaded existing collection: ${this.tokenId}`);
      return;
    }

    // Create new NFT collection
    await this.createCollection();
  }

  /**
   * Create the NFT collection on Hedera Token Service.
   */
  private async createCollection(): Promise<void> {
    if (!this.client || !this.supplyKey) {
      throw new Error("Client not initialized");
    }

    console.log(`[NFT] Creating collection: ${TOKEN_NAME} (${TOKEN_SYMBOL})`);

    const createTx = new TokenCreateTransaction()
      .setTokenName(TOKEN_NAME)
      .setTokenSymbol(TOKEN_SYMBOL)
      .setTokenType(TokenType.NonFungibleUnique)
      .setDecimals(0)
      .setInitialSupply(0)
      .setTreasuryAccountId(AccountId.fromString(this.treasuryId))
      .setSupplyType(TokenSupplyType.Finite)
      .setMaxSupply(MAX_SUPPLY)
      .setSupplyKey(this.supplyKey)
      .freezeWith(this.client);

    const signedTx = await createTx.sign(this.supplyKey);
    const response = await signedTx.execute(this.client);
    const receipt = await response.getReceipt(this.client);

    this.tokenId = receipt.tokenId?.toString() || null;

    if (!this.tokenId) {
      throw new Error("Failed to create NFT collection: no token ID returned");
    }

    console.log(`[NFT] Collection created: ${this.tokenId}`);

    // Persist token ID for reuse
    await this.saveTokenState({
      token_id: this.tokenId,
      created_at: new Date().toISOString(),
      network: this.network,
    });
  }

  /**
   * Mint a governance receipt as an NFT.
   * Metadata is a compact JSON buffer pointing to the full receipt.
   */
  async mintGovernanceReceipt(receiptData: {
    change_id: string;
    ruling: string;
    risk_level: string;
    receipt_url?: string;
  }): Promise<NftProof> {
    if (!this.client || !this.tokenId || !this.supplyKey) {
      throw new Error("NFT service not initialized. Call initialize() first.");
    }

    // Compact metadata — Hedera HTS enforces a 100-byte limit per NFT serial
    const metadata = JSON.stringify({
      cid: receiptData.change_id.slice(0, 16),
      r: receiptData.ruling[0], // a=approve, b=block, e=escalate
      rl: receiptData.risk_level[0], // l=low, m=medium, h=high
      t: new Date().toISOString().slice(0, 19),
    });

    const mintTx = new TokenMintTransaction()
      .setTokenId(this.tokenId)
      .setMetadata([Buffer.from(metadata)])
      .freezeWith(this.client);

    const signedTx = await mintTx.sign(this.supplyKey);
    const response = await signedTx.execute(this.client);
    const receipt = await response.getReceipt(this.client);

    const serialNumber = receipt.serials?.[0]?.toString() || "0";

    const hashscanLink = `https://hashscan.io/${this.network}/token/${this.tokenId}/${serialNumber}`;

    console.log(
      `[NFT] Minted receipt #${serialNumber}: ${receiptData.change_id} → ${hashscanLink}`
    );

    return {
      token_id: this.tokenId,
      serial_number: serialNumber,
      hashscan_link: hashscanLink,
    };
  }

  /**
   * Get collection info for API responses.
   */
  getCollectionInfo(): {
    token_id: string | null;
    name: string;
    symbol: string;
    network: string;
    hashscan_link: string | null;
  } {
    return {
      token_id: this.tokenId,
      name: TOKEN_NAME,
      symbol: TOKEN_SYMBOL,
      network: this.network,
      hashscan_link: this.tokenId
        ? `https://hashscan.io/${this.network}/token/${this.tokenId}`
        : null,
    };
  }

  /**
   * Check if the service is ready to mint.
   */
  isReady(): boolean {
    return this.client !== null && this.tokenId !== null;
  }

  /**
   * Load persisted token state from disk.
   */
  private async loadTokenState(): Promise<NftTokenState | null> {
    try {
      const raw = await readFile(STATE_FILE, "utf8");
      const state = JSON.parse(raw) as NftTokenState;

      // Validate network matches
      if (state.network !== this.network) {
        console.warn(
          `[NFT] Saved token is on ${state.network}, but current network is ${this.network}. Creating new collection.`
        );
        return null;
      }

      return state;
    } catch {
      return null;
    }
  }

  /**
   * Persist token state to disk.
   */
  private async saveTokenState(state: NftTokenState): Promise<void> {
    await mkdir(STATE_DIR, { recursive: true });
    await writeFile(STATE_FILE, JSON.stringify(state, null, 2) + "\n", "utf8");
  }

  /**
   * Clean up Hedera client.
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
  }
}

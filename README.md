# Dotto

**AI governance protocol for software change. AI assists. Humans authorize. Receipts enforce. Every receipt is anchored to Hedera — immutable proof of who authorized what, and why.**

Dotto is an autonomous change-control governance engine. It detects schema drift, analyzes breaking changes with AI, issues cryptographic authorization receipts, and anchors every decision to the Hedera network. No deployment without a valid receipt.

---

## How It Works

```
Code Change Detected
    |
    v
Schema Drift Analysis ──> Impact Assessment ──> AI Governance Engine
    |                                                    |
    v                                                    v
Graph Engine                                    Decision: APPROVE / BLOCK / ESCALATE
(dependency mapping)                                     |
                                                         v
                                            Authorization Receipt (signed)
                                                         |
                                     ┌───────────────────┼───────────────────┐
                                     v                   v                   v
                                HCS Anchor          HTS NFT Mint       Epoch Batch
                              (immutable msg)     (DOTTO-GOV-RECEIPT)  (Merkle root)
                                     |                   |                   |
                                     v                   v                   v
                                  Hashscan            Hashscan           Hashscan
```

## Hedera Integration

Dotto uses **4 Hedera services** for a complete on-chain proof chain:

### 1. HCS (Hedera Consensus Service) — Receipt Anchoring

Every governance decision is submitted as an immutable HCS message. The receipt includes the change ID, ruling, risk level, and artifacts hash. Once submitted, the proof cannot be altered.

### 2. HTS (Hedera Token Service) — NFT Receipts

Each approved receipt is minted as an NFT in the `DOTTO-GOV-RECEIPT` collection (`DGR`). The NFT metadata encodes the change ID, ruling, risk level, and timestamp. Every authorization becomes a verifiable on-chain token.

### 3. HCS-10 (OpenConvAI Protocol) — Agent Identity

Dotto registers as an autonomous agent in the HOL Registry via the HCS-10 standard. Other agents and users can discover Dotto, connect via HCS topics, and chat in natural language. The agent identity is embedded in every receipt for provable autonomous actions.

### 4. Epoch Batching — Merkle Root Anchoring

Multiple governance events are batched into epochs. A Merkle tree is computed over the batch, and the root is submitted to HCS. Each individual event can be verified against the Merkle root without replaying the entire epoch.

### 5. AWS KMS — HSM-Backed Signing (Optional)

When configured, receipts are signed with ECDSA via AWS KMS (`ECC_SECG_P256K1`). Private keys never leave the HSM. Hedera transactions are also signed through KMS. Falls back to HMAC-SHA256 when KMS is not configured.

## Authorization Receipt

The receipt is the atomic unit of Dotto. It's a cryptographic artifact that proves:

```json
{
  "change_id": "abc123",
  "ruling": "approve",
  "risk_level": "low",
  "timestamp": "2026-03-07T12:00:00Z",
  "algorithm": "kms-ecdsa-sha256",
  "artifacts_hash": "sha256:...",
  "signature": "3045022100...",
  "kms_key_id": "arn:aws:kms:us-east-1:...",
  "hedera_proof": {
    "topic_id": "0.0.7224074",
    "sequence_number": "42",
    "transaction_id": "0.0.7223674@...",
    "hashscan_link": "https://hashscan.io/testnet/transaction/0.0.7223674@..."
  },
  "nft_proof": {
    "token_id": "0.0.8126377",
    "serial_number": "7",
    "hashscan_link": "https://hashscan.io/testnet/transaction/..."
  },
  "agent_identity": {
    "account_id": "0.0.8145658",
    "inbound_topic_id": "0.0.8145660",
    "outbound_topic_id": "0.0.8145659",
    "registry": "HOL"
  }
}
```

## Agent Identity Flow

```
HCS-10 Agent Identity (Hedera account, HOL Registry)
    |
    v
Governance Decision (drift analysis -> risk assessment -> ruling)
    |
    v
Signed Receipt (HMAC-SHA256 or KMS ECDSA)
    |
    v
Hedera Anchor (HCS message + HTS NFT mint + Epoch batch)
    |
    v
Provable Autonomous Agent Action on Hedera
```

The agent has a verifiable identity on Hedera, makes decisions, signs receipts, and anchors proof on-chain. The full chain is traceable: which agent, which decision, which proof, which block.

---

## Quick Start

### Prerequisites

- Node.js 20+ (required for `@hashgraph/sdk`)
- Hedera testnet account ([portal.hedera.com](https://portal.hedera.com/))
- AI API key — Gemini ([aistudio.google.com](https://aistudio.google.com/))

### Installation

```bash
git clone https://github.com/your-org/dotto-ai.git
cd dotto-ai
npm install
cd src/viewer && npm install && cd ../..
```

### Environment

Create a `.env` file:

```env
# Gemini AI
GEMINI_API_KEY=your-gemini-api-key

# Receipt Signing
DOTTO_SIGNING_KEY=your-signing-secret

# Hedera (testnet)
HEDERA_ACCOUNT_ID=0.0.xxxxx
HEDERA_PRIVATE_KEY=<your-hex-encoded-private-key>
HEDERA_NETWORK=testnet
HEDERA_TOPIC_ID=0.0.xxxxx

# AWS KMS (optional — for HSM-backed signing)
AWS_REGION=us-east-1
AWS_KMS_KEY_ID=your-kms-key-id
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
```

### Run

```bash
# Backend + Viewer (concurrent)
npm run dev:all

# Backend only
npm run dev

# Viewer only (React)
npm run dev:viewer
```

The backend runs on `http://localhost:3001` and the viewer on `http://localhost:5173`.

### Verify Hedera Integration

```bash
npx tsx scripts/test-hedera-integration.ts
```

This runs end-to-end tests on Hedera testnet:

1. HCS message submission
2. NFT collection creation + minting
3. Epoch batching with Merkle root
4. Full receipt flow (HCS + NFT)
5. HCS-10 agent registration
6. AWS KMS signing (if configured)

### Enforce

```bash
# Verify a receipt is valid before deployment
npm run verify

# Enforce mode — block deployments without valid receipts
npm run enforce
```

---

## Architecture

```
src/
├── server.ts                          # HTTP API server
├── crypto/
│   ├── receipt.ts                     # Receipt creation, signing, verification, Hedera anchoring
│   └── kms-signer.ts                 # AWS KMS wrapper (ECDSA, HSM-backed)
├── engine/
│   ├── dotto.ts                       # Core orchestrator
│   ├── core/types.ts                  # Shared types
│   ├── diff/SchemaDiffer.ts           # Schema diff detection
│   ├── graph/GraphEngine.ts           # Dependency graph analysis
│   ├── scanner/
│   │   ├── Crawler.ts                 # File system crawler
│   │   ├── OpenAPIScanner.ts          # OpenAPI schema scanner
│   │   └── TypeScriptScanner.ts       # TypeScript type scanner
│   ├── analysis/
│   │   ├── ImpactAnalyzer.ts          # Breaking change impact analysis
│   │   ├── CompatibilityChecker.ts    # API compatibility checking
│   │   ├── IntentDriftDetector.ts     # Intent drift detection
│   │   └── ProvenanceAnalyzer.ts      # Change provenance analysis
│   ├── proof/
│   │   ├── HederaBackend.ts           # HCS anchoring + epoch batching
│   │   ├── HederaNFTService.ts        # HTS NFT collection + minting
│   │   ├── EpochManager.ts            # Merkle tree epoch manager
│   │   ├── ProofBackend.ts            # Proof backend interface
│   │   └── NoneBackend.ts             # No-op backend (offline mode)
│   └── hcs10/
│       ├── HCS10AgentManager.ts       # HCS-10 agent registration + messaging
│       └── types.ts                   # HCS-10 types
├── gemini/
│   └── governor.ts                    # AI governance engine
├── cli/
│   ├── dotto-verify.ts                # Receipt verification CLI
│   ├── dotto-generate.ts              # Artifact generation CLI
│   └── dotto-local-scan.ts            # Local scan CLI
└── viewer/                            # React frontend (Vite)
    └── src/
        ├── App.tsx                    # Main app
        └── components/
            ├── PipelinePanel.tsx       # Governance pipeline view
            ├── AnalysisViewApple.tsx   # Analysis details + Hedera proof cards
            └── Whitepaper.tsx         # Whitepaper with Hedera proof chain section
```

## API Endpoints

### Core

| Method | Endpoint    | Description                                                |
| ------ | ----------- | ---------------------------------------------------------- |
| `GET`  | `/run`      | Run full governance cycle (scan, analyze, decide, receipt) |
| `GET`  | `/status`   | Server status and configuration                            |
| `POST` | `/feedback` | Submit human feedback on a decision                        |

### Hedera

| Method | Endpoint                 | Description                                   |
| ------ | ------------------------ | --------------------------------------------- |
| `GET`  | `/hedera/proof`          | Latest Hedera proof (HCS anchor)              |
| `GET`  | `/hedera/epochs`         | Epoch history with Merkle roots               |
| `GET`  | `/hedera/agent`          | HCS-10 agent info (account, topics, registry) |
| `GET`  | `/hedera/nft-collection` | NFT collection info (token ID, supply)        |
| `GET`  | `/hedera/kms`            | AWS KMS signing status and key info           |
| `GET`  | `/receipts/:id`          | Retrieve a specific receipt by change ID      |

---

## Testnet Verification

Verified on Hedera testnet:

| Component            | Testnet ID    | Hashscan                                                |
| -------------------- | ------------- | ------------------------------------------------------- |
| Operator Account     | `0.0.7223674` | [View](https://hashscan.io/testnet/account/0.0.7223674) |
| HCS Topic            | `0.0.7224074` | [View](https://hashscan.io/testnet/topic/0.0.7224074)   |
| NFT Collection       | `0.0.8126377` | [View](https://hashscan.io/testnet/token/0.0.8126377)   |
| HCS-10 Agent         | `0.0.8145658` | [View](https://hashscan.io/testnet/account/0.0.8145658) |
| Agent Inbound Topic  | `0.0.8145660` | [View](https://hashscan.io/testnet/topic/0.0.8145660)   |
| Agent Outbound Topic | `0.0.8145659` | [View](https://hashscan.io/testnet/topic/0.0.8145659)   |

---

## Tech Stack

- **Runtime:** Node.js 20+, TypeScript
- **AI:** Google Gemini (`@google/generative-ai`)
- **Blockchain:** Hedera (`@hashgraph/sdk`, `@hashgraphonline/standards-sdk`)
- **Signing:** HMAC-SHA256 (default), AWS KMS ECDSA (`@aws-sdk/client-kms`, optional)
- **Frontend:** React, Vite, ReactFlow
- **Scanning:** TypeScript AST, OpenAPI spec parsing

## License

MIT

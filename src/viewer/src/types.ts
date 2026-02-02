export interface SchemaChange {
  type:
    | "field_added"
    | "field_removed"
    | "field_type_changed"
    | "field_required_changed"
    | "intent_changed"
    | "enum_value_changed";
  path: string;
  oldValue?: unknown;
  newValue?: unknown;
  breaking: boolean;
  description: string;
}

export interface SchemaDiff {
  nodeId: string;
  name: string;
  type: string;
  changeType: "added" | "removed" | "modified" | "unchanged";
  breaking: boolean;
  changes: SchemaChange[];
  oldVersion?: unknown;
  newVersion?: unknown;
}

export interface DriftCertificate {
  version: string;
  metadata: {
    repository: string;
    branch: string;
    baseCommit: string;
    headCommit: string;
    timestamp: string;
    author: string;
  };
  drift: {
    summary: {
      breaking: number;
      nonBreaking: number;
      filesChanged: number;
    };
    changes: SchemaDiff[];
  };
  intent?: {
    description: string;
    approvedBy?: string;
    timestamp: string;
  };
  proof: {
    hash: string;
    algorithm: string;
    backend: string;
    transactionId?: string;
    timestamp?: string;
    link?: string;
  };
}

export interface Artifact {
  id: string;
  name: string;
  file: string;
  hash: string;
  dependencies: string[];
  status: "verified" | "changed" | "impacted" | "drifted";
  hederaTxId?: string;
  lastModified: string;
  metadata?: {
    breaking?: boolean;
    intentDrift?: boolean;
    hcsTimestamp?: string;
    drift?: SchemaDiff;
    [key: string]: unknown;
  };
  certificate?: DriftCertificate;
}

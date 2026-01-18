import { DriftCertificate } from '../../export/DriftCertificate';
export interface Artifact {
  id: string;
  name: string;
  file: string;
  hash: string;
  dependencies: string[];
  status: 'verified' | 'changed' | 'impacted' | 'drifted';
  hederaTxId?: string;
  lastModified: string;
  metadata?: {
    breaking?: boolean;
    intentDrift?: boolean;
    hcsTimestamp?: string;
    [key: string]: any;
  };
  certificate?: DriftCertificate;
}

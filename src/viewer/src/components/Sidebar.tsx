import { Artifact } from "../types";
import "./Sidebar.css";

interface SidebarProps {
  artifact: Artifact | null;
  onClose: () => void;
  lastUpdate: Date;
}

const STATUS_CONFIG = {
  verified: { color: "#22c55e", label: "Verified" },
  changed: { color: "#3b82f6", label: "Changed" },
  impacted: { color: "#f59e0b", label: "Impacted" },
  drifted: { color: "#ef4444", label: "Breaking" },
} as const;

// Status icons for accessibility (color-independent indicators)
const StatusIcon = ({ status }: { status: keyof typeof STATUS_CONFIG }) => {
  const iconProps = {
    width: 12,
    height: 12,
    viewBox: "0 0 24 24",
    fill: "currentColor",
  };

  switch (status) {
    case "drifted":
      return (
        <svg {...iconProps}>
          <path d="M12 2L1 21h22L12 2zm0 4l7.53 13H4.47L12 6zm-1 5v4h2v-4h-2zm0 6v2h2v-2h-2z" />
        </svg>
      );
    case "impacted":
      return (
        <svg {...iconProps}>
          <path d="M12 2L2 12l10 10 10-10L12 2zm0 3.41L18.59 12 12 18.59 5.41 12 12 5.41z" />
        </svg>
      );
    case "changed":
      return (
        <svg {...iconProps}>
          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
        </svg>
      );
    case "verified":
      return (
        <svg {...iconProps}>
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
        </svg>
      );
  }
};

function Sidebar({ artifact, onClose, lastUpdate }: SidebarProps) {
  if (!artifact) {
    return (
      <aside className="sidebar sidebar--empty">
        <div className="sidebar__placeholder">
          <div className="sidebar__placeholder-icon">
            <svg
              width="24"
              height="24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"
              />
            </svg>
          </div>
          <p>Select a node to view details</p>
        </div>
      </aside>
    );
  }

  const statusConfig = STATUS_CONFIG[artifact.status];
  const drift = artifact.metadata?.drift;

  return (
    <aside className="sidebar">
      <header className="sidebar__header">
        <h2 className="sidebar__title">Details</h2>
        <button className="sidebar__close" onClick={onClose} aria-label="Close">
          <svg
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </header>

      <div className="sidebar__content">
        <section className="sidebar__section">
          <div className="field">
            <span className="field__label">Name</span>
            <span className="field__value field__value--lg">{artifact.name}</span>
          </div>

          <div className="field">
            <span className="field__label">Status</span>
            <span
              className="status-badge"
              style={{
                color: statusConfig.color,
                background: `${statusConfig.color}15`,
                borderColor: `${statusConfig.color}30`,
              }}
            >
              <StatusIcon status={artifact.status} />
              {statusConfig.label}
            </span>
          </div>
        </section>

        <section className="sidebar__section">
          <div className="field">
            <span className="field__label">ID</span>
            <code className="field__code">{artifact.id}</code>
          </div>

          <div className="field">
            <span className="field__label">File</span>
            <code className="field__code">{artifact.file || "N/A"}</code>
          </div>

          <div className="field">
            <span className="field__label">Hash</span>
            <code className="field__code field__code--sm">{artifact.hash || "N/A"}</code>
          </div>
        </section>

        {drift && (
          <section className="sidebar__section sidebar__section--alert">
            <h3 className="section__title section__title--error">Changes Detected</h3>

            <div className="field">
              <span className="field__label">Type</span>
              <span
                className="status-badge"
                style={{
                  color: drift.breaking ? "#ef4444" : "#f59e0b",
                  background: drift.breaking ? "#ef444415" : "#f59e0b15",
                  borderColor: drift.breaking ? "#ef444430" : "#f59e0b30",
                }}
              >
                {drift.changeType?.toUpperCase()}
                {drift.breaking && " (Breaking)"}
              </span>
            </div>

            {drift.changes && drift.changes.length > 0 && (
              <div className="changes-list">
                {drift.changes.map((change: any, idx: number) => {
                  const isBreaking = change.breaking || change.severity === "breaking";
                  return (
                    <div
                      key={idx}
                      className={`change-item ${isBreaking ? "change-item--breaking" : "change-item--safe"}`}
                    >
                      <span className="change-item__type">{change.type?.replace(/_/g, " ")}</span>
                      <span className="change-item__desc">{change.description}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {artifact.dependencies.length > 0 && (
          <section className="sidebar__section">
            <h3 className="section__title">Dependencies ({artifact.dependencies.length})</h3>
            <div className="deps-list">
              {artifact.dependencies.map((dep) => (
                <code key={dep} className="dep-item">
                  {dep}
                </code>
              ))}
            </div>
          </section>
        )}

        {(artifact.certificate?.proof?.link || artifact.certificate?.proof?.transactionId) && (
          <section className="sidebar__section">
            <h3 className="section__title">Verification</h3>
            <div className="field">
              <span className="field__label">Hedera TX</span>
              <a
                href={
                  artifact.certificate.proof.link ||
                  `https://hashscan.io/testnet/transaction/${artifact.certificate.proof.transactionId}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="field__link"
              >
                {artifact.certificate.proof.transactionId?.split("@")[0] || "View on Hashscan"}
                <svg
                  width="12"
                  height="12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25"
                  />
                </svg>
              </a>
            </div>
          </section>
        )}

        <footer className="sidebar__footer">Updated {lastUpdate.toLocaleTimeString()}</footer>
      </div>
    </aside>
  );
}

export default Sidebar;

import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import PipelinePanel, { GovernorDecision } from "./PipelinePanel";
import "./AnalysisView.css";
import { HelpIcon, Tooltip, TOOLTIPS } from "./Tooltip";
import { SearchFilterBar, FilterStatus } from "./SearchFilter";
import { SyntaxHighlightedJSON } from "./SyntaxHighlightedJSON";
import { ExportMenu } from "./ExportMenu";
import { ExportData } from "../utils/exportUtils";

interface Artifact {
  id: string;
  name: string;
  status: "verified" | "changed" | "impacted" | "drifted";
  file?: string;
  type?: string;
}

interface ArtifactSummary {
  total: number;
  verified: number;
  changed: number;
  impacted: number;
  breaking: number;
}

interface PipelineState {
  decision: GovernorDecision | null;
  setDecision: (d: GovernorDecision | null) => void;
  isRunning: boolean;
  setIsRunning: (r: boolean) => void;
  humanFeedback: "accepted" | "overridden" | null;
  setHumanFeedback: (f: "accepted" | "overridden" | null) => void;
  overrideAction: "approve" | "block" | null;
  setOverrideAction: (a: "approve" | "block" | null) => void;
}

interface EnforcementStatus {
  locked: boolean;
  exitCode: 0 | 1 | 2;
  reason: string;
  receipt?: {
    signature: string;
    ruling: string;
    auto_authorized?: boolean;
  };
}

interface DecisionRecord {
  change_id: string;
  decision: string;
  risk_level: string;
  timestamp: string;
  reasoning: string[];
  human_feedback: {
    outcome: string;
    notes?: string;
    override_decision?: string;
  };
}

interface AnalysisViewProps {
  artifacts: ArtifactSummary;
  artifactsList: Artifact[];
  pipelineState: PipelineState;
  onDecisionHistoryUpdate?: () => void;
  decisionHistory?: DecisionRecord[];
}

interface InputArtifacts {
  graph: any;
  drift: any;
  intent: any;
  decisions: any;
}

// Sanitize raw vendor errors into governance-grade language
function sanitizeErrorText(text: string): string {
  console.log({ text });
  if (
    text.includes("GoogleGenerativeAI Error") ||
    text.includes("429") ||
    text.includes("Too Many Requests") ||
    text.includes("RESOURCE_EXHAUSTED") ||
    text.includes("quota")
  ) {
    return "Reliability threshold exceeded. Request volume surpassed allocated budget.";
  }
  if (text.includes("timed out") || text.includes("timeout")) {
    return "Operational timeout. Analysis did not complete within reliability budget.";
  }
  if (text.includes("GEMINI_API_KEY") || text.includes("API key")) {
    return "Governance engine not configured. Administrative action required.";
  }
  if (text.includes("network") || text.includes("ECONNREFUSED") || text.includes("fetch failed")) {
    return "Connectivity constraint. Governance engine unreachable.";
  }
  return text
    .replace(/\[GoogleGenerativeAI Error\][^.]*\./g, "")
    .replace(/error=\[[^\]]*\]/g, "")
    .replace(/https?:\/\/[^\s]+/g, "")
    .trim();
}

function StreamingText({ text, delay = 20 }: { text: string; delay?: number }) {
  const [displayed, setDisplayed] = useState("");
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    setDisplayed("");
    setIsComplete(false);
    let i = 0;
    const timer = setInterval(() => {
      if (i < text.length) {
        setDisplayed(text.slice(0, i + 1));
        i++;
      } else {
        setIsComplete(true);
        clearInterval(timer);
      }
    }, delay);
    return () => clearInterval(timer);
  }, [text, delay]);

  return <span className={isComplete ? "" : "streaming-cursor"}>{displayed}</span>;
}

function StreamingMarkdown({ text, delay = 3 }: { text: string; delay?: number }) {
  const [displayed, setDisplayed] = useState("");
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    setDisplayed("");
    setIsComplete(false);
    let i = 0;
    const timer = setInterval(() => {
      if (i < text.length) {
        setDisplayed(text.slice(0, i + 1));
        i++;
      } else {
        setIsComplete(true);
        clearInterval(timer);
      }
    }, delay);
    return () => clearInterval(timer);
  }, [text, delay]);

  return (
    <div className={`thinking-markdown ${isComplete ? "" : "thinking-markdown--streaming"}`}>
      <ReactMarkdown>{displayed}</ReactMarkdown>
      {!isComplete && <span className="streaming-cursor" />}
    </div>
  );
}

function CollapsibleJson({
  title,
  data,
  defaultOpen = false,
}: {
  title: string;
  data: any;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const jsonString = JSON.stringify(data, null, 2);
  const lineCount = jsonString.split("\n").length;

  return (
    <div className="collapsible-json">
      <button className="collapsible-json__header" onClick={() => setIsOpen(!isOpen)}>
        <span className="collapsible-json__title">
          <svg
            className={`collapsible-json__chevron ${isOpen ? "collapsible-json__chevron--open" : ""}`}
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
          {title}
        </span>
        <span className="collapsible-json__meta">{lineCount} lines</span>
      </button>
      {isOpen && <SyntaxHighlightedJSON data={data} showLineNumbers={true} />}
    </div>
  );
}

function CollapsibleSection({
  title,
  subtitle,
  children,
  defaultOpen = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={`collapsible-section ${isOpen ? "collapsible-section--open" : ""}`}>
      <button className="collapsible-section__header" onClick={() => setIsOpen(!isOpen)}>
        <div className="collapsible-section__title-group">
          <svg
            className={`collapsible-section__chevron ${isOpen ? "collapsible-section__chevron--open" : ""}`}
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
          <h3 className="collapsible-section__title">{title}</h3>
          {subtitle && <span className="collapsible-section__subtitle">{subtitle}</span>}
        </div>
      </button>
      {isOpen && <div className="collapsible-section__content">{children}</div>}
    </div>
  );
}

export default function AnalysisView({
  artifacts,
  artifactsList,
  pipelineState,
  onDecisionHistoryUpdate,
  decisionHistory = [],
}: AnalysisViewProps) {
  // Use pipeline state from props (persisted in parent)
  const {
    decision,
    setDecision,
    isRunning,
    setIsRunning,
    humanFeedback,
    setHumanFeedback,
    overrideAction,
    setOverrideAction,
  } = pipelineState;

  const [streamingIndex, setStreamingIndex] = useState(-1);
  const [inputArtifacts, setInputArtifacts] = useState<InputArtifacts | null>(null);
  const [loadingInputs, setLoadingInputs] = useState(true);
  const [feedbackNotes, setFeedbackNotes] = useState("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilters, setSelectedFilters] = useState<FilterStatus[]>(["all"]);
  const [enforcement, setEnforcement] = useState<EnforcementStatus>({
    locked: true,
    exitCode: 2,
    reason: "No authorization receipt",
  });

  // Fetch input artifacts
  useEffect(() => {
    const fetchInputs = async () => {
      try {
        const [graphRes, driftRes, intentRes, decisionsRes] = await Promise.all([
          fetch("/artifacts/graph.json").then((r) => (r.ok ? r.json() : { nodes: {}, edges: {} })),
          fetch("/artifacts/drift.json").then((r) => (r.ok ? r.json() : { diffs: [] })),
          fetch("/artifacts/intent.json").then((r) => (r.ok ? r.json() : {})),
          fetch("/memory/decisions.json").then((r) => (r.ok ? r.json() : { decisions: [] })),
        ]);
        setInputArtifacts({
          graph: graphRes,
          drift: driftRes,
          intent: intentRes,
          decisions: decisionsRes,
        });
      } catch (e) {
        console.error("Failed to load input artifacts:", e);
      } finally {
        setLoadingInputs(false);
      }
    };
    fetchInputs();
  }, []);

  useEffect(() => {
    if (decision?.reasoning) {
      setStreamingIndex(0);
      const timer = setInterval(() => {
        setStreamingIndex((prev) => {
          if (prev < decision.reasoning.length - 1) {
            return prev + 1;
          }
          clearInterval(timer);
          return prev;
        });
      }, 1500);
      return () => clearInterval(timer);
    }
  }, [decision]);

  // Update enforcement status based on decision and receipt
  useEffect(() => {
    const checkEnforcement = async () => {
      try {
        const response = await fetch("/artifacts/authorization-receipt.json");
        if (response.ok) {
          const receipt = await response.json();
          // Valid receipt exists
          if (receipt.ruling === "approve") {
            setEnforcement({
              locked: false,
              exitCode: 0,
              reason: receipt.auto_authorized
                ? "Auto-authorized via precedent"
                : "Authorized by human",
              receipt: {
                signature: receipt.signature,
                ruling: receipt.ruling,
                auto_authorized: receipt.auto_authorized,
              },
            });
          } else if (receipt.ruling === "block") {
            setEnforcement({
              locked: true,
              exitCode: 1,
              reason: "Blocked by governance",
              receipt: {
                signature: receipt.signature,
                ruling: receipt.ruling,
                auto_authorized: receipt.auto_authorized,
              },
            });
          } else {
            // escalate or other
            setEnforcement({
              locked: true,
              exitCode: 2,
              reason: "Pending human review",
              receipt: {
                signature: receipt.signature,
                ruling: receipt.ruling,
                auto_authorized: receipt.auto_authorized,
              },
            });
          }
        } else {
          // No receipt
          setEnforcement({
            locked: true,
            exitCode: 2,
            reason: "No authorization receipt",
          });
        }
      } catch {
        // Error fetching receipt
        setEnforcement({
          locked: true,
          exitCode: 2,
          reason: "No authorization receipt",
        });
      }
    };

    checkEnforcement();
  }, [decision, humanFeedback, overrideAction]);

  const handleDecision = (dec: GovernorDecision | null) => {
    setDecision(dec);
    setStreamingIndex(-1);
    setHumanFeedback(null);
    setOverrideAction(null);
    setFeedbackNotes("");
  };

  const submitFeedback = async (
    outcome: "accepted" | "overridden",
    override?: "approve" | "block"
  ) => {
    if (!decision) return;

    setSubmittingFeedback(true);
    try {
      await fetch("/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          change_id: `local-${Date.now()}`,
          governor: {
            decision: decision.decision,
            risk_level: decision.risk_level,
            reasoning: decision.reasoning,
          },
          human: {
            outcome,
            override_decision: override,
            notes: feedbackNotes || undefined,
          },
        }),
      });
      setHumanFeedback(outcome);
      if (override) setOverrideAction(override);
      // Refresh decision history in parent
      onDecisionHistoryUpdate?.();
    } catch (e) {
      console.error("Failed to submit feedback:", e);
    } finally {
      setSubmittingFeedback(false);
    }
  };

  // Show governance tension modal when escalation requires human judgment
  const showGovernanceTension = decision?.decision === "escalate" && !humanFeedback;

  // Show audit banner after governance conflict is resolved
  const showAuditBanner = decision?.decision === "escalate" && humanFeedback;

  // Filter artifacts based on search and filter state
  const filteredArtifacts = artifactsList.filter((artifact) => {
    // Search filter
    const matchesSearch =
      searchQuery === "" ||
      artifact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (artifact.type && artifact.type.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (artifact.file && artifact.file.toLowerCase().includes(searchQuery.toLowerCase()));

    // Status filter
    const matchesFilter =
      selectedFilters.includes("all") ||
      (selectedFilters.includes("breaking") && artifact.status === "drifted") ||
      (selectedFilters.includes("impacted") && artifact.status === "impacted") ||
      (selectedFilters.includes("changed") && artifact.status === "changed") ||
      (selectedFilters.includes("verified") && artifact.status === "verified");

    return matchesSearch && matchesFilter;
  });

  // Calculate counts for filter chips
  const filterCounts: Record<FilterStatus, number> = {
    all: artifactsList.length,
    breaking: artifactsList.filter((a) => a.status === "drifted").length,
    impacted: artifactsList.filter((a) => a.status === "impacted").length,
    changed: artifactsList.filter((a) => a.status === "changed").length,
    verified: artifactsList.filter((a) => a.status === "verified").length,
  };

  return (
    <div className={`analysis ${showGovernanceTension ? "analysis--governance-pending" : ""}`}>
      {/* ========== AUDIT BANNER (after resolution) ========== */}
      {showAuditBanner && (
        <div className={`audit-banner audit-banner--${overrideAction || "accepted"}`}>
          <span className="audit-banner__icon">
            {overrideAction === "block" ? "✕" : overrideAction === "approve" ? "✓" : "⚡"}
          </span>
          <span className="audit-banner__text">
            {overrideAction === "block"
              ? "Change rejected. Ruling recorded."
              : overrideAction === "approve"
                ? "Change approved via override. Ruling recorded."
                : "Escalation accepted. Pending additional review."}
          </span>
          <span className="audit-banner__time">{new Date().toLocaleTimeString()}</span>
        </div>
      )}

      {/* Header with Pipeline and Artifacts Summary */}
      <div className="analysis__header">
        <PipelinePanel
          decision={decision}
          setDecision={handleDecision}
          isRunning={isRunning}
          setIsRunning={setIsRunning}
        />
        <div className="artifacts-summary">
          <div className="artifacts-summary__item">
            <span className="artifacts-summary__value">{artifacts.total}</span>
            <span className="artifacts-summary__label">Total</span>
          </div>
          <div className="artifacts-summary__item artifacts-summary__item--success">
            <span className="artifacts-summary__value">{artifacts.verified}</span>
            <span className="artifacts-summary__label">Verified</span>
          </div>
          <div className="artifacts-summary__item artifacts-summary__item--info">
            <span className="artifacts-summary__value">{artifacts.changed}</span>
            <span className="artifacts-summary__label">Changed</span>
          </div>
          <div className="artifacts-summary__item artifacts-summary__item--warning">
            <span className="artifacts-summary__value">{artifacts.impacted}</span>
            <span className="artifacts-summary__label">Impacted</span>
          </div>
          <div className="artifacts-summary__item artifacts-summary__item--error">
            <span className="artifacts-summary__value">{artifacts.breaking}</span>
            <span className="artifacts-summary__label">Breaking</span>
          </div>
        </div>
        <ExportMenu
          data={{
            artifacts: {
              total: artifacts.total,
              breaking: artifacts.breaking,
              changed: artifacts.changed,
              impacted: artifacts.impacted,
              verified: artifacts.verified,
            },
            decisions: decisionHistory,
            generatedAt: new Date().toISOString(),
          }}
        />
      </div>

      {/* Production Context Bar */}
      <div className="production-context">
        <span className="production-context__item">
          <span className="production-context__label">Environment</span>
          <span className="production-context__value production-context__value--prod">
            Production
          </span>
        </span>
        <span className="production-context__divider" />
        <span className="production-context__item">
          <span className="production-context__label">Status</span>
          <span
            className={`production-context__value ${enforcement.locked ? "production-context__value--error" : "production-context__value--success"}`}
          >
            {enforcement.locked ? "🔒 Locked" : "🔓 Unlocked"}
          </span>
        </span>
      </div>

      <div className="analysis__content">
        {/* Collapsible Deterministic Inputs Section */}
        <CollapsibleSection title="Evidence" subtitle="Artifacts" defaultOpen={false}>
          {loadingInputs ? (
            <div className="loading-inputs">Loading artifacts...</div>
          ) : inputArtifacts ? (
            <div className="input-artifacts">
              <CollapsibleJson
                title="graph.json — Dependency Graph"
                data={inputArtifacts.graph}
                defaultOpen={false}
              />
              <CollapsibleJson
                title="drift.json — Detected Changes"
                data={inputArtifacts.drift}
                defaultOpen={true}
              />
              <CollapsibleJson
                title="intent.json — Developer Intent"
                data={inputArtifacts.intent}
                defaultOpen={false}
              />
              <CollapsibleJson
                title="decisions.json — Precedent Memory"
                data={inputArtifacts.decisions}
                defaultOpen={false}
              />
            </div>
          ) : (
            <p className="text-muted">No input artifacts available</p>
          )}
        </CollapsibleSection>

        {/* Main Layout: Thinking on left, Decision on right */}
        <div className="analysis__main">
          {/* Structured Reasoning Trace (Left/Main) */}
          <div className="analysis__thinking">
            {decision?.auto_authorized ? (
              <div className="card card--auto-authorized">
                <div className="card__header">
                  <h3 className="card__title card__title--success">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      style={{ marginRight: 8 }}
                    >
                      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Auto-Authorized via Precedent
                  </h3>
                </div>
                <div className="card__body">
                  <div className="auto-auth-success">
                    <p className="auto-auth-success__message">
                      This change matches a previously approved pattern. No human review required.
                    </p>
                    {decision.precedent_match && (
                      <div className="auto-auth-success__details">
                        <p>
                          <strong>Prior ruling:</strong> {decision.precedent_match.change_id}
                        </p>
                        <p>
                          <strong>Approved:</strong>{" "}
                          {new Date(decision.precedent_match.timestamp).toLocaleDateString()}
                        </p>
                        <p>
                          <strong>Similarity:</strong>{" "}
                          {Math.round(decision.precedent_match.similarity * 100)}%
                        </p>
                      </div>
                    )}
                    {decision.receipt && (
                      <div className="auto-auth-success__receipt">
                        <p className="receipt-label">Authorization Receipt</p>
                        <code className="receipt-signature">
                          {decision.receipt.signature.slice(0, 32)}...
                        </code>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : decision?.thinking ? (
              <div className="card card--thinking">
                <div className="card__header">
                  <h3 className="card__title">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      style={{ marginRight: 8 }}
                    >
                      <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Decision Rationale
                  </h3>
                </div>
                <div className="card__body">
                  <StreamingMarkdown text={decision.thinking} delay={3} />
                </div>
              </div>
            ) : decision && !decision.thinking ? (
              <div className="card card--thinking card--thinking-missing">
                <div className="card__header">
                  <h3 className="card__title">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      style={{ marginRight: 8 }}
                    >
                      <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Decision Rationale
                  </h3>
                </div>
                <div className="card__body">
                  <div className="thinking-missing">
                    <p className="thinking-missing__title">Analysis unavailable</p>
                    <p className="thinking-missing__reason">
                      {decision.reasoning?.some((r) => r.includes("GEMINI_API_KEY"))
                        ? "Governance engine not configured. Administrative action required."
                        : "Automated analysis did not complete within operational constraints."}
                    </p>
                    {decision.reasoning && decision.reasoning.length > 0 && (
                      <div className="thinking-missing__fallback">
                        <p className="thinking-missing__label">Status:</p>
                        <ul>
                          {decision.reasoning.map((reason, idx) => (
                            <li key={idx}>{sanitizeErrorText(reason)}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : decision ? (
              <div className="card card--reasoning">
                <div className="card__header">
                  <h3 className="card__title">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      style={{ marginRight: 8 }}
                    >
                      <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    Analysis Summary
                  </h3>
                </div>
                <div className="card__body">
                  {decision.reasoning && decision.reasoning.length > 0 ? (
                    <ul className="reasoning-list">
                      {decision.reasoning.map((reason, idx) => (
                        <li
                          key={idx}
                          className={`reasoning-item ${idx <= streamingIndex ? "reasoning-item--visible" : "reasoning-item--hidden"}`}
                        >
                          <span className="reasoning-item__num">{idx + 1}</span>
                          <span className="reasoning-item__text">
                            {idx === streamingIndex ? (
                              <StreamingText text={sanitizeErrorText(reason)} delay={15} />
                            ) : idx < streamingIndex ? (
                              sanitizeErrorText(reason)
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted">No reasoning provided</p>
                  )}

                  {decision.conditions &&
                    decision.conditions.length > 0 &&
                    streamingIndex >= decision.reasoning.length - 1 && (
                      <div className="conditions">
                        <h4 className="conditions__title">Required Actions</h4>
                        <ul className="conditions__list">
                          {decision.conditions.map((condition, idx) => (
                            <li key={idx}>{sanitizeErrorText(condition)}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                </div>
              </div>
            ) : (
              <div className="empty-state empty-state--pending">
                <div className="empty-state__icon empty-state__icon--alert">
                  <svg
                    width="40"
                    height="40"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                    />
                  </svg>
                </div>
                <h3 className="empty-state__title--alert">Human authorization required</h3>
                <p className="empty-state__subtitle--alert">
                  Deployment is paused. Breaking change in payment schemas requires authorization.
                </p>
              </div>
            )}
          </div>

          {/* Decision Card (Right Sidebar) */}
          <div className="analysis__decision">
            {/* Resolved escalation summary - shows after human decision */}
            {decision && decision.decision === "escalate" && humanFeedback && (
              <div className="card card--resolved">
                <div className="card__header">
                  <h3 className="card__title card__title--resolved">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      style={{ marginRight: 6 }}
                    >
                      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Ruling recorded
                  </h3>
                </div>
                <div className="card__body">
                  <p className="resolved-text">Decision logged. Precedent updated.</p>
                </div>
              </div>
            )}

            <div className="card card--decision-compact card--governance-status">
              <div className="card__header">
                <h3 className="card__title card__title--governance">
                  Governance Status
                  <HelpIcon content={TOOLTIPS.governance} position="left" />
                </h3>
              </div>
              <div className="card__body">
                {decision ? (
                  <div className="decision-compact">
                    <div
                      className={`decision-compact__badge decision-compact__badge--${overrideAction || decision.decision}`}
                    >
                      {overrideAction
                        ? overrideAction.toUpperCase()
                        : decision.decision.toUpperCase()}
                    </div>
                    {overrideAction && (
                      <span className="decision-compact__override">Human Override</span>
                    )}
                    <Tooltip
                      content={
                        decision.risk_level === "low"
                          ? TOOLTIPS.riskLow
                          : decision.risk_level === "medium"
                            ? TOOLTIPS.riskMedium
                            : TOOLTIPS.riskHigh
                      }
                      position="left"
                    >
                      <span
                        className={`decision-compact__risk decision-compact__risk--${decision.risk_level}`}
                      >
                        {decision.risk_level} risk
                      </span>
                    </Tooltip>

                    {/* Delegated Authority - when auto-authorized via precedent */}
                    {decision.auto_authorized && decision.precedent_match ? (
                      <div className="decision-compact__delegated">
                        <span className="decision-compact__delegated-label">
                          Authority: Delegated
                        </span>
                        <div className="decision-compact__delegated-details">
                          <div className="delegated-row">
                            <span className="delegated-key">Prior Ruling</span>
                            <span className="delegated-value">
                              {decision.precedent_match.change_id.slice(0, 16)}
                              ...
                            </span>
                          </div>
                          <div className="delegated-row">
                            <span className="delegated-key">Approved</span>
                            <span className="delegated-value">
                              {new Date(decision.precedent_match.timestamp).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="delegated-row">
                            <span className="delegated-key">Match</span>
                            <span className="delegated-value">
                              {Math.round(decision.precedent_match.similarity * 100)}%
                            </span>
                          </div>
                          {decision.receipt && (
                            <div className="delegated-row">
                              <span className="delegated-key">Receipt</span>
                              <span className="delegated-value delegated-value--mono">
                                {decision.receipt.signature.slice(0, 12)}...
                              </span>
                            </div>
                          )}
                        </div>
                        <p className="decision-compact__delegated-note">
                          A human authorized this pattern. The system is enforcing that decision.
                        </p>
                      </div>
                    ) : decision.decision !== "escalate" && !humanFeedback ? (
                      /* Human Authority - only show for non-escalate, non-auto-authorized decisions */
                      <div className="decision-compact__actions">
                        <span className="decision-compact__actions-label">
                          Human Authority (Final)
                        </span>
                        <div className="decision-compact__actions-btns">
                          <button
                            className="decision-compact__btn decision-compact__btn--accept"
                            onClick={() => submitFeedback("accepted")}
                            disabled={submittingFeedback}
                            title="Accept — Record precedent"
                          >
                            ✓
                          </button>
                          {decision.decision !== "approve" && (
                            <button
                              className="decision-compact__btn decision-compact__btn--approve"
                              onClick={() => submitFeedback("overridden", "approve")}
                              disabled={submittingFeedback}
                              title="Override: Approve — Deploy and record"
                            >
                              →
                            </button>
                          )}
                          {decision.decision !== "block" && (
                            <button
                              className="decision-compact__btn decision-compact__btn--block"
                              onClick={() => submitFeedback("overridden", "block")}
                              disabled={submittingFeedback}
                              title="Override: Reject — Block and record"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                    ) : humanFeedback ? (
                      <div
                        className={`decision-compact__result decision-compact__result--${humanFeedback}`}
                      >
                        {humanFeedback === "accepted" ? "Human Accepted" : "Human Override"}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="decision-compact decision-compact--empty decision-compact--awaiting">
                    <span className="decision-compact__placeholder">⚠</span>
                    <span className="decision-compact__awaiting-title">Awaiting authorization</span>
                  </div>
                )}
              </div>
            </div>

            {/* Enforcement Status */}
            <div
              className={`card card--enforcement card--enforcement-${enforcement.locked ? "locked" : "unlocked"}`}
            >
              <div className="card__header">
                <h3 className="card__title card__title--enforcement">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{ marginRight: 6 }}
                  >
                    <path d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                  </svg>
                  Production Gate
                  <HelpIcon content={TOOLTIPS.ciGate} position="left" />
                </h3>
              </div>
              <div className="card__body">
                <div className="enforcement-status">
                  <Tooltip content={TOOLTIPS.productionLock} position="left">
                    <div
                      className={`enforcement-status__lock enforcement-status__lock--${enforcement.locked ? "locked" : "unlocked"}`}
                    >
                      <span className="enforcement-status__icon">
                        {enforcement.locked ? "🔒" : "🔓"}
                      </span>
                      <span className="enforcement-status__label">
                        {enforcement.locked ? "Production Locked" : "Production Unlocked"}
                      </span>
                    </div>
                  </Tooltip>
                  <div
                    className={`enforcement-status__badge enforcement-status__badge--${enforcement.locked ? "blocked" : "passing"}`}
                  >
                    <span className="enforcement-status__badge-text">
                      CI Status: {enforcement.locked ? "BLOCKED" : "PASSING"}
                    </span>
                    <code className="enforcement-status__exit-code">
                      exit {enforcement.exitCode}
                    </code>
                  </div>
                  <p className="enforcement-status__reason">{enforcement.reason}</p>
                  {enforcement.receipt && (
                    <Tooltip content={TOOLTIPS.receipt} position="top">
                      <div className="enforcement-status__receipt">
                        <span className="enforcement-status__receipt-label">Receipt:</span>
                        <code className="enforcement-status__receipt-sig">
                          {enforcement.receipt.signature.slice(0, 16)}...
                        </code>
                      </div>
                    </Tooltip>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Artifacts List with Search/Filter */}
        {artifactsList.length > 0 && (
          <div className="card card--full artifacts-section">
            <div className="card__header">
              <h3 className="card__title">Impacted Systems</h3>
              <span className="card__subtitle">
                {filteredArtifacts.length === artifactsList.length
                  ? `${artifactsList.length} artifact${artifactsList.length !== 1 ? "s" : ""} affected`
                  : `${filteredArtifacts.length} of ${artifactsList.length} artifacts`}
              </span>
            </div>
            <div className="card__body">
              <SearchFilterBar
                searchValue={searchQuery}
                onSearchChange={setSearchQuery}
                selectedFilters={selectedFilters}
                onFilterChange={setSelectedFilters}
                resultCount={filteredArtifacts.length}
                totalCount={artifactsList.length}
                counts={filterCounts}
              />
              {filteredArtifacts.length > 0 ? (
                <div className="artifacts-grid">
                  {filteredArtifacts.map((artifact) => (
                    <div
                      key={artifact.id}
                      className={`artifact-card ${
                        artifact.status === "drifted"
                          ? "artifact-card--breaking"
                          : artifact.status === "changed"
                            ? "artifact-card--changed"
                            : artifact.status === "impacted"
                              ? "artifact-card--impacted"
                              : artifact.status === "verified"
                                ? "artifact-card--verified"
                                : ""
                      }`}
                    >
                      <div className="artifact-card__name">{artifact.name}</div>
                      <div className="artifact-card__meta">{artifact.type || "schema"}</div>
                      <span
                        className={`artifact-card__status artifact-card__status--${artifact.status === "drifted" ? "breaking" : artifact.status}`}
                      >
                        {artifact.status === "drifted"
                          ? "BREAKING"
                          : artifact.status === "verified"
                            ? "OK"
                            : artifact.status === "changed"
                              ? "CHANGED"
                              : "IMPACTED"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="search-empty-state">
                  <div className="search-empty-state__icon">🔍</div>
                  <h4 className="search-empty-state__title">No matches found</h4>
                  <p className="search-empty-state__subtitle">
                    Try adjusting your search or filter criteria
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer line */}
        <div className="analysis__footer">Human rulings are binding.</div>
      </div>
    </div>
  );
}

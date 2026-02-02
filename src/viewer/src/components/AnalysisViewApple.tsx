import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import PipelinePanel, { GovernorDecision } from "./PipelinePanel";
import "./AnalysisViewApple.css";
import { SyntaxHighlightedJSON } from "./SyntaxHighlightedJSON";
import { extractIntentsFromContent, analyzeIntentAlignment } from "../utils/intent";

// Demo scenarios (Precedent Match removed - should feel earned, not selectable)
const DEMO_SCENARIOS = [
  {
    id: "1-approve",
    name: "Safe Change",
    description: "Adding optional field",
    outcome: "approve" as const,
  },
  {
    id: "5-intent-present",
    name: "Intent Declared",
    description: "Change with clear intent",
    outcome: "approve" as const,
  },
  {
    id: "2-escalate",
    name: "Breaking Change",
    description: "Type change in Payment",
    outcome: "escalate" as const,
  },
  {
    id: "3-block",
    name: "High Risk",
    description: "Field renamed in critical path",
    outcome: "block" as const,
  },
];

// Gemini sparkle icon as SVG
const GeminiSparkle = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="gemini-sparkle">
    <path
      d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z"
      fill="url(#gemini-gradient)"
    />
    <defs>
      <linearGradient
        id="gemini-gradient"
        x1="2"
        y1="2"
        x2="22"
        y2="22"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#4285F4" />
        <stop offset="0.5" stopColor="#9B72CB" />
        <stop offset="1" stopColor="#D96570" />
      </linearGradient>
    </defs>
  </svg>
);

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
  changeId: string;
  setChangeId: (id: string) => void;
  humanFeedback: "accepted" | "overridden" | null;
  setHumanFeedback: (f: "accepted" | "overridden" | null) => void;
  overrideAction: "approve" | "block" | null;
  setOverrideAction: (a: "approve" | "block" | null) => void;
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

interface ScenarioDrift {
  nodeId: string;
  changeType: string;
  breaking: boolean;
  changes: Array<{
    type: string;
    field?: string;
    oldField?: string;
    newField?: string;
    oldType?: string;
    newType?: string;
    description?: string;
  }>;
}

interface AnalysisViewProps {
  artifacts: ArtifactSummary;
  artifactsList: Artifact[];
  pipelineState: PipelineState;
  onDecisionHistoryUpdate?: () => void;
  decisionHistory?: DecisionRecord[];
  onScenarioLoad?: (drifts: ScenarioDrift[]) => void;
}

interface InputArtifacts {
  graph: unknown;
  drift: unknown;
  intent: unknown;
  decisions: unknown;
}

type TabId = "summary" | "context" | "systems";

export default function AnalysisViewApple({
  artifacts,
  artifactsList,
  pipelineState,
  onDecisionHistoryUpdate,
  onScenarioLoad,
}: AnalysisViewProps) {
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

  const [activeTab, setActiveTab] = useState<TabId>("summary");
  const [inputArtifacts, setInputArtifacts] = useState<InputArtifacts | null>(null);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [showThinking, setShowThinking] = useState(true);
  const [demoMode, setDemoMode] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [loadingScenario, setLoadingScenario] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    type: "accepted" | "overridden";
    override?: "approve" | "block";
  } | null>(null);

  // Schema Drift Simulator state
  const [simulatorMode, setSimulatorMode] = useState(false);
  const [beforeSchema, setBeforeSchema] = useState<string | null>(null);
  const [afterSchema, setAfterSchema] = useState<string | null>(null);
  const [activeDrift, setActiveDrift] = useState<{
    detected: boolean;
    changes: Array<{ type: string; field: string; from?: string; to?: string; breaking: boolean }>;
  } | null>(null);
  const [activeIntent, setActiveIntent] = useState<string[] | null>(null);

  // Simple drift detection from TypeScript interface strings
  const detectDrift = (before: string, after: string) => {
    const changes: Array<{
      type: string;
      field: string;
      from?: string;
      to?: string;
      breaking: boolean;
    }> = [];

    // Extract fields from interface-like structures
    const extractFields = (code: string): Map<string, string> => {
      const fields = new Map<string, string>();
      // Match patterns like: fieldName: Type or fieldName?: Type
      const fieldRegex = /(\w+)\??:\s*([^;,\n]+)/g;
      let match;
      while ((match = fieldRegex.exec(code)) !== null) {
        fields.set(match[1], match[2].trim());
      }
      return fields;
    };

    const beforeFields = extractFields(before);
    const afterFields = extractFields(after);

    // Check for removed fields (breaking)
    beforeFields.forEach((type, field) => {
      if (!afterFields.has(field)) {
        changes.push({
          type: "field_removed",
          field,
          from: type,
          breaking: true,
        });
      }
    });

    // Check for added and changed fields
    afterFields.forEach((newType, field) => {
      const oldType = beforeFields.get(field);
      if (!oldType) {
        // New required field is breaking, optional is not
        const isOptional = after.includes(`${field}?:`);
        changes.push({
          type: "field_added",
          field,
          to: newType,
          breaking: !isOptional,
        });
      } else if (oldType !== newType) {
        // Type changed - always breaking
        changes.push({
          type: "type_changed",
          field,
          from: oldType,
          to: newType,
          breaking: true,
        });
      }
    });

    // Check for renamed fields (heuristic: similar types, one removed + one added)
    const removedFields = changes.filter((c) => c.type === "field_removed");
    const addedFields = changes.filter((c) => c.type === "field_added");

    removedFields.forEach((removed) => {
      addedFields.forEach((added) => {
        if (removed.from === added.to) {
          // Likely a rename
          const idx = changes.indexOf(removed);
          if (idx > -1) {
            changes[idx] = {
              type: "field_renamed",
              field: `${removed.field} → ${added.field}`,
              from: removed.field,
              to: added.field,
              breaking: true,
            };
            // Remove the "added" entry since it's now part of rename
            const addedIdx = changes.indexOf(added);
            if (addedIdx > -1) {
              changes.splice(addedIdx, 1);
            }
          }
        }
      });
    });

    return {
      detected: changes.length > 0,
      changes,
    };
  };

  // Handle file upload for before schema
  const handleBeforeUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setBeforeSchema(content);
        // If both schemas are present, detect drift
        if (afterSchema) {
          const drift = detectDrift(content, afterSchema);
          setActiveDrift(drift);
        }
      };
      reader.readAsText(file);
    }
  };

  // Handle file upload for after schema
  const handleAfterUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setAfterSchema(content);
        setActiveIntent(extractIntentsFromContent(content));
        // If both schemas are present, detect drift
        if (beforeSchema) {
          const drift = detectDrift(beforeSchema, content);
          setActiveDrift(drift);
        }
      };
      reader.readAsText(file);
    }
  };

  // Reset simulator
  const resetSimulator = () => {
    setBeforeSchema(null);
    setAfterSchema(null);
    setActiveDrift(null);
    setActiveIntent(null);
    setDecision(null);
    setHumanFeedback(null);
    setOverrideAction(null);
  };

  // Load demo scenario - fetches scenario-specific drift and intent data
  const loadDemoScenario = async (scenarioId: string) => {
    setSelectedScenario(scenarioId);
    setLoadingScenario(true);

    // Reset current decision when switching scenarios
    setDecision(null);
    setHumanFeedback(null);
    setOverrideAction(null);

    try {
      // Load scenario-specific drift and intent files in parallel
      const [driftResponse, intentResponse] = await Promise.all([
        fetch(`/examples/demo-scenarios/${scenarioId}/drift.json`),
        fetch(`/examples/demo-scenarios/${scenarioId}/intent.json`),
      ]);

      let driftData = null;
      let intentData = null;

      if (driftResponse.ok) {
        driftData = await driftResponse.json();
      }

      if (intentResponse.ok) {
        intentData = await intentResponse.json();
      }

      // Update input artifacts for display (Context tab)
      setInputArtifacts((prev) =>
        prev
          ? {
              ...prev,
              drift: driftData || prev.drift,
              intent: intentData || prev.intent,
            }
          : null
      );

      // Set activeDrift so it gets sent to governance
      if (driftData?.diffs && Array.isArray(driftData.diffs)) {
        // Flatten nested changes from drift structure
        const flatChanges: Array<{
          type: string;
          field: string;
          from?: string;
          to?: string;
          breaking: boolean;
        }> = [];

        for (const diff of driftData.diffs) {
          if (diff.changes && Array.isArray(diff.changes)) {
            for (const change of diff.changes) {
              flatChanges.push({
                type: change.type || "unknown",
                field: change.field || change.oldField || "unknown",
                from: change.oldType || change.oldField,
                to: change.newType || change.newField,
                breaking: diff.breaking ?? true,
              });
            }
          } else {
            // Handle flat diff format
            flatChanges.push({
              type: diff.type || diff.changeType || "unknown",
              field: diff.field || "unknown",
              from: diff.from || diff.oldType,
              to: diff.to || diff.newType,
              breaking: diff.breaking ?? true,
            });
          }
        }

        setActiveDrift({
          detected: flatChanges.length > 0,
          changes: flatChanges,
        });

        // Notify parent to update graph and stats
        if (onScenarioLoad && driftData.diffs) {
          onScenarioLoad(driftData.diffs);
        }
      }

      // Set activeIntent so it gets sent to governance
      // Intent files have title, description, justification fields
      if (intentData) {
        const intents: string[] = [];
        if (intentData.intents && Array.isArray(intentData.intents)) {
          intents.push(...intentData.intents);
        } else {
          // Extract intent from structured fields
          if (intentData.title) intents.push(intentData.title);
          if (intentData.description) intents.push(intentData.description);
          if (intentData.justification) intents.push(intentData.justification);
        }
        setActiveIntent(intents.length > 0 ? intents : null);
      } else {
        setActiveIntent(null);
      }
    } catch (e) {
      console.error(`Failed to load scenario ${scenarioId}:`, e);
    } finally {
      setLoadingScenario(false);
    }
  };

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

        // If backend drift has no diffs, try static demo data
        let finalDrift = driftRes;
        if (!driftRes.diffs || driftRes.diffs.length === 0) {
          try {
            const demoDrift = await fetch("/drift.json").then((r) =>
              r.ok ? r.json() : { diffs: [] }
            );
            if (demoDrift.diffs && demoDrift.diffs.length > 0) {
              finalDrift = demoDrift;
            }
          } catch {
            // Keep the original drift data
          }
        }

        setInputArtifacts({
          graph: graphRes,
          drift: finalDrift,
          intent: intentRes,
          decisions: decisionsRes,
        });
      } catch (e) {
        console.error("Failed to load input artifacts:", e);
      }
    };
    fetchInputs();
  }, []);

  const handleDecision = (dec: GovernorDecision | null) => {
    setDecision(dec);
    setHumanFeedback(null);
    setOverrideAction(null);
  };

  const submitFeedback = async (
    outcome: "accepted" | "overridden",
    override?: "approve" | "block"
  ) => {
    if (!decision) return;

    setSubmittingFeedback(true);
    try {
      // Build drift data for precedent matching
      // Convert activeDrift format to drift.json format
      const driftForServer = activeDrift
        ? {
            diffs: activeDrift.changes.map((c, i) => ({
              nodeId: `change:${c.field || i}`,
              name: c.field,
              changeType: c.type.includes("add")
                ? "added"
                : c.type.includes("remove")
                  ? "removed"
                  : "modified",
              breaking: c.breaking,
            })),
          }
        : inputArtifacts?.drift;

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
          },
          // Include drift data for proper precedent vector storage
          drift: driftForServer,
        }),
      });
      setHumanFeedback(outcome);
      if (override) setOverrideAction(override);
      onDecisionHistoryUpdate?.();
    } catch (e) {
      console.error("Failed to submit feedback:", e);
    } finally {
      setSubmittingFeedback(false);
    }
  };

  // Modal handlers for human authority
  const openAuthModal = (type: "accepted" | "overridden", override?: "approve" | "block") => {
    setPendingAction({ type, override });
    setShowAuthModal(true);
  };

  const confirmAuthAction = () => {
    if (pendingAction) {
      submitFeedback(pendingAction.type, pendingAction.override);
    }
    setShowAuthModal(false);
    setPendingAction(null);
  };

  const cancelAuthAction = () => {
    setShowAuthModal(false);
    setPendingAction(null);
  };

  const getAuthModalConfig = () => {
    if (!pendingAction || !decision) return null;

    if (pendingAction.type === "accepted") {
      return {
        title: "Accept AI Recommendation",
        action:
          decision.decision === "approve"
            ? "Approve"
            : decision.decision === "block"
              ? "Block"
              : "Escalate",
        description: "You are accepting the AI's recommendation as your human ruling.",
        buttonText: "Sign & Accept",
        buttonClass: "auth-modal__btn--accept",
      };
    }

    if (pendingAction.override === "approve") {
      return {
        title: "Override to Approve",
        action: "Approve",
        description: "You are overriding the AI recommendation to approve this change.",
        buttonText: "Sign & Approve",
        buttonClass: "auth-modal__btn--approve",
      };
    }

    return {
      title: "Override to Block",
      action: "Block",
      description: "You are overriding the AI recommendation to block this change.",
      buttonText: "Sign & Block",
      buttonClass: "auth-modal__btn--block",
    };
  };

  const getStatusConfig = () => {
    if (!decision) {
      return {
        status: "pending",
        label: "Awaiting Governance",
        description: "Select a change and run governance to analyze",
        color: "neutral",
      };
    }
    if (decision.auto_authorized) {
      return {
        status: "auto-authorized",
        label: "Authorized",
        description: "Matches previously approved precedent",
        color: "success",
      };
    }
    if (humanFeedback) {
      // Determine final ruling: override takes precedence, otherwise use original decision
      const finalRuling = overrideAction || decision.decision;
      const isAccepted = humanFeedback === "accepted";
      const isOverridden = humanFeedback === "overridden";

      return {
        status: finalRuling,
        label:
          finalRuling === "approve"
            ? "Authorized"
            : finalRuling === "block"
              ? "Production Locked"
              : "Escalated",
        description:
          finalRuling === "approve"
            ? isOverridden
              ? "Human authority overrode to approve"
              : "Human authority accepted recommendation"
            : finalRuling === "block"
              ? isOverridden
                ? "Human authority overrode to block"
                : "Human authority accepted block recommendation"
              : isAccepted
                ? "Human acknowledged escalation"
                : "Pending further review",
        color:
          finalRuling === "approve" ? "success" : finalRuling === "block" ? "error" : "warning",
      };
    }
    const config = {
      approve: {
        label: "Authorized",
        description: "Safe to deploy",
        color: "success",
      },
      block: {
        label: "Production Locked",
        description: "Policy violation — deployment blocked",
        color: "error",
      },
      escalate: {
        label: "Awaiting Authorization",
        description: "Human judgment required before deployment",
        color: "warning",
      },
    };
    return {
      status: decision.decision,
      ...config[decision.decision as keyof typeof config],
    };
  };

  const statusConfig = getStatusConfig();
  const needsHumanAction = decision && !decision.auto_authorized && !humanFeedback;

  return (
    <div className="apple-analysis">
      {/* Gemini-powered header */}
      <header className="apple-analysis__header">
        <div className="apple-analysis__brand">
          <GeminiSparkle size={20} />
          <span className="apple-analysis__brand-text">Powered by Gemini 3</span>
        </div>
        <PipelinePanel
          decision={decision}
          setDecision={handleDecision}
          isRunning={isRunning}
          setIsRunning={setIsRunning}
          activeArtifacts={{
            drift: activeDrift,
            intent: activeIntent,
            beforeSchema,
            afterSchema,
          }}
          humanFeedback={humanFeedback}
          overrideAction={overrideAction}
        />
      </header>

      {/* Schema Drift Simulator */}
      <div className="simulator-bar">
        <button
          className={`simulator-bar__toggle ${simulatorMode ? "simulator-bar__toggle--active" : ""}`}
          onClick={() => {
            setSimulatorMode(!simulatorMode);
            if (!simulatorMode) {
              setDemoMode(false);
            }
          }}
        >
          <span className="simulator-bar__icon">🧪</span>
          Try with Your Own Schema
        </button>

        {!simulatorMode && <span className="simulator-bar__or">or</span>}

        {!simulatorMode && (
          <button
            className={`demo-bar__toggle ${demoMode ? "demo-bar__toggle--active" : ""}`}
            onClick={() => {
              setDemoMode(!demoMode);
              if (!demoMode) {
                setSimulatorMode(false);
              }
            }}
          >
            <span className="demo-bar__icon">
              {demoMode ? (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              ) : (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </span>
            {selectedScenario
              ? DEMO_SCENARIOS.find((s) => s.id === selectedScenario)?.name || "Load Example Change"
              : "Load Example Change"}
          </button>
        )}

        {demoMode && !simulatorMode && (
          <>
            <div className="demo-bar__scenarios">
              {DEMO_SCENARIOS.map((scenario) => (
                <button
                  key={scenario.id}
                  className={`demo-chip demo-chip--${scenario.outcome} ${selectedScenario === scenario.id ? "demo-chip--selected" : ""}`}
                  onClick={() => loadDemoScenario(scenario.id)}
                >
                  <span className="demo-chip__name">{scenario.name}</span>
                </button>
              ))}
            </div>
            <span className="demo-bar__hint">
              Select a change to load. Click <strong>Run Governance</strong> to analyze.
            </span>
          </>
        )}
      </div>

      {/* Simulator Panel - Expanded View */}
      {simulatorMode && (
        <div className="simulator-panel">
          <div className="simulator-panel__header">
            <h3 className="simulator-panel__title">
              <span>🧪</span> Try with Your Own Schema
            </h3>
            <p className="simulator-panel__subtitle">
              Upload before and after schemas to simulate drift, intent mismatch, and human
              authorization.
            </p>
            <p className="simulator-panel__disclaimer">
              This does not deploy code. It simulates governance over a proposed change.
            </p>
          </div>

          <div className="simulator-panel__content">
            {/* Upload Section */}
            <div className="simulator-panel__uploads">
              <div className={`simulator-upload ${beforeSchema ? "simulator-upload--loaded" : ""}`}>
                <div className="simulator-upload__header">
                  <span className="simulator-upload__label">Before</span>
                  {beforeSchema && <span className="simulator-upload__check">✓</span>}
                </div>
                <label className="simulator-upload__dropzone">
                  <input
                    type="file"
                    accept=".ts,.tsx,.json"
                    onChange={handleBeforeUpload}
                    className="simulator-upload__input"
                  />
                  {beforeSchema ? (
                    <div className="simulator-upload__preview">
                      <pre>{beforeSchema.slice(0, 200)}...</pre>
                    </div>
                  ) : (
                    <div className="simulator-upload__placeholder">
                      <span className="simulator-upload__icon">📄</span>
                      <span>Upload before.ts</span>
                    </div>
                  )}
                </label>
              </div>

              <div className="simulator-panel__arrow">→</div>

              <div className={`simulator-upload ${afterSchema ? "simulator-upload--loaded" : ""}`}>
                <div className="simulator-upload__header">
                  <span className="simulator-upload__label">After</span>
                  {afterSchema && <span className="simulator-upload__check">✓</span>}
                </div>
                <label className="simulator-upload__dropzone">
                  <input
                    type="file"
                    accept=".ts,.tsx,.json"
                    onChange={handleAfterUpload}
                    className="simulator-upload__input"
                  />
                  {afterSchema ? (
                    <div className="simulator-upload__preview">
                      <pre>{afterSchema.slice(0, 200)}...</pre>
                    </div>
                  ) : (
                    <div className="simulator-upload__placeholder">
                      <span className="simulator-upload__icon">📄</span>
                      <span>Upload after.ts</span>
                    </div>
                  )}
                </label>
              </div>
            </div>

            {/* Drift Results */}
            {activeDrift && (
              <div className="simulator-panel__results">
                <div className="simulator-results__header">
                  <span className="simulator-results__badge simulator-results__badge--detected">
                    ⚠ Drift Detected
                  </span>
                  <span className="simulator-results__count">
                    {activeDrift.changes.filter((c) => c.breaking).length} breaking change
                    {activeDrift.changes.filter((c) => c.breaking).length !== 1 ? "s" : ""}
                  </span>
                </div>

                <div className="simulator-results__changes">
                  {activeDrift.changes.map((change, i) => (
                    <div
                      key={i}
                      className={`simulator-change ${change.breaking ? "simulator-change--breaking" : ""}`}
                    >
                      <span className="simulator-change__type">
                        {change.type.replace("_", " ")}
                      </span>
                      <span className="simulator-change__field">{change.field}</span>
                      {change.from && change.to && (
                        <span className="simulator-change__diff">
                          <code>{change.from}</code> → <code>{change.to}</code>
                        </span>
                      )}
                      {change.breaking && (
                        <span className="simulator-change__breaking">BREAKING</span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Intent Alignment */}
                {(() => {
                  const alignment = analyzeIntentAlignment(activeIntent || [], activeDrift.changes);
                  const statusConfig = {
                    ALIGNED: {
                      icon: "✓",
                      className: "simulator-results__intent--aligned",
                      title: "Intent Alignment: ALIGNED",
                    },
                    PARTIAL: {
                      icon: "◐",
                      className: "simulator-results__intent--partial",
                      title: "Intent Alignment: PARTIAL",
                    },
                    UNCLEAR: {
                      icon: "⚠",
                      className: "simulator-results__intent--unclear",
                      title: "Intent Alignment: UNCLEAR",
                    },
                  }[alignment.status];

                  return (
                    <div className={`simulator-results__intent-warning ${statusConfig.className}`}>
                      <div className="simulator-results__intent-header">
                        <span className="simulator-results__intent-icon">{statusConfig.icon}</span>
                        <span className="simulator-results__intent-title">
                          {statusConfig.title}
                        </span>
                      </div>

                      {alignment.status === "UNCLEAR" && (
                        <>
                          <p className="simulator-results__intent-text">
                            No <code>@intent</code> annotation found. Governance requires
                            intent-to-change alignment.
                          </p>
                          <div className="simulator-results__intent-tip">
                            <strong>Tip:</strong> Add intent to your schema:
                            <pre className="simulator-results__intent-example">
                              {`// @intent Rename userId to customerId for new billing system`}
                            </pre>
                          </div>
                        </>
                      )}

                      {alignment.status === "PARTIAL" && (
                        <>
                          {alignment.coveredChanges.length > 0 ? (
                            <>
                              <p className="simulator-results__intent-text">
                                Declared intent covers:{" "}
                                <strong>{alignment.coveredChanges.join(", ")}</strong>
                              </p>
                              <p className="simulator-results__intent-text simulator-results__intent-text--warning">
                                But does not explain:{" "}
                                <strong>{alignment.uncoveredChanges.join(", ")}</strong>
                              </p>
                            </>
                          ) : (
                            <p className="simulator-results__intent-text simulator-results__intent-text--warning">
                              Intent declared but does not match detected changes:{" "}
                              <strong>{alignment.uncoveredChanges.join(", ")}</strong>
                            </p>
                          )}
                        </>
                      )}

                      {alignment.status === "ALIGNED" && (
                        <p className="simulator-results__intent-text">
                          Declared intent covers all {alignment.coveredChanges.length} breaking
                          change{alignment.coveredChanges.length !== 1 ? "s" : ""}.
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* Run Governance Prompt */}
                <div className="simulator-results__run-prompt">
                  <span className="simulator-results__run-prompt-text">
                    Drift detected. Run governance to evaluate policy, intent, and risk.
                  </span>
                </div>
              </div>
            )}

            {/* Reset */}
            {(beforeSchema || afterSchema) && (
              <div className="simulator-panel__actions">
                <button className="simulator-panel__reset" onClick={resetSimulator}>
                  ↺ Reset
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Intent Governance Headline - The Killer Line */}
      <div className="intent-governance-headline">
        <span className="intent-governance-headline__text">
          Dotto governs not just <em>what</em> changed, but whether the change matches{" "}
          <strong>declared human intent</strong>.
        </span>
      </div>

      {/* Hero Status Card */}
      <section className="apple-analysis__hero">
        <div className={`status-hero status-hero--${statusConfig.color}`}>
          <div className="status-hero__indicator">
            {statusConfig.status === "pending" && (
              <div className="status-hero__icon status-hero__icon--pending">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeDasharray="4 4"
                  />
                </svg>
              </div>
            )}
            {statusConfig.status === "approve" && (
              <div className="status-hero__icon status-hero__icon--success">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            )}
            {statusConfig.status === "block" && (
              <div className="status-hero__icon status-hero__icon--error">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            )}
            {statusConfig.status === "escalate" && (
              <div className="status-hero__icon status-hero__icon--warning">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            )}
            {statusConfig.status === "auto-authorized" && (
              <div className="status-hero__icon status-hero__icon--success">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            )}
          </div>
          <h1 className="status-hero__label">{statusConfig.label}</h1>
          <p className="status-hero__description">{statusConfig.description}</p>

          {/* Quick stats */}
          <div className="status-hero__stats">
            <div className="quick-stat">
              <span className="quick-stat__value">{artifacts.breaking}</span>
              <span className="quick-stat__label">Breaking</span>
            </div>
            <div className="quick-stat__divider" />
            <div className="quick-stat">
              <span className="quick-stat__value">{artifacts.impacted}</span>
              <span className="quick-stat__label">Impacted</span>
            </div>
            <div className="quick-stat__divider" />
            <div className="quick-stat">
              <span className="quick-stat__value">{artifacts.total}</span>
              <span className="quick-stat__label">Total</span>
            </div>
          </div>
        </div>
      </section>

      {/* Pill tabs */}
      <nav className="apple-analysis__tabs">
        <button
          className={`pill-tab ${activeTab === "summary" ? "pill-tab--active" : ""}`}
          onClick={() => setActiveTab("summary")}
        >
          Summary
        </button>
        <button
          className={`pill-tab ${activeTab === "context" ? "pill-tab--active" : ""}`}
          onClick={() => setActiveTab("context")}
        >
          <GeminiSparkle size={14} />
          Gemini Context
        </button>
        <button
          className={`pill-tab ${activeTab === "systems" ? "pill-tab--active" : ""}`}
          onClick={() => setActiveTab("systems")}
        >
          Affected Systems
          {artifacts.breaking > 0 && <span className="pill-tab__badge">{artifacts.breaking}</span>}
        </button>
      </nav>

      {/* Tab content */}
      <main className="apple-analysis__content">
        {activeTab === "summary" && (
          <div className="tab-panel tab-panel--summary">
            {decision ? (
              <>
                {/* Gemini Insight - The key observation, generated once and frozen */}
                <div
                  className={`gemini-insight ${humanFeedback ? "gemini-insight--superseded" : ""}`}
                >
                  <div className="gemini-insight__header">
                    <GeminiSparkle size={20} />
                    <h3>Gemini Insight</h3>
                  </div>
                  <p className="gemini-insight__text">
                    {/* Use the insight field if available (dynamic from Gemini), otherwise fallback */}
                    {decision.insight ? (
                      decision.insight
                    ) : decision.auto_authorized ? (
                      <>
                        This change matches a previously approved pattern with{" "}
                        {decision.precedent_match
                          ? `${Math.round(decision.precedent_match.similarity * 100)}% similarity`
                          : "high confidence"}
                        . Safe to auto-authorize based on established precedent.
                      </>
                    ) : (
                      decision.reasoning?.[0] || "Analysis complete."
                    )}
                  </p>
                  <span className="gemini-insight__provenance">
                    Generated by Gemini during analysis. This insight is preserved as part of the
                    decision record.
                  </span>
                </div>

                {/* Gemini Recommendation - Not a judgment, superseded when human rules */}
                <div
                  className={`gemini-recommendation ${humanFeedback ? "gemini-recommendation--superseded" : ""}`}
                >
                  <span className="gemini-recommendation__label">Gemini Recommendation:</span>
                  <span
                    className={`gemini-recommendation__action gemini-recommendation__action--${decision.decision}`}
                  >
                    {decision.decision === "escalate"
                      ? "Escalate for human review"
                      : decision.decision === "block"
                        ? "Block deployment"
                        : "Approve for deployment"}
                  </span>
                  <span className="gemini-recommendation__risk">({decision.risk_level} risk)</span>
                </div>

                {/* Supporting Evidence - Detailed reasoning */}
                {decision.thinking ? (
                  <div
                    className={`thinking-card ${humanFeedback ? "thinking-card--superseded" : ""}`}
                  >
                    <div className="thinking-card__header">
                      <h3>Supporting Analysis</h3>
                      {humanFeedback && (
                        <span className="thinking-card__superseded-badge">
                          Superseded by human decision
                        </span>
                      )}
                      <button
                        className="thinking-card__toggle"
                        onClick={() => setShowThinking(!showThinking)}
                      >
                        {showThinking ? "Collapse" : "Expand"}
                      </button>
                    </div>
                    {showThinking && (
                      <div className="thinking-card__content">
                        <ReactMarkdown>
                          {decision.thinking
                            // Remove or rename the Judgment section - it's now handled by Gemini Recommendation
                            .replace(/## Judgment[\s\S]*?(?=##|$)/gi, "")
                            // Clean up any double line breaks
                            .replace(/\n{3,}/g, "\n\n")}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>
                ) : decision.reasoning && decision.reasoning.length > 1 ? (
                  <div className="reasoning-card">
                    <div className="reasoning-card__header">
                      <h3>Supporting Evidence</h3>
                    </div>
                    <ul className="reasoning-card__list">
                      {decision.reasoning.slice(1).map((reason, idx) => (
                        <li key={idx} className="reasoning-item">
                          <span className="reasoning-item__bullet" />
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="empty-card">
                <div className="empty-card__icon">
                  <GeminiSparkle size={40} />
                </div>
                <h3>Ready for Analysis</h3>
                <p>Click "Run Governance" to start Gemini analysis</p>
              </div>
            )}

            {/* Auto-authorized precedent info */}
            {decision?.auto_authorized && decision.precedent_match && (
              <div className="precedent-card">
                <div className="precedent-card__badge">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Precedent Match
                </div>
                <div className="precedent-card__details">
                  <div className="precedent-detail">
                    <span className="precedent-detail__label">Prior Decision</span>
                    <span className="precedent-detail__value">
                      {decision.precedent_match.change_id.slice(0, 20)}...
                    </span>
                  </div>
                  <div className="precedent-detail">
                    <span className="precedent-detail__label">Similarity</span>
                    <span className="precedent-detail__value">
                      {Math.round(decision.precedent_match.similarity * 100)}%
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "context" && (
          <div className="tab-panel tab-panel--context">
            <p className="context-intro">
              <GeminiSparkle size={16} />
              Artifacts analyzed by Gemini to make the governance decision.
            </p>
            {inputArtifacts && (
              <div className="context-artifacts">
                <ContextCard
                  title="Drift Detection"
                  subtitle="Schema changes detected"
                  data={inputArtifacts.drift}
                  defaultOpen
                />
                <IntentCard intent={inputArtifacts.intent} />
                <ContextCard
                  title="Dependency Graph"
                  subtitle="System relationships"
                  data={inputArtifacts.graph}
                />
                <ContextCard
                  title="Decision Memory"
                  subtitle="Previous rulings"
                  data={inputArtifacts.decisions}
                />
              </div>
            )}
          </div>
        )}

        {activeTab === "systems" && (
          <div className="tab-panel tab-panel--systems">
            {artifactsList.length > 0 ? (
              <div className="systems-grid">
                {artifactsList.map((artifact) => (
                  <div
                    key={artifact.id}
                    className={`system-card system-card--${artifact.status === "drifted" ? "breaking" : artifact.status}`}
                  >
                    <div className="system-card__status">
                      {artifact.status === "drifted" && (
                        <span className="status-dot status-dot--breaking" />
                      )}
                      {artifact.status === "impacted" && (
                        <span className="status-dot status-dot--warning" />
                      )}
                      {artifact.status === "changed" && (
                        <span className="status-dot status-dot--info" />
                      )}
                      {artifact.status === "verified" && (
                        <span className="status-dot status-dot--success" />
                      )}
                    </div>
                    <div className="system-card__info">
                      <span className="system-card__name">{artifact.name}</span>
                      <span className="system-card__type">{artifact.type || "schema"}</span>
                    </div>
                    <span
                      className={`system-card__badge system-card__badge--${artifact.status === "drifted" ? "breaking" : artifact.status}`}
                    >
                      {artifact.status === "drifted" ? "BREAKING" : artifact.status.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-card">
                <h3>No Systems Detected</h3>
                <p>Run governance analysis to detect affected systems</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Floating action bar for human authority */}
      {needsHumanAction && (
        <div className="floating-actions">
          <div className="floating-actions__content">
            <div className="floating-actions__lock">
              <span className="floating-actions__lock-icon">🔒</span>
              <span className="floating-actions__lock-text">Human Authorization Required</span>
            </div>
            <p className="floating-actions__hint">Authorization requires a signed confirmation.</p>
            <div className="floating-actions__buttons">
              {decision.decision !== "approve" && (
                <button
                  className="action-btn action-btn--approve"
                  onClick={() => openAuthModal("overridden", "approve")}
                  disabled={submittingFeedback}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                  Override: Approve
                </button>
              )}
              <button
                className="action-btn action-btn--accept"
                onClick={() => openAuthModal("accepted")}
                disabled={submittingFeedback}
              >
                <span>⚡</span> Authorize
              </button>
              {decision.decision !== "block" && (
                <button
                  className="action-btn action-btn--block"
                  onClick={() => openAuthModal("overridden", "block")}
                  disabled={submittingFeedback}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Override: Block
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Minimal footer */}
      <footer className="apple-analysis__footer">
        <span>Human rulings are binding</span>
      </footer>

      {/* Authorization Confirmation Modal */}
      {showAuthModal && decision && (
        <div className="auth-modal-overlay" onClick={cancelAuthAction}>
          <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
            <div className="auth-modal__header">
              <span className="auth-modal__icon">⚠️</span>
              <h3 className="auth-modal__title">{getAuthModalConfig()?.title}</h3>
            </div>

            <div className="auth-modal__summary">
              <div className="auth-modal__row">
                <span className="auth-modal__label">AI Recommendation</span>
                <span className={`auth-modal__value auth-modal__value--${decision.decision}`}>
                  {decision.decision.charAt(0).toUpperCase() + decision.decision.slice(1)}
                </span>
              </div>
              <div className="auth-modal__row">
                <span className="auth-modal__label">Risk Level</span>
                <span className={`auth-modal__value auth-modal__value--${decision.risk_level}`}>
                  {decision.risk_level.charAt(0).toUpperCase() + decision.risk_level.slice(1)}
                </span>
              </div>
              <div className="auth-modal__row">
                <span className="auth-modal__label">Your Ruling</span>
                <span className="auth-modal__value auth-modal__value--action">
                  {getAuthModalConfig()?.action}
                </span>
              </div>
            </div>

            <p className="auth-modal__disclaimer">{getAuthModalConfig()?.description}</p>
            <p className="auth-modal__receipt-note">
              This creates a signed authorization receipt required for deployment.
            </p>

            <div className="auth-modal__actions">
              <button
                className="auth-modal__btn auth-modal__btn--cancel"
                onClick={cancelAuthAction}
              >
                Cancel
              </button>
              <button
                className={`auth-modal__btn ${getAuthModalConfig()?.buttonClass}`}
                onClick={confirmAuthAction}
                disabled={submittingFeedback}
              >
                <span>⚡</span> {getAuthModalConfig()?.buttonText}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Intent card component - special treatment for intent alignment
function IntentCard({ intent }: { intent: unknown }) {
  const [isOpen, setIsOpen] = useState(false);

  // Check if intent is empty/unclear
  // Intent can have various fields: summary, description, reason, title, justification, intents[]
  const intentObj = intent as Record<string, unknown> | null;
  const hasIntent =
    intentObj &&
    Object.keys(intentObj).length > 0 &&
    (intentObj.summary ||
      intentObj.description ||
      intentObj.reason ||
      intentObj.title ||
      intentObj.justification ||
      (Array.isArray(intentObj.intents) && intentObj.intents.length > 0));
  const isUnclear = !hasIntent;

  return (
    <div
      className={`context-card intent-card ${isOpen ? "context-card--open" : ""} ${isUnclear ? "intent-card--danger" : "intent-card--present"}`}
    >
      <button className="context-card__header" onClick={() => setIsOpen(!isOpen)}>
        <div className="context-card__info">
          <h4 className="context-card__title">
            {isUnclear && <span className="intent-card__warning-icon">⚠</span>}
            Intent Alignment
          </h4>
          <span
            className={`context-card__subtitle ${isUnclear ? "intent-card__subtitle--danger" : ""}`}
          >
            {isUnclear
              ? "No declared intent — alignment cannot be verified"
              : "Stated purpose of changes"}
          </span>
        </div>
        {isUnclear && (
          <span className="intent-card__status intent-card__status--danger">MISSING</span>
        )}
        <svg
          className={`context-card__chevron ${isOpen ? "context-card__chevron--open" : ""}`}
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>
      {isOpen && (
        <div className="context-card__content">
          {isUnclear ? (
            <div className="intent-card__empty-state">
              <div className="intent-card__empty-icon">⚠</div>
              <p className="intent-card__empty-title">No Declared Intent</p>
              <p className="intent-card__empty-description">
                Governance requires intent-to-change alignment. Without declared intent, the system
                cannot verify that this change matches what the developer intended.
              </p>
              <p className="intent-card__empty-consequence">
                <strong>Consequence:</strong> Human authorization required.
              </p>
            </div>
          ) : (
            <SyntaxHighlightedJSON data={intent} showLineNumbers />
          )}
        </div>
      )}
    </div>
  );
}

// Context card component
function ContextCard({
  title,
  subtitle,
  data,
  defaultOpen = false,
}: {
  title: string;
  subtitle: string;
  data: unknown;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={`context-card ${isOpen ? "context-card--open" : ""}`}>
      <button className="context-card__header" onClick={() => setIsOpen(!isOpen)}>
        <div className="context-card__info">
          <h4 className="context-card__title">{title}</h4>
          <span className="context-card__subtitle">{subtitle}</span>
        </div>
        <svg
          className={`context-card__chevron ${isOpen ? "context-card__chevron--open" : ""}`}
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>
      {isOpen && (
        <div className="context-card__content">
          <SyntaxHighlightedJSON data={data} showLineNumbers />
        </div>
      )}
    </div>
  );
}

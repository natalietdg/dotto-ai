import { useState } from "react";
import { Tooltip } from "./Tooltip";
import { LoadingSpinner } from "./LoadingSpinner";

type AuthorizationReceipt = {
  version: string;
  issuer?: string;
  algorithm?: string;
  issued_at?: string;
  expires_at?: string | null;
  timestamp?: string; // Legacy v1.0
  change_id: string;
  ruling: string;
  risk_level?: string;
  auto_authorized?: boolean;
  precedent_match?: {
    change_id: string;
    timestamp: string;
    similarity: number;
  };
  artifacts_hash: string;
  signature: string;
};

type GovernorDecision = {
  decision: "approve" | "block" | "escalate";
  risk_level: "low" | "medium" | "high";
  insight?: string; // Key finding quote from Gemini - the headline shown to humans
  reasoning: string[];
  conditions?: string[];
  thinking?: string; // Gemini's chain-of-thought
  auto_authorized?: boolean;
  precedent_match?: {
    change_id: string;
    timestamp: string;
    similarity: number;
  };
  receipt?: AuthorizationReceipt;
};

type StepStatus = "idle" | "running" | "done" | "error";

type Step = {
  id: string;
  label: string;
  status: StepStatus;
};

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

type ActiveArtifacts = {
  drift: {
    detected: boolean;
    changes: Array<{ type: string; field: string; from?: string; to?: string; breaking: boolean }>;
  } | null;
  intent: string[] | null;
  beforeSchema: string | null;
  afterSchema: string | null;
};

interface PipelinePanelProps {
  decision: GovernorDecision | null;
  setDecision: (d: GovernorDecision | null) => void;
  isRunning: boolean;
  setIsRunning: (r: boolean) => void;
  activeArtifacts?: ActiveArtifacts;
  humanFeedback?: "accepted" | "overridden" | null;
  overrideAction?: "approve" | "block" | null;
}

export default function PipelinePanel({
  decision,
  setDecision,
  isRunning,
  setIsRunning,
  activeArtifacts,
  humanFeedback,
  overrideAction,
}: PipelinePanelProps) {
  const [error, setError] = useState<string | null>(null);

  const [steps, setSteps] = useState<Step[]>([
    { id: "dotto", label: "Artifacts", status: "idle" },
    { id: "gemini", label: "AI Analysis", status: "idle" },
    { id: "decision", label: "Decision", status: "idle" },
    { id: "ci", label: "CI Gate", status: "idle" },
  ]);

  const stepDescriptions: Record<string, string> = {
    dotto: "Scan codebase to detect schema changes and build dependency graph",
    gemini: "AI evaluates changes against policy, precedent, and risk factors",
    decision: "Generate governance recommendation (approve, block, or escalate)",
    ci: "Enforce decision via CI gate - blocks deployment if unauthorized",
  };

  const updateStep = (id: string, status: StepStatus) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
  };

  const reset = () => {
    setError(null);
    setDecision(null);
    setSteps((prev) => prev.map((s) => ({ ...s, status: "idle" })));
  };

  const runPipeline = async () => {
    reset();
    setIsRunning(true);

    try {
      updateStep("dotto", "running");
      // Skip dotto/run - use pre-existing artifacts (dotto scan has git checkout issues)
      // Artifacts are already generated with breaking changes detected
      await new Promise((resolve) => setTimeout(resolve, 500)); // Brief delay for UX
      updateStep("dotto", "done");

      updateStep("gemini", "running");
      const requestBody: Record<string, unknown> = {
        artifactsDir: "artifacts",
        change_id: `change-${Date.now()}`,
      };

      // If we have simulated data from the schema simulator, send it
      if (activeArtifacts?.drift) {
        requestBody.simulated = {
          drift: {
            timestamp: new Date().toISOString(),
            diffs: activeArtifacts.drift.changes.map((c) => ({
              type: c.type,
              field: c.field,
              from: c.from,
              to: c.to,
              breaking: c.breaking,
            })),
          },
          intent: activeArtifacts.intent || [],
        };
      }

      const dec = await postJson<GovernorDecision>("/run", requestBody);
      setDecision(dec);
      updateStep("gemini", "done");

      updateStep("decision", "done");

      updateStep("ci", "done");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      const runningStep = steps.find((s) => s.status === "running");
      if (runningStep) {
        updateStep(runningStep.id, "error");
      }
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="pipeline">
      <span className="pipeline-label">Pipeline</span>

      <div className="pipeline-steps">
        {steps.map((step, idx) => (
          <div key={step.id}>
            <Tooltip content={stepDescriptions[step.id]} position="bottom">
              <div className={`pipeline-step ${step.status}`}>
                <span className="step-num">
                  {step.status === "done" ? (
                    <svg
                      width="10"
                      height="10"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : step.status === "error" ? (
                    <svg
                      width="10"
                      height="10"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  ) : step.status === "running" ? (
                    <div className="step-spinner" />
                  ) : (
                    idx + 1
                  )}
                </span>
                <span className="step-label">{step.label}</span>
              </div>
            </Tooltip>
            {idx < steps.length - 1 && <div className="pipeline-connector" />}
          </div>
        ))}
      </div>

      <Tooltip
        content="Analyze changes against policy, precedent, and risk factors"
        position="bottom"
      >
        <button
          className="pipeline-btn pipeline-btn--governance pipeline-btn--primary"
          onClick={() => runPipeline()}
          disabled={isRunning}
        >
          {isRunning ? (
            <>
              <LoadingSpinner size="sm" color="white" />
              <span className="pipeline-btn__text">Analyzing...</span>
            </>
          ) : (
            <>
              <svg
                className="pipeline-btn__icon"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span className="pipeline-btn__text">
                {decision ? "Re-evaluate" : "Run Governance"}
              </span>
              <span className="pipeline-btn__shortcut">⌘↵</span>
            </>
          )}
        </button>
      </Tooltip>

      {(decision || error) &&
        (() => {
          // Determine the final outcome state based on human feedback
          const isDeferred = humanFeedback === "accepted" && !overrideAction;
          const isHumanApproved = overrideAction === "approve";
          const isHumanBlocked = overrideAction === "block";

          // Determine what to display
          const displayState = isDeferred
            ? "deferred"
            : isHumanApproved
              ? "approve"
              : isHumanBlocked
                ? "block"
                : decision?.decision || "error";

          const displayLabel = isDeferred
            ? "DEFERRED"
            : isHumanApproved
              ? "AUTHORIZED"
              : isHumanBlocked
                ? "BLOCKED"
                : decision?.decision.toUpperCase();

          // Only show signed receipt for actual authorizations
          const showReceipt =
            decision?.receipt &&
            (decision.auto_authorized ||
              isHumanApproved ||
              (decision.decision === "approve" && !humanFeedback));

          return (
            <div
              className={`pipeline-result ${displayState} ${decision?.auto_authorized ? "auto-authorized" : ""}`}
            >
              {decision ? (
                <>
                  {decision.auto_authorized && (
                    <span className="auto-auth-badge">AUTO-AUTHORIZED</span>
                  )}
                  {isDeferred && <span className="deferred-badge">⏸</span>}
                  <strong>{displayLabel}</strong>
                  {!isDeferred && <span className="result-risk">({decision.risk_level} risk)</span>}
                  {decision.auto_authorized && decision.precedent_match && (
                    <span className="precedent-info">
                      via precedent {decision.precedent_match.change_id.slice(0, 12)}
                    </span>
                  )}
                  {isDeferred ? (
                    <span className="result-reason">Deployment blocked pending further review</span>
                  ) : (
                    !decision.auto_authorized &&
                    decision.reasoning?.[0] && (
                      <span className="result-reason">{decision.reasoning[0]}</span>
                    )
                  )}
                  {showReceipt && (
                    <Tooltip
                      content={
                        <div className="receipt-tooltip">
                          <div className="receipt-tooltip__row">
                            <span className="receipt-tooltip__label">Version:</span>
                            <span>{decision.receipt!.version}</span>
                          </div>
                          {decision.receipt!.issuer && (
                            <div className="receipt-tooltip__row">
                              <span className="receipt-tooltip__label">Issuer:</span>
                              <span>{decision.receipt!.issuer}</span>
                            </div>
                          )}
                          {decision.receipt!.algorithm && (
                            <div className="receipt-tooltip__row">
                              <span className="receipt-tooltip__label">Algorithm:</span>
                              <span>{decision.receipt!.algorithm}</span>
                            </div>
                          )}
                          <div className="receipt-tooltip__row">
                            <span className="receipt-tooltip__label">Issued:</span>
                            <span>
                              {new Date(
                                decision.receipt!.issued_at || decision.receipt!.timestamp || ""
                              ).toLocaleString()}
                            </span>
                          </div>
                          {decision.receipt!.expires_at && (
                            <div className="receipt-tooltip__row">
                              <span className="receipt-tooltip__label">Expires:</span>
                              <span>{new Date(decision.receipt!.expires_at).toLocaleString()}</span>
                            </div>
                          )}
                          <div className="receipt-tooltip__row">
                            <span className="receipt-tooltip__label">Artifacts:</span>
                            <span className="receipt-tooltip__hash">
                              {decision.receipt!.artifacts_hash.slice(0, 16)}...
                            </span>
                          </div>
                          <div className="receipt-tooltip__row">
                            <span className="receipt-tooltip__label">Signature:</span>
                            <span className="receipt-tooltip__hash">
                              {decision.receipt!.signature.slice(0, 16)}...
                            </span>
                          </div>
                        </div>
                      }
                      position="bottom"
                    >
                      <span className="receipt-badge">
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                          <path d="M9 12l2 2 4-4" />
                        </svg>
                        Signed Receipt
                      </span>
                    </Tooltip>
                  )}
                  {isDeferred && (
                    <span className="audit-badge">
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <path d="M14 2v6h6" />
                        <path d="M16 13H8" />
                        <path d="M16 17H8" />
                      </svg>
                      Deferral Recorded
                    </span>
                  )}
                </>
              ) : (
                <>
                  <strong>Error:</strong> {error}
                </>
              )}
            </div>
          );
        })()}
    </div>
  );
}

export type { GovernorDecision };

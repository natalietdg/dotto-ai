import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import PipelinePanel, { GovernorDecision } from './PipelinePanel';
import './AnalysisView.css';

interface Artifact {
  id: string;
  name: string;
  status: 'verified' | 'changed' | 'impacted' | 'drifted';
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
  humanFeedback: 'accepted' | 'overridden' | null;
  setHumanFeedback: (f: 'accepted' | 'overridden' | null) => void;
  overrideAction: 'approve' | 'block' | null;
  setOverrideAction: (a: 'approve' | 'block' | null) => void;
}

interface AnalysisViewProps {
  artifacts: ArtifactSummary;
  artifactsList: Artifact[];
  pipelineState: PipelineState;
  onDecisionHistoryUpdate?: () => void;
}

interface InputArtifacts {
  graph: any;
  drift: any;
  intent: any;
  decisions: any;
}

function StreamingText({ text, delay = 20 }: { text: string; delay?: number }) {
  const [displayed, setDisplayed] = useState('');
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    setDisplayed('');
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
    <span className={isComplete ? '' : 'streaming-cursor'}>
      {displayed}
    </span>
  );
}

function StreamingMarkdown({ text, delay = 3 }: { text: string; delay?: number }) {
  const [displayed, setDisplayed] = useState('');
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    setDisplayed('');
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
    <div className={`thinking-markdown ${isComplete ? '' : 'thinking-markdown--streaming'}`}>
      <ReactMarkdown>{displayed}</ReactMarkdown>
      {!isComplete && <span className="streaming-cursor" />}
    </div>
  );
}

function CollapsibleJson({ title, data, defaultOpen = false }: { title: string; data: any; defaultOpen?: boolean }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const jsonString = JSON.stringify(data, null, 2);
  const lineCount = jsonString.split('\n').length;

  return (
    <div className="collapsible-json">
      <button className="collapsible-json__header" onClick={() => setIsOpen(!isOpen)}>
        <span className="collapsible-json__title">
          <svg
            className={`collapsible-json__chevron ${isOpen ? 'collapsible-json__chevron--open' : ''}`}
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
      {isOpen && (
        <pre className="collapsible-json__content">
          <code>{jsonString}</code>
        </pre>
      )}
    </div>
  );
}

function CollapsibleSection({ title, subtitle, children, defaultOpen = false }: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={`collapsible-section ${isOpen ? 'collapsible-section--open' : ''}`}>
      <button className="collapsible-section__header" onClick={() => setIsOpen(!isOpen)}>
        <div className="collapsible-section__title-group">
          <svg
            className={`collapsible-section__chevron ${isOpen ? 'collapsible-section__chevron--open' : ''}`}
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
      {isOpen && (
        <div className="collapsible-section__content">
          {children}
        </div>
      )}
    </div>
  );
}

export default function AnalysisView({ artifacts, artifactsList, pipelineState, onDecisionHistoryUpdate }: AnalysisViewProps) {
  // Use pipeline state from props (persisted in parent)
  const {
    decision,
    setDecision,
    isRunning,
    setIsRunning,
    changeId,
    humanFeedback,
    setHumanFeedback,
    overrideAction,
    setOverrideAction,
  } = pipelineState;

  const [streamingIndex, setStreamingIndex] = useState(-1);
  const [inputArtifacts, setInputArtifacts] = useState<InputArtifacts | null>(null);
  const [loadingInputs, setLoadingInputs] = useState(true);
  const [feedbackNotes, setFeedbackNotes] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  // Fetch input artifacts
  useEffect(() => {
    const fetchInputs = async () => {
      try {
        const [graphRes, driftRes, intentRes, decisionsRes] = await Promise.all([
          fetch('/artifacts/graph.json').then(r => r.ok ? r.json() : { nodes: {}, edges: {} }),
          fetch('/artifacts/drift.json').then(r => r.ok ? r.json() : { diffs: [] }),
          fetch('/artifacts/intent.json').then(r => r.ok ? r.json() : {}),
          fetch('/memory/decisions.json').then(r => r.ok ? r.json() : { decisions: [] }),
        ]);
        setInputArtifacts({
          graph: graphRes,
          drift: driftRes,
          intent: intentRes,
          decisions: decisionsRes,
        });
      } catch (e) {
        console.error('Failed to load input artifacts:', e);
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

  const handleDecision = (dec: GovernorDecision | null) => {
    setDecision(dec);
    setStreamingIndex(-1);
    setHumanFeedback(null);
    setOverrideAction(null);
    setFeedbackNotes('');
  };

  const submitFeedback = async (outcome: 'accepted' | 'overridden', override?: 'approve' | 'block') => {
    if (!decision) return;

    setSubmittingFeedback(true);
    try {
      await fetch('/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
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
      console.error('Failed to submit feedback:', e);
    } finally {
      setSubmittingFeedback(false);
    }
  };

  // Show governance tension modal when escalation requires human judgment
  const showGovernanceTension = decision?.decision === 'escalate' && !humanFeedback;

  // Show audit banner after governance conflict is resolved
  const showAuditBanner = decision?.decision === 'escalate' && humanFeedback;

  return (
    <div className={`analysis ${showGovernanceTension ? 'analysis--governance-pending' : ''}`}>
      {/* ========== AUDIT BANNER (after resolution) ========== */}
      {showAuditBanner && (
        <div className={`audit-banner audit-banner--${overrideAction || 'accepted'}`}>
          <span className="audit-banner__icon">
            {overrideAction === 'block' ? '✕' : overrideAction === 'approve' ? '✓' : '⚡'}
          </span>
          <span className="audit-banner__text">
            {overrideAction === 'block'
              ? 'This change was blocked via human authority after governance conflict.'
              : overrideAction === 'approve'
              ? 'This change proceeded via human override after governance conflict.'
              : 'Escalation accepted — change requires additional review before deployment.'}
          </span>
          <span className="audit-banner__time">
            {new Date().toLocaleTimeString()}
          </span>
        </div>
      )}

      {/* Header with Pipeline and Artifacts Summary */}
      <div className="analysis__header">
        <PipelinePanel
          decision={decision}
          setDecision={handleDecision}
          isRunning={isRunning}
          setIsRunning={setIsRunning}
          changeId={changeId}
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
      </div>

      <div className="analysis__content">
        {/* Collapsible Deterministic Inputs Section */}
        <CollapsibleSection
          title="Deterministic Inputs"
          subtitle="Artifacts sent to Gemini 3"
          defaultOpen={false}
        >
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
            {decision?.thinking ? (
              <div className="card card--thinking">
                <div className="card__header">
                  <h3 className="card__title">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 8 }}>
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
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 8 }}>
                      <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Decision Rationale
                  </h3>
                </div>
                <div className="card__body">
                  <div className="thinking-missing">
                    <p className="thinking-missing__title">Rationale not available</p>
                    <p className="thinking-missing__reason">
                      {decision.reasoning?.some(r => r.includes('GEMINI_API_KEY'))
                        ? 'GEMINI_API_KEY is not set. Set this environment variable to enable AI reasoning.'
                        : 'Structured reasoning trace was not returned for this response.'}
                    </p>
                    {decision.reasoning && decision.reasoning.length > 0 && (
                      <div className="thinking-missing__fallback">
                        <p className="thinking-missing__label">Summary from response:</p>
                        <ul>
                          {decision.reasoning.map((reason, idx) => (
                            <li key={idx}>{reason}</li>
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
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 8 }}>
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
                          className={`reasoning-item ${idx <= streamingIndex ? 'reasoning-item--visible' : 'reasoning-item--hidden'}`}
                        >
                          <span className="reasoning-item__num">{idx + 1}</span>
                          <span className="reasoning-item__text">
                            {idx === streamingIndex ? (
                              <StreamingText text={reason} delay={15} />
                            ) : idx < streamingIndex ? (
                              reason
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted">No reasoning provided</p>
                  )}

                  {decision.conditions && decision.conditions.length > 0 && streamingIndex >= decision.reasoning.length - 1 && (
                    <div className="conditions">
                      <h4 className="conditions__title">Conditions for Approval</h4>
                      <ul className="conditions__list">
                        {decision.conditions.map((condition, idx) => (
                          <li key={idx}>{condition}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-state__icon">
                  <svg width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <h3>Ready for Analysis</h3>
                <p>Click "Run Pipeline" to send artifacts to Gemini 3</p>
              </div>
            )}
          </div>

          {/* Decision Card (Right Sidebar) */}
          <div className="analysis__decision">
            {/* Resolved escalation summary - shows after human decision */}
            {decision && decision.decision === 'escalate' && humanFeedback && (
              <div className="card card--resolved">
                <div className="card__header">
                  <h3 className="card__title card__title--resolved">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}>
                      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Governance Resolved
                  </h3>
                </div>
                <div className="card__body">
                  <p className="resolved-text">
                    Human authority exercised. Decision recorded in learning loop.
                  </p>
                </div>
              </div>
            )}

            <div className="card card--decision-compact">
              <div className="card__header">
                <h3 className="card__title">
                  Governance Decision
                </h3>
              </div>
              <div className="card__body">
                {decision ? (
                  <div className="decision-compact">
                    <div className={`decision-compact__badge decision-compact__badge--${overrideAction || decision.decision}`}>
                      {overrideAction ? overrideAction.toUpperCase() : decision.decision.toUpperCase()}
                    </div>
                    {overrideAction && <span className="decision-compact__override">Human Override</span>}
                    <span className={`decision-compact__risk decision-compact__risk--${decision.risk_level}`}>
                      {decision.risk_level} risk
                    </span>

                    {/* Human Authority - only show for non-escalate decisions (escalate uses the modal) */}
                    {decision.decision !== 'escalate' && !humanFeedback ? (
                      <div className="decision-compact__actions">
                        <span className="decision-compact__actions-label">Human Authority (Final)</span>
                        <div className="decision-compact__actions-btns">
                          <button
                            className="decision-compact__btn decision-compact__btn--accept"
                            onClick={() => submitFeedback('accepted')}
                            disabled={submittingFeedback}
                            title="Accept governance decision — Creates binding precedent for similar changes"
                          >
                            ✓
                          </button>
                          {decision.decision !== 'approve' && (
                            <button
                              className="decision-compact__btn decision-compact__btn--approve"
                              onClick={() => submitFeedback('overridden', 'approve')}
                              disabled={submittingFeedback}
                              title="Override → Approve — Gemini learns to be less conservative for similar changes"
                            >
                              →
                            </button>
                          )}
                          {decision.decision !== 'block' && (
                            <button
                              className="decision-compact__btn decision-compact__btn--block"
                              onClick={() => submitFeedback('overridden', 'block')}
                              disabled={submittingFeedback}
                              title="Override → Block — Gemini learns to be more cautious for similar changes"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                    ) : humanFeedback ? (
                      <div className={`decision-compact__result decision-compact__result--${humanFeedback}`}>
                        {humanFeedback === 'accepted' ? 'Human Accepted' : 'Human Override'}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="decision-compact decision-compact--empty">
                    <span className="decision-compact__placeholder">—</span>
                    <span className="decision-compact__hint">Pending</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Artifacts List */}
        {artifactsList.length > 0 && (
          <div className="card card--full artifacts-section">
            <div className="card__header">
              <h3 className="card__title">Schema Artifacts</h3>
              <span className="card__subtitle">Detected schemas and their change status</span>
            </div>
            <div className="card__body">
              <div className="artifacts-grid">
                {artifactsList.map((artifact) => (
                  <div
                    key={artifact.id}
                    className={`artifact-card ${
                      artifact.status === 'drifted' ? 'artifact-card--breaking' :
                      artifact.status === 'changed' ? 'artifact-card--changed' :
                      artifact.status === 'impacted' ? 'artifact-card--impacted' :
                      artifact.status === 'verified' ? 'artifact-card--verified' : ''
                    }`}
                  >
                    <div className="artifact-card__name">{artifact.name}</div>
                    <div className="artifact-card__meta">{artifact.type || 'schema'}</div>
                    <span className={`artifact-card__status artifact-card__status--${artifact.status === 'drifted' ? 'breaking' : artifact.status}`}>
                      {artifact.status === 'drifted' ? 'breaking' : artifact.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect, useRef } from "react";

// Particle burst component for celebration effect
function ParticleBurst({ active }: { active: boolean }) {
  if (!active) return null;

  const particles = Array.from({ length: 24 }, (_, i) => {
    const angle = (i / 24) * 360;
    const distance = 60 + Math.random() * 40;
    const size = 4 + Math.random() * 6;
    const colors = ["#22c55e", "#3b82f6", "#f59e0b", "#8b5cf6", "#ec4899"];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const delay = Math.random() * 0.2;

    return (
      <div
        key={i}
        className="particle"
        style={
          {
            "--angle": `${angle}deg`,
            "--distance": `${distance}px`,
            "--size": `${size}px`,
            "--color": color,
            "--delay": `${delay}s`,
          } as React.CSSProperties
        }
      />
    );
  });

  return <div className="particle-burst">{particles}</div>;
}

// Interactive Demo - "Show don't tell" experience
// Stages: 0=locked, 1=drift detected, 2=ai recommends, 3=human rules, 4=enforced
export default function InteractiveDemo() {
  const [stage, setStage] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showParticles, setShowParticles] = useState(false);
  const autoPlayingRef = useRef(false);
  const ref = useRef<HTMLDivElement>(null);

  // Start when visible - check immediately and observe
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Check if already in viewport on mount
    const rect = el.getBoundingClientRect();
    const inViewport = rect.top < window.innerHeight && rect.bottom > 0;
    if (inViewport && !isVisible) {
      setIsVisible(true);
      return;
    }

    // Otherwise observe for scroll
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isVisible) {
          setIsVisible(true);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [isVisible]);

  // Auto-advance through stages 0→1→2 (stop at 2 for user action)
  useEffect(() => {
    if (!isVisible || autoPlayingRef.current) return;
    autoPlayingRef.current = true;

    const timer1 = setTimeout(() => setStage(1), 1000); // Drift detected
    const timer2 = setTimeout(() => setStage(2), 2500); // AI recommends

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [isVisible]);

  const handleAuthorizeClick = () => {
    if (stage === 2) {
      setShowModal(true);
    }
  };

  const handleConfirmAuthorize = () => {
    setShowModal(false);
    setStage(3); // Human rules
    setTimeout(() => {
      setStage(4); // Enforcement follows
      setShowParticles(true);
      setTimeout(() => setShowParticles(false), 1500); // Clean up particles
    }, 1200);
  };

  const handleCancelAuthorize = () => {
    setShowModal(false);
  };

  const handleRestart = () => {
    setStage(0);
    autoPlayingRef.current = false;
    setTimeout(() => {
      autoPlayingRef.current = true;
      setTimeout(() => setStage(1), 1000);
      setTimeout(() => setStage(2), 2500);
    }, 500);
  };

  return (
    <div ref={ref} className="interactive-demo">
      {/* Title */}
      <div className="interactive-demo__header">
        <h1 className="interactive-demo__title">dotto.</h1>
        <p className="interactive-demo__tagline">
          {stage < 4
            ? "Production is locked until a human authorizes."
            : "Production authorized. Receipt issued."}
        </p>
      </div>

      {/* Production State Indicator */}
      <div className={`production-state production-state--${stage >= 4 ? "unlocked" : "locked"}`}>
        <ParticleBurst active={showParticles} />
        <div className="production-state__icon">{stage >= 4 ? "✓" : "🔒"}</div>
        <div className="production-state__text">
          {stage >= 4 ? "Production Authorized" : "Production Locked"}
        </div>
        {stage < 4 && <div className="production-state__reason">No valid receipt detected</div>}
      </div>

      {/* User Action Banner - appears at stage 2 */}
      {stage === 2 && (
        <div className="user-action-banner">
          <div className="user-action-banner__content">
            <span className="user-action-banner__icon">👇</span>
            <span className="user-action-banner__text">
              Your turn — click <strong>&quot;Authorize Production&quot;</strong> below
            </span>
          </div>
        </div>
      )}

      {/* The Governance Loop Label */}
      <div className="governance-loop-label">
        <h2 className="governance-loop-label__title">The Governance Loop</h2>
        <p className="governance-loop-label__subtitle">
          What happens every time a change touches production
        </p>
      </div>

      {/* Main Demo Area */}
      <div className="interactive-demo__stages">
        {/* Stage 1: Drift Detection */}
        <div className={`demo-card demo-card--drift ${stage >= 1 ? "demo-card--active" : ""}`}>
          <div className="demo-card__header">
            <span className="demo-card__step">1</span>
            <span className="demo-card__title">Drift Detected</span>
            {stage >= 1 && (
              <span className="demo-card__badge demo-card__badge--warning">Breaking</span>
            )}
          </div>

          {stage >= 1 && (
            <div className="demo-card__content">
              <div className="drift-visual">
                <div className="drift-visual__change">
                  <span className="drift-visual__old">userId</span>
                  <span className="drift-visual__arrow">→</span>
                  <span className="drift-visual__new">customerId</span>
                </div>
                <div className="drift-visual__label">Field renamed (breaking)</div>
              </div>
            </div>
          )}

          {stage < 1 && <div className="demo-card__placeholder">Scanning for changes...</div>}
        </div>

        {/* Stage 2: AI Recommendation */}
        <div className={`demo-card demo-card--ai ${stage >= 2 ? "demo-card--active" : ""}`}>
          <div className="demo-card__header">
            <span className="demo-card__step">2</span>
            <span className="demo-card__title">AI Recommendation</span>
            {stage >= 2 && (
              <span className="demo-card__badge demo-card__badge--ai">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" />
                </svg>
                Gemini
              </span>
            )}
          </div>

          {stage >= 2 && (
            <div className="demo-card__content">
              <div className="ai-recommendation">
                <div className="ai-recommendation__verdict">Recommend: Escalate</div>
                <div className="ai-recommendation__reason">
                  Breaking change affects 3 downstream services
                </div>

                {/* DISABLED BUTTONS - Key visual */}
                <div className="ai-recommendation__actions">
                  <button
                    className="ai-btn ai-btn--approve"
                    disabled
                    title="AI cannot authorize production"
                  >
                    Approve
                  </button>
                  <button
                    className="ai-btn ai-btn--block"
                    disabled
                    title="AI cannot authorize production"
                  >
                    Block
                  </button>
                </div>
                <div className="ai-recommendation__notice">
                  <span className="ai-recommendation__lock">🔒</span>
                  AI cannot authorize production
                </div>
              </div>
            </div>
          )}

          {stage < 2 && <div className="demo-card__placeholder">Awaiting drift analysis...</div>}
        </div>

        {/* Stage 3: Human Authority */}
        <div
          className={`demo-card demo-card--human ${stage >= 3 ? "demo-card--active" : ""} ${stage === 2 ? "demo-card--ready" : ""}`}
        >
          <div className="demo-card__header">
            <span className="demo-card__step">3</span>
            <span className="demo-card__title">Human Authority</span>
            {stage >= 3 && (
              <span className="demo-card__badge demo-card__badge--success">Authorized</span>
            )}
          </div>

          <div className="demo-card__content">
            {stage === 2 && (
              <div className="human-authority human-authority--waiting">
                <div className="human-authority__lock-status">
                  <span className="human-authority__lock-icon">🔒</span>
                  <span className="human-authority__lock-text">Human Required</span>
                </div>
                <button className="authorize-btn" onClick={handleAuthorizeClick}>
                  <span className="authorize-btn__icon">⚡</span>
                  <span className="authorize-btn__text">Authorize Production</span>
                </button>
                <div className="human-authority__receipt-hint">
                  Creates signed receipt to unlock deployment
                </div>
              </div>
            )}

            {stage >= 3 && (
              <div className="human-authority human-authority--complete">
                <div className="human-authority__decision">
                  <span className="human-authority__check">✓</span>
                  <strong>Production Authorized</strong>
                </div>
                <div className="human-authority__precedent">Receipt issued • Deploy unlocked</div>
              </div>
            )}

            {stage < 2 && (
              <div className="demo-card__placeholder">Awaiting AI recommendation...</div>
            )}
          </div>
        </div>

        {/* Stage 4: Enforcement */}
        <div className={`demo-card demo-card--enforce ${stage >= 4 ? "demo-card--active" : ""}`}>
          <div className="demo-card__header">
            <span className="demo-card__step">4</span>
            <span className="demo-card__title">Enforcement</span>
          </div>

          <div className="demo-card__content">
            {stage >= 4 ? (
              <div className="enforcement">
                {/* Receipt */}
                <div className="enforcement__receipt">
                  <div className="receipt-seal">
                    <span className="receipt-seal__icon">◈</span>
                    <span className="receipt-seal__text">Receipt Issued</span>
                  </div>
                </div>

                {/* CI Pipeline */}
                <div className="enforcement__pipeline">
                  <div className="ci-stage ci-stage--pass">
                    <span>Build</span>
                    <span className="ci-stage__icon">✓</span>
                  </div>
                  <div className="ci-connector ci-connector--pass" />
                  <div className="ci-stage ci-stage--pass">
                    <span>Test</span>
                    <span className="ci-stage__icon">✓</span>
                  </div>
                  <div className="ci-connector ci-connector--pass" />
                  <div className="ci-stage ci-stage--pass ci-stage--dotto">
                    <span>dotto</span>
                    <span className="ci-stage__icon">✓</span>
                  </div>
                  <div className="ci-connector ci-connector--pass" />
                  <div className="ci-stage ci-stage--deploy">
                    <span>Deploy</span>
                    <span className="ci-stage__icon">🚀</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="enforcement enforcement--locked">
                <div className="enforcement__blocked">
                  <div className="ci-stage ci-stage--pass">
                    <span>Build</span>
                    <span className="ci-stage__icon">✓</span>
                  </div>
                  <div className="ci-connector ci-connector--pass" />
                  <div className="ci-stage ci-stage--pass">
                    <span>Test</span>
                    <span className="ci-stage__icon">✓</span>
                  </div>
                  <div className="ci-connector ci-connector--pass" />
                  <div className="ci-stage ci-stage--blocked">
                    <span>dotto</span>
                    <span className="ci-stage__icon">✕</span>
                  </div>
                  <div className="ci-connector ci-connector--blocked" />
                  <div className="ci-stage ci-stage--disabled">
                    <span>Deploy</span>
                    <span className="ci-stage__icon">🔒</span>
                  </div>
                </div>
                <div className="enforcement__message">No receipt. Deploy blocked.</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Enforcement Rule */}
      <p className="interactive-demo__rule">
        This sequence is enforced for every production change.
      </p>

      {/* Bottom message */}
      <div className="interactive-demo__footer">
        {stage >= 4 ? (
          <div className="demo-complete">
            <div className="demo-complete__message">No receipt, no production state change.</div>
            <button className="demo-restart" onClick={handleRestart}>
              ↺ Try again
            </button>
          </div>
        ) : (
          <div className="demo-progress">
            <div className="demo-progress__dots">
              {[0, 1, 2, 3, 4].map((s) => (
                <span
                  key={s}
                  className={`demo-progress__dot ${stage >= s ? "demo-progress__dot--complete" : ""} ${stage === s ? "demo-progress__dot--current" : ""}`}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Authorization Confirmation Modal */}
      {showModal && (
        <div
          className="auth-modal-overlay"
          onClick={handleCancelAuthorize}
          onKeyDown={(e) => e.key === "Escape" && handleCancelAuthorize()}
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
        >
          <div className="auth-modal" onClick={(e) => e.stopPropagation()} role="document">
            <div className="auth-modal__header">
              <span className="auth-modal__icon">⚠️</span>
              <h3 className="auth-modal__title">Authorize Production Change</h3>
            </div>

            <div className="auth-modal__summary">
              <div className="auth-modal__row">
                <span className="auth-modal__label">Change</span>
                <span className="auth-modal__value">
                  <code>userId</code> → <code>customerId</code>
                </span>
              </div>
              <div className="auth-modal__row">
                <span className="auth-modal__label">Risk Level</span>
                <span className="auth-modal__value auth-modal__value--warning">Breaking</span>
              </div>
              <div className="auth-modal__row">
                <span className="auth-modal__label">Downstream</span>
                <span className="auth-modal__value">3 services affected</span>
              </div>
            </div>

            <p className="auth-modal__disclaimer">
              This creates a signed authorization receipt required for deployment.
            </p>

            <div className="auth-modal__actions">
              <button
                className="auth-modal__btn auth-modal__btn--cancel"
                onClick={handleCancelAuthorize}
              >
                Cancel
              </button>
              <button
                className="auth-modal__btn auth-modal__btn--confirm"
                onClick={handleConfirmAuthorize}
              >
                <span>⚡</span> Sign Authorization
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

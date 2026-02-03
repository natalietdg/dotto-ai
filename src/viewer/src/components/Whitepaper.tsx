import { useState, useEffect, useRef } from "react";
import InteractiveDemo from "./InteractiveDemo";
import EnforcementDemo from "./EnforcementDemo";
import ReceiptDemo from "./ReceiptDemo";
import TableOfContents from "./TableOfContents";
import ScrollRevealSection from "./ScrollRevealSection";
import "./Whitepaper.css";

// Progress Bar - shows scroll completion with completion badge
function ProgressBar() {
  const [progress, setProgress] = useState(0);
  const [showBadge, setShowBadge] = useState(false);
  const badgeShownRef = useRef(false);

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrollPercent = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
      const newProgress = Math.min(scrollPercent, 100);
      setProgress(newProgress);

      // Show badge when reaching 95%+ for the first time
      if (newProgress >= 95 && !badgeShownRef.current) {
        badgeShownRef.current = true;
        setShowBadge(true);
        // Hide badge after 5 seconds
        setTimeout(() => setShowBadge(false), 5000);
      }
    };

    window.addEventListener("scroll", handleScroll);
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <>
      <div className="progress-bar">
        <div className="progress-bar__fill" style={{ width: `${progress}%` }} />
        <span className="progress-bar__text">{Math.round(progress)}% complete</span>
      </div>
      {showBadge && (
        <div className="completion-badge">
          <span className="completion-badge__icon">✓</span>
          <span className="completion-badge__title">Section complete</span>
        </div>
      )}
    </>
  );
}

// Static Similarity Breakdown (Read-only)
function SimilarityCalculator() {
  return (
    <div className="similarity-calc">
      <div className="similarity-calc__header">
        <h4 className="similarity-calc__title">Similarity Breakdown</h4>
      </div>

      <div className="similarity-calc__breakdown">
        <div className="similarity-calc__breakdown-row">
          <span className="similarity-calc__breakdown-label">Entity match</span>
          <span className="similarity-calc__breakdown-calc">31% × 0.5</span>
          <span className="similarity-calc__breakdown-value">= 15.5%</span>
        </div>
        <div className="similarity-calc__breakdown-row">
          <span className="similarity-calc__breakdown-label">Breaking status</span>
          <span className="similarity-calc__breakdown-calc">100% × 0.25</span>
          <span className="similarity-calc__breakdown-value">= 25%</span>
        </div>
        <div className="similarity-calc__breakdown-row">
          <span className="similarity-calc__breakdown-label">Type match</span>
          <span className="similarity-calc__breakdown-calc">100% × 0.25</span>
          <span className="similarity-calc__breakdown-value">= 25%</span>
        </div>
        <div className="similarity-calc__breakdown-divider"></div>
        <div className="similarity-calc__breakdown-row similarity-calc__breakdown-row--total">
          <span className="similarity-calc__breakdown-label">Total similarity</span>
          <span className="similarity-calc__breakdown-value similarity-calc__breakdown-value--total">
            66%
          </span>
        </div>
      </div>

      <div className="similarity-calc__result similarity-calc__result--pass">
        <div className="similarity-calc__verdict similarity-calc__verdict--pass">
          <span className="similarity-calc__verdict-icon">✓</span>
          <span>Auto-authorized</span>
        </div>
      </div>

      <p className="similarity-calc__threshold-note">
        Deterministic. Explainable. Auditable. No embeddings.
      </p>
    </div>
  );
}

// Jargon Tooltip - hover to reveal definition
function Jargon({ definition, children }: { definition: string; children: React.ReactNode }) {
  return (
    <span className="jargon">
      {children}
      <span className="jargon__tooltip">{definition}</span>
    </span>
  );
}

// Aha Moment - Before/After pain comparison
function AhaMoment() {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      className={`aha-moment scroll-reveal ${isVisible ? "scroll-reveal--visible" : ""}`}
    >
      <div
        className={`aha-moment__container scroll-reveal-stagger ${isVisible ? "scroll-reveal-stagger--visible" : ""}`}
      >
        <div className="aha-moment__scenario aha-moment__scenario--before">
          <span className="aha-moment__label">Without Dotto</span>
          <div className="aha-moment__timeline">
            <div className="aha-moment__event">
              <span className="aha-moment__icon">⚠</span>
              <span className="aha-moment__text">Breaking schema change deploys</span>
            </div>
            <div className="aha-moment__arrow">→</div>
            <div className="aha-moment__event">
              <span className="aha-moment__icon">✕</span>
              <span className="aha-moment__text">Downstream services fail</span>
            </div>
            <div className="aha-moment__arrow">→</div>
            <div className="aha-moment__event aha-moment__event--bad">
              <span className="aha-moment__icon">↺</span>
              <span className="aha-moment__text">Emergency rollback required</span>
            </div>
          </div>
        </div>

        <div className="aha-moment__divider">
          <span>vs</span>
        </div>

        <div className="aha-moment__scenario aha-moment__scenario--after">
          <span className="aha-moment__label">With Dotto</span>
          <div className="aha-moment__timeline">
            <div className="aha-moment__event">
              <span className="aha-moment__icon">◎</span>
              <span className="aha-moment__text">CI blocks unapproved change</span>
            </div>
            <div className="aha-moment__arrow">→</div>
            <div className="aha-moment__event">
              <span className="aha-moment__icon">👤</span>
              <span className="aha-moment__text">Human reviews in seconds</span>
            </div>
            <div className="aha-moment__arrow">→</div>
            <div className="aha-moment__event aha-moment__event--good">
              <span className="aha-moment__icon">✓</span>
              <span className="aha-moment__text">Authorized deployment proceeds</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// Drift Demo - Animated diff with morphing highlights
function DriftDemo() {
  const [isVisible, setIsVisible] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);

  const breakingTypes = [
    { label: "Field Renamed", example: "userId → customerId", category: "syntax" },
    { label: "Type Changed", example: "number → PaymentAmount", category: "syntax" },
    { label: "Intent Drift", example: "Same field, different meaning", category: "intent" },
  ];

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isVisible) {
          setIsVisible(true);
        }
      },
      { threshold: 0.3 }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible) return;

    const timer = setTimeout(() => {
      setHighlightIndex(0);
    }, 500);

    const cycleTimer = setInterval(() => {
      setHighlightIndex((prev) => (prev + 1) % 3);
    }, 2000);

    return () => {
      clearTimeout(timer);
      clearInterval(cycleTimer);
    };
  }, [isVisible]);

  return (
    <div ref={ref} className="drift-demo">
      <div className="drift-demo__panels">
        <div className={`drift-demo__panel ${isVisible ? "drift-demo__panel--visible" : ""}`}>
          <div className="drift-demo__panel-header">
            <span className="drift-demo__label">main</span>
          </div>
          <pre className="drift-demo__code">
            <span className="drift-demo__keyword">interface</span> Payment {"{"}
            {"\n"}
            {"  "}
            <span className={highlightIndex === 0 ? "drift-demo__old-value" : ""}>
              userId
            </span>: <span className="drift-demo__type-token">string</span>;{"\n"}
            {"  "}amount:{" "}
            <span className={highlightIndex === 1 ? "drift-demo__old-value" : ""}>
              <span className="drift-demo__type-token">number</span>
            </span>
            ;{"\n"}
            {"  "}status:{" "}
            <span className={highlightIndex === 2 ? "drift-demo__old-value" : ""}>
              <span className="drift-demo__string">&quot;pending&quot;</span>
            </span>
            ;{"\n"}
            {"}"}
          </pre>
        </div>

        <div className={`drift-demo__arrow ${isVisible ? "drift-demo__arrow--visible" : ""}`}>
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </div>

        <div
          className={`drift-demo__panel drift-demo__panel--changed ${isVisible ? "drift-demo__panel--visible" : ""}`}
        >
          <div className="drift-demo__panel-header">
            <span className="drift-demo__label">feature/payment-v2</span>
            <span className="drift-demo__badge">3 breaking</span>
          </div>
          <pre className="drift-demo__code">
            <span className="drift-demo__keyword">interface</span> Payment {"{"}
            {"\n"}
            {"  "}
            <span
              className={`drift-demo__changed ${highlightIndex === 0 ? "drift-demo__changed--active" : ""}`}
            >
              customerId
            </span>
            : <span className="drift-demo__type-token">string</span>;{"\n"}
            {"  "}amount:{" "}
            <span
              className={`drift-demo__changed ${highlightIndex === 1 ? "drift-demo__changed--active" : ""}`}
            >
              PaymentAmount
            </span>
            ;{"\n"}
            {"  "}status:{" "}
            <span
              className={`drift-demo__changed ${highlightIndex === 2 ? "drift-demo__changed--active" : ""}`}
            >
              &quot;initiated&quot;
            </span>
            ;{"\n"}
            {"}"}
          </pre>
        </div>
      </div>

      <div className="drift-demo__types">
        {breakingTypes.map((type, i) => (
          <div
            key={i}
            className={`drift-demo__type ${highlightIndex === i ? "drift-demo__type--active" : ""} ${isVisible ? "drift-demo__type--visible" : ""}`}
            style={{ transitionDelay: `${i * 100 + 300}ms` }}
          >
            <span className="drift-demo__type-label">{type.label}</span>
            <code className="drift-demo__type-example">{type.example}</code>
          </div>
        ))}
      </div>
    </div>
  );
}

// Separation of Powers Flow - Animated visual flow
function SeparationOfPowersFlow() {
  const [isVisible, setIsVisible] = useState(false);
  const [activeStep, setActiveStep] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);

  const steps = [
    {
      icon: (
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
      ),
      label: "Detection",
      desc: "Deterministic",
      badge: "Code Analysis",
      color: "#3b82f6",
    },
    {
      icon: (
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      ),
      label: "Recommendation",
      desc: "Gemini (Advisory)",
      badge: "AI Insight",
      color: "#9b72cb",
    },
    {
      icon: (
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
      label: "Authorization",
      desc: "Human",
      badge: "Final Authority",
      color: "#22c55e",
    },
    {
      icon: (
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      ),
      label: "Enforcement",
      desc: "CI Gate",
      badge: "Immutable",
      color: "#ef4444",
    },
  ];

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isVisible) {
          setIsVisible(true);
        }
      },
      { threshold: 0.3 }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible) return;

    const timers = steps.map((_, i) => setTimeout(() => setActiveStep(i), 400 + i * 500));

    return () => timers.forEach(clearTimeout);
  }, [isVisible]);

  return (
    <div ref={ref} className="sop-flow">
      <div className="sop-flow__steps">
        {steps.map((step, i) => (
          <div key={i} className="sop-flow__step-wrapper">
            <div
              className={`sop-flow__step ${activeStep >= i ? "sop-flow__step--active" : ""}`}
              style={
                {
                  transitionDelay: `${i * 100}ms`,
                  "--step-color": step.color,
                } as React.CSSProperties
              }
            >
              <div className="sop-flow__icon">{step.icon}</div>
              <div className="sop-flow__label">{step.label}</div>
              <div className="sop-flow__desc">{step.desc}</div>
              <div
                className="sop-flow__badge"
                style={{ background: `${step.color}20`, color: step.color }}
              >
                {step.badge}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`sop-flow__connector ${activeStep > i ? "sop-flow__connector--active" : ""}`}
              >
                <svg width="40" height="20" viewBox="0 0 40 20">
                  <path
                    d="M0 10 L30 10 M25 5 L35 10 L25 15"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>
      <p className={`sop-flow__caption ${activeStep >= 3 ? "sop-flow__caption--visible" : ""}`}>
        Authority flows right. Memory flows forward.
      </p>
    </div>
  );
}

export default function Whitepaper() {
  const [viewMode, setViewMode] = useState<"overview" | "technical">("overview");

  return (
    <div className="whitepaper">
      <TableOfContents viewMode={viewMode} />
      <div className="whitepaper__container">
        {/* Hero - Interactive Demo - ALWAYS SHOWN */}
        <InteractiveDemo />

        {/* View Mode Toggle */}
        <div className="view-mode-toggle view-mode-toggle--top">
          <button
            className={`view-mode-toggle__btn ${viewMode === "overview" ? "view-mode-toggle__btn--active" : ""}`}
            onClick={() => setViewMode("overview")}
          >
            <span className="view-mode-toggle__icon">✨</span>
            <span className="view-mode-toggle__label">Conceptual</span>
            <span className="view-mode-toggle__subtitle">high-level, visual</span>
          </button>
          <button
            className={`view-mode-toggle__btn ${viewMode === "technical" ? "view-mode-toggle__btn--active" : ""}`}
            onClick={() => setViewMode("technical")}
          >
            <span className="view-mode-toggle__icon">⚙️</span>
            <span className="view-mode-toggle__label">Deep Dive</span>
            <span className="view-mode-toggle__subtitle">technical, deterministic</span>
          </button>
        </div>
        <p className="view-mode-explainer">
          Conceptual explains <em>why</em>. Deep Dive proves <em>how</em>.
        </p>

        {viewMode === "overview" && (
          <>
            <AhaMoment />

            {/* Who Benefits */}
            <section id="who-benefits" className="whitepaper__section whitepaper__section--visible">
              <h2 className="section__title">Who Benefits</h2>
              <div className="content-block">
                <p>Teams shipping to production under compliance, safety, or trust constraints.</p>
              </div>
              <div className="steps-grid" style={{ marginTop: "20px" }}>
                <div className="step-card">
                  <div className="step-card__num">🏦</div>
                  <h3 className="step-card__title">Financial Services</h3>
                  <p className="step-card__desc">Audit trails. Compliance-ready receipts.</p>
                </div>
                <div className="step-card">
                  <div className="step-card__num">🏥</div>
                  <h3 className="step-card__title">Healthcare</h3>
                  <p className="step-card__desc">Human-authorized changes. HIPAA-aligned.</p>
                </div>
                <div className="step-card">
                  <div className="step-card__num">🔐</div>
                  <h3 className="step-card__title">Security-Critical</h3>
                  <p className="step-card__desc">No silent changes. Cryptographic authorization.</p>
                </div>
                <div className="step-card">
                  <div className="step-card__num">🚀</div>
                  <h3 className="step-card__title">Fast-Moving Teams</h3>
                  <p className="step-card__desc">Auto-authorization. Governance gets cheaper.</p>
                </div>
              </div>
            </section>

            {/* Separation of Powers */}
            <section
              id="separation-of-powers"
              className="whitepaper__section whitepaper__section--visible"
            >
              <h2 className="section__title">Separation of Powers</h2>
              <p className="section__preface">
                Authority is divided to prevent silent production change.
              </p>
              <SeparationOfPowersFlow />
            </section>

            {/* AI Review vs Governance */}
            <section
              id="why-ai-review-is-not-governance"
              className="whitepaper__section whitepaper__section--visible"
            >
              <h2 className="section__title">Why AI Review Is Not Governance</h2>
              <p className="section__preface">Analysis is not authority.</p>

              <p className="section__body">
                Modern AI systems are increasingly capable of analyzing code changes, identifying
                risks, and suggesting remediation. However, analysis alone cannot authorize
                production change.
              </p>

              <p className="section__body">Dotto draws a strict boundary between:</p>

              <div className="boundary-cards">
                <div className="boundary-card">
                  <h3 className="boundary-card__title">Analysis</h3>
                  <p className="boundary-card__desc">
                    Understanding what changed and what might break
                  </p>
                </div>
                <div className="boundary-card boundary-card--primary">
                  <h3 className="boundary-card__title">Governance</h3>
                  <p className="boundary-card__desc">
                    Deciding whether a change is allowed to proceed
                  </p>
                </div>
              </div>

              <p className="section__body">Authorization requires:</p>
              <ul className="auth-requirements">
                <li>Declared human intent</li>
                <li>Accountable decision-making</li>
                <li>Immutable, auditable records</li>
              </ul>

              <p className="section__body section__body--emphasis">
                For this reason, Dotto treats all AI output as <strong>advisory by design</strong>.
                Final authority is explicitly reserved for humans, and enforcement is automatic.
              </p>

              <p className="section__body">
                This separation ensures that production systems remain safe, auditable, and
                compliant — even as AI analysis improves.
              </p>
            </section>

            {/* Core Loop */}
            <section id="how-it-works" className="whitepaper__section whitepaper__section--visible">
              <h2 className="section__title">How It Works</h2>
              <p className="section__threat">
                One unauthorized change can silently break production.
                <br />
                <strong>Dotto makes that impossible.</strong>
              </p>

              <div className="core-loop">
                <div className="core-loop__step">Code Change</div>
                <div className="core-loop__arrow">↓</div>
                <div className="core-loop__step">Drift Detected</div>
                <div className="core-loop__arrow">↓</div>
                <div className="core-loop__step core-loop__step--gemini">
                  Gemini Insight <span className="core-loop__tag">Advisory</span>
                </div>
                <div className="core-loop__arrow">↓</div>
                <div className="core-loop__step core-loop__step--human">
                  Human Judgment <span className="core-loop__tag">Binding</span>
                </div>
                <div className="core-loop__arrow">↓</div>
                <div className="core-loop__step">Receipt + Precedent</div>
                <div className="core-loop__feedback">↺ future changes cheaper</div>
              </div>

              <h3 className="section__subtitle">Governance Lifecycle</h3>
              <div className="steps-grid">
                <div className="step-card">
                  <div className="step-card__num">1</div>
                  <h3 className="step-card__title">Detect</h3>
                  <p className="step-card__desc">
                    Deterministic analysis. Breaking vs non-breaking drift.
                  </p>
                </div>
                <div className="step-card">
                  <div className="step-card__num">2</div>
                  <h3 className="step-card__title">Recommend</h3>
                  <p className="step-card__microcopy">Advisory only</p>
                  <p className="step-card__desc">Gemini evaluates against policy + precedent.</p>
                </div>
                <div className="step-card step-card--primary">
                  <div className="step-card__num">3</div>
                  <h3 className="step-card__title">Authorize</h3>
                  <p className="step-card__microcopy">Final authority</p>
                  <p className="step-card__desc">
                    Human issues binding authorization. Gates deployment.
                  </p>
                </div>
              </div>
              <p className="lifecycle-note">
                Enforcement is automatic and occurs after authorization.
              </p>
            </section>

            {/* Closing - Overview */}
            <section className="whitepaper__section whitepaper__section--closing whitepaper__section--visible">
              <div className="cta-section">
                <h2 className="cta-section__title">Every change. Every time. No exceptions.</h2>
                <p className="cta-section__subtitle">
                  No receipt, no production change. Every ruling is auditable.
                </p>
                <button className="cta-btn">
                  <span className="cta-btn__icon">⚡</span>
                  Try a Breaking Change
                </button>
              </div>
            </section>
          </>
        )}

        {/* ============================================ */}
        {/* TECHNICAL MODE - Full documentation */}
        {/* ============================================ */}
        {viewMode === "technical" && (
          <>
            {/* What is Dotto */}
            <section
              id="what-is-dotto"
              className="whitepaper__section whitepaper__section--visible"
            >
              <h2 className="section__title">What is Dotto?</h2>
              <div className="content-block">
                <p>Dotto is a governor between code and production.</p>
                <p>It evaluates drift against policy and precedent.</p>
                <p>
                  <strong>Only humans authorize outcomes.</strong>
                </p>
              </div>
            </section>

            {/* What is Drift */}
            <section
              id="what-is-drift"
              className="whitepaper__section whitepaper__section--visible whitepaper__section--alt"
            >
              <h2 className="section__title">What is Drift?</h2>
              <p className="section__preface">Drift is the factual basis for governance.</p>
              <div className="content-block">
                <p>
                  <Jargon definition="The difference between your current code and a baseline. Detected automatically.">
                    <strong>Drift</strong>
                  </Jargon>{" "}
                  refers to the difference between your current code and a baseline. When you modify
                  schemas, APIs, or data structures, dotto detects these changes and classifies them
                  as{" "}
                  <Jargon definition="A change that could break downstream consumers, like renaming a field.">
                    <strong>breaking</strong>
                  </Jargon>{" "}
                  or{" "}
                  <Jargon definition="A change that is backwards-compatible, like adding an optional field.">
                    <strong>non-breaking</strong>
                  </Jargon>
                  .
                </p>
              </div>
              <DriftDemo />
              <div className="steps-grid" style={{ marginTop: "16px" }}>
                <div className="step-card">
                  <div className="step-card__num">!</div>
                  <h3 className="step-card__title">Field Renamed</h3>
                  <p className="step-card__desc">
                    <code>userId</code> → <code>customerId</code>
                  </p>
                </div>
                <div className="step-card">
                  <div className="step-card__num">!</div>
                  <h3 className="step-card__title">Type Changed</h3>
                  <p className="step-card__desc">
                    <code>amount: number</code> → <code>amount: PaymentAmount</code>
                  </p>
                </div>
              </div>
            </section>

            {/* Scope of Detection */}
            <section
              id="scope-of-detection"
              className="whitepaper__section whitepaper__section--visible"
            >
              <h2 className="section__title">Scope of Detection</h2>
              <p className="section__preface">
                Dotto only governs where teams have legitimate authority.
              </p>
              <div className="content-block">
                <p>
                  Dotto governs drift at the <strong>service boundary</strong>.
                </p>
                <p>
                  Each service produces a deterministic dependency graph (<code>graph.json</code>).
                </p>
              </div>
              <div className="scope-flow">
                <div className="scope-flow__step">Service</div>
                <div className="scope-flow__arrow">→</div>
                <div className="scope-flow__step scope-flow__step--artifact">graph.json</div>
                <div className="scope-flow__arrow">→</div>
                <div className="scope-flow__step">Federation</div>
                <div className="scope-flow__arrow">→</div>
                <div className="scope-flow__step">Impact</div>
              </div>
            </section>

            {/* Intent-Aware Governance */}
            <section
              id="intent-aware"
              className="whitepaper__section whitepaper__section--visible whitepaper__section--alt"
            >
              <h2 className="section__title">Intent-Aware Governance</h2>
              <p className="section__preface">
                Drift tells us <em>what</em> changed. Intent tells us <em>whether it should</em>.
              </p>
              <div className="content-block">
                <p>
                  Syntactic drift (field renames, type changes) is deterministic. But two fields can
                  have the same name and different meanings — or different names and the same
                  meaning.
                </p>
                <p>
                  <Jargon definition="When a field's semantic purpose diverges from its documented intent, even if the syntax is valid.">
                    <strong>Intent drift</strong>
                  </Jargon>{" "}
                  occurs when the <em>purpose</em> of a field changes, not just its shape.
                </p>
              </div>
              <div className="intent-comparison">
                <div className="intent-card intent-card--missing">
                  <div className="intent-card__header">
                    <span className="intent-card__icon">⚠️</span>
                    <span className="intent-card__label">Intent Missing</span>
                  </div>
                  <div className="intent-card__example">
                    <code>status: string</code>
                    <span className="intent-card__desc">No documented purpose</span>
                  </div>
                  <div className="intent-card__outcome intent-card__outcome--escalate">
                    → Escalate to human
                  </div>
                </div>
                <div className="intent-card intent-card--present">
                  <div className="intent-card__header">
                    <span className="intent-card__icon">✓</span>
                    <span className="intent-card__label">Intent Declared</span>
                  </div>
                  <div className="intent-card__example">
                    <code>@intent(&quot;payment lifecycle state&quot;)</code>
                    <span className="intent-card__desc">Purpose is documented</span>
                  </div>
                  <div className="intent-card__outcome intent-card__outcome--allow">
                    → Can match precedent
                  </div>
                </div>
              </div>
              <p className="section__note">
                Gemini analyzes intent alignment. Humans authorize when intent is ambiguous.
              </p>
            </section>

            {/* Governance Lifecycle */}
            <section
              id="governance-lifecycle"
              className="whitepaper__section whitepaper__section--visible"
            >
              <h2 className="section__title">Governance Lifecycle</h2>
              <div className="steps-grid">
                <div className="step-card">
                  <div className="step-card__num">1</div>
                  <h3 className="step-card__title">Detect</h3>
                  <p className="step-card__desc">
                    Deterministic crawl. Structured diff between Git states.
                  </p>
                  <div className="step-card__artifacts">
                    <code>graph.json</code>
                    <code>drift.json</code>
                  </div>
                </div>
                <div className="step-card">
                  <div className="step-card__num">2</div>
                  <h3 className="step-card__title">Recommend</h3>
                  <p className="step-card__microcopy">Advisory only — cannot act</p>
                  <p className="step-card__desc">Gemini evaluates against policy + precedent.</p>
                  <div className="step-card__artifacts">
                    <code>policy.json</code>
                    <code>decisions.json</code>
                  </div>
                </div>
                <div className="step-card step-card--primary">
                  <div className="step-card__num">3</div>
                  <h3 className="step-card__title">Authorize</h3>
                  <p className="step-card__microcopy">Final authority — irreversible</p>
                  <p className="step-card__desc">
                    Human issues authorization. Stored as precedent.
                  </p>
                  <div className="step-card__code">
                    <code>dotto run --ci</code>
                  </div>
                </div>
              </div>
              <p className="lifecycle-note">
                Enforcement is automatic and occurs after authorization.
              </p>

              {/* Technical Deep Dive */}
              <div className="deep-dive-content">
                <div className="content-block">
                  <h4>Artifact Pipeline</h4>
                  <p>
                    Each stage produces immutable artifacts. Detection outputs{" "}
                    <code>graph.json</code> and <code>drift.json</code>. These feed into{" "}
                    <code>policy.json</code> and <code>decisions.json</code>.
                  </p>
                </div>
                <div className="content-block">
                  <h4>Deterministic Hashing</h4>
                  <p>
                    Every artifact is SHA-256 hashed. The receipt binds the ruling to exact hashes.
                  </p>
                </div>
                <div className="content-block">
                  <h4>Failure Handling</h4>
                  <div className="failure-modes">
                    <div className="failure-mode">
                      <span className="failure-mode__trigger">Missing artifacts</span>
                      <span className="failure-mode__arrow">→</span>
                      <span className="failure-mode__outcome">escalation</span>
                    </div>
                    <div className="failure-mode">
                      <span className="failure-mode__trigger">Invalid receipt</span>
                      <span className="failure-mode__arrow">→</span>
                      <span className="failure-mode__outcome failure-mode__outcome--block">
                        hard block
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Policy Rules */}
            <ScrollRevealSection id="policy-rules" className="whitepaper__section">
              <h2 className="section__title">Policy Rules</h2>
              <p className="section__constraint">
                Policy rules constrain outcomes — never authorize.
              </p>
              <div className="policy-rules__grid">
                <div className="policy-rule-card">
                  <div className="policy-rule-card__header">
                    <span className="policy-rule-card__icon">🔒</span>
                    <span className="policy-rule-card__name">no_pii_drift</span>
                    <span className="policy-rule-card__badge policy-rule-card__badge--escalate">
                      Escalate
                    </span>
                  </div>
                  <p className="policy-rule-card__desc">
                    PII schemas must never drift without escalation
                  </p>
                </div>
                <div className="policy-rule-card">
                  <div className="policy-rule-card__header">
                    <span className="policy-rule-card__icon">💳</span>
                    <span className="policy-rule-card__name">payments_breaking</span>
                    <span className="policy-rule-card__badge policy-rule-card__badge--escalate">
                      Escalate
                    </span>
                  </div>
                  <p className="policy-rule-card__desc">
                    Breaking payment changes require approval
                  </p>
                </div>
              </div>
            </ScrollRevealSection>

            {/* Authorization Receipt */}
            <section
              id="authorization-receipt"
              className="whitepaper__section whitepaper__section--visible whitepaper__section--alt"
            >
              <h2 className="section__title">Authorization Receipt</h2>
              <p className="section__preface">
                The{" "}
                <Jargon definition="A cryptographically signed artifact that proves a human authorized this specific change.">
                  receipt
                </Jargon>{" "}
                is not evidence. It is the approval.
              </p>
              <div className="rules-example" style={{ marginTop: "20px" }}>
                <pre>{`{
  "change_id": "pr-847-abc123",
  "ruling": "approve",
  "artifact_hash": "sha256:e3b0c44298fc...",
  "signature": "dotto:v1:abc123..."
}`}</pre>
              </div>
              <div className="content-block" style={{ marginTop: "20px" }}>
                <p>
                  <strong>Receipts are capabilities, not logs.</strong> Without a valid receipt,
                  production cannot change.
                </p>
              </div>
              <ReceiptDemo />
            </section>

            {/* Enforcement */}
            <section id="enforcement" className="whitepaper__section whitepaper__section--visible">
              <h2 className="section__title">Enforcement</h2>
              <div className="steps-grid">
                <div className="step-card">
                  <div
                    className="step-card__num"
                    style={{ background: "var(--success)", color: "white" }}
                  >
                    0
                  </div>
                  <h3 className="step-card__title">Approved</h3>
                  <p className="step-card__desc">Valid receipt. Deploy.</p>
                </div>
                <div className="step-card">
                  <div
                    className="step-card__num"
                    style={{ background: "var(--error)", color: "white" }}
                  >
                    1
                  </div>
                  <h3 className="step-card__title">Blocked</h3>
                  <p className="step-card__desc">Blocked receipt. Abort.</p>
                </div>
                <div className="step-card">
                  <div
                    className="step-card__num"
                    style={{ background: "var(--warning)", color: "white" }}
                  >
                    2
                  </div>
                  <h3 className="step-card__title">No Receipt</h3>
                  <p className="step-card__desc">Missing/invalid. Abort.</p>
                </div>
              </div>
              <div className="rules-example" style={{ marginTop: "16px" }}>
                <pre>{`dotto enforce --artifacts ./artifacts
# Exit: 0=deploy, 1=blocked, 2=no-receipt`}</pre>
              </div>
              <EnforcementDemo />
            </section>

            {/* Human Authority */}
            <section
              id="human-authority"
              className="whitepaper__section whitepaper__section--visible"
            >
              <h2 className="section__title">Human Authority</h2>
              <div className="steps-grid steps-grid--4col" style={{ marginTop: "20px" }}>
                <div className="step-card step-card--approve">
                  <div className="step-card__num">✓</div>
                  <h3 className="step-card__title">Approve</h3>
                  <p className="step-card__desc">Creates receipt + precedent</p>
                </div>
                <div className="step-card step-card--reject">
                  <div className="step-card__num">✕</div>
                  <h3 className="step-card__title">Reject</h3>
                  <p className="step-card__desc">Creates rejection record</p>
                </div>
                <div className="step-card step-card--defer">
                  <div className="step-card__num">⏸</div>
                  <h3 className="step-card__title">Defer</h3>
                  <p className="step-card__desc">Blocks without precedent</p>
                </div>
              </div>
            </section>

            {/* Precedent */}
            <section
              id="precedent"
              className="whitepaper__section whitepaper__section--visible whitepaper__section--alt"
            >
              <h2 className="section__title">Precedent</h2>
              <div className="content-block">
                <p>
                  Every authorization becomes{" "}
                  <Jargon definition="A past decision that automatically applies to similar future changes.">
                    <strong>binding precedent</strong>
                  </Jargon>
                  .
                </p>
                <p>
                  Matching changes are{" "}
                  <Jargon definition="Changes similar enough to a past approval are automatically authorized without human review.">
                    <strong>auto-authorized</strong>
                  </Jargon>
                  .
                </p>
              </div>
              <div className="past-decisions">
                <h4 className="past-decisions__title">Recent Decisions</h4>
                <div className="past-decision">
                  <div className="past-decision__header">
                    <span className="past-decision__badge past-decision__badge--approved">
                      Approved
                    </span>
                    <span className="past-decision__date">Jan 28, 2025</span>
                  </div>
                  <div className="past-decision__change">
                    <code>UserSchema</code> → renamed <code>email</code> to{" "}
                    <code>emailAddress</code>
                  </div>
                  <div className="past-decision__meta">
                    <span className="past-decision__author">natalie@company.com</span>
                    <span className="past-decision__similarity">Auto-authorizes 72% similar</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Precedent Matching */}
            <section
              id="precedent-matching"
              className="whitepaper__section whitepaper__section--visible"
            >
              <h2 className="section__title">Precedent Matching</h2>
              <p className="section__preface">
                Humans authorize patterns. The system enforces similarity.
              </p>
              <div className="content-block" style={{ marginBottom: "20px" }}>
                <p>
                  Changes become <strong>drift vectors</strong>. Similarity above{" "}
                  <strong>60%</strong> = auto-authorized.
                </p>
                <p style={{ marginTop: "16px", fontSize: "13px", color: "var(--text-muted)" }}>
                  Deterministic. Explainable. Auditable. No embeddings.
                </p>
              </div>
              <SimilarityCalculator />
            </section>

            {/* Closing - Technical */}
            <section className="whitepaper__section whitepaper__section--closing whitepaper__section--visible">
              <div className="cta-section">
                <h2 className="cta-section__title">Every change. Every time. No exceptions.</h2>
                <p className="cta-section__subtitle">
                  Every ruling is auditable. Every precedent is binding.
                </p>
                <button className="cta-btn">
                  <span className="cta-btn__icon">▶</span>
                  Run Governance
                </button>
              </div>
            </section>
          </>
        )}

        {/* Footer */}
        <footer className="whitepaper__footer">
          <p>Built for the Gemini 3 Hackathon</p>
        </footer>
      </div>
    </div>
  );
}

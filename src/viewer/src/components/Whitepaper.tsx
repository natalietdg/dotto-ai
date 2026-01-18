import './Whitepaper.css';

export default function Whitepaper() {
  return (
    <div className="whitepaper">
      <div className="whitepaper__container">
        <header className="whitepaper__header">
          <h1 className="whitepaper__title">How Dotto Works</h1>
          <p className="whitepaper__subtitle">
            An AI-powered change-control governor for safe, auditable deployments
          </p>
          <p className="whitepaper__thesis">
            Dotto treats software change as a governed act, not a technical event.
          </p>
        </header>

        {/* Architecture Flow */}
        <section className="whitepaper__section">
          <h2 className="section__title">Architecture</h2>
          <div className="architecture">
            <div className="architecture__flow">
              <div className="flow-step">
                <div className="flow-step__icon">
                  <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                </div>
                <div className="flow-step__label">dotto</div>
                <div className="flow-step__desc">Crawl & Diff</div>
              </div>

              <div className="flow-connector">
                <svg width="40" height="24" viewBox="0 0 40 24">
                  <path d="M0 12 L30 12 M25 6 L35 12 L25 18" fill="none" stroke="currentColor" strokeWidth="2"/>
                </svg>
              </div>

              <div className="flow-step flow-step--highlight">
                <div className="flow-step__icon">
                  <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                  </svg>
                </div>
                <div className="flow-step__label">Gemini 3</div>
                <div className="flow-step__desc">AI Analysis</div>
              </div>

              <div className="flow-connector">
                <svg width="40" height="24" viewBox="0 0 40 24">
                  <path d="M0 12 L30 12 M25 6 L35 12 L25 18" fill="none" stroke="currentColor" strokeWidth="2"/>
                </svg>
              </div>

              <div className="flow-step">
                <div className="flow-step__icon">
                  <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                  </svg>
                </div>
                <div className="flow-step__label">Governance</div>
                <div className="flow-step__desc">Approve / Block / Escalate</div>
              </div>

              <div className="flow-connector">
                <svg width="40" height="24" viewBox="0 0 40 24">
                  <path d="M0 12 L30 12 M25 6 L35 12 L25 18" fill="none" stroke="currentColor" strokeWidth="2"/>
                </svg>
              </div>

              <div className="flow-step">
                <div className="flow-step__icon">
                  <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12a7.5 7.5 0 0015 0m-15 0a7.5 7.5 0 1115 0m-15 0H3m16.5 0H21m-1.5 0H12m-8.457 3.077l1.41-.513m14.095-5.13l1.41-.513M5.106 17.785l1.15-.964m11.49-9.642l1.149-.964M7.501 19.795l.75-1.3m7.5-12.99l.75-1.3m-6.063 16.658l.26-1.477m2.605-14.772l.26-1.477m0 17.726l-.26-1.477M10.698 4.614l-.26-1.477M16.5 19.794l-.75-1.299M7.5 4.205L12 12m6.894 5.785l-1.149-.964M6.256 7.178l-1.15-.964m15.352 8.864l-1.41-.513M4.954 9.435l-1.41-.514M12.002 12l-3.75 6.495" />
                  </svg>
                </div>
                <div className="flow-step__label">CI</div>
                <div className="flow-step__desc">Gate Pipeline</div>
              </div>

              <div className="flow-connector">
                <svg width="40" height="24" viewBox="0 0 40 24">
                  <path d="M0 12 L30 12 M25 6 L35 12 L25 18" fill="none" stroke="currentColor" strokeWidth="2"/>
                </svg>
              </div>

              <div className="flow-step">
                <div className="flow-step__icon">
                  <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
                  </svg>
                </div>
                <div className="flow-step__label">Precedent</div>
                <div className="flow-step__desc">Binding Memory</div>
              </div>
            </div>
          </div>
        </section>

        {/* What is Dotto */}
        <section className="whitepaper__section">
          <h2 className="section__title">What is Dotto?</h2>
          <div className="content-block">
            <p>
              Dotto is an <strong>AI-powered change-control governor</strong> that sits between your code changes
              and production deployment. Deterministic systems handle detection; <strong>Gemini 3 makes governance decisions under uncertainty</strong>.
            </p>
            <p>
              When policies conflict, precedents are ambiguous, or risk tradeoffs require nuance—<strong>this is where
              most CI pipelines either blindly pass or blindly block</strong>. Dotto asks Gemini to make a governance
              decision, not a guess.
            </p>
            <p>
              Dotto does for software change what regulators do for financial markets: <strong>it allows innovation,
              but not recklessness</strong>.
            </p>
          </div>
        </section>

        {/* What is Drift */}
        <section className="whitepaper__section">
          <h2 className="section__title">What is Drift?</h2>
          <div className="content-block">
            <p>
              <strong>Drift</strong> refers to the difference between your current code and a baseline (typically your main branch).
              When you modify schemas, APIs, or data structures, dotto detects these changes and classifies them as either
              <strong> breaking</strong> or <strong>non-breaking</strong>.
            </p>
            <p>
              <strong>Breaking drift</strong> includes changes that could cause failures in downstream systems:
            </p>
          </div>
          <div className="steps-grid" style={{ marginTop: '16px' }}>
            <div className="step-card">
              <div className="step-card__num">!</div>
              <h3 className="step-card__title">Field Renamed</h3>
              <p className="step-card__desc">
                <code>userId</code> → <code>customerId</code><br />
                Existing code expecting <code>userId</code> will fail.
              </p>
            </div>
            <div className="step-card">
              <div className="step-card__num">!</div>
              <h3 className="step-card__title">Type Changed</h3>
              <p className="step-card__desc">
                <code>amount: number</code> → <code>amount: PaymentAmount</code><br />
                Type mismatch breaks serialization.
              </p>
            </div>
            <div className="step-card">
              <div className="step-card__num">!</div>
              <h3 className="step-card__title">Required Field Added</h3>
              <p className="step-card__desc">
                New required <code>idempotencyKey</code> field.<br />
                Existing requests without it will fail validation.
              </p>
            </div>
            <div className="step-card">
              <div className="step-card__num">!</div>
              <h3 className="step-card__title">Enum Values Changed</h3>
              <p className="step-card__desc">
                <code>pending</code> → <code>initiated</code><br />
                Status checks using old values will break.
              </p>
            </div>
          </div>
          <div className="content-block" style={{ marginTop: '20px' }}>
            <p>
              <strong>Non-breaking drift</strong> includes additive changes like new optional fields or new interfaces
              that don't affect existing consumers.
            </p>
          </div>
        </section>

        {/* How It Works */}
        <section className="whitepaper__section">
          <h2 className="section__title">How It Works</h2>

          <div className="steps-grid">
            <div className="step-card">
              <div className="step-card__num">1</div>
              <h3 className="step-card__title">Crawl & Diff</h3>
              <p className="step-card__desc">
                Dotto crawls your codebase to build a dependency graph of schemas, APIs, DTOs, and services.
                It then computes a structured diff between Git states to identify exactly what changed.
              </p>
              <div className="step-card__artifacts">
                <code>graph.json</code>
                <code>drift.json</code>
              </div>
            </div>

            <div className="step-card">
              <div className="step-card__num">2</div>
              <h3 className="step-card__title">AI Analysis</h3>
              <p className="step-card__desc">
                The Gemini 3 model analyzes the changes against your policy rules. It evaluates breaking changes,
                blast radius, PII exposure, and compliance requirements to assess risk.
              </p>
              <div className="step-card__artifacts">
                <code>intent.json</code>
                <code>impact.json</code>
              </div>
            </div>

            <div className="step-card">
              <div className="step-card__num">3</div>
              <h3 className="step-card__title">Governance Decision</h3>
              <p className="step-card__desc">
                Based on the analysis, Dotto issues one of three governance decisions:
              </p>
              <div className="decision-types">
                <div className="decision-type decision-type--approve">
                  <strong>Approve</strong> — Safe to deploy
                </div>
                <div className="decision-type decision-type--escalate">
                  <strong>Escalate</strong> — Requires human authority
                </div>
                <div className="decision-type decision-type--block">
                  <strong>Block</strong> — Change rejected
                </div>
              </div>
            </div>

            <div className="step-card">
              <div className="step-card__num">4</div>
              <h3 className="step-card__title">CI Gate</h3>
              <p className="step-card__desc">
                The decision gates your CI/CD pipeline. Approved changes proceed automatically.
                Escalated changes pause for human approval. Blocked changes fail the pipeline.
              </p>
              <div className="step-card__code">
                <code>dotto run --ci</code>
              </div>
            </div>

            <div className="step-card">
              <div className="step-card__num">5</div>
              <h3 className="step-card__title">Precedent Memory</h3>
              <p className="step-card__desc">
                Every governance decision is logged with human authority. These become binding precedent
                for future judgments—the system learns your organization's standards.
              </p>
              <div className="step-card__artifacts">
                <code>decisions.json</code>
              </div>
            </div>
          </div>
        </section>

        {/* Policy Rules */}
        <section className="whitepaper__section">
          <h2 className="section__title">Policy Rules</h2>
          <div className="content-block">
            <p>
              Dotto enforces customizable policy rules that define what requires escalation or blocking:
            </p>
            <div className="rules-example">
              <pre>{`{
  "rules": [
    {
      "id": "no_pii_drift",
      "description": "PII schemas must never drift without escalation",
      "match": { "tags_any": ["pii"] },
      "action": "escalate"
    },
    {
      "id": "payments_breaking_change",
      "description": "Breaking changes in payment systems require approval",
      "match": { "systems_any": ["payments"], "breaking": true },
      "action": "escalate"
    }
  ]
}`}</pre>
            </div>
          </div>
        </section>

        {/* Structured Reasoning Trace */}
        <section className="whitepaper__section">
          <h2 className="section__title">Structured Reasoning Trace</h2>
          <div className="content-block">
            <p>
              Unlike black-box AI systems, Dotto provides a <strong>complete audit trail of decision rationale</strong>.
              The AI governor analyzes changes step-by-step:
            </p>
          </div>
          <div className="steps-grid" style={{ marginTop: '20px' }}>
            <div className="step-card">
              <div className="step-card__num">1</div>
              <h3 className="step-card__title">Schema Analysis</h3>
              <p className="step-card__desc">
                "I see PaymentSchema.ts has been modified. The <code>userId</code> field was renamed to <code>customerId</code>.
                This is a breaking change that will affect all downstream consumers."
              </p>
            </div>
            <div className="step-card">
              <div className="step-card__num">2</div>
              <h3 className="step-card__title">Breaking Change Detection</h3>
              <p className="step-card__desc">
                "The <code>amount</code> field changed from <code>number</code> to <code>PaymentAmount</code> object.
                Any service expecting a number will fail. This is HIGH severity."
              </p>
            </div>
            <div className="step-card">
              <div className="step-card__num">3</div>
              <h3 className="step-card__title">Policy Evaluation</h3>
              <p className="step-card__desc">
                "Checking against policy rules... Rule 'payments_breaking_change' matches: breaking changes
                in payment systems require escalation."
              </p>
            </div>
            <div className="step-card">
              <div className="step-card__num">4</div>
              <h3 className="step-card__title">Blast Radius</h3>
              <p className="step-card__desc">
                "PaymentService.ts imports Payment. PaymentsAPI imports PaymentService.
                Total blast radius: 4 files directly impacted."
              </p>
            </div>
            <div className="step-card">
              <div className="step-card__num">5</div>
              <h3 className="step-card__title">Intent Validation</h3>
              <p className="step-card__desc">
                "Developer intent mentions 'multi-currency support'. The changes align with stated purpose,
                but breaking changes were acknowledged without migration plan."
              </p>
            </div>
            <div className="step-card">
              <div className="step-card__num">6</div>
              <h3 className="step-card__title">Governance Decision</h3>
              <p className="step-card__desc">
                "Given 11 breaking changes, HIGH risk score, and policy match on payments system,
                governance decision: <strong>ESCALATE</strong>. Human authority required."
              </p>
            </div>
          </div>
          <div className="content-block" style={{ marginTop: '20px' }}>
            <p>
              This transparency ensures that every governance decision is <strong>auditable and explainable</strong>—critical
              for compliance. If Dotto rejects a change, the system is legally unchanged.
            </p>
          </div>
        </section>

        {/* Human Override */}
        <section className="whitepaper__section">
          <h2 className="section__title">Human Authority</h2>
          <div className="content-block">
            <p>
              <strong>Governance without human authority is invalid.</strong> After Gemini issues a governance
              decision, humans exercise final authority:
            </p>
          </div>
          <div className="steps-grid" style={{ marginTop: '20px' }}>
            <div className="step-card">
              <div className="step-card__num">✓</div>
              <h3 className="step-card__title">Accept Decision</h3>
              <p className="step-card__desc">
                Agree with the governance decision. This creates binding precedent
                and reinforces similar future judgments.
              </p>
            </div>
            <div className="step-card">
              <div className="step-card__num">→</div>
              <h3 className="step-card__title">Override → Approve</h3>
              <p className="step-card__desc">
                Override a block or escalation to approve. This override becomes binding precedent—future
                governance decisions will reference this ruling.
              </p>
            </div>
            <div className="step-card">
              <div className="step-card__num">✕</div>
              <h3 className="step-card__title">Override → Block</h3>
              <p className="step-card__desc">
                Override an approval to block. This override becomes binding precedent—future
                governance decisions will be more cautious about similar patterns.
              </p>
            </div>
          </div>
          <div className="content-block" style={{ marginTop: '20px' }}>
            <p>
              <strong>Every override becomes binding precedent for future governance decisions.</strong> These
              decisions are stored in <code>decisions.json</code> and inform all subsequent judgments.
            </p>
          </div>
        </section>

        {/* The Learning Loop */}
        <section className="whitepaper__section">
          <h2 className="section__title">The Learning Loop</h2>
          <div className="content-block">
            <p>
              This isn't logging—it's <strong>precedent</strong>. Every human decision becomes binding
              context that Gemini reasons from on subsequent governance decisions.
            </p>
          </div>

          <div className="learning-loop" style={{ marginTop: '24px' }}>
            <div className="loop-step">
              <div className="loop-step__num">1</div>
              <div className="loop-step__content">
                <h4>Run Pipeline</h4>
                <p>Gemini receives: <code>artifacts</code> + <code>policy</code> + <code>decisions.json</code> (memory)</p>
              </div>
            </div>
            <div className="loop-arrow">↓</div>
            <div className="loop-step">
              <div className="loop-step__num">2</div>
              <div className="loop-step__content">
                <h4>Gemini Reasons from Precedent</h4>
                <p>"Similar payment schema change was approved on Jan 15 after migration plan attached. Checking if current change has migration plan..."</p>
              </div>
            </div>
            <div className="loop-arrow">↓</div>
            <div className="loop-step">
              <div className="loop-step__num">3</div>
              <div className="loop-step__content">
                <h4>Human Provides Feedback</h4>
                <p>Accept ✓ or Override →/✕ with optional notes explaining the decision</p>
              </div>
            </div>
            <div className="loop-arrow">↓</div>
            <div className="loop-step loop-step--highlight">
              <div className="loop-step__num">4</div>
              <div className="loop-step__content">
                <h4>Memory Updated</h4>
                <p>Decision + human feedback + context stored in <code>decisions.json</code></p>
              </div>
            </div>
            <div className="loop-arrow loop-arrow--return">↺ Next run includes updated memory</div>
          </div>

          <div className="content-block" style={{ marginTop: '24px' }}>
            <p>
              <strong>Example:</strong> If humans consistently override BLOCK decisions on
              optional field additions, this precedent establishes that your organization treats
              these as low-risk. Future governance decisions will reference this pattern.
            </p>
          </div>
        </section>

        {/* Why Gemini 3 */}
        <section className="whitepaper__section">
          <h2 className="section__title">Why Gemini 3?</h2>
          <div className="content-block" style={{ marginBottom: '20px' }}>
            <p>
              <strong>Gemini 3 does not analyze code.</strong> Deterministic tools handle that.
              <strong> Gemini 3 makes governance decisions under uncertainty</strong>—decisions that
              rule-based systems cannot make safely.
            </p>
          </div>
          <div className="features-grid">
            <div className="feature">
              <div className="feature__icon">
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h4>Policy Conflicts</h4>
              <p>When security rules allow but compliance rules forbid—Gemini weighs tradeoffs and decides</p>
            </div>
            <div className="feature">
              <div className="feature__icon">
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h4>Intent Ambiguity</h4>
              <p>When developer intent is unclear or conflicts with stated goals—Gemini interprets context</p>
            </div>
            <div className="feature">
              <div className="feature__icon">
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                </svg>
              </div>
              <h4>Precedent Reasoning</h4>
              <p>When past decisions are ambiguous—Gemini reasons from similar cases in decision history</p>
            </div>
            <div className="feature">
              <div className="feature__icon">
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                </svg>
              </div>
              <h4>Risk Tradeoffs</h4>
              <p>When blast radius vs. velocity requires nuance—Gemini balances competing concerns</p>
            </div>
          </div>
          <div className="content-block" style={{ marginTop: '20px' }}>
            <p>
              Rules fail exactly where governance matters most—when policies conflict, intent is ambiguous,
              and risk must be weighed. <strong>Dotto exists for the decisions deterministic systems cannot make safely.</strong>
            </p>
          </div>
        </section>

        {/* Closing */}
        <section className="whitepaper__section whitepaper__section--closing">
          <div className="content-block">
            <p className="closing-statement">
              As AI writes more code than humans can safely review, software cannot be governed manually anymore.
            </p>
            <p className="closing-statement">
              Dotto doesn't replace engineers. <strong>It replaces unguarded change.</strong>
            </p>
            <p className="closing-statement closing-statement--final">
              If Dotto rejects a change, the system is legally unchanged.
            </p>
          </div>
        </section>

        {/* Footer */}
        <footer className="whitepaper__footer">
          <p>Built with Gemini 3 for the Gemini API Developer Competition</p>
        </footer>
      </div>
    </div>
  );
}

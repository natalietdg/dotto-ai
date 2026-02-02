import { useState } from "react";

// Enforcement Demo - Toggle between approved/blocked scenarios
export default function EnforcementDemo() {
  const [scenario, setScenario] = useState<"approved" | "blocked">("approved");

  return (
    <div className="enforcement-demo">
      {/* Light bulb toggle */}
      <div className="enforcement-demo__toggle">
        <button
          className={`enforcement-demo__bulb ${scenario === "approved" ? "enforcement-demo__bulb--on" : ""}`}
          onClick={() => setScenario(scenario === "approved" ? "blocked" : "approved")}
          aria-label="Toggle scenario"
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M9 21h6M12 3a6 6 0 0 0-6 6c0 2.22 1.21 4.16 3 5.19V17a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-2.81c1.79-1.03 3-2.97 3-5.19a6 6 0 0 0-6-6z" />
            {scenario === "approved" && (
              <>
                <line x1="12" y1="1" x2="12" y2="0" className="enforcement-demo__ray" />
                <line x1="4.22" y1="4.22" x2="3.51" y2="3.51" className="enforcement-demo__ray" />
                <line x1="1" y1="12" x2="0" y2="12" className="enforcement-demo__ray" />
                <line x1="19.78" y1="4.22" x2="20.49" y2="3.51" className="enforcement-demo__ray" />
                <line x1="23" y1="12" x2="24" y2="12" className="enforcement-demo__ray" />
              </>
            )}
          </svg>
        </button>
        <span className="enforcement-demo__bulb-label">
          {scenario === "approved" ? "Receipt Valid" : "No Receipt"}
        </span>
      </div>

      <div className="enforcement-demo__pipeline">
        <div className="enforcement-demo__stage enforcement-demo__stage--complete">
          <span className="enforcement-demo__stage-icon">✓</span>
          <span className="enforcement-demo__stage-label">Build</span>
        </div>
        <div className="enforcement-demo__connector enforcement-demo__connector--complete" />
        <div className="enforcement-demo__stage enforcement-demo__stage--complete">
          <span className="enforcement-demo__stage-icon">✓</span>
          <span className="enforcement-demo__stage-label">Test</span>
        </div>
        <div className="enforcement-demo__connector enforcement-demo__connector--complete" />
        <div
          className={`enforcement-demo__stage enforcement-demo__stage--gate ${
            scenario === "approved"
              ? "enforcement-demo__stage--approved"
              : "enforcement-demo__stage--blocked"
          }`}
        >
          <span className="enforcement-demo__stage-icon">
            {scenario === "approved" ? "✓" : "✕"}
          </span>
          <span className="enforcement-demo__stage-label">dotto</span>
        </div>
        <div
          className={`enforcement-demo__connector ${
            scenario === "approved"
              ? "enforcement-demo__connector--complete"
              : "enforcement-demo__connector--blocked"
          }`}
        />
        <div
          className={`enforcement-demo__stage ${
            scenario === "approved"
              ? "enforcement-demo__stage--complete"
              : "enforcement-demo__stage--disabled"
          }`}
        >
          <span className="enforcement-demo__stage-icon">
            {scenario === "approved" ? "✓" : "◎"}
          </span>
          <span className="enforcement-demo__stage-label">Deploy</span>
        </div>
      </div>

      <div className="enforcement-demo__output">
        {scenario === "approved" ? (
          <div className="enforcement-demo__message enforcement-demo__message--approved">
            <span>Exit 0</span> — Receipt valid. Deploying to production.
          </div>
        ) : (
          <div className="enforcement-demo__message enforcement-demo__message--blocked">
            <span>Exit 1</span> — No valid receipt. Deployment blocked.
          </div>
        )}
      </div>
    </div>
  );
}

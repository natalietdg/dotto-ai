import { useState, useEffect, useRef } from "react";

// Receipt Demo - Scroll-driven receipt construction
export default function ReceiptDemo() {
  const [step, setStep] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const receiptSteps = [
    { field: '"version"', value: '"1.0"', label: "Protocol version" },
    { field: '"timestamp"', value: '"2026-01-27T10:00:00Z"', label: "Issued at" },
    { field: '"change_id"', value: '"change-1769421525348"', label: "Change identifier" },
    { field: '"ruling"', value: '"approve"', label: "Human decision", highlight: true },
    { field: '"risk_level"', value: '"low"', label: "Risk classification" },
    { field: '"auto_authorized"', value: "false", label: "Required human review" },
    { field: '"artifacts_hash"', value: '"6ce0b737..."', label: "Content hash" },
    { field: '"signature"', value: '"e8b682bb..."', label: "Cryptographic seal", highlight: true },
  ];

  useEffect(() => {
    const handleScroll = () => {
      if (!ref.current || hasStarted) return;

      const rect = ref.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;

      // Check if section is in viewport (at least 20% visible)
      const isVisible = rect.top < windowHeight * 0.8 && rect.bottom > 0;

      if (isVisible) {
        setHasStarted(true);
      }
    };

    // Find the .whitepaper scroll container
    const scrollContainer = document.querySelector(".whitepaper");
    if (scrollContainer) {
      scrollContainer.addEventListener("scroll", handleScroll, { passive: true });
      handleScroll();
      return () => scrollContainer.removeEventListener("scroll", handleScroll);
    } else {
      // Fallback to window scroll
      window.addEventListener("scroll", handleScroll, { passive: true });
      handleScroll();
      return () => window.removeEventListener("scroll", handleScroll);
    }
  }, [hasStarted]);

  useEffect(() => {
    if (!hasStarted) return;

    const interval = setInterval(() => {
      setStep((prev) => {
        if (prev >= receiptSteps.length) {
          clearInterval(interval);
          return prev;
        }
        return prev + 1;
      });
    }, 300);

    return () => clearInterval(interval);
  }, [hasStarted, receiptSteps.length]);

  return (
    <div ref={ref} className="receipt-demo">
      <div className="receipt-demo__container">
        {/* Left: Step indicators */}
        <div className="receipt-demo__steps">
          {receiptSteps.map((item, i) => (
            <div
              key={item.field}
              className={`receipt-demo__step ${step > i ? "receipt-demo__step--complete" : ""} ${step === i + 1 ? "receipt-demo__step--active" : ""}`}
            >
              <span className="receipt-demo__step-dot" />
              <span className="receipt-demo__step-label">{item.label}</span>
            </div>
          ))}
        </div>

        {/* Right: Receipt building - lines appear as steps activate */}
        <div className="receipt-demo__receipt">
          <div className="receipt-demo__header">
            <span className="receipt-demo__filename">authorization-receipt.json</span>
            <span className="receipt-demo__status">
              {step >= receiptSteps.length ? "✓ Signed" : "Building..."}
            </span>
          </div>
          <div className="receipt-demo__content">
            <span className="receipt-demo__brace">{"{"}</span>
            {receiptSteps.map((item, i) => (
              <div
                key={item.field}
                className={`receipt-demo__line ${step > i ? "receipt-demo__line--visible" : ""} ${item.highlight && step > i ? "receipt-demo__line--highlight" : ""}`}
              >
                <span className="receipt-demo__field">{item.field}</span>
                <span className="receipt-demo__colon">: </span>
                <span className="receipt-demo__value">{item.value}</span>
                {i < receiptSteps.length - 1 && <span className="receipt-demo__comma">,</span>}
              </div>
            ))}
            <span className="receipt-demo__brace">{"}"}</span>
          </div>
        </div>
      </div>

      <div className="receipt-demo__footer">
        {step >= receiptSteps.length && (
          <div className="receipt-demo__capability">
            This receipt is a <strong>capability</strong> — present it to unlock production.
          </div>
        )}
      </div>
    </div>
  );
}

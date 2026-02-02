import { useState, useEffect, useRef } from "react";

// Similarity Demo - Animated precedent matching calculation
export default function SimilarityDemo() {
  const [isVisible, setIsVisible] = useState(false);
  const [animationStage, setAnimationStage] = useState(0);
  const [scores, setScores] = useState({ entity: 0, breaking: 0, type: 0 });
  const [meterWidth, setMeterWidth] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  // Start animation when visible
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

  // Animate scores sequentially
  useEffect(() => {
    if (!isVisible) return;

    const animateScoreValue = (key: "entity" | "breaking" | "type", target: number) => {
      const duration = 400;
      const steps = 20;
      const increment = target / steps;
      let current = 0;

      const timer = setInterval(() => {
        current += increment;
        if (current >= target) {
          setScores((prev) => ({ ...prev, [key]: target }));
          clearInterval(timer);
        } else {
          setScores((prev) => ({ ...prev, [key]: current }));
        }
      }, duration / steps);
    };

    const animateMeterValue = () => {
      const duration = 800;
      const steps = 40;
      const increment = 100 / steps;
      let current = 0;

      const timer = setInterval(() => {
        current += increment;
        if (current >= 100) {
          setMeterWidth(100);
          clearInterval(timer);
        } else {
          setMeterWidth(current);
        }
      }, duration / steps);
    };

    const stages = [
      { delay: 300, action: () => setAnimationStage(1) },
      { delay: 600, action: () => animateScoreValue("entity", 0.5) },
      { delay: 1200, action: () => setAnimationStage(2) },
      { delay: 1500, action: () => animateScoreValue("breaking", 0.25) },
      { delay: 2100, action: () => setAnimationStage(3) },
      { delay: 2400, action: () => animateScoreValue("type", 0.25) },
      { delay: 3000, action: () => setAnimationStage(4) },
      { delay: 3300, action: () => animateMeterValue() },
      { delay: 4000, action: () => setAnimationStage(5) },
    ];

    const timers = stages.map(({ delay, action }) => setTimeout(action, delay));

    return () => timers.forEach(clearTimeout);
  }, [isVisible]);

  const totalScore = scores.entity + scores.breaking + scores.type;

  return (
    <div ref={ref} className="similarity-demo">
      <div
        className={`similarity-demo__comparison ${isVisible ? "similarity-demo__comparison--visible" : ""}`}
      >
        <div className="similarity-demo__change">
          <span className="similarity-demo__label">New Change</span>
          <div className="similarity-demo__vector">
            <div
              className={`similarity-demo__field ${animationStage >= 1 ? "similarity-demo__field--active" : ""}`}
            >
              <span className="similarity-demo__key">entity</span>
              <span className="similarity-demo__value similarity-demo__value--match">
                &quot;Payment&quot;
              </span>
            </div>
            <div
              className={`similarity-demo__field ${animationStage >= 2 ? "similarity-demo__field--active" : ""}`}
            >
              <span className="similarity-demo__key">breaking</span>
              <span className="similarity-demo__value similarity-demo__value--match">true</span>
            </div>
            <div
              className={`similarity-demo__field ${animationStage >= 3 ? "similarity-demo__field--active" : ""}`}
            >
              <span className="similarity-demo__key">changeType</span>
              <span className="similarity-demo__value similarity-demo__value--match">
                &quot;modified&quot;
              </span>
            </div>
          </div>
        </div>

        <div
          className={`similarity-demo__vs ${animationStage >= 1 ? "similarity-demo__vs--visible" : ""}`}
        >
          ≈
        </div>

        <div className="similarity-demo__change">
          <span className="similarity-demo__label">Prior Precedent</span>
          <div className="similarity-demo__vector">
            <div
              className={`similarity-demo__field ${animationStage >= 1 ? "similarity-demo__field--active" : ""}`}
            >
              <span className="similarity-demo__key">entity</span>
              <span className="similarity-demo__value similarity-demo__value--match">
                &quot;Payment&quot;
              </span>
            </div>
            <div
              className={`similarity-demo__field ${animationStage >= 2 ? "similarity-demo__field--active" : ""}`}
            >
              <span className="similarity-demo__key">breaking</span>
              <span className="similarity-demo__value similarity-demo__value--match">true</span>
            </div>
            <div
              className={`similarity-demo__field ${animationStage >= 3 ? "similarity-demo__field--active" : ""}`}
            >
              <span className="similarity-demo__key">changeType</span>
              <span className="similarity-demo__value similarity-demo__value--match">
                &quot;modified&quot;
              </span>
            </div>
          </div>
        </div>
      </div>

      <div
        className={`similarity-demo__calculation ${animationStage >= 1 ? "similarity-demo__calculation--visible" : ""}`}
      >
        <div
          className={`similarity-demo__score-item ${animationStage >= 1 ? "similarity-demo__score-item--active" : ""}`}
        >
          <span className="similarity-demo__score-label">Entity</span>
          <span className="similarity-demo__score-value">{scores.entity.toFixed(2)}</span>
        </div>
        <span
          className={`similarity-demo__operator ${animationStage >= 2 ? "similarity-demo__operator--visible" : ""}`}
        >
          +
        </span>
        <div
          className={`similarity-demo__score-item ${animationStage >= 2 ? "similarity-demo__score-item--active" : ""}`}
        >
          <span className="similarity-demo__score-label">Breaking</span>
          <span className="similarity-demo__score-value">{scores.breaking.toFixed(2)}</span>
        </div>
        <span
          className={`similarity-demo__operator ${animationStage >= 3 ? "similarity-demo__operator--visible" : ""}`}
        >
          +
        </span>
        <div
          className={`similarity-demo__score-item ${animationStage >= 3 ? "similarity-demo__score-item--active" : ""}`}
        >
          <span className="similarity-demo__score-label">Type</span>
          <span className="similarity-demo__score-value">{scores.type.toFixed(2)}</span>
        </div>
        <span
          className={`similarity-demo__operator ${animationStage >= 4 ? "similarity-demo__operator--visible" : ""}`}
        >
          =
        </span>
        <div
          className={`similarity-demo__total ${animationStage >= 4 ? "similarity-demo__total--visible" : ""}`}
        >
          <span className="similarity-demo__total-value">{Math.round(totalScore * 100)}%</span>
        </div>
      </div>

      <div
        className={`similarity-demo__meter ${animationStage >= 4 ? "similarity-demo__meter--visible" : ""}`}
      >
        <div className="similarity-demo__meter-track">
          <div className="similarity-demo__meter-fill" style={{ width: `${meterWidth}%` }} />
          <div className="similarity-demo__threshold" style={{ left: "60%" }}>
            <span>60%</span>
          </div>
        </div>
        <div
          className={`similarity-demo__result similarity-demo__result--pass ${animationStage >= 5 ? "similarity-demo__result--visible" : ""}`}
        >
          Auto-authorized from precedent
        </div>
      </div>
    </div>
  );
}

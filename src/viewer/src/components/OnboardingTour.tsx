import { useState, useEffect, useCallback } from "react";
import "./OnboardingTour.css";

interface TourStep {
  id: string;
  target: string; // CSS selector for the element to highlight
  title: string;
  content: string;
  position?: "top" | "bottom" | "left" | "right";
}

const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    target: ".logo",
    title: "Welcome to Dotto",
    content:
      "Your AI-powered production governance assistant. Dotto helps you safely manage schema changes with policy enforcement and human oversight.",
    position: "bottom",
  },
  {
    id: "gemini-brand",
    target: ".apple-analysis__brand",
    title: "Powered by Gemini 3",
    content:
      "Dotto uses Google's Gemini 3 AI to analyze schema changes, evaluate policy compliance, and provide governance recommendations.",
    position: "bottom",
  },
  {
    id: "demo-mode",
    target: ".demo-bar__toggle",
    title: "Demo Mode",
    content:
      "Try different scenarios to see how Dotto handles various types of schema changes - from safe additions to breaking changes.",
    position: "bottom",
  },
  {
    id: "status-hero",
    target: ".status-hero",
    title: "Governance Status",
    content:
      "The current status of your governance decision. Shows Pending, Approve, Block, or Escalate based on AI analysis.",
    position: "bottom",
  },
  {
    id: "run-governance",
    target: ".pipeline-btn--governance",
    title: "Run Governance",
    content:
      "Click here to analyze your current changes. The AI will evaluate policy compliance, check precedents, and provide a recommendation.",
    position: "bottom",
  },
  {
    id: "pill-tabs",
    target: ".apple-analysis__tabs",
    title: "Analysis Views",
    content:
      "Switch between Summary (AI reasoning), Gemini Context (input artifacts), and Affected Systems (impacted schemas).",
    position: "bottom",
  },
  {
    id: "tabs",
    target: ".tabs",
    title: "Main Navigation",
    content:
      "Navigate between Analysis, Graph (dependency visualization), Decision History (precedents), and How It Works documentation.",
    position: "bottom",
  },
  {
    id: "stats",
    target: ".stats",
    title: "Schema Health",
    content: "Monitor breaking changes, impacted systems, and verified schemas at a glance.",
    position: "bottom",
  },
];

const STORAGE_KEY = "dotto_onboarding_complete";

interface OnboardingTourProps {
  onComplete?: () => void;
  forceShow?: boolean;
}

export function OnboardingTour({ onComplete, forceShow }: OnboardingTourProps) {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    // Check if tour was already completed
    const completed = localStorage.getItem(STORAGE_KEY);
    if (!completed || forceShow) {
      // Delay tour start slightly to let the UI render
      const timer = setTimeout(() => setIsActive(true), 500);
      return () => clearTimeout(timer);
    }
  }, [forceShow]);

  const updateTargetRect = useCallback(() => {
    if (!isActive) return;

    const step = TOUR_STEPS[currentStep];
    const element = document.querySelector(step.target);
    if (element) {
      const rect = element.getBoundingClientRect();
      setTargetRect(rect);
    }
  }, [isActive, currentStep]);

  useEffect(() => {
    updateTargetRect();
    window.addEventListener("resize", updateTargetRect);
    window.addEventListener("scroll", updateTargetRect);
    return () => {
      window.removeEventListener("resize", updateTargetRect);
      window.removeEventListener("scroll", updateTargetRect);
    };
  }, [updateTargetRect]);

  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      completeTour();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    completeTour();
  };

  const completeTour = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setIsActive(false);
    onComplete?.();
  };

  if (!isActive || !targetRect) return null;

  const step = TOUR_STEPS[currentStep];
  const padding = 8;

  // Calculate tooltip position
  const getTooltipStyle = (): React.CSSProperties => {
    const tooltipWidth = 320;
    const tooltipHeight = 200; // Approximate
    const gap = 12;

    let top = 0;
    let left = 0;

    switch (step.position) {
      case "bottom":
        top = targetRect.bottom + gap;
        left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
        break;
      case "top":
        top = targetRect.top - tooltipHeight - gap;
        left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
        break;
      case "left":
        top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
        left = targetRect.left - tooltipWidth - gap;
        break;
      case "right":
        top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
        left = targetRect.right + gap;
        break;
      default:
        top = targetRect.bottom + gap;
        left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
    }

    // Keep tooltip within viewport
    left = Math.max(16, Math.min(left, window.innerWidth - tooltipWidth - 16));
    top = Math.max(16, top);

    return { top, left, width: tooltipWidth };
  };

  return (
    <div className="onboarding-tour">
      {/* Overlay with cutout for target */}
      <svg className="onboarding-tour__overlay" width="100%" height="100%">
        <defs>
          <mask id="spotlight-mask">
            <rect width="100%" height="100%" fill="white" />
            <rect
              x={targetRect.left - padding}
              y={targetRect.top - padding}
              width={targetRect.width + padding * 2}
              height={targetRect.height + padding * 2}
              rx="8"
              fill="black"
            />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0, 0, 0, 0.7)" mask="url(#spotlight-mask)" />
      </svg>

      {/* Spotlight border */}
      <div
        className="onboarding-tour__spotlight"
        style={{
          left: targetRect.left - padding,
          top: targetRect.top - padding,
          width: targetRect.width + padding * 2,
          height: targetRect.height + padding * 2,
        }}
      />

      {/* Tooltip */}
      <div className="onboarding-tour__tooltip" style={getTooltipStyle()}>
        <div className="onboarding-tour__header">
          <span className="onboarding-tour__step-count">
            {currentStep + 1} of {TOUR_STEPS.length}
          </span>
          <button className="onboarding-tour__skip" onClick={handleSkip} type="button">
            Skip tour
          </button>
        </div>

        <h3 className="onboarding-tour__title">{step.title}</h3>
        <p className="onboarding-tour__content">{step.content}</p>

        <div className="onboarding-tour__actions">
          {currentStep > 0 && (
            <button
              className="onboarding-tour__btn onboarding-tour__btn--secondary"
              onClick={handlePrev}
              type="button"
            >
              Back
            </button>
          )}
          <button
            className="onboarding-tour__btn onboarding-tour__btn--primary"
            onClick={handleNext}
            type="button"
          >
            {currentStep === TOUR_STEPS.length - 1 ? "Get Started" : "Next"}
          </button>
        </div>

        {/* Progress dots */}
        <div className="onboarding-tour__progress">
          {TOUR_STEPS.map((_, idx) => (
            <span
              key={idx}
              className={`onboarding-tour__dot ${idx === currentStep ? "onboarding-tour__dot--active" : ""} ${idx < currentStep ? "onboarding-tour__dot--completed" : ""}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// Hook to control tour externally
export function useOnboardingTour() {
  const [showTour, setShowTour] = useState(false);

  const startTour = () => {
    localStorage.removeItem(STORAGE_KEY);
    setShowTour(true);
  };

  const resetTour = () => {
    localStorage.removeItem(STORAGE_KEY);
  };

  return { showTour, startTour, resetTour, setShowTour };
}

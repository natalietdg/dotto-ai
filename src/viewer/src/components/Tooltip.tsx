import { useState, useRef, useEffect, ReactNode } from "react";
import "./Tooltip.css";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  position?: "top" | "bottom" | "left" | "right";
  delay?: number;
}

interface TooltipStyle {
  top?: number;
  left?: number;
  transform?: string;
}

export function Tooltip({ content, children, position = "top", delay = 200 }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [actualPosition, setActualPosition] = useState(position);
  const [tooltipStyle, setTooltipStyle] = useState<TooltipStyle>({});
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isVisible && tooltipRef.current && containerRef.current) {
      const tooltip = tooltipRef.current;
      const container = containerRef.current;
      const rect = container.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();

      // Check if tooltip goes off screen and adjust position
      let newPosition = position;
      if (position === "top" && rect.top - tooltipRect.height < 10) {
        newPosition = "bottom";
      } else if (
        position === "bottom" &&
        rect.bottom + tooltipRect.height > window.innerHeight - 10
      ) {
        newPosition = "top";
      } else if (position === "left" && rect.left - tooltipRect.width < 10) {
        newPosition = "right";
      } else if (position === "right" && rect.right + tooltipRect.width > window.innerWidth - 10) {
        newPosition = "left";
      }
      setActualPosition(newPosition);

      // Calculate fixed position based on container position
      const style: TooltipStyle = {};
      const gap = 8;

      switch (newPosition) {
        case "top":
          style.top = rect.top - gap;
          style.left = rect.left + rect.width / 2;
          style.transform = "translate(-50%, -100%)";
          break;
        case "bottom":
          style.top = rect.bottom + gap;
          style.left = rect.left + rect.width / 2;
          style.transform = "translateX(-50%)";
          break;
        case "left":
          style.top = rect.top + rect.height / 2;
          style.left = rect.left - gap;
          style.transform = "translate(-100%, -50%)";
          break;
        case "right":
          style.top = rect.top + rect.height / 2;
          style.left = rect.right + gap;
          style.transform = "translateY(-50%)";
          break;
      }
      setTooltipStyle(style);
    }
  }, [isVisible, position]);

  const showTooltip = () => {
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delay);
  };

  const hideTooltip = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      setIsVisible(!isVisible);
    } else if (e.key === "Escape") {
      setIsVisible(false);
    }
  };

  return (
    <div
      className="tooltip-container"
      ref={containerRef}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
      onKeyDown={handleKeyDown}
    >
      {children}
      {isVisible && (
        <div
          ref={tooltipRef}
          className={`tooltip tooltip--${actualPosition}`}
          role="tooltip"
          style={tooltipStyle}
        >
          {content}
        </div>
      )}
    </div>
  );
}

interface HelpIconProps {
  content: string;
  position?: "top" | "bottom" | "left" | "right";
}

export function HelpIcon({ content, position = "top" }: HelpIconProps) {
  return (
    <Tooltip content={content} position={position}>
      <button className="help-icon" type="button" aria-label="Help" tabIndex={0}>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </button>
    </Tooltip>
  );
}

// Predefined tooltips for common technical terms
export const TOOLTIPS = {
  blastRadius: "The number of downstream systems potentially affected by this change",
  precedentMemory: "Historical decisions that inform AI recommendations for similar changes",
  drift: "Detected difference between expected and actual schema state",
  breakingChange: "A change that may cause downstream system failures",
  riskLow: "Minimal impact, safe to auto-approve",
  riskMedium: "Requires careful review before authorization",
  riskHigh: "Significant risk, needs explicit human authorization",
  ciGate: "Continuous Integration checkpoint that blocks or allows deployment",
  productionLock: "When locked, changes cannot be deployed until authorized",
  verified: "Schema matches expected state with no changes detected",
  changed: "Schema has been modified but impact is contained",
  impacted: "Schema is affected by upstream changes",
  governance:
    "The process of reviewing and authorizing production changes through policy and human oversight",
  receipt: "Cryptographic proof of authorization that CI/CD systems verify before deployment",
};

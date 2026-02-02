import "./LoadingSpinner.css";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  color?: "default" | "white" | "accent";
}

export function LoadingSpinner({ size = "md", color = "default" }: LoadingSpinnerProps) {
  return (
    <div
      className={`loading-spinner loading-spinner--${size} loading-spinner--${color}`}
      role="status"
      aria-label="Loading"
    >
      <span className="loading-spinner__circle" />
    </div>
  );
}

interface ButtonLoadingProps {
  isLoading: boolean;
  loadingText?: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
  title?: string;
}

export function ButtonLoading({
  isLoading,
  loadingText,
  children,
  className = "",
  disabled,
  onClick,
  type = "button",
  title,
}: ButtonLoadingProps) {
  return (
    <button
      type={type}
      className={`btn-loading ${className} ${isLoading ? "btn-loading--active" : ""}`}
      disabled={disabled || isLoading}
      onClick={onClick}
      title={title}
    >
      {isLoading ? (
        <>
          <LoadingSpinner size="sm" color="white" />
          {loadingText && <span className="btn-loading__text">{loadingText}</span>}
        </>
      ) : (
        children
      )}
    </button>
  );
}

interface SkeletonProps {
  width?: string;
  height?: string;
  borderRadius?: string;
  className?: string;
}

export function Skeleton({
  width = "100%",
  height = "20px",
  borderRadius = "4px",
  className = "",
}: SkeletonProps) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{ width, height, borderRadius }}
      aria-hidden="true"
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="skeleton-card" aria-hidden="true">
      <div className="skeleton-card__header">
        <Skeleton width="40%" height="16px" />
      </div>
      <div className="skeleton-card__body">
        <Skeleton width="100%" height="12px" />
        <Skeleton width="80%" height="12px" />
        <Skeleton width="60%" height="12px" />
      </div>
    </div>
  );
}

export function SkeletonStats() {
  return (
    <div className="skeleton-stats" aria-hidden="true">
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} width="70px" height="20px" borderRadius="4px" />
      ))}
    </div>
  );
}

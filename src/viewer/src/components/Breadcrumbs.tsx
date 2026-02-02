import "./Breadcrumbs.css";

interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  if (items.length === 0) return null;

  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb navigation">
      <ol className="breadcrumbs__list">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={index} className="breadcrumbs__item">
              {item.onClick && !isLast ? (
                <button className="breadcrumbs__link" onClick={item.onClick} type="button">
                  {item.label}
                </button>
              ) : (
                <span
                  className={`breadcrumbs__text ${isLast ? "breadcrumbs__text--current" : ""}`}
                  aria-current={isLast ? "page" : undefined}
                >
                  {item.label}
                </span>
              )}
              {!isLast && (
                <span className="breadcrumbs__separator" aria-hidden="true">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// Helper to generate breadcrumbs based on current view
export function getBreadcrumbs(
  view: "analysis" | "graph" | "history" | "whitepaper",
  subSection?: string
): BreadcrumbItem[] {
  const viewLabels = {
    analysis: "Analysis",
    graph: "Dependency Graph",
    history: "Decision History",
    whitepaper: "How It Works",
  };

  const items: BreadcrumbItem[] = [{ label: "Dotto" }, { label: viewLabels[view] }];

  if (subSection) {
    items.push({ label: subSection });
  }

  return items;
}

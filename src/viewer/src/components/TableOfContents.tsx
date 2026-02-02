import { useState, useEffect } from "react";

interface TableOfContentsProps {
  viewMode: "overview" | "technical";
}

const CONCEPTUAL_SECTIONS = [
  { id: "who-benefits", title: "Who Benefits" },
  { id: "separation-of-powers", title: "Separation of Powers" },
  { id: "why-ai-review-is-not-governance", title: "Why AI Review is Not Governance" },
  { id: "how-it-works", title: "How It Works" },
];

const DEEP_DIVE_SECTIONS = [
  { id: "what-is-dotto", title: "What is Dotto?" },
  { id: "what-is-drift", title: "What is Drift?" },
  { id: "scope-of-detection", title: "Scope of Detection" },
  { id: "intent-aware", title: "Intent-Aware Governance" },
  { id: "governance-lifecycle", title: "Governance Lifecycle" },
  { id: "policy-rules", title: "Policy Rules" },
  { id: "authorization-receipt", title: "Authorization Receipt" },
  { id: "enforcement", title: "Enforcement" },
  { id: "human-authority", title: "Human Authority" },
  { id: "precedent", title: "Precedent" },
  { id: "precedent-matching", title: "Precedent Matching" },
];

export default function TableOfContents({ viewMode }: TableOfContentsProps) {
  const [activeSection, setActiveSection] = useState<string>("");

  const sections = viewMode === "overview" ? CONCEPTUAL_SECTIONS : DEEP_DIVE_SECTIONS;

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: "-100px 0px -80% 0px" }
    );

    sections.forEach(({ id }) => {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [sections]);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <nav className="toc">
      <h3 className="toc__title">{viewMode === "overview" ? "Conceptual" : "Deep Dive"}</h3>
      <ul className="toc__list">
        {sections.map(({ id, title }) => (
          <li key={id} className="toc__item">
            <button
              className={`toc__link ${activeSection === id ? "toc__link--active" : ""}`}
              onClick={() => scrollToSection(id)}
            >
              {title}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

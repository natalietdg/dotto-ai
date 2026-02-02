import { useEffect, useRef } from "react";
import "./KeyboardShortcutsModal.css";

interface Shortcut {
  keys: string[];
  description: string;
  category: string;
}

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUTS: Shortcut[] = [
  // Navigation
  {
    keys: ["⌘/Ctrl", "1"],
    description: "Switch to Analysis tab",
    category: "Navigation",
  },
  {
    keys: ["⌘/Ctrl", "2"],
    description: "Switch to Graph tab",
    category: "Navigation",
  },
  {
    keys: ["⌘/Ctrl", "3"],
    description: "Switch to History tab",
    category: "Navigation",
  },
  {
    keys: ["⌘/Ctrl", "4"],
    description: "Switch to How It Works tab",
    category: "Navigation",
  },

  // Actions
  {
    keys: ["⌘/Ctrl", "Enter"],
    description: "Run Governance",
    category: "Actions",
  },
  { keys: ["⌘/Ctrl", "R"], description: "Refresh data", category: "Actions" },
  { keys: ["⌘/Ctrl", "K"], description: "Focus search", category: "Actions" },

  // UI
  { keys: ["D"], description: "Toggle dark mode", category: "UI" },
  { keys: ["?"], description: "Show keyboard shortcuts", category: "UI" },
  { keys: ["Esc"], description: "Close modals / sidebars", category: "UI" },
];

export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Focus trap
  useEffect(() => {
    if (isOpen && modalRef.current) {
      modalRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Group shortcuts by category
  const categories = SHORTCUTS.reduce(
    (acc, shortcut) => {
      if (!acc[shortcut.category]) {
        acc[shortcut.category] = [];
      }
      acc[shortcut.category].push(shortcut);
      return acc;
    },
    {} as Record<string, Shortcut[]>
  );

  return (
    <div className="shortcuts-overlay" onClick={onClose}>
      <div
        className="shortcuts-modal"
        ref={modalRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
      >
        <header className="shortcuts-modal__header">
          <h2 id="shortcuts-title" className="shortcuts-modal__title">
            Keyboard Shortcuts
          </h2>
          <button
            className="shortcuts-modal__close"
            onClick={onClose}
            aria-label="Close shortcuts modal"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="shortcuts-modal__content">
          {Object.entries(categories).map(([category, shortcuts]) => (
            <section key={category} className="shortcuts-category">
              <h3 className="shortcuts-category__title">{category}</h3>
              <ul className="shortcuts-list">
                {shortcuts.map((shortcut, idx) => (
                  <li key={idx} className="shortcuts-item">
                    <span className="shortcuts-item__keys">
                      {shortcut.keys.map((key, keyIdx) => (
                        <kbd key={keyIdx} className="shortcuts-key">
                          {key}
                        </kbd>
                      ))}
                    </span>
                    <span className="shortcuts-item__desc">{shortcut.description}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <footer className="shortcuts-modal__footer">
          <span className="shortcuts-hint">
            Press <kbd className="shortcuts-key">?</kbd> to toggle this modal
          </span>
        </footer>
      </div>
    </div>
  );
}

import { useState, useMemo } from "react";
import "./SyntaxHighlightedJSON.css";

interface SyntaxHighlightedJSONProps {
  data: unknown;
  showLineNumbers?: boolean;
  maxHeight?: string;
}

type TokenType = "key" | "string" | "number" | "boolean" | "null" | "bracket";

interface Token {
  type: TokenType;
  value: string;
}

// Escape HTML entities to prevent XSS attacks (kept as utility - React JSX auto-escapes)
export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

function tokenize(jsonString: string): Token[][] {
  const lines = jsonString.split("\n");

  return lines.map((line) => {
    const tokens: Token[] = [];
    let remaining = line;
    let match;

    while (remaining.length > 0) {
      // Match key (with quotes and colon)
      match = remaining.match(/^(\s*)"([^"]+)":/);
      if (match) {
        if (match[1]) tokens.push({ type: "bracket", value: match[1] });
        tokens.push({ type: "key", value: `"${match[2]}"` });
        tokens.push({ type: "bracket", value: ":" });
        remaining = remaining.slice(match[0].length);
        continue;
      }

      // Match string value
      match = remaining.match(/^(\s*)"([^"]*)"(,?)/);
      if (match) {
        if (match[1]) tokens.push({ type: "bracket", value: match[1] });
        tokens.push({ type: "string", value: `"${match[2]}"` });
        if (match[3]) tokens.push({ type: "bracket", value: match[3] });
        remaining = remaining.slice(match[0].length);
        continue;
      }

      // Match number
      match = remaining.match(/^(\s*)(-?\d+\.?\d*)(,?)/);
      if (match) {
        if (match[1]) tokens.push({ type: "bracket", value: match[1] });
        tokens.push({ type: "number", value: match[2] });
        if (match[3]) tokens.push({ type: "bracket", value: match[3] });
        remaining = remaining.slice(match[0].length);
        continue;
      }

      // Match boolean
      match = remaining.match(/^(\s*)(true|false)(,?)/);
      if (match) {
        if (match[1]) tokens.push({ type: "bracket", value: match[1] });
        tokens.push({ type: "boolean", value: match[2] });
        if (match[3]) tokens.push({ type: "bracket", value: match[3] });
        remaining = remaining.slice(match[0].length);
        continue;
      }

      // Match null
      match = remaining.match(/^(\s*)(null)(,?)/);
      if (match) {
        if (match[1]) tokens.push({ type: "bracket", value: match[1] });
        tokens.push({ type: "null", value: match[2] });
        if (match[3]) tokens.push({ type: "bracket", value: match[3] });
        remaining = remaining.slice(match[0].length);
        continue;
      }

      // Match brackets and other characters
      match = remaining.match(/^(\s*)([\[\]{}])(,?)/);
      if (match) {
        if (match[1]) tokens.push({ type: "bracket", value: match[1] });
        tokens.push({ type: "bracket", value: match[2] });
        if (match[3]) tokens.push({ type: "bracket", value: match[3] });
        remaining = remaining.slice(match[0].length);
        continue;
      }

      // Match whitespace
      match = remaining.match(/^(\s+)/);
      if (match) {
        tokens.push({ type: "bracket", value: match[1] });
        remaining = remaining.slice(match[0].length);
        continue;
      }

      // Fallback: take one character
      tokens.push({ type: "bracket", value: remaining[0] });
      remaining = remaining.slice(1);
    }

    return tokens;
  });
}

export function SyntaxHighlightedJSON({
  data,
  showLineNumbers = true,
  maxHeight = "400px",
}: SyntaxHighlightedJSONProps) {
  const [copied, setCopied] = useState(false);

  const jsonString = useMemo(() => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }, [data]);

  const tokenizedLines = useMemo(() => tokenize(jsonString), [jsonString]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div className="syntax-json">
      <div className="syntax-json__header">
        <span className="syntax-json__label">JSON</span>
        <button
          className="syntax-json__copy"
          onClick={handleCopy}
          type="button"
          title="Copy to clipboard"
        >
          {copied ? (
            <>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>
      <div className="syntax-json__content" style={{ maxHeight }}>
        <pre className="syntax-json__pre">
          <code className="syntax-json__code">
            {tokenizedLines.map((tokens, lineIndex) => (
              <div key={lineIndex} className="syntax-json__line">
                {showLineNumbers && (
                  <span className="syntax-json__line-number">{lineIndex + 1}</span>
                )}
                <span className="syntax-json__line-content">
                  {tokens.map((token, tokenIndex) => (
                    <span
                      key={tokenIndex}
                      className={`syntax-json__token syntax-json__token--${token.type}`}
                    >
                      {token.value}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </code>
        </pre>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  MarkerType,
} from "reactflow";
import "reactflow/dist/style.css";
import "./App.css";
import "./components/AnalysisView.css";
import "./components/AnalysisViewApple.css";
import Sidebar from "./components/Sidebar";
import AnalysisView from "./components/AnalysisViewApple";
import Whitepaper from "./components/Whitepaper";
import { Artifact, SchemaDiff, SchemaChange } from "./types";
import { Tooltip, TOOLTIPS } from "./components/Tooltip";
import { LoadingSpinner } from "./components/LoadingSpinner";
import { OnboardingTour, useOnboardingTour } from "./components/OnboardingTour";
import { KeyboardShortcutsModal } from "./components/KeyboardShortcutsModal";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { EmptyState } from "./components/EmptyState";
import { Breadcrumbs, getBreadcrumbs } from "./components/Breadcrumbs";

type ViewType = "analysis" | "graph" | "history" | "whitepaper";

type StoredDecision = {
  timestamp: string;
  change_id: string;
  decision: "approve" | "block" | "escalate";
  risk_level: "low" | "medium" | "high";
  reasoning: string[];
  human_feedback: {
    outcome: "accepted" | "overridden" | "modified";
    override_decision?: "approve" | "block";
    notes?: string;
  };
};

const STATUS_COLORS = {
  verified: "#22c55e",
  changed: "#3b82f6",
  impacted: "#f59e0b",
  drifted: "#ef4444",
} as const;

function App() {
  const [view, setView] = useState<ViewType>("analysis");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [selectedNode, setSelectedNode] = useState<Artifact | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);
  const [decisionHistory, setDecisionHistory] = useState<StoredDecision[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { showTour, startTour, setShowTour } = useOnboardingTour();

  // Pipeline state - lifted up so it persists across tab switches
  const [pipelineDecision, setPipelineDecision] = useState<{
    decision: "approve" | "block" | "escalate";
    risk_level: "low" | "medium" | "high";
    reasoning: string[];
    conditions?: string[];
    thinking?: string;
  } | null>(null);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineChangeId, setPipelineChangeId] = useState<string>(`local-${Date.now()}`);
  const [humanFeedback, setHumanFeedback] = useState<"accepted" | "overridden" | null>(null);
  const [overrideAction, setOverrideAction] = useState<"approve" | "block" | null>(null);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    shortcuts: [
      {
        key: "1",
        ctrl: true,
        handler: () => setView("analysis"),
        description: "Switch to Analysis tab",
      },
      {
        key: "2",
        ctrl: true,
        handler: () => setView("graph"),
        description: "Switch to Graph tab",
      },
      {
        key: "3",
        ctrl: true,
        handler: () => setView("history"),
        description: "Switch to History tab",
      },
      {
        key: "4",
        ctrl: true,
        handler: () => setView("whitepaper"),
        description: "Switch to How It Works tab",
      },
      {
        key: "d",
        handler: () => setTheme((t) => (t === "light" ? "dark" : "light")),
        description: "Toggle dark mode",
      },
      {
        key: "?",
        handler: () => setShowShortcutsModal((s) => !s),
        description: "Show keyboard shortcuts",
      },
      {
        key: "Escape",
        handler: () => {
          setShowShortcutsModal(false);
          setSelectedNode(null);
        },
        description: "Close modals",
      },
    ],
  });

  // Governance modal condition
  const showGovernanceTension = pipelineDecision?.decision === "escalate" && !humanFeedback;

  // Sanitize raw vendor errors into governance-grade language
  const sanitizeErrorText = (text: string): string => {
    // Detect raw Gemini/API errors and replace with governance language
    if (
      text.includes("GoogleGenerativeAI Error") ||
      text.includes("429") ||
      text.includes("Too Many Requests") ||
      text.includes("RESOURCE_EXHAUSTED") ||
      text.includes("quota")
    ) {
      return "Reliability threshold exceeded. Request volume surpassed allocated budget.";
    }
    if (text.includes("timed out") || text.includes("timeout")) {
      return "Operational timeout. Analysis did not complete within reliability budget.";
    }
    if (text.includes("GEMINI_API_KEY") || text.includes("API key")) {
      return "Governance engine not configured. Administrative action required.";
    }
    if (
      text.includes("network") ||
      text.includes("ECONNREFUSED") ||
      text.includes("fetch failed")
    ) {
      return "Connectivity constraint. Governance engine unreachable.";
    }
    // Strip any raw error patterns that slip through
    return text
      .replace(/\[GoogleGenerativeAI Error\][^.]*\./g, "")
      .replace(/error=\[[^\]]*\]/g, "")
      .replace(/https?:\/\/[^\s]+/g, "")
      .trim();
  };

  // Parse Gemini's thinking into structured sections for the modal
  const parseGovernanceAnalysis = useCallback(() => {
    if (!pipelineDecision?.thinking) {
      return { policy: [], intent: [], precedent: [], risk: [] };
    }

    const thinking = pipelineDecision.thinking;
    const reasoning = pipelineDecision.reasoning || [];

    // Extract sections from thinking markdown
    const extractSection = (sectionName: string): string => {
      const regex = new RegExp(`## ${sectionName}\\s*([\\s\\S]*?)(?=##|$)`, "i");
      const match = thinking.match(regex);
      return match ? match[1].trim() : "";
    };

    const policyText = extractSection("Policy Evaluation");
    const intentText = extractSection("Intent Alignment");
    const precedentText = extractSection("Precedent Check");
    const riskText = extractSection("Risk Assessment");
    const judgmentText = extractSection("Judgment");

    // Parse bullet points or sentences into items with sentiment
    const parseItems = (
      text: string
    ): Array<{ text: string; type: "allow" | "deny" | "neutral" }> => {
      if (!text) return [];

      const lines = text
        .split(/\n/)
        .map((l) => l.replace(/^[-*•]\s*/, "").trim())
        // Strip markdown bold **text** and convert to plain text
        .map((l) => l.replace(/\*\*([^*]+)\*\*/g, "$1"))
        // Strip markdown code `text`
        .map((l) => l.replace(/`([^`]+)`/g, "$1"))
        .filter((l) => l.length > 10 && l.length < 200);

      return lines.slice(0, 3).map((line) => {
        // Sanitize any raw errors
        const sanitized = sanitizeErrorText(line);
        const lower = sanitized.toLowerCase();
        // Detect sentiment from keywords
        if (
          lower.includes("allows") ||
          lower.includes("valid") ||
          lower.includes("approved") ||
          lower.includes("acceptable") ||
          lower.includes("supports") ||
          lower.includes("aligns")
        ) {
          return { text: sanitized, type: "allow" as const };
        }
        if (
          lower.includes("forbids") ||
          lower.includes("violat") ||
          lower.includes("block") ||
          lower.includes("reject") ||
          lower.includes("risk") ||
          lower.includes("break") ||
          lower.includes("fail") ||
          lower.includes("missing") ||
          lower.includes("without") ||
          lower.includes("threshold") ||
          lower.includes("exhausted")
        ) {
          return { text: sanitized, type: "deny" as const };
        }
        return { text: sanitized, type: "neutral" as const };
      });
    };

    // Also extract key points from reasoning array (sanitized)
    const reasoningItems = reasoning.slice(0, 2).map((r) => {
      const sanitized = sanitizeErrorText(r);
      return {
        text: sanitized,
        type:
          sanitized.toLowerCase().includes("risk") ||
          sanitized.toLowerCase().includes("break") ||
          sanitized.toLowerCase().includes("threshold")
            ? ("deny" as const)
            : ("neutral" as const),
      };
    });

    return {
      policy: parseItems(policyText).length > 0 ? parseItems(policyText) : reasoningItems,
      intent: parseItems(intentText),
      precedent: parseItems(precedentText),
      risk: parseItems(riskText),
      judgment: judgmentText,
    };
  }, [pipelineDecision?.thinking, pipelineDecision?.reasoning]);

  const governanceAnalysis = parseGovernanceAnalysis();

  // Submit feedback for governance decisions
  const submitFeedback = async (
    outcome: "accepted" | "overridden",
    override?: "approve" | "block"
  ) => {
    if (!pipelineDecision) return;

    setSubmittingFeedback(true);
    try {
      await fetch("/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          change_id: pipelineChangeId,
          governor: {
            decision: pipelineDecision.decision,
            risk_level: pipelineDecision.risk_level,
            reasoning: pipelineDecision.reasoning,
          },
          human: {
            outcome,
            override_decision: override,
          },
        }),
      });
      setHumanFeedback(outcome);
      if (override) setOverrideAction(override);
      // Refresh decision history
      fetchJsonWithFallback(["/memory/decisions.json", "/src/memory/decisions.json"])
        .then((data) => setDecisionHistory(data.decisions || []))
        .catch(() => {});
    } catch (e) {
      console.error("Failed to submit feedback:", e);
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchData();
    setIsRefreshing(false);
  };

  const fetchJsonWithFallback = useCallback(async (paths: string[]) => {
    let lastErr: unknown;
    for (const p of paths) {
      try {
        const res = await fetch(p);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr;
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const graphData = await fetchJsonWithFallback([
        "/artifacts/graph.json",
        "/graph.json",
        "../../../graph.json",
      ]);

      let driftData = { diffs: [] };
      try {
        // Try backend artifacts first
        driftData = await fetchJsonWithFallback(["/artifacts/drift.json"]);

        // If backend has empty diffs, try static demo data as fallback
        if (!driftData.diffs || driftData.diffs.length === 0) {
          try {
            const demoDrift = await fetchJsonWithFallback(["/drift.json"]);
            if (demoDrift.diffs && demoDrift.diffs.length > 0) {
              driftData = demoDrift;
            }
          } catch {
            // Keep the original (empty) drift data
          }
        }
      } catch {
        // If backend fails, try static files directly
        try {
          driftData = await fetchJsonWithFallback(["/drift.json"]);
        } catch {
          // No drift data available
        }
      }

      const nodesArray = Array.isArray(graphData.nodes)
        ? graphData.nodes
        : Object.values(graphData.nodes || {});

      const edgesArray = Array.isArray(graphData.edges)
        ? graphData.edges
        : Object.values(graphData.edges || {});

      // Build a map of schema names to node IDs for edge inference
      const schemaNameToId = new Map<string, string>();
      nodesArray.forEach((node: any) => {
        const name = node.name || node.id.split(":").pop();
        if (name) {
          schemaNameToId.set(name, node.id);
        }
      });

      // Infer edges from property type references
      const inferredEdges: any[] = [];
      nodesArray.forEach((node: any) => {
        if (node.properties && Array.isArray(node.properties)) {
          node.properties.forEach((prop: any) => {
            if (prop.type) {
              // Extract type name (handle arrays like "OrderItem[]" and generics)
              const typeMatch = prop.type.match(/^([A-Z][a-zA-Z0-9]*)/);
              if (typeMatch) {
                const typeName = typeMatch[1];
                const targetId = schemaNameToId.get(typeName);
                if (targetId && targetId !== node.id) {
                  inferredEdges.push({
                    id: `inferred-${targetId}-to-${node.id}-${prop.name}`,
                    source: targetId,
                    target: node.id,
                    type: "uses",
                  });
                }
              }
            }
          });
        }
      });

      // Combine explicit edges with inferred edges (deduplicated)
      const allEdges = [...edgesArray];
      const existingEdgePairs = new Set(edgesArray.map((e: any) => `${e.source}|${e.target}`));
      inferredEdges.forEach((edge) => {
        const pair = `${edge.source}|${edge.target}`;
        if (!existingEdgePairs.has(pair)) {
          allEdges.push(edge);
          existingEdgePairs.add(pair);
        }
      });

      const driftMap = new Map(driftData.diffs.map((d: any) => [d.nodeId, d]));

      const breakingNodeIds = new Set(
        Array.from(driftMap.values())
          .filter((d: any) => d.breaking)
          .map((d: any) => d.nodeId)
      );

      const impactedNodeIds = new Set<string>();
      const findUpstream = (nodeId: string) => {
        allEdges
          .filter((e: any) => e.target === nodeId)
          .forEach((e: any) => {
            if (!impactedNodeIds.has(e.source) && !breakingNodeIds.has(e.source)) {
              impactedNodeIds.add(e.source);
              findUpstream(e.source);
            }
          });
      };

      breakingNodeIds.forEach((nodeId) => findUpstream(nodeId));

      const response = await fetch("/driftpack.json");
      const certificate = response.ok ? await response.json() : null;

      const artifactList: Artifact[] = nodesArray.map((node: any) => {
        const drift = driftMap.get(node.id);
        const hasBreaking = drift?.breaking;
        const hasNonBreaking = drift && !drift.breaking;
        const isImpacted = impactedNodeIds.has(node.id);

        let status: Artifact["status"] = "verified";
        if (hasBreaking) status = "drifted";
        else if (hasNonBreaking) status = "changed";
        else if (isImpacted) status = "impacted";

        return {
          id: node.id,
          name: node.name || node.id.split(":").pop() || node.id,
          status,
          dependencies: [
            ...new Set(allEdges.filter((e: any) => e.target === node.id).map((e: any) => e.source)),
          ],
          hash: node.hash || node.fileHash,
          file: node.file || node.filePath,
          filePath: node.filePath,
          type: node.type,
          lastModified: node.lastModified || new Date().toISOString(),
          metadata: {
            ...node.metadata,
            drift: drift
              ? {
                  changeType: drift.changeType,
                  breaking: drift.breaking,
                  changes: drift.changes,
                }
              : undefined,
          },
          certificate,
        };
      });

      setArtifacts(artifactList);
      setLastUpdate(new Date());

      // Fetch decision history (memory)
      try {
        const memoryData = await fetchJsonWithFallback([
          "/memory/decisions.json",
          "/src/memory/decisions.json",
          "../../../src/memory/decisions.json",
        ]);
        setDecisionHistory(memoryData.decisions || []);
      } catch {
        // No decision history available
        setDecisionHistory([]);
      }

      setLoading(false);
    } catch (error) {
      console.error("Failed to load data:", error);
      setLoading(false);
    }
  }, [fetchJsonWithFallback]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Keyboard shortcut: Cmd/Ctrl + Enter to run governance
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        // Find and click the Run Governance button
        const btn = document.querySelector(".pipeline-btn--governance") as HTMLButtonElement;
        if (btn && !btn.disabled) {
          btn.click();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (artifacts.length === 0) return;

    // Build dependency graph for hierarchical layout
    const artifactMap = new Map(artifacts.map((a) => [a.id, a]));

    // Calculate depth for each node (nodes with no deps = depth 0)
    const depths = new Map<string, number>();
    const calculateDepth = (id: string, visited: Set<string>): number => {
      if (depths.has(id)) return depths.get(id)!;
      if (visited.has(id)) return 0; // Circular dependency
      visited.add(id);

      const artifact = artifactMap.get(id);
      if (!artifact || artifact.dependencies.length === 0) {
        depths.set(id, 0);
        return 0;
      }

      const maxDepDeath = Math.max(
        ...artifact.dependencies
          .filter((depId) => artifactMap.has(depId))
          .map((depId) => calculateDepth(depId, visited))
      );
      const depth = maxDepDeath + 1;
      depths.set(id, depth);
      return depth;
    };

    artifacts.forEach((a) => calculateDepth(a.id, new Set()));

    // Group nodes by depth
    const nodesByDepth = new Map<number, Artifact[]>();
    artifacts.forEach((artifact) => {
      const depth = depths.get(artifact.id) || 0;
      if (!nodesByDepth.has(depth)) nodesByDepth.set(depth, []);
      nodesByDepth.get(depth)!.push(artifact);
    });

    // Position nodes in hierarchical layout
    const nodeWidth = 160;
    const nodeHeight = 70;
    const horizontalGap = 40;
    const verticalGap = 100;

    const newNodes: Node[] = [];

    nodesByDepth.forEach((nodesAtDepth, depth) => {
      const totalWidth =
        nodesAtDepth.length * nodeWidth + (nodesAtDepth.length - 1) * horizontalGap;
      const startX = -totalWidth / 2;

      nodesAtDepth.forEach((artifact, index) => {
        const color = STATUS_COLORS[artifact.status];
        const x = startX + index * (nodeWidth + horizontalGap) + nodeWidth / 2;
        const y = depth * (nodeHeight + verticalGap);

        newNodes.push({
          id: artifact.id,
          type: "default",
          position: { x, y },
          data: {
            label: (
              <div className="node-content">
                <span className="node-name">{artifact.name}</span>
                <span className="node-status">{artifact.status}</span>
              </div>
            ),
            status: artifact.status,
          },
          className: `status-${artifact.status}`,
          style: {
            background: `${color}15`,
            border: `2px solid ${color}`,
            borderRadius: "10px",
            padding: "14px 18px",
            minWidth: "140px",
          },
        });
      });
    });

    // Create edges with smooth curves
    const newEdges: Edge[] = [];
    const edgeColor = theme === "dark" ? "#a3a3a3" : "#6b7280";
    artifacts.forEach((artifact) => {
      artifact.dependencies.forEach((depId) => {
        if (artifacts.some((a) => a.id === depId)) {
          const isDrifted = artifact.status === "drifted";
          newEdges.push({
            id: `${artifact.id}-${depId}`,
            source: depId,
            target: artifact.id,
            type: "smoothstep",
            animated: isDrifted,
            style: {
              stroke: isDrifted ? "#ef4444" : edgeColor,
              strokeWidth: 2,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: isDrifted ? "#ef4444" : edgeColor,
              width: 20,
              height: 20,
            },
          });
        }
      });
    });
    setNodes(newNodes);
    setEdges(newEdges);
  }, [artifacts, theme, setNodes, setEdges]);

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const artifact = artifacts.find((a) => a.id === node.id);
      if (artifact) setSelectedNode(artifact);
    },
    [artifacts]
  );

  // Handle scenario drift updates from AnalysisView
  const handleScenarioLoad = useCallback(
    (
      drifts: Array<{
        nodeId: string;
        name?: string;
        changeType: string;
        breaking: boolean;
        changes: Array<{
          type: string;
          field?: string;
          oldField?: string;
          newField?: string;
          oldType?: string;
          newType?: string;
          description?: string;
        }>;
      }>
    ) => {
      if (artifacts.length === 0) return;

      // Create drift map by NAME (not nodeId) since demo scenarios use simple names
      // e.g., drift.json has "after.ts:Payment" but graph has "schemas/PaymentSchema.ts:Payment"
      // Both have name="Payment", so we match by name
      const driftMapByName = new Map(
        drifts.map((d) => [d.name || d.nodeId.split(":").pop() || d.nodeId, d])
      );
      const breakingNames = new Set(
        drifts.filter((d) => d.breaking).map((d) => d.name || d.nodeId.split(":").pop() || d.nodeId)
      );

      // Find impacted nodes (upstream dependencies of breaking nodes)
      const impactedNodeIds = new Set<string>();
      const breakingNodeIds = new Set<string>();

      // First, identify which artifact IDs have breaking changes (by name match)
      artifacts.forEach((artifact) => {
        if (breakingNames.has(artifact.name)) {
          breakingNodeIds.add(artifact.id);
        }
      });

      const findUpstream = (nodeId: string, visited: Set<string> = new Set()) => {
        if (visited.has(nodeId)) return;
        visited.add(nodeId);

        artifacts.forEach((artifact) => {
          if (artifact.dependencies?.includes(nodeId)) {
            if (!breakingNodeIds.has(artifact.id) && !impactedNodeIds.has(artifact.id)) {
              impactedNodeIds.add(artifact.id);
              findUpstream(artifact.id, visited);
            }
          }
        });
      };

      breakingNodeIds.forEach((nodeId) => findUpstream(nodeId));

      // Update artifacts with new statuses
      const updatedArtifacts = artifacts.map((artifact) => {
        // Match drift by artifact name
        const drift = driftMapByName.get(artifact.name);
        let status: Artifact["status"] = "verified";

        if (drift?.breaking) {
          status = "drifted";
        } else if (drift) {
          status = "changed";
        } else if (impactedNodeIds.has(artifact.id)) {
          status = "impacted";
        }

        return {
          ...artifact,
          status,
          metadata: {
            ...artifact.metadata,
            drift: drift
              ? {
                  nodeId: artifact.id,
                  name: artifact.name,
                  type: "schema",
                  changeType: drift.changeType as SchemaDiff["changeType"],
                  breaking: drift.breaking,
                  changes: drift.changes.map((c) => ({
                    type: c.type as SchemaChange["type"],
                    path: c.field || c.oldField || c.newField || "",
                    oldValue: c.oldType || c.oldField,
                    newValue: c.newType || c.newField,
                    breaking: drift.breaking,
                    description: c.description || `${c.type} on ${c.field || "field"}`,
                  })),
                }
              : undefined,
          },
        };
      });

      setArtifacts(updatedArtifacts);
    },
    [artifacts]
  );

  const stats = {
    total: artifacts.length,
    verified: artifacts.filter((a) => a.status === "verified").length,
    breaking: artifacts.filter((a) => a.status === "drifted").length,
    changed: artifacts.filter((a) => a.status === "changed").length,
    impacted: artifacts.filter((a) => a.status === "impacted").length,
  };

  if (loading) {
    return (
      <div className="app loading-state">
        <div className="loader" />
        <p>Loading artifacts...</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1 className="logo">dotto.</h1>
          <span className="logo-tag">AI governor</span>
        </div>

        <nav className="tabs" role="tablist" aria-label="Main navigation">
          <button
            id="tab-analysis"
            role="tab"
            aria-selected={view === "analysis"}
            aria-controls="panel-analysis"
            className={`tab ${view === "analysis" ? "tab--active" : ""}`}
            onClick={() => setView("analysis")}
          >
            Analysis
          </button>
          <button
            id="tab-graph"
            role="tab"
            aria-selected={view === "graph"}
            aria-controls="panel-graph"
            className={`tab ${view === "graph" ? "tab--active" : ""}`}
            onClick={() => setView("graph")}
          >
            Graph
          </button>
          <button
            id="tab-history"
            role="tab"
            aria-selected={view === "history"}
            aria-controls="panel-history"
            className={`tab ${view === "history" ? "tab--active" : ""}`}
            onClick={() => setView("history")}
          >
            Decision History
            {decisionHistory.length > 0 && (
              <span className="tab__badge" aria-label={`${decisionHistory.length} decisions`}>
                {decisionHistory.length}
              </span>
            )}
          </button>
          <button
            id="tab-whitepaper"
            role="tab"
            aria-selected={view === "whitepaper"}
            aria-controls="panel-whitepaper"
            className={`tab ${view === "whitepaper" ? "tab--active" : ""}`}
            onClick={() => setView("whitepaper")}
          >
            How It Works
          </button>
        </nav>

        <div className="header-right">
          {stats.breaking > 0 && (
            <Tooltip content={TOOLTIPS.blastRadius} position="bottom">
              <div className="blast-radius">
                <span className="blast-radius__icon">⚠</span>
                <span className="blast-radius__label">Blast Radius:</span>
                <span className="blast-radius__count">{stats.breaking + stats.impacted} nodes</span>
              </div>
            </Tooltip>
          )}
          <div className="stats">
            <Tooltip content={TOOLTIPS.breakingChange} position="bottom">
              <span className="stat breaking">
                <svg
                  className="stat__icon"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M12 2L1 21h22L12 2zm0 4l7.53 13H4.47L12 6zm-1 5v4h2v-4h-2zm0 6v2h2v-2h-2z" />
                </svg>
                {stats.breaking} breaking
              </span>
            </Tooltip>
            <Tooltip content={TOOLTIPS.impacted} position="bottom">
              <span className="stat impacted">
                <svg
                  className="stat__icon"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M12 2L2 12l10 10 10-10L12 2zm0 3.41L18.59 12 12 18.59 5.41 12 12 5.41z" />
                </svg>
                {stats.impacted} impacted
              </span>
            </Tooltip>
            <Tooltip content={TOOLTIPS.changed} position="bottom">
              <span className="stat changed">
                <svg
                  className="stat__icon"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                </svg>
                {stats.changed} changed
              </span>
            </Tooltip>
            <Tooltip content={TOOLTIPS.verified} position="bottom">
              <span className="stat verified">
                <svg
                  className="stat__icon"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                </svg>
                {stats.verified} verified
              </span>
            </Tooltip>
          </div>
          <button className="btn-refresh" onClick={handleRefresh} disabled={isRefreshing}>
            {isRefreshing ? (
              <>
                <LoadingSpinner size="sm" color="default" />
                <span style={{ marginLeft: 6 }}>Refreshing...</span>
              </>
            ) : (
              "Refresh"
            )}
          </button>
          <Tooltip content="Restart the onboarding tour" position="bottom">
            <button
              className="btn-refresh"
              onClick={() => {
                setView("analysis");
                startTour();
              }}
              style={{ padding: "6px 10px" }}
            >
              ?
            </button>
          </Tooltip>
          <Tooltip content="Keyboard shortcuts" position="bottom">
            <button
              className="btn-refresh"
              onClick={() => setShowShortcutsModal(true)}
              style={{ padding: "6px 10px" }}
              aria-label="Show keyboard shortcuts"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10" />
              </svg>
            </button>
          </Tooltip>
          <button
            className="btn-theme"
            onClick={toggleTheme}
            title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
          >
            {theme === "light" ? (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            ) : (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            )}
          </button>
          {/* Mobile Menu Button */}
          <button
            className="mobile-menu-btn"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open menu"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>
      </header>

      {/* Breadcrumbs navigation */}
      <div className="breadcrumbs-container">
        <Breadcrumbs items={getBreadcrumbs(view)} />
      </div>

      {/* All views rendered but hidden when not active - preserves state across tab switches */}
      <div
        id="panel-analysis"
        role="tabpanel"
        aria-labelledby="tab-analysis"
        className={`view-container ${view === "analysis" ? "view-container--active" : "view-container--hidden"}`}
      >
        <AnalysisView
          artifacts={stats}
          artifactsList={artifacts}
          pipelineState={{
            decision: pipelineDecision,
            setDecision: setPipelineDecision,
            isRunning: pipelineRunning,
            setIsRunning: setPipelineRunning,
            changeId: pipelineChangeId,
            setChangeId: setPipelineChangeId,
            humanFeedback,
            setHumanFeedback,
            overrideAction,
            setOverrideAction,
          }}
          decisionHistory={decisionHistory}
          onDecisionHistoryUpdate={() => {
            // Refresh decision history after feedback
            fetchJsonWithFallback(["/memory/decisions.json", "/src/memory/decisions.json"])
              .then((data) => setDecisionHistory(data.decisions || []))
              .catch(() => {});
          }}
          onScenarioLoad={handleScenarioLoad}
        />
      </div>

      <div
        id="panel-whitepaper"
        role="tabpanel"
        aria-labelledby="tab-whitepaper"
        className={`view-container ${view === "whitepaper" ? "view-container--active" : "view-container--hidden"}`}
      >
        <Whitepaper />
      </div>

      <div
        id="panel-history"
        role="tabpanel"
        aria-labelledby="tab-history"
        className={`view-container ${view === "history" ? "view-container--active" : "view-container--hidden"}`}
      >
        <main className="main history-view">
          <div className="history-container">
            <div className="history-header">
              <h2 className="history-title">Decision History</h2>
              <p className="history-subtitle">
                Past decisions are sent to Gemini 3 as <code>memory.json</code> — a deterministic
                input that enables precedent-based reasoning.
              </p>
            </div>

            {decisionHistory.length === 0 ? (
              <EmptyState
                icon="history"
                title="No decisions recorded yet"
                description="Run the governance pipeline and provide feedback to start building precedent memory. Future similar changes can be auto-authorized."
                action={{
                  label: "Run Governance",
                  onClick: () => setView("analysis"),
                }}
              />
            ) : (
              <div className="history-list">
                {decisionHistory.map((decision, idx) => (
                  <div key={idx} className={`history-card history-card--${decision.decision}`}>
                    <div className="history-card__header">
                      <span
                        className={`history-card__decision history-card__decision--${decision.decision}`}
                      >
                        {decision.decision.toUpperCase()}
                      </span>
                      <span
                        className={`history-card__risk history-card__risk--${decision.risk_level}`}
                      >
                        {decision.risk_level} risk
                      </span>
                      <span className="history-card__time">
                        {new Date(decision.timestamp).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="history-card__id">
                      Change: <code>{decision.change_id}</code>
                    </div>
                    <div className="history-card__reasoning">
                      <h4>Governance Reasoning:</h4>
                      <ul>
                        {decision.reasoning.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                    <div
                      className={`history-card__feedback history-card__feedback--${decision.human_feedback.outcome}`}
                    >
                      <span className="history-card__feedback-label">Human Authority:</span>
                      <span className="history-card__feedback-outcome">
                        {decision.human_feedback.outcome === "accepted" &&
                        decision.decision === "escalate"
                          ? "⏸ Deferred"
                          : decision.human_feedback.outcome === "accepted"
                            ? "✓ Accepted"
                            : decision.human_feedback.outcome === "overridden" &&
                                decision.human_feedback.override_decision === "block"
                              ? "✕ Blocked (Override)"
                              : decision.human_feedback.outcome === "overridden" &&
                                  decision.human_feedback.override_decision === "approve"
                                ? "✓ Approved (Override)"
                                : decision.human_feedback.outcome === "overridden"
                                  ? "→ Overridden"
                                  : "⚡ Modified"}
                      </span>
                      {decision.human_feedback.notes && (
                        <p className="history-card__feedback-notes">
                          "{decision.human_feedback.notes}"
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="history-note">
              <strong>How this enables learning:</strong> On each pipeline run, Gemini receives this
              history and reasons: "Similar changes were previously{" "}
              {decisionHistory[0]?.human_feedback.outcome || "handled"} — adjusting judgment
              accordingly."
            </div>
          </div>
        </main>
      </div>

      {/* Graph view - conditionally rendered so fitView works correctly each time */}
      {view === "graph" && (
        <main id="panel-graph" role="tabpanel" aria-labelledby="tab-graph" className="main">
          <div className="graph-container">
            {nodes.length === 0 ? (
              <EmptyState
                icon="graph"
                title="No schema artifacts detected"
                description="Scan your codebase to detect schemas and their dependencies. The graph will visualize how your data models connect."
                action={{
                  label: "Go to Analysis",
                  onClick: () => setView("analysis"),
                }}
              />
            ) : (
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={handleNodeClick}
                fitView
                fitViewOptions={{
                  padding: 0.2,
                  minZoom: 0.8,
                  maxZoom: 1.2,
                }}
                minZoom={0.3}
                maxZoom={2}
                proOptions={{ hideAttribution: true }}
              >
                <Background color={theme === "dark" ? "#262626" : "#e5e5e5"} gap={20} size={1} />
                <Controls showInteractive={false} />
                <MiniMap
                  nodeColor={(node) => {
                    const status = node.data?.status;
                    if (status === "drifted") return "#ef4444";
                    if (status === "impacted") return "#f59e0b";
                    if (status === "changed") return "#3b82f6";
                    return "#22c55e";
                  }}
                  maskColor={theme === "dark" ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.8)"}
                  style={{
                    backgroundColor: theme === "dark" ? "#171717" : "#fafafa",
                    border: `1px solid ${theme === "dark" ? "#262626" : "#e5e5e5"}`,
                    borderRadius: "8px",
                  }}
                  pannable
                  zoomable
                />
              </ReactFlow>
            )}
          </div>

          <Sidebar
            artifact={selectedNode}
            onClose={() => setSelectedNode(null)}
            lastUpdate={lastUpdate}
          />
        </main>
      )}

      {/* ========== GOVERNANCE TENSION MODAL ========== */}
      {showGovernanceTension && (
        <div className="governance-tension-overlay">
          <div className="governance-tension">
            <div className="governance-tension__badge">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>DETERMINISTIC RULES INSUFFICIENT</span>
            </div>

            <h2 className="governance-tension__title">
              This decision exceeds automation authority.
            </h2>
            <p className="governance-tension__subtitle">
              Governance Conflict Detected — rule-based systems cannot resolve this.
            </p>

            <div className="governance-tension__conflicts">
              {/* Policy - why this triggered */}
              {governanceAnalysis.policy.length > 0 && (
                <div className="tension-item">
                  <div className="tension-item__header">
                    <span className="tension-item__icon tension-item__icon--policy">⚖</span>
                    <span className="tension-item__label">Policy</span>
                  </div>
                  <div className="tension-item__content">
                    {governanceAnalysis.policy.slice(0, 2).map((item, i) => (
                      <div key={i} className={`tension-item__row tension-item__row--${item.type}`}>
                        <span className="tension-item__indicator">
                          {item.type === "allow" ? "✓" : item.type === "deny" ? "✕" : "•"}
                        </span>
                        <span>{item.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Precedent */}
              {governanceAnalysis.precedent.length > 0 && (
                <div className="tension-item">
                  <div className="tension-item__header">
                    <span className="tension-item__icon tension-item__icon--precedent">📜</span>
                    <span className="tension-item__label">Precedent</span>
                  </div>
                  <div className="tension-item__content">
                    {governanceAnalysis.precedent.slice(0, 2).map((item, i) => (
                      <div key={i} className={`tension-item__row tension-item__row--${item.type}`}>
                        <span className="tension-item__indicator">
                          {item.type === "allow" ? "✓" : item.type === "deny" ? "✕" : "•"}
                        </span>
                        <span>{item.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Risk */}
              {governanceAnalysis.risk.length > 0 && (
                <div className="tension-item">
                  <div className="tension-item__header">
                    <span className="tension-item__icon tension-item__icon--risk">⚠</span>
                    <span className="tension-item__label">Risk</span>
                  </div>
                  <div className="tension-item__content">
                    {governanceAnalysis.risk.slice(0, 2).map((item, i) => (
                      <div key={i} className={`tension-item__row tension-item__row--${item.type}`}>
                        <span className="tension-item__indicator">
                          {item.type === "allow" ? "✓" : item.type === "deny" ? "✕" : "•"}
                        </span>
                        <span>{item.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Fallback */}
              {governanceAnalysis.policy.length === 0 &&
                governanceAnalysis.precedent.length === 0 &&
                governanceAnalysis.risk.length === 0 &&
                pipelineDecision?.reasoning && (
                  <div className="tension-item">
                    <div className="tension-item__header">
                      <span className="tension-item__icon tension-item__icon--policy">⚖</span>
                      <span className="tension-item__label">Evaluation</span>
                    </div>
                    <div className="tension-item__content">
                      {pipelineDecision.reasoning.slice(0, 2).map((reason, i) => (
                        <div key={i} className="tension-item__row tension-item__row--neutral">
                          <span className="tension-item__indicator">•</span>
                          <span>{sanitizeErrorText(reason)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
            </div>

            <div className="governance-tension__conclusion">
              <div className="conclusion__arrow">→</div>
              <div className="conclusion__text">
                <strong>No automated path forward exists.</strong>
                <span>Dotto blocks deployment until a ruling is recorded.</span>
              </div>
            </div>

            <div className="governance-tension__divider">
              <span className="divider__line"></span>
              <span className="divider__text">Everything above is advisory</span>
              <span className="divider__line"></span>
            </div>

            <div className="governance-tension__actions">
              <p className="actions__authorization">
                No production state changes without accountable human authorization.
              </p>
              <div className="actions__buttons">
                <button
                  className="authority-btn authority-btn--approve"
                  onClick={() => submitFeedback("overridden", "approve")}
                  disabled={submittingFeedback}
                >
                  <span className="authority-btn__icon">✓</span>
                  <span className="authority-btn__label">Approve</span>
                  <span className="authority-btn__desc">Override Gemini → Allow change</span>
                </button>
                <button
                  className="authority-btn authority-btn--accept"
                  onClick={() => submitFeedback("accepted")}
                  disabled={submittingFeedback}
                >
                  <span className="authority-btn__icon">↗</span>
                  <span className="authority-btn__label">Defer Decision</span>
                  <span className="authority-btn__desc">
                    Block deployment pending further review
                  </span>
                </button>
                <button
                  className="authority-btn authority-btn--block"
                  onClick={() => submitFeedback("overridden", "block")}
                  disabled={submittingFeedback}
                >
                  <span className="authority-btn__icon">✕</span>
                  <span className="authority-btn__label">Block</span>
                  <span className="authority-btn__desc">Override Gemini → Reject change</span>
                </button>
              </div>
              <p className="actions__note">
                This decision will be recorded in the learning loop and influence future judgments.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Onboarding Tour */}
      <OnboardingTour forceShow={showTour} onComplete={() => setShowTour(false)} />

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal
        isOpen={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
      />

      {/* Mobile Menu Overlay */}
      <div
        className={`mobile-menu-overlay ${mobileMenuOpen ? "active" : ""}`}
        onClick={() => setMobileMenuOpen(false)}
      />

      {/* Mobile Menu Drawer */}
      <div className={`mobile-menu ${mobileMenuOpen ? "active" : ""}`}>
        <div className="mobile-menu__header">
          <span className="mobile-menu__title">Menu</span>
          <button
            className="mobile-menu__close"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <nav className="mobile-menu__nav">
          <button
            className={`mobile-menu__nav-item ${view === "analysis" ? "active" : ""}`}
            onClick={() => {
              setView("analysis");
              setMobileMenuOpen(false);
            }}
          >
            Analysis
          </button>
          <button
            className={`mobile-menu__nav-item ${view === "graph" ? "active" : ""}`}
            onClick={() => {
              setView("graph");
              setMobileMenuOpen(false);
            }}
          >
            Graph
          </button>
          <button
            className={`mobile-menu__nav-item ${view === "history" ? "active" : ""}`}
            onClick={() => {
              setView("history");
              setMobileMenuOpen(false);
            }}
          >
            Decision History
            {decisionHistory.length > 0 && (
              <span className="tab__badge">{decisionHistory.length}</span>
            )}
          </button>
          <button
            className={`mobile-menu__nav-item ${view === "whitepaper" ? "active" : ""}`}
            onClick={() => {
              setView("whitepaper");
              setMobileMenuOpen(false);
            }}
          >
            How It Works
          </button>
        </nav>

        <div className="mobile-menu__stats">
          <div className="mobile-menu__stats-title">Schema Health</div>
          <div className="mobile-menu__stats-grid">
            <div className="mobile-menu__stat" style={{ color: "var(--error)" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L1 21h22L12 2zm0 4l7.53 13H4.47L12 6zm-1 5v4h2v-4h-2zm0 6v2h2v-2h-2z" />
              </svg>
              {stats.breaking} breaking
            </div>
            <div className="mobile-menu__stat" style={{ color: "var(--warning)" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L2 12l10 10 10-10L12 2zm0 3.41L18.59 12 12 18.59 5.41 12 12 5.41z" />
              </svg>
              {stats.impacted} impacted
            </div>
            <div className="mobile-menu__stat" style={{ color: "#3b82f6" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
              </svg>
              {stats.changed} changed
            </div>
            <div className="mobile-menu__stat" style={{ color: "var(--success)" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
              </svg>
              {stats.verified} verified
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;

import { useState, useEffect, useCallback } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import './App.css';
import './components/AnalysisView.css';
import Sidebar from './components/Sidebar';
import AnalysisView from './components/AnalysisView';
import Whitepaper from './components/Whitepaper';
import { Artifact } from './types';

type ViewType = 'analysis' | 'graph' | 'history' | 'whitepaper';

type StoredDecision = {
  timestamp: string;
  change_id: string;
  decision: 'approve' | 'block' | 'escalate';
  risk_level: 'low' | 'medium' | 'high';
  reasoning: string[];
  human_feedback: {
    outcome: 'accepted' | 'overridden' | 'modified';
    override_decision?: 'approve' | 'block';
    notes?: string;
  };
};

const STATUS_COLORS = {
  verified: '#22c55e',
  changed: '#3b82f6',
  impacted: '#f59e0b',
  drifted: '#ef4444',
} as const;

function App() {
  const [view, setView] = useState<ViewType>('analysis');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [selectedNode, setSelectedNode] = useState<Artifact | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);
  const [decisionHistory, setDecisionHistory] = useState<StoredDecision[]>([]);

  // Pipeline state - lifted up so it persists across tab switches
  const [pipelineDecision, setPipelineDecision] = useState<{
    decision: 'approve' | 'block' | 'escalate';
    risk_level: 'low' | 'medium' | 'high';
    reasoning: string[];
    conditions?: string[];
    thinking?: string;
  } | null>(null);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineChangeId, setPipelineChangeId] = useState<string>(`local-${Date.now()}`);
  const [humanFeedback, setHumanFeedback] = useState<'accepted' | 'overridden' | null>(null);
  const [overrideAction, setOverrideAction] = useState<'approve' | 'block' | null>(null);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  // Governance modal condition
  const showGovernanceTension = pipelineDecision?.decision === 'escalate' && !humanFeedback;

  // Submit feedback for governance decisions
  const submitFeedback = async (outcome: 'accepted' | 'overridden', override?: 'approve' | 'block') => {
    if (!pipelineDecision) return;

    setSubmittingFeedback(true);
    try {
      await fetch('/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
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
      fetchJsonWithFallback([
        '/memory/decisions.json',
        '/src/memory/decisions.json',
      ]).then(data => setDecisionHistory(data.decisions || [])).catch(() => {});
    } catch (e) {
      console.error('Failed to submit feedback:', e);
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
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
        '/artifacts/graph.json',
        '/graph.json',
        '../../../graph.json',
      ]);

      let driftData = { diffs: [] };
      try {
        driftData = await fetchJsonWithFallback([
          '/artifacts/drift.json',
          '/drift.json',
        ]);
      } catch {
        // No drift data
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
        const name = node.name || node.id.split(':').pop();
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
                    type: 'uses',
                  });
                }
              }
            }
          });
        }
      });

      // Combine explicit edges with inferred edges (deduplicated)
      const allEdges = [...edgesArray];
      const existingEdgePairs = new Set(
        edgesArray.map((e: any) => `${e.source}|${e.target}`)
      );
      inferredEdges.forEach((edge) => {
        const pair = `${edge.source}|${edge.target}`;
        if (!existingEdgePairs.has(pair)) {
          allEdges.push(edge);
          existingEdgePairs.add(pair);
        }
      });

      const driftMap = new Map(
        driftData.diffs.map((d: any) => [d.nodeId, d])
      );

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
            if (
              !impactedNodeIds.has(e.source) &&
              !breakingNodeIds.has(e.source)
            ) {
              impactedNodeIds.add(e.source);
              findUpstream(e.source);
            }
          });
      };

      breakingNodeIds.forEach((nodeId) => findUpstream(nodeId));

      const response = await fetch('/driftpack.json');
      const certificate = response.ok ? await response.json() : null;

      const artifactList: Artifact[] = nodesArray.map((node: any) => {
        const drift = driftMap.get(node.id);
        const hasBreaking = drift?.breaking;
        const hasNonBreaking = drift && !drift.breaking;
        const isImpacted = impactedNodeIds.has(node.id);

        let status: Artifact['status'] = 'verified';
        if (hasBreaking) status = 'drifted';
        else if (hasNonBreaking) status = 'changed';
        else if (isImpacted) status = 'impacted';

        return {
          id: node.id,
          name: node.name || node.id.split(':').pop() || node.id,
          status,
          dependencies: [...new Set(allEdges
            .filter((e: any) => e.target === node.id)
            .map((e: any) => e.source))],
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
          '/memory/decisions.json',
          '/src/memory/decisions.json',
          '../../../src/memory/decisions.json',
        ]);
        setDecisionHistory(memoryData.decisions || []);
      } catch {
        // No decision history available
        setDecisionHistory([]);
      }

      setLoading(false);
    } catch (error) {
      console.error('Failed to load data:', error);
      setLoading(false);
    }
  }, [fetchJsonWithFallback]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (artifacts.length === 0) return;

    // Build dependency graph for hierarchical layout
    const artifactMap = new Map(artifacts.map(a => [a.id, a]));

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
          .filter(depId => artifactMap.has(depId))
          .map(depId => calculateDepth(depId, visited))
      );
      const depth = maxDepDeath + 1;
      depths.set(id, depth);
      return depth;
    };

    artifacts.forEach(a => calculateDepth(a.id, new Set()));

    // Group nodes by depth
    const nodesByDepth = new Map<number, Artifact[]>();
    artifacts.forEach(artifact => {
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
      const totalWidth = nodesAtDepth.length * nodeWidth + (nodesAtDepth.length - 1) * horizontalGap;
      const startX = -totalWidth / 2;

      nodesAtDepth.forEach((artifact, index) => {
        const color = STATUS_COLORS[artifact.status];
        const x = startX + index * (nodeWidth + horizontalGap) + nodeWidth / 2;
        const y = depth * (nodeHeight + verticalGap);

        newNodes.push({
          id: artifact.id,
          type: 'default',
          position: { x, y },
          data: {
            label: (
              <div className="node-content">
                <span className="node-name">{artifact.name}</span>
                <span className="node-status">{artifact.status}</span>
              </div>
            ),
          },
          className: `status-${artifact.status}`,
          style: {
            background: `${color}15`,
            border: `2px solid ${color}`,
            borderRadius: '10px',
            padding: '14px 18px',
            minWidth: '140px',
          },
        });
      });
    });

    // Create edges with smooth curves
    const newEdges: Edge[] = [];
    const edgeColor = theme === 'dark' ? '#a3a3a3' : '#6b7280';
    artifacts.forEach((artifact) => {
      artifact.dependencies.forEach((depId) => {
        if (artifacts.some((a) => a.id === depId)) {
          const isDrifted = artifact.status === 'drifted';
          newEdges.push({
            id: `${artifact.id}-${depId}`,
            source: depId,
            target: artifact.id,
            type: 'smoothstep',
            animated: isDrifted,
            style: {
              stroke: isDrifted ? '#ef4444' : edgeColor,
              strokeWidth: 2,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: isDrifted ? '#ef4444' : edgeColor,
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

  const stats = {
    total: artifacts.length,
    verified: artifacts.filter((a) => a.status === 'verified').length,
    breaking: artifacts.filter((a) => a.status === 'drifted').length,
    changed: artifacts.filter((a) => a.status === 'changed').length,
    impacted: artifacts.filter((a) => a.status === 'impacted').length,
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

        <nav className="tabs">
          <button
            className={`tab ${view === 'analysis' ? 'tab--active' : ''}`}
            onClick={() => setView('analysis')}
          >
            Analysis
          </button>
          <button
            className={`tab ${view === 'graph' ? 'tab--active' : ''}`}
            onClick={() => setView('graph')}
          >
            Graph
          </button>
          <button
            className={`tab ${view === 'history' ? 'tab--active' : ''}`}
            onClick={() => setView('history')}
          >
            Decision History
            {decisionHistory.length > 0 && (
              <span className="tab__badge">{decisionHistory.length}</span>
            )}
          </button>
          <button
            className={`tab ${view === 'whitepaper' ? 'tab--active' : ''}`}
            onClick={() => setView('whitepaper')}
          >
            How It Works
          </button>
        </nav>

        <div className="header-right">
          {stats.breaking > 0 && (
            <div className="blast-radius">
              <span className="blast-radius__icon">⚠</span>
              <span className="blast-radius__label">Blast Radius:</span>
              <span className="blast-radius__count">{stats.breaking + stats.impacted} nodes</span>
            </div>
          )}
          <div className="stats">
            <span className="stat breaking">{stats.breaking} breaking</span>
            <span className="stat impacted">{stats.impacted} impacted</span>
            <span className="stat changed">{stats.changed} changed</span>
            <span className="stat verified">{stats.verified} verified</span>
          </div>
          <button className="btn-refresh" onClick={fetchData}>
            Refresh
          </button>
          <button className="btn-theme" onClick={toggleTheme} title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}>
            {theme === 'light' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
        </div>
      </header>

      {/* All views rendered but hidden when not active - preserves state across tab switches */}
      <div className={`view-container ${view === 'analysis' ? 'view-container--active' : 'view-container--hidden'}`}>
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
          onDecisionHistoryUpdate={() => {
            // Refresh decision history after feedback
            fetchJsonWithFallback([
              '/memory/decisions.json',
              '/src/memory/decisions.json',
            ]).then(data => setDecisionHistory(data.decisions || [])).catch(() => {});
          }}
        />
      </div>

      <div className={`view-container ${view === 'whitepaper' ? 'view-container--active' : 'view-container--hidden'}`}>
        <Whitepaper />
      </div>

      <div className={`view-container ${view === 'history' ? 'view-container--active' : 'view-container--hidden'}`}>
        <main className="main history-view">
          <div className="history-container">
            <div className="history-header">
              <h2 className="history-title">Decision History</h2>
              <p className="history-subtitle">
                Past decisions are sent to Gemini 3 as <code>memory.json</code> — a deterministic input that enables precedent-based reasoning.
              </p>
            </div>

            {decisionHistory.length === 0 ? (
              <div className="history-empty">
                <div className="history-empty__icon">📋</div>
                <h3>No decisions yet</h3>
                <p>Run the pipeline and provide feedback to build decision history.</p>
              </div>
            ) : (
              <div className="history-list">
                {decisionHistory.map((decision, idx) => (
                  <div key={idx} className={`history-card history-card--${decision.decision}`}>
                    <div className="history-card__header">
                      <span className={`history-card__decision history-card__decision--${decision.decision}`}>
                        {decision.decision.toUpperCase()}
                      </span>
                      <span className={`history-card__risk history-card__risk--${decision.risk_level}`}>
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
                    <div className={`history-card__feedback history-card__feedback--${decision.human_feedback.outcome}`}>
                      <span className="history-card__feedback-label">Human Authority:</span>
                      <span className="history-card__feedback-outcome">
                        {decision.human_feedback.outcome === 'accepted' ? '✓ Accepted' :
                         decision.human_feedback.outcome === 'overridden' && decision.human_feedback.override_decision === 'block' ? '✕ Blocked (Override)' :
                         decision.human_feedback.outcome === 'overridden' && decision.human_feedback.override_decision === 'approve' ? '✓ Approved (Override)' :
                         decision.human_feedback.outcome === 'overridden' ? '→ Overridden' : '⚡ Modified'}
                      </span>
                      {decision.human_feedback.notes && (
                        <p className="history-card__feedback-notes">"{decision.human_feedback.notes}"</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="history-note">
              <strong>How this enables learning:</strong> On each pipeline run, Gemini receives this history and reasons:
              "Similar changes were previously {decisionHistory[0]?.human_feedback.outcome || 'handled'} — adjusting judgment accordingly."
            </div>
          </div>
        </main>
      </div>

      {/* Graph view - conditionally rendered so fitView works correctly each time */}
      {view === 'graph' && (
        <main className="main">
          <div className="graph-container">
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
              minZoom={0.5}
              maxZoom={2}
              proOptions={{ hideAttribution: true }}
            >
              <Background color={theme === 'dark' ? '#262626' : '#e5e5e5'} gap={20} size={1} />
              <Controls showInteractive={false} />
            </ReactFlow>
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
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>DETERMINISTIC RULES INSUFFICIENT</span>
            </div>

            <h2 className="governance-tension__title">This decision exceeds automation authority.</h2>
            <p className="governance-tension__subtitle">
              Governance Conflict Detected — rule-based systems cannot resolve this.
            </p>

            <div className="governance-tension__conflicts">
              <div className="tension-item">
                <div className="tension-item__header">
                  <span className="tension-item__icon tension-item__icon--policy">⚖</span>
                  <span className="tension-item__label">Policy Conflict</span>
                </div>
                <div className="tension-item__content">
                  <div className="tension-item__row tension-item__row--allow">
                    <span className="tension-item__indicator">✓</span>
                    <span>Security policy allows schema evolution</span>
                  </div>
                  <div className="tension-item__row tension-item__row--deny">
                    <span className="tension-item__indicator">✕</span>
                    <span>Payments policy forbids breaking changes without migration</span>
                  </div>
                </div>
              </div>

              <div className="tension-item">
                <div className="tension-item__header">
                  <span className="tension-item__icon tension-item__icon--intent">?</span>
                  <span className="tension-item__label">Intent Ambiguity</span>
                </div>
                <div className="tension-item__content">
                  <div className="tension-item__row tension-item__row--allow">
                    <span className="tension-item__indicator">✓</span>
                    <span>Business goal is valid (multi-currency support)</span>
                  </div>
                  <div className="tension-item__row tension-item__row--deny">
                    <span className="tension-item__indicator">✕</span>
                    <span>Migration risk unresolved for downstream consumers</span>
                  </div>
                </div>
              </div>

              <div className="tension-item">
                <div className="tension-item__header">
                  <span className="tension-item__icon tension-item__icon--precedent">↺</span>
                  <span className="tension-item__label">Precedent Analysis</span>
                </div>
                <div className="tension-item__content">
                  <div className="tension-item__row tension-item__row--neutral">
                    <span className="tension-item__indicator">~</span>
                    <span>Similar change approved once before</span>
                  </div>
                  <div className="tension-item__row tension-item__row--neutral">
                    <span className="tension-item__indicator">~</span>
                    <span>But only with staged rollout plan attached</span>
                  </div>
                </div>
              </div>
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
              <h4 className="actions__title">Human Authority (Final)</h4>
              <p className="actions__sovereign">Your decision is sovereign. Automation cannot override.</p>
              <div className="actions__buttons">
                <button
                  className="authority-btn authority-btn--approve"
                  onClick={() => submitFeedback('overridden', 'approve')}
                  disabled={submittingFeedback}
                >
                  <span className="authority-btn__icon">✓</span>
                  <span className="authority-btn__label">Approve</span>
                  <span className="authority-btn__desc">Override Gemini → Allow change</span>
                </button>
                <button
                  className="authority-btn authority-btn--accept"
                  onClick={() => submitFeedback('accepted')}
                  disabled={submittingFeedback}
                >
                  <span className="authority-btn__icon">⚡</span>
                  <span className="authority-btn__label">Accept Escalation</span>
                  <span className="authority-btn__desc">Agree with Gemini → Requires review</span>
                </button>
                <button
                  className="authority-btn authority-btn--block"
                  onClick={() => submitFeedback('overridden', 'block')}
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
    </div>
  );
}

export default App;

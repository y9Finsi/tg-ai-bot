import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { CircleAlert, RefreshCw, ZoomIn, ZoomOut, RotateCcw, Info, X } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { initNodePositions, stepSimulation } from '@/lib/forceGraphPhysics.js';

export function memoryGraphData(raw) {
    if (!raw) return { nodes: [], edges: [] };
    const rawNodes = raw.nodes || raw.vertices || [];
    const rawEdges = raw.edges || raw.links || raw.relationships || [];

    const nodes = rawNodes.map((n, idx) => ({
        id: String(n.id ?? n.key ?? `node-${idx}`),
        label: n.label || n.name || n.text || n.fact || `Узел ${idx + 1}`,
        category: n.category || n.type || 'fact',
        confidence: n.confidence ?? n.weight ?? 1.0,
        status: n.status || (n.is_active === false ? 'superseded' : 'active'),
        created_at: n.created_at,
        metadata: n.metadata || {}
    }));

    const edges = rawEdges.map((e, idx) => ({
        id: String(e.id ?? `edge-${idx}`),
        source: String(e.source ?? e.from ?? e.source_id),
        target: String(e.target ?? e.to ?? e.target_id),
        label: e.label || e.type || e.relationship || 'Связь',
        weight: Number(e.weight || e.confidence || 1.0)
    }));

    return { nodes, edges };
}

export function MemoryGraph({ graph, loading, error, onRetry }) {
    const svgRef = useRef(null);
    const [physicsNodes, setPhysicsNodes] = useState([]);
    const [selectedNode, setSelectedNode] = useState(null);
    const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
    const [draggingNodeId, setDraggingNodeId] = useState(null);
    const [isPanning, setIsPanning] = useState(false);
    const panStartRef = useRef({ x: 0, y: 0 });

    const width = 800;
    const height = 480;

    // Pre-calculate node layout iteratively when graph changes
    useEffect(() => {
        if (!graph?.nodes?.length) {
            setPhysicsNodes([]);
            return;
        }
        let nodes = initNodePositions(graph.nodes, width, height);
        const edges = graph.edges || [];
        for (let i = 0; i < 75; i++) {
            const step = stepSimulation(nodes, edges, {
                width,
                height,
                repulsion: 3800,
                springLength: 110,
                springStrength: 0.04,
                gravity: 0.02,
                damping: 0.85
            });
            nodes = step.nodes;
            if (step.maxMovement < 0.05) break;
        }
        setPhysicsNodes(nodes);
    }, [graph]);

    // Dragging handlers
    const handleNodeMouseDown = (e, nodeId) => {
        e.stopPropagation();
        setDraggingNodeId(nodeId);
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        const clientX = (e.clientX - rect.left - transform.x) / transform.scale;
        const clientY = (e.clientY - rect.top - transform.y) / transform.scale;

        setPhysicsNodes(current =>
            current.map(n => n.id === nodeId ? { ...n, fx: clientX, fy: clientY, x: clientX, y: clientY } : n)
        );
    };

    const handleMouseMove = (e) => {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;

        if (draggingNodeId) {
            const clientX = (e.clientX - rect.left - transform.x) / transform.scale;
            const clientY = (e.clientY - rect.top - transform.y) / transform.scale;
            setPhysicsNodes(current =>
                current.map(n => n.id === draggingNodeId ? { ...n, fx: clientX, fy: clientY, x: clientX, y: clientY } : n)
            );
        } else if (isPanning) {
            setTransform(t => ({
                ...t,
                x: e.clientX - panStartRef.current.x,
                y: e.clientY - panStartRef.current.y
            }));
        }
    };

    const handleMouseUp = () => {
        if (draggingNodeId) {
            setPhysicsNodes(current => {
                let nodes = current.map(n => n.id === draggingNodeId ? { ...n, fx: null, fy: null } : n);
                const edges = graph?.edges || [];
                for (let i = 0; i < 20; i++) {
                    const step = stepSimulation(nodes, edges, {
                        width,
                        height,
                        repulsion: 3800,
                        springLength: 110,
                        springStrength: 0.04,
                        gravity: 0.02,
                        damping: 0.85
                    });
                    nodes = step.nodes;
                    if (step.maxMovement < 0.05) break;
                }
                return nodes;
            });
            setDraggingNodeId(null);
        }
        setIsPanning(false);
    };

    const handleBackgroundMouseDown = (e) => {
        if (e.button === 0) {
            setIsPanning(true);
            panStartRef.current = { x: e.clientX - transform.x, y: e.clientY - transform.y };
        }
    };

    const handleWheel = (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        setTransform(t => {
            const nextScale = Math.max(0.4, Math.min(3.0, t.scale * factor));
            return { ...t, scale: nextScale };
        });
    };

    const nodePositionsMap = useMemo(() => {
        const map = new Map();
        for (const node of physicsNodes) {
            map.set(String(node.id), node);
        }
        return map;
    }, [physicsNodes]);

    const getNodeColor = (category, status) => {
        if (status === 'superseded' || status === 'inactive') return '#64748b';
        switch (category) {
            case 'preference': return '#a855f7';
            case 'relationship': return '#ec4899';
            case 'entity': return '#06b6d4';
            case 'event': return '#f59e0b';
            case 'fact':
            default: return '#3b82f6';
        }
    };

    if (loading) {
        return (
            <div className="memory-insight-state" role="status">
                <RefreshCw size={18} className="animate-spin" />
                <span>Загрузка графа ассоциативной памяти…</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="memory-insight-state is-error" role="alert">
                <CircleAlert size={18} />
                <span>{error}</span>
                {onRetry && <Button size="sm" variant="outline" onClick={onRetry}>Повторить</Button>}
            </div>
        );
    }

    if (!physicsNodes.length) {
        return (
            <div className="empty-state" style={{ minHeight: 280, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <Info size={32} style={{ opacity: 0.5, marginBottom: 8 }} />
                <p>У данного пользователя пока нет накопленных ассоциативных узлов памяти.</p>
            </div>
        );
    }

    return (
        <div className="memory-graph-container" style={{ position: 'relative', width: '100%', borderRadius: 8, overflow: 'hidden', background: '#0b0f17', border: '1px solid var(--border)' }}>
            <div className="graph-controls-toolbar" style={{ position: 'absolute', top: 12, right: 12, zIndex: 10, display: 'flex', gap: 6 }}>
                <Button size="xs" variant="outline" onClick={() => setTransform(t => ({ ...t, scale: Math.min(3.0, t.scale * 1.2) }))} title="Приблизить">
                    <ZoomIn size={14} />
                </Button>
                <Button size="xs" variant="outline" onClick={() => setTransform(t => ({ ...t, scale: Math.max(0.4, t.scale / 1.2) }))} title="Отдалить">
                    <ZoomOut size={14} />
                </Button>
                <Button size="xs" variant="outline" onClick={() => setTransform({ x: 0, y: 0, scale: 1 })} title="Сбросить масштаб">
                    <RotateCcw size={14} />
                </Button>
            </div>

            <div className="graph-legend" style={{ position: 'absolute', bottom: 12, left: 12, zIndex: 10, display: 'flex', gap: 10, fontSize: 11, background: 'rgba(0,0,0,0.6)', padding: '4px 10px', borderRadius: 6 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><i style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', display: 'inline-block' }} /> Факт</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><i style={{ width: 8, height: 8, borderRadius: '50%', background: '#a855f7', display: 'inline-block' }} /> Предпочтение</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><i style={{ width: 8, height: 8, borderRadius: '50%', background: '#ec4899', display: 'inline-block' }} /> Отношения</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><i style={{ width: 8, height: 8, borderRadius: '50%', background: '#64748b', display: 'inline-block' }} /> Устаревший</span>
            </div>

            <svg
                ref={svgRef}
                width="100%"
                height={height}
                viewBox={`0 0 ${width} ${height}`}
                style={{ cursor: isPanning ? 'grabbing' : 'grab', userSelect: 'none', display: 'block' }}
                onMouseDown={handleBackgroundMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
            >
                <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
                    {/* Edges */}
                    {(graph.edges || []).map(edge => {
                        const source = nodePositionsMap.get(String(edge.source));
                        const target = nodePositionsMap.get(String(edge.target));
                        if (!source || !target) return null;

                        return (
                            <g key={edge.id}>
                                <line
                                    x1={source.x}
                                    y1={source.y}
                                    x2={target.x}
                                    y2={target.y}
                                    stroke="rgba(255,255,255,0.18)"
                                    strokeWidth={Math.max(1, (edge.weight || 1) * 1.5)}
                                    strokeDasharray={edge.weight < 0.5 ? "4 3" : undefined}
                                />
                            </g>
                        );
                    })}

                    {/* Nodes */}
                    {physicsNodes.map(node => {
                        const color = getNodeColor(node.category, node.status);
                        const isSelected = selectedNode?.id === node.id;
                        const isSuperseded = node.status === 'superseded' || node.status === 'inactive';

                        return (
                            <g
                                key={node.id}
                                transform={`translate(${node.x}, ${node.y})`}
                                style={{ cursor: 'pointer' }}
                                onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                                onClick={() => setSelectedNode(node)}
                            >
                                <circle
                                    r={isSelected ? 18 : 14}
                                    fill={color}
                                    stroke={isSelected ? '#ffffff' : 'rgba(255,255,255,0.3)'}
                                    strokeWidth={isSelected ? 3 : 1.5}
                                    opacity={isSuperseded ? 0.45 : 0.9}
                                    style={{ filter: isSelected ? 'drop-shadow(0 0 8px rgba(255,255,255,0.5))' : undefined, transition: 'r 0.15s ease' }}
                                />
                                <text
                                    y={25}
                                    textAnchor="middle"
                                    fill="#cbd5e1"
                                    fontSize={11}
                                    fontWeight={isSelected ? 'bold' : 'normal'}
                                    style={{ pointerEvents: 'none', textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
                                >
                                    {node.label.length > 20 ? `${node.label.slice(0, 18)}…` : node.label}
                                </text>
                            </g>
                        );
                    })}
                </g>
            </svg>

            {/* Node detail inspect overlay */}
            {selectedNode && (
                <div style={{ position: 'absolute', top: 12, left: 12, maxWidth: 300, background: 'rgba(15, 23, 42, 0.95)', backdropFilter: 'blur(8px)', padding: 14, borderRadius: 8, border: '1px solid var(--border)', zIndex: 20, boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <Badge variant={selectedNode.status === 'superseded' ? 'muted' : 'blue'}>
                            {selectedNode.category} · {selectedNode.status}
                        </Badge>
                        <button type="button" onClick={() => setSelectedNode(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                            <X size={15} />
                        </button>
                    </div>
                    <strong style={{ fontSize: 13, display: 'block', color: '#f8fafc', marginBottom: 4 }}>
                        {selectedNode.label}
                    </strong>
                    <div style={{ fontSize: 11, color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span>ID: {selectedNode.id}</span>
                        <span>Уверенность: {Math.round((selectedNode.confidence || 1) * 100)}%</span>
                        {selectedNode.created_at && <span>Создан: {new Date(selectedNode.created_at).toLocaleDateString('ru-RU')}</span>}
                    </div>
                </div>
            )}
        </div>
    );
}

export default MemoryGraph;

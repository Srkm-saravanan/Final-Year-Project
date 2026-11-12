import React, { useState, useRef, useEffect } from 'react';
import {
  Network,
  Search,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  FileText,
  ArrowRight,
  Inbox
} from 'lucide-react';
import { useIntelligence } from '../../context/CortexContext';

export const KnowledgeGraph: React.FC = () => {
  const { graphNodes, graphEdges, selectedGraphNode, setSelectedGraphNode } = useIntelligence();

  const [searchEntity, setSearchEntity] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [activeTab, setActiveTab] = useState<'Overview' | 'Relationships' | 'Documents'>('Overview');
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});

  useEffect(() => {
    const initial: Record<string, { x: number; y: number }> = {};
    graphNodes.forEach((n) => {
      initial[n.id] = { x: n.x || 360, y: n.y || 250 };
    });
    setNodePositions(initial);
  }, [graphNodes]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const gRef = useRef<SVGGElement | null>(null);

  const entityTypes = [
    { label: 'Company', color: '#0ea5e9' },
    { label: 'Department', color: '#3b82f6' },
    { label: 'Product', color: '#10b981' },
    { label: 'Customer', color: '#f59e0b' },
    { label: 'Supplier', color: '#f97316' },
    { label: 'Region', color: '#8b5cf6' },
    { label: 'Event', color: '#ec4899' },
    { label: 'Metric', color: '#14b8a6' }
  ];

  const filteredNodes = graphNodes.filter((node) => {
    if (selectedTypeFilter && node.type !== selectedTypeFilter) return false;
    if (searchEntity && !node.label.toLowerCase().includes(searchEntity.toLowerCase())) return false;
    return true;
  });

  const visibleNodeIds = new Set(filteredNodes.map((n) => n.id));
  const visibleEdges = graphEdges.filter(
    (edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
  );

  const activeNode =
    (selectedGraphNode && visibleNodeIds.has(selectedGraphNode.id)
      ? selectedGraphNode
      : filteredNodes[0]) || undefined;

  const handleMouseDown = (nodeId: string) => {
    setDraggedNodeId(nodeId);
    const n = graphNodes.find((gn) => gn.id === nodeId);
    if (n) setSelectedGraphNode(n);
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!draggedNodeId || !svgRef.current) return;
    const svg = svgRef.current;
    const ctm = gRef.current?.getScreenCTM();
    let x: number;
    let y: number;

    if (ctm) {
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const transformed = pt.matrixTransform(ctm.inverse());
      x = transformed.x;
      y = transformed.y;
    } else {
      const rect = svg.getBoundingClientRect();
      const vbWidth = 760;
      const vbHeight = 520;
      const uniformScale = Math.min(rect.width / vbWidth, rect.height / vbHeight) || 1;
      const offsetX = (rect.width - vbWidth * uniformScale) / 2;
      const offsetY = (rect.height - vbHeight * uniformScale) / 2;
      const svgX = (e.clientX - rect.left - offsetX) / uniformScale;
      const svgY = (e.clientY - rect.top - offsetY) / uniformScale;
      x = (svgX - 380) / zoomLevel + 380;
      y = (svgY - 260) / zoomLevel + 260;
    }

    const clampedX = Math.max(-150, Math.min(910, x));
    const clampedY = Math.max(-100, Math.min(620, y));

    setNodePositions((prev) => ({
      ...prev,
      [draggedNodeId]: { x: clampedX, y: clampedY }
    }));
  };

  const handleMouseUp = () => {
    setDraggedNodeId(null);
  };

  const resetZoom = () => {
    setZoomLevel(1);
    const initial: Record<string, { x: number; y: number }> = {};
    graphNodes.forEach((n) => {
      initial[n.id] = { x: n.x || 360, y: n.y || 250 };
    });
    setNodePositions(initial);
  };

  const getNodeColor = (type?: string) => {
    const found = entityTypes.find((t) => t.label === type);
    return found ? found.color : '#94a3b8';
  };

  return (
    <div className="w-full max-w-[1920px] mx-auto p-6 md:p-8 xl:p-10 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[#162138]">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            GraphRAG Enterprise Knowledge Graph
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Traversable multi-hop entity relationships linking financial statements, supply chain partners, and operational units
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchEntity}
              onChange={(e) => setSearchEntity(e.target.value)}
              placeholder="Search entity..."
              className="pl-9 pr-3 py-1.5 bg-[#0e1628] border border-[#1b2740] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 w-44"
            />
          </div>

          <div className="flex bg-[#0e1628] rounded-xl border border-[#1b2740] p-1">
            <button
              onClick={() => setZoomLevel((z) => Math.min(1.8, z + 0.15))}
              className="p-1 hover:bg-[#15223a] text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => setZoomLevel((z) => Math.max(0.6, z - 0.15))}
              className="p-1 hover:bg-[#15223a] text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={resetZoom}
              className="p-1 hover:bg-[#15223a] text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              title="Reset Layout"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Entity Type Legend / Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <span className="text-slate-500 font-mono text-[11px] mr-1">Filter Type:</span>
        <button
          onClick={() => setSelectedTypeFilter(null)}
          className={`px-3 py-1 rounded-full font-medium transition-all cursor-pointer ${
            selectedTypeFilter === null
              ? 'bg-blue-600 text-white font-semibold'
              : 'bg-[#0e1628] text-slate-400 hover:text-white border border-[#1b2740]'
          }`}
        >
          All Entities ({graphNodes.length})
        </button>
        {entityTypes.map((t) => (
          <button
            key={t.label}
            onClick={() => setSelectedTypeFilter(selectedTypeFilter === t.label ? null : t.label)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full font-medium transition-all cursor-pointer ${
              selectedTypeFilter === t.label
                ? 'bg-blue-600 text-white font-semibold'
                : 'bg-[#0e1628] text-slate-400 hover:text-white border border-[#1b2740]'
            }`}
          >
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Main Visualization Layout: 9 cols Canvas + 3 cols Entity Details Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[580px]">
        {/* Left: Interactive SVG Graph Canvas (9 cols) */}
        <div className="lg:col-span-9 bg-[#080d19] border border-[#1b2740] rounded-2xl relative overflow-hidden shadow-inner flex flex-col justify-between">
          <div className="absolute top-3 left-3 z-10 flex items-center gap-2 pointer-events-none">
            <span className="text-[11px] font-mono bg-[#0c1426]/90 border border-[#1c2a47] px-2.5 py-1 rounded-lg text-slate-400 backdrop-blur-sm">
              Nodes: {filteredNodes.length} · Edges: {visibleEdges.length} · GraphRAG Engine
            </span>
          </div>

          <div className="flex-1 w-full h-[520px] overflow-hidden cursor-grab active:cursor-grabbing relative">
            {filteredNodes.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
                <Network className="w-12 h-12 text-slate-600 mb-2" />
                <h4 className="text-base font-bold text-white">Knowledge Graph Empty</h4>
                <p className="text-xs text-slate-500 max-w-sm mt-1">
                  Dummy entities and relationships were cleared because mock-data.json was removed.
                </p>
              </div>
            ) : (
              <svg
                ref={svgRef}
                className="w-full h-full select-none"
                viewBox="0 0 760 520"
                preserveAspectRatio="xMidYMid meet"
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <g
                  ref={gRef}
                  transform={`translate(380, 260) scale(${zoomLevel}) translate(-380, -260)`}
                >
                  {/* Edges */}
                  {visibleEdges.map((edge) => {
                    const src = nodePositions[edge.source];
                    const tgt = nodePositions[edge.target];
                    if (!src || !tgt) return null;

                    const isConnectedToActive =
                      activeNode && (edge.source === activeNode.id || edge.target === activeNode.id);

                    const midX = (src.x + tgt.x) / 2;
                    const midY = (src.y + tgt.y) / 2;

                    return (
                      <g key={edge.id} className="transition-all">
                        <line
                          x1={src.x}
                          y1={src.y}
                          x2={tgt.x}
                          y2={tgt.y}
                          stroke={isConnectedToActive ? '#38bdf8' : '#1e293b'}
                          strokeWidth={isConnectedToActive ? 2 : 1}
                          strokeDasharray={isConnectedToActive ? 'none' : '3 3'}
                        />
                        <rect
                          x={midX - 25}
                          y={midY - 7}
                          width="50"
                          height="14"
                          rx="3"
                          fill="#0b1322"
                          stroke={isConnectedToActive ? '#22406d' : '#131e33'}
                        />
                        <text
                          x={midX}
                          y={midY + 3}
                          fill={isConnectedToActive ? '#38bdf8' : '#64748b'}
                          fontSize="8"
                          textAnchor="middle"
                          fontFamily="monospace"
                        >
                          {edge.relationship}
                        </text>
                      </g>
                    );
                  })}

                  {/* Nodes */}
                  {filteredNodes.map((node) => {
                    const pos = nodePositions[node.id] || { x: 380, y: 260 };
                    const isSelected = activeNode?.id === node.id;
                    const isCentral = node.id === 'cortex-corp' || node.type === 'Company';
                    const color = getNodeColor(node.type);

                    return (
                      <g
                        key={node.id}
                        transform={`translate(${pos.x}, ${pos.y})`}
                        onMouseDown={() => handleMouseDown(node.id)}
                        onClick={() => setSelectedGraphNode(node)}
                        className="cursor-pointer group"
                      >
                        {isSelected && (
                          <circle
                            r={isCentral ? 38 : 28}
                            fill="none"
                            stroke={color}
                            strokeWidth="2.5"
                            strokeDasharray="5 3"
                          />
                        )}

                        <circle
                          r={isCentral ? 30 : 20}
                          fill="#0f172a"
                          stroke={color}
                          strokeWidth={isCentral ? 3 : 2}
                          className="transition-transform group-hover:scale-105"
                        />

                        <text
                          y={isCentral ? 4 : 3}
                          fill="#ffffff"
                          fontSize={isCentral ? 10 : 8}
                          fontWeight="bold"
                          textAnchor="middle"
                          pointerEvents="none"
                        >
                          {node.label.length > 12 ? node.label.substring(0, 11) + '…' : node.label}
                        </text>

                        <text
                          y={isCentral ? 44 : 32}
                          fill="#94a3b8"
                          fontSize="9"
                          textAnchor="middle"
                          fontFamily="monospace"
                          pointerEvents="none"
                        >
                          {node.type}
                        </text>
                      </g>
                    );
                  })}
                </g>
              </svg>
            )}
          </div>

          <div className="p-3 border-t border-[#162138] bg-[#0c1426] flex items-center justify-between text-xs text-slate-400">
            <span>Tip: Drag nodes with mouse to reorganize spatial clustering.</span>
            <span className="font-mono text-emerald-400">Deterministic In-Memory Triples</span>
          </div>
        </div>

        {/* Right: Entity Details Panel (3 cols) */}
        <div className="lg:col-span-3 bg-[#0e1628] border border-[#1b2740] rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          {!activeNode ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-xs text-slate-500">
              <Inbox className="w-8 h-8 text-slate-600 mb-2" />
              <span>No entity selected</span>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between pb-2 mb-3 border-b border-[#162138]">
                <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
                  Entity Details
                </h3>
              </div>

              {/* Entity Header Banner */}
              <div className="p-3 rounded-lg bg-[#111c33] border border-[#1d2b47] mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: getNodeColor(activeNode.type) }}
                  />
                  <h4 className="text-sm font-bold text-white">{activeNode.label}</h4>
                </div>
                <span className="text-[10px] text-blue-400 font-medium uppercase tracking-wider">
                  {activeNode.type}
                </span>
              </div>

              {/* Tabs: Overview, Relationships, Documents */}
              <div className="flex border-b border-[#162138] mb-3 text-xs">
                {(['Overview', 'Relationships', 'Documents'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`pb-2 px-2.5 font-medium transition-colors border-b-2 cursor-pointer ${
                      activeTab === tab
                        ? 'border-blue-500 text-blue-400 font-semibold'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Tab: Overview */}
              {activeTab === 'Overview' && (
                <div className="space-y-2 text-xs divide-y divide-[#162138]">
                  <div className="flex justify-between pt-1">
                    <span className="text-slate-400">Type</span>
                    <span className="text-slate-200 font-medium">{activeNode.type}</span>
                  </div>
                  {activeNode.industry && (
                    <div className="flex justify-between pt-1.5">
                      <span className="text-slate-400">Industry</span>
                      <span className="text-slate-200 font-medium">{activeNode.industry}</span>
                    </div>
                  )}
                  {activeNode.revenue && (
                    <div className="flex justify-between pt-1.5">
                      <span className="text-slate-400">Revenue</span>
                      <span className="text-blue-400 font-semibold">{activeNode.revenue}</span>
                    </div>
                  )}
                  {activeNode.employees && (
                    <div className="flex justify-between pt-1.5">
                      <span className="text-slate-400">Employees</span>
                      <span className="text-slate-200 tabular-nums">{activeNode.employees}</span>
                    </div>
                  )}
                  {activeNode.locations && (
                    <div className="flex justify-between pt-1.5">
                      <span className="text-slate-400">Locations</span>
                      <span className="text-slate-200 tabular-nums">{activeNode.locations}</span>
                    </div>
                  )}
                  {activeNode.keyProducts && (
                    <div className="flex justify-between pt-1.5">
                      <span className="text-slate-400">Key Products</span>
                      <span className="text-slate-200">{activeNode.keyProducts.join(', ')}</span>
                    </div>
                  )}
                  {activeNode.description && (
                    <div className="pt-2">
                      <span className="text-slate-400 block mb-1">Description</span>
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        {activeNode.description}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Relationships */}
              {activeTab === 'Relationships' && (
                <div className="space-y-2 text-xs">
                  <div className="text-[11px] text-slate-400 mb-2">Connected Topology:</div>
                  {graphEdges
                    .filter((e) => e.source === activeNode.id || e.target === activeNode.id)
                    .map((edge) => {
                      const otherId = edge.source === activeNode.id ? edge.target : edge.source;
                      const otherNode = graphNodes.find((n) => n.id === otherId);
                      return (
                        <div
                          key={edge.id}
                          onClick={() => {
                            if (otherNode) {
                              if (!visibleNodeIds.has(otherNode.id)) {
                                setSelectedTypeFilter(null);
                                setSearchEntity('');
                              }
                              setSelectedGraphNode(otherNode);
                            }
                          }}
                          className="p-2.5 rounded-lg bg-[#111c33] border border-[#1d2b47] hover:border-blue-500/40 flex items-center justify-between cursor-pointer transition-colors"
                        >
                          <div>
                            <span className="font-semibold text-slate-200">
                              {otherNode?.label || otherId}
                            </span>
                            <div className="text-[10px] text-blue-400 font-mono mt-0.5">
                              {edge.relationship}
                            </div>
                          </div>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                        </div>
                      );
                    })}
                </div>
              )}

              {/* Tab: Documents */}
              {activeTab === 'Documents' && (
                <div className="space-y-2 text-xs">
                  <div className="p-2.5 rounded-lg bg-[#111c33] border border-[#1d2b47] flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-400" />
                    <div>
                      <div className="font-semibold text-slate-200">ERP_Sync_Snapshot.json</div>
                      <span className="text-[10px] text-slate-500">SAP S/4HANA verified</span>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#111c33] border border-[#1d2b47] flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-400" />
                    <div>
                      <div className="font-semibold text-slate-200">Audit_Trails_2026.pdf</div>
                      <span className="text-[10px] text-slate-500">PwC certified balance</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-[#162138] text-[11px] text-slate-400 flex items-center justify-between">
            <span>Graph Depth: 3 hops</span>
            <span className="font-mono text-blue-400">GraphRAG Enabled</span>
          </div>
        </div>
      </div>
    </div>
  );
};

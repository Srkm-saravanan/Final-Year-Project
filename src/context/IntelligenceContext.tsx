import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { governanceApi } from '../services/cortexApi';
import type {
  AgentBreakdown,
  AgentInfo,
  ChatMessage,
  ChatSession,
  GraphEdge,
  GraphNode,
  RawMockDataset,
} from '../types/cortex';
import { useAuth } from './AuthContext';
import { useAuditLogger, useGovernance } from './GovernanceContext';

export interface IntelligenceContextType {
  agents: AgentInfo[];
  updateAgent: (id: string, updates: Partial<AgentInfo>) => Promise<void>;
  chatSessions: ChatSession[];
  activeChatId: string;
  setActiveChatId: (id: string) => void;
  createNewChat: () => void;
  sendMessage: (query: string) => Promise<void>;
  isAgentsAnalyzing: boolean;
  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
  selectedGraphNode: GraphNode | null;
  setSelectedGraphNode: (node: GraphNode | null) => void;
  applyIntelligenceMockData: (json: RawMockDataset | null) => void;
}

const IntelligenceContext = createContext<IntelligenceContextType | null>(null);

export const IntelligenceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const { addAuditLog, refreshAuditLogs } = useAuditLogger();
  const { getSystemSettingsSnapshot } = useGovernance();

  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string>('');
  const [isAgentsAnalyzing, setIsAgentsAnalyzing] = useState<boolean>(false);

  const [graphNodes, setGraphNodes] = useState<GraphNode[]>([]);
  const [graphEdges, setGraphEdges] = useState<GraphEdge[]>([]);
  const [selectedGraphNode, setSelectedGraphNode] = useState<GraphNode | null>(null);

  const responseTimerRef = useRef<number | null>(null);
  const activeChatIdRef = useRef<string>(activeChatId);
  activeChatIdRef.current = activeChatId;
  const agentsRef = useRef<AgentInfo[]>(agents);
  agentsRef.current = agents;

  useEffect(() => {
    return () => {
      if (responseTimerRef.current !== null) {
        window.clearTimeout(responseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setAgents([]);
      setChatSessions([]);
      setActiveChatId('');
      setGraphNodes([]);
      setGraphEdges([]);
      setSelectedGraphNode(null);
    }
  }, [isAuthenticated]);

  const updateAgent = useCallback(
    async (id: string, updates: Partial<AgentInfo>): Promise<void> => {
      const { agent: updated } = await governanceApi.updateAgent(id, {
        ...(updates.name !== undefined ? { name: updates.name } : {}),
        ...(updates.model !== undefined ? { model: updates.model } : {}),
        ...(updates.temperature !== undefined ? { temperature: updates.temperature } : {}),
        ...(updates.systemPrompt !== undefined ? { systemPrompt: updates.systemPrompt } : {}),
        ...(updates.status !== undefined ? { status: updates.status } : {}),
      });
      setAgents((prev) => prev.map((a) => (a.id === id ? updated : a)));
      await refreshAuditLogs();
    },
    [refreshAuditLogs]
  );

  const createNewChat = useCallback(() => {
    const newId = `chat-${Date.now()}`;
    const newChat: ChatSession = {
      id: newId,
      title: 'New Decision Analysis',
      date: 'Just now',
      messages: [],
    };
    setChatSessions((prev) => [newChat, ...prev]);
    setActiveChatId(newId);
    addAuditLog('Created Chat Session', newChat.title, 'Success');
  }, [addAuditLog]);

  // Note: Live Gemini / ReAct multi-agent execution belongs to Phase D.
  // Phase C retains deterministic local diagnostic preview in AIWorkspace.
  const sendMessage = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) return;

      const userMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        sender: 'user',
        content: trimmed,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      let targetChatId = activeChatIdRef.current;
      if (!targetChatId) {
        targetChatId = `chat-${Date.now()}`;
        const created: ChatSession = {
          id: targetChatId,
          title: trimmed.length > 42 ? `${trimmed.slice(0, 42)}...` : trimmed,
          date: 'Just now',
          messages: [userMsg],
        };
        setChatSessions((prev) => [created, ...prev]);
        setActiveChatId(targetChatId);
      } else {
        setChatSessions((prev) =>
          prev.map((session) => {
            if (session.id !== targetChatId) return session;
            const shouldRetitle =
              session.messages.length === 0 && session.title.startsWith('New');
            return {
              ...session,
              title: shouldRetitle
                ? trimmed.length > 42
                  ? `${trimmed.slice(0, 42)}...`
                  : trimmed
                : session.title,
              date: 'Just now',
              messages: [...session.messages, userMsg],
            };
          })
        );
      }

      setIsAgentsAnalyzing(true);
      setAgents((prev) => prev.map((a) => ({ ...a, status: 'Analyzing...' })));

      if (responseTimerRef.current !== null) {
        window.clearTimeout(responseTimerRef.current);
      }

      const currentFailover = getSystemSettingsSnapshot().automatedModelFailover;
      const activeAgents = agentsRef.current;

      await new Promise<void>((resolve) => {
        responseTimerRef.current = window.setTimeout(() => {
          responseTimerRef.current = null;
          const lower = trimmed.toLowerCase();
          const failoverNote = currentFailover
            ? 'Secondary region failover routing: Armed'
            : 'Secondary region failover routing: Standby (Single-Region Mode)';

          let synthesis =
            'Multi-agent diagnostic synthesis across connected CORTEX enterprise domains (Phase C deterministic preview — live Gemini orchestration activates in Phase D):\n\n' +
            '1. **Revenue & Margin Structure**: Current enterprise baseline operates at ₹124.3 Cr revenue with an 18.4% net margin and ₹86.7 Cr operating cost footprint.\n' +
            '2. **Execution Risk Envelope**: Logistics friction in Tier-2 corridors and raw material cost sensitivity remain the primary controllable variance drivers.\n' +
            '3. **Recommended Next Action**: Validate net profit impact in the Scenario Simulator before locking Q4 commercial budget allocations.';

          if (lower.includes('profit') || lower.includes('margin') || lower.includes('cost')) {
            synthesis =
              'Financial variance synthesis for profitability & cost optimization:\n\n' +
              '• **Current Baseline**: 18.4% profit margin on ₹124.3 Cr quarterly revenue.\n' +
              '• **Primary Cost Levers**: Variable COGS & Tier-2 freight surcharges account for the steepest controllable margin compression.\n' +
              '• **Recommended Tradeoff**: Compare a +2–5% pricing posture against logistics renegotiation inside the Scenario Simulator to preserve margin without over-constraining unit volume.';
          } else if (lower.includes('supply') || lower.includes('inventory') || lower.includes('region')) {
            synthesis =
              'Operations & Supply Chain corridor assessment:\n\n' +
              '• **Bottleneck Status**: Secondary regional fulfillment delays are elevating SLA latency in East & Tier-2 markets.\n' +
              '• **Sales Mix Evidence**: Regional sales velocity shows North and West markets driving core order density while East requires replenishment tuning.\n' +
              '• **Next Step**: Review the Knowledge Graph corridor dependencies and linked operational recommendations.';
          }

          const breakdowns: AgentBreakdown[] = activeAgents.slice(0, 3).map((agent) => ({
            agentName: agent.name,
            agentRole: agent.role,
            finding:
              agent.id === 'agent-finance'
                ? `Margin sensitivity evaluated on ₹124.3 Cr baseline (${agent.model}; ${failoverNote}).`
                : agent.id === 'agent-operations'
                  ? `Operational capacity & fulfillment cadence cross-checked (${agent.model}).`
                  : `Strategic & market correlation checked across active graph entities (${agent.model}).`,
          }));

          const assistantMsg: ChatMessage = {
            id: `msg-${Date.now() + 1}`,
            sender: 'assistant',
            content: synthesis,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            agentBreakdowns: breakdowns,
            sources: ['Sales Database', 'Enterprise ERP', 'Executive Knowledge Graph'],
            recommendations: [
              'Validate pricing & capacity trade-offs in Scenario Simulator',
              'Review prioritized strategic recommendations for approval status',
            ],
          };

          setChatSessions((prev) =>
            prev.map((session) =>
              session.id === targetChatId
                ? { ...session, messages: [...session.messages, assistantMsg] }
                : session
            )
          );
          setAgents((prev) => prev.map((a) => ({ ...a, status: 'Complete' })));
          setIsAgentsAnalyzing(false);
          addAuditLog(
            'Multi-Agent Preview Processed',
            `Query: "${trimmed.substring(0, 30)}..."`,
            'Success'
          );
          resolve();
        }, 500);
      });
    },
    [addAuditLog, getSystemSettingsSnapshot]
  );

  const applyIntelligenceMockData = useCallback((json: RawMockDataset | null) => {
    if (!json) {
      setAgents([]);
      setChatSessions([]);
      setActiveChatId('');
      setGraphNodes([]);
      setGraphEdges([]);
      setSelectedGraphNode(null);
      return;
    }

    setAgents(Array.isArray(json.agents) ? json.agents : []);
    if (Array.isArray(json.chatSessions)) {
      setChatSessions(json.chatSessions);
      setActiveChatId((prev) =>
        prev && json.chatSessions?.some((s) => s.id === prev)
          ? prev
          : json.chatSessions?.[0]?.id ?? ''
      );
    } else {
      setChatSessions([]);
      setActiveChatId('');
    }
    if (json.knowledgeGraph) {
      const nodes = Array.isArray(json.knowledgeGraph.nodes) ? json.knowledgeGraph.nodes : [];
      setGraphNodes(nodes);
      setSelectedGraphNode((prev) =>
        prev ? nodes.find((n) => n.id === prev.id) ?? nodes[0] ?? null : nodes[0] ?? null
      );
      setGraphEdges(Array.isArray(json.knowledgeGraph.edges) ? json.knowledgeGraph.edges : []);
    } else {
      setGraphNodes([]);
      setGraphEdges([]);
      setSelectedGraphNode(null);
    }
  }, []);

  const value = useMemo<IntelligenceContextType>(
    () => ({
      agents,
      updateAgent,
      chatSessions,
      activeChatId,
      setActiveChatId,
      createNewChat,
      sendMessage,
      isAgentsAnalyzing,
      graphNodes,
      graphEdges,
      selectedGraphNode,
      setSelectedGraphNode,
      applyIntelligenceMockData,
    }),
    [
      agents,
      updateAgent,
      chatSessions,
      activeChatId,
      createNewChat,
      sendMessage,
      isAgentsAnalyzing,
      graphNodes,
      graphEdges,
      selectedGraphNode,
      applyIntelligenceMockData,
    ]
  );

  return <IntelligenceContext.Provider value={value}>{children}</IntelligenceContext.Provider>;
};

export const useIntelligence = (): IntelligenceContextType => {
  const ctx = useContext(IntelligenceContext);
  if (!ctx) {
    throw new Error('useIntelligence must be used within an IntelligenceProvider');
  }
  return ctx;
};

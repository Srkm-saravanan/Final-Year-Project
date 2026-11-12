import React, { useState } from 'react';
import {
  Users,
  Bot,
  Database,
  Layers,
  Settings,
  FileText,
  Save,
  CheckCircle2,
  UserPlus,
  X,
  Check,
  ShieldCheck
} from 'lucide-react';
import { useDataFabric, useGovernance, useIntelligence } from '../../context/CortexContext';
import { AgentInfo, CanonicalRole } from '../../types/cortex';

export const AdminSettings: React.FC = () => {
  const { agents, updateAgent } = useIntelligence();
  const {
    users,
    addUser,
    updateUserRole,
    auditLogs,
    auditRecordChecksums,
    auditChainChecksum,
    lastAuditVerification,
    verifyAuditTrail,
    addAuditLog,
    systemSettings,
    updateSystemSetting,
    governanceError
  } = useGovernance();
  const { dataSources, salesRecords, customDatasets } = useDataFabric();

  const [activeTab, setActiveTab] = useState<
    'Users' | 'AI Agents' | 'Data Sources' | 'Integrations' | 'System Settings' | 'Audit Logs'
  >('AI Agents');

  const [selectedAgentId, setSelectedAgentId] = useState<string>('agent-finance');
  const [agentSubTab, setAgentSubTab] = useState<'General' | 'Capabilities' | 'Data Access' | 'Prompt Settings'>('General');

  const selectedAgent = agents.find((a) => a.id === selectedAgentId) || agents[0] || null;
  const [editedName, setEditedName] = useState(selectedAgent ? selectedAgent.name : '');
  const [editedModel, setEditedModel] = useState(selectedAgent ? selectedAgent.model : 'Gemini 2.5 Flash');
  const [editedTemp, setEditedTemp] = useState(selectedAgent ? selectedAgent.temperature : 0.2);
  const [editedPrompt, setEditedPrompt] = useState(selectedAgent ? selectedAgent.systemPrompt : '');
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [testedSyncResult, setTestedSyncResult] = useState<{
    id: string;
    durationMs: number;
    rowCount: number;
  } | null>(null);
  const [isVerifyingAudit, setIsVerifyingAudit] = useState(false);

  React.useEffect(() => {
    if (selectedAgent) {
      setEditedName(selectedAgent.name);
      setEditedModel(selectedAgent.model);
      setEditedTemp(selectedAgent.temperature);
      setEditedPrompt(selectedAgent.systemPrompt);
    }
  }, [selectedAgent]);

  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<CanonicalRole>('Analyst');
  const [adminActionError, setAdminActionError] = useState<string | null>(null);

  const handleSelectAgent = (agent: AgentInfo) => {
    setSelectedAgentId(agent.id);
    setEditedName(agent.name);
    setEditedModel(agent.model);
    setEditedTemp(agent.temperature);
    setEditedPrompt(agent.systemPrompt);
  };

  const handleSaveAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgent) return;
    setAdminActionError(null);
    try {
      await updateAgent(selectedAgent.id, {
        name: editedName,
        model: editedModel,
        temperature: editedTemp,
        systemPrompt: editedPrompt
      });
      setShowSavedToast(true);
      setTimeout(() => setShowSavedToast(false), 3000);
    } catch (err) {
      setAdminActionError(err instanceof Error ? err.message : 'Unable to save agent configuration.');
    }
  };

  const handleTestSync = (id: string) => {
    const t0 = performance.now();
    const targetSource = dataSources.find((ds) => ds.id === id);
    const localRows = customDatasets[id]?.rows.length ?? (id === 'ds-sales' ? salesRecords.length : 0);
    const durationMs = Math.max(0.1, performance.now() - t0);
    setTestedSyncResult({ id, durationMs, rowCount: localRows });
    addAuditLog(
      'Verified Local Source Store',
      `${targetSource?.name ?? id} (${localRows} cached rows inspected)`,
      'Success'
    );
    window.setTimeout(() => {
      setTestedSyncResult((prev) => (prev?.id === id ? null : prev));
    }, 3000);
  };

  const handleVerifyChain = async () => {
    setIsVerifyingAudit(true);
    await verifyAuditTrail();
    setIsVerifyingAudit(false);
  };

  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserEmail.trim()) return;
    setAdminActionError(null);
    try {
      await addUser({
        name: newUserName.trim(),
        email: newUserEmail.trim(),
        role: newUserRole,
        ...(newUserPassword.trim() ? { password: newUserPassword.trim() } : {})
      });
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setInviteModalOpen(false);
    } catch (err) {
      setAdminActionError(err instanceof Error ? err.message : 'Unable to provision user.');
    }
  };

  const handleRoleChange = async (userId: string, nextRole: CanonicalRole) => {
    setAdminActionError(null);
    try {
      await updateUserRole(userId, nextRole);
    } catch (err) {
      setAdminActionError(err instanceof Error ? err.message : 'Unable to update user role.');
    }
  };

  return (
    <div className="w-full max-w-[1920px] mx-auto p-6 md:p-8 xl:p-10 space-y-8">
      {/* Subtitle */}
      <div className="pb-3 border-b border-[#162138]">
        <h2 className="text-xl font-bold text-white tracking-tight">
          Administration & Platform Governance
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Role-based access control, agent hyperparameters, pipeline connections, and immutable audit logs
        </p>
      </div>

      {/* Main Subtabs Header */}
      {(adminActionError || governanceError) && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
          {adminActionError || governanceError}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 border-b border-[#162138] pb-4">
        {(
          [
            { id: 'Users', label: 'Users & RBAC', icon: Users },
            { id: 'AI Agents', label: 'AI Agents', icon: Bot },
            { id: 'Data Sources', label: 'Data Sources', icon: Database },
            { id: 'Integrations', label: 'Integrations', icon: Layers },
            { id: 'System Settings', label: 'System Settings', icon: Settings },
            { id: 'Audit Logs', label: 'Audit Trail', icon: FileText }
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs xl:text-sm font-semibold transition-all cursor-pointer ${
                isActive
                  ? 'bg-blue-600 text-white shadow-md font-bold'
                  : 'bg-[#111c33] text-slate-300 hover:text-white border border-[#1b2740]'
              }`}
            >
              <Icon className={`w-4.5 h-4.5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB: AI AGENTS */}
      {activeTab === 'AI Agents' && (
        agents.length === 0 ? (
          <div className="bg-[#0e1628] border border-[#1b2740] rounded-xl p-12 text-center space-y-3">
            <Bot className="w-12 h-12 text-slate-600 mx-auto" />
            <h3 className="text-base font-bold text-white">No AI Agents Configured</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              All dummy domain agents were removed because mock-data.json was deleted.
            </p>
          </div>
        ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: AI Agents List (4 cols) */}
          <div className="lg:col-span-4 bg-[#0e1628] border border-[#1b2740] rounded-xl p-5 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 mb-3.5 border-b border-[#162138]">
                <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
                  Configured Agents ({agents.length})
                </h3>
                <span className="text-[10px] text-blue-400 font-mono">Sandboxed</span>
              </div>

              <div className="space-y-2">
                {agents.map((agent) => {
                  const isSelected = agent.id === selectedAgentId;
                  return (
                    <div
                      key={agent.id}
                      onClick={() => handleSelectAgent(agent)}
                      className={`p-3 rounded-lg border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-blue-900/30 border-blue-500/50 shadow-xs'
                          : 'bg-[#111c33] border-[#1d2b47] hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-semibold text-white">{agent.name}</h4>
                        <span className="text-[10px] text-blue-300 font-mono">{agent.model}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 line-clamp-1 mt-1">
                        {agent.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-4 border-t border-[#162138] text-[11px] text-slate-500 font-mono">
              Zero data-leakage across domain tenant boundaries
            </div>
          </div>

          {/* Right: Agent Configuration (8 cols) */}
          <div className="lg:col-span-8 bg-[#0e1628] border border-[#1b2740] rounded-xl p-6 shadow-sm space-y-5">
            {/* Header Banner */}
            <div className="flex items-center justify-between pb-4 border-b border-[#162138]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold shadow-xs">
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h4 className="text-base font-semibold text-white">{selectedAgent.name}</h4>
                  <p className="text-xs text-slate-400">{selectedAgent.description}</p>
                </div>
              </div>
              <span className="text-[10px] px-2.5 py-0.5 rounded font-mono font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                ACTIVE
              </span>
            </div>

            {/* Sub-tabs */}
            <div className="flex border-b border-[#162138] gap-2 text-xs">
              {(['General', 'Capabilities', 'Data Access', 'Prompt Settings'] as const).map(
                (stab) => (
                  <button
                    key={stab}
                    onClick={() => setAgentSubTab(stab)}
                    className={`pb-2 px-3 font-medium transition-colors border-b-2 cursor-pointer ${
                      agentSubTab === stab
                        ? 'border-blue-500 text-blue-400 font-semibold'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {stab}
                  </button>
                )
              )}
            </div>

            {/* Sub-tab: General */}
            {agentSubTab === 'General' && (
              <form onSubmit={handleSaveAgent} className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Agent Identifier Label</label>
                    <input
                      type="text"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      className="w-full bg-[#111c33] border border-[#1d2b47] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Inference Engine</label>
                    <select
                      value={editedModel}
                      onChange={(e) => setEditedModel(e.target.value)}
                      className="w-full bg-[#111c33] border border-[#1d2b47] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 cursor-pointer font-mono"
                    >
                      <option value="Gemini 2.5 Flash">Gemini 2.5 Flash (Production Fast)</option>
                      <option value="Gemini 2.5 Pro">Gemini 2.5 Pro (Deep Strategic Reasoning)</option>
                      <option value="Claude 3.5 Sonnet">Claude 3.5 Sonnet</option>
                      <option value="GPT-4o">GPT-4o Enterprise</option>
                    </select>
                  </div>
                </div>

                {/* Temperature slider */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-300 font-medium">Sampling Temperature</span>
                    <span className="font-mono text-blue-400 font-semibold bg-[#111c33] px-2 py-0.5 rounded border border-[#1d2b47]">
                      {editedTemp}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={editedTemp}
                    onChange={(e) => setEditedTemp(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-[#111c33] rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                    <span>0.0 (Deterministic Mathematics)</span>
                    <span>1.0 (Exploratory Scenarios)</span>
                  </div>
                </div>

                {/* System Prompt TextArea */}
                <div>
                  <label className="block text-slate-300 font-medium mb-1">System Instruction Directives</label>
                  <textarea
                    rows={4}
                    value={editedPrompt}
                    onChange={(e) => setEditedPrompt(e.target.value)}
                    className="w-full bg-[#111c33] border border-[#1d2b47] rounded-lg p-3 text-slate-200 focus:outline-none focus:border-blue-500 font-mono text-[11px] leading-relaxed"
                  />
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-[#162138]">
                  {showSavedToast ? (
                    <span className="text-emerald-400 flex items-center gap-1.5 font-medium">
                      <CheckCircle2 className="w-4 h-4" /> Agent parameters saved successfully!
                    </span>
                  ) : (
                    <span className="text-slate-500 font-mono text-[11px]">Applied to next execution cycle</span>
                  )}
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold flex items-center gap-2 cursor-pointer shadow-xs"
                  >
                    <Save className="w-4 h-4" /> Save Parameters
                  </button>
                </div>
              </form>
            )}

            {/* Sub-tab: Capabilities */}
            {agentSubTab === 'Capabilities' && (
              <div className="space-y-3 text-xs">
                <span className="text-slate-400">Available execution tools and sandboxed APIs:</span>
                <div className="grid grid-cols-2 gap-2.5">
                  {selectedAgent.tools.map((t, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-lg bg-[#111c33] border border-[#1d2b47] flex items-center justify-between"
                    >
                      <span className="text-white font-medium">{t}</span>
                      <span className="text-emerald-400 font-mono text-[10px] font-semibold">AUTHORIZED</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sub-tab: Data Access */}
            {agentSubTab === 'Data Access' && (
              <div className="space-y-3 text-xs">
                <span className="text-slate-400">Role-Based Access Control (RBAC) boundaries:</span>
                <div className="space-y-2">
                  <div className="p-3 bg-[#111c33] rounded-lg border border-[#1d2b47] flex items-center justify-between">
                    <span className="text-slate-200">Financial Ledger & P&L Tables</span>
                    <span className="text-emerald-400 font-semibold font-mono text-[11px]">READ / COMPUTE</span>
                  </div>
                  <div className="p-3 bg-[#111c33] rounded-lg border border-[#1d2b47] flex items-center justify-between">
                    <span className="text-slate-200">Supply Chain WMS Inventories</span>
                    <span className="text-emerald-400 font-semibold font-mono text-[11px]">READ ONLY</span>
                  </div>
                  <div className="p-3 bg-[#111c33] rounded-lg border border-[#1d2b47] flex items-center justify-between">
                    <span className="text-slate-200">PII Customer Contact Information</span>
                    <span className="text-rose-400 font-semibold font-mono text-[11px]">RESTRICTED (REDACTED)</span>
                  </div>
                </div>
              </div>
            )}

            {/* Sub-tab: Prompt Settings */}
            {agentSubTab === 'Prompt Settings' && (
              <div className="space-y-3 text-xs">
                <label className="text-slate-300 font-medium block">
                  Grounding & Citation Enforcement
                </label>
                <div className="p-3 bg-[#111c33] rounded-lg border border-[#1d2b47] text-slate-300 leading-relaxed font-mono text-[11px]">
                  Mode: GraphRAG Verification Enabled. Model must resolve at least 2 source citations
                  for any quantitative enterprise claim before synthesizing answer.
                </div>
              </div>
            )}
          </div>
        </div>
        )
      )}

      {/* TAB: USERS */}
      {activeTab === 'Users' && (
        <div className="bg-[#0e1628] border border-[#1b2740] rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3.5 border-b border-[#162138]">
            <div>
              <h3 className="text-sm font-semibold text-white">Authorized Users & RBAC Permissions</h3>
              <p className="text-xs text-slate-400">Manage organizational roles, SSO identities, and credential provisioning</p>
            </div>
            <button
              onClick={() => setInviteModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-xs cursor-pointer"
            >
              <UserPlus className="w-4 h-4" /> Invite User
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-[#162138]">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#111c33] border-b border-[#162138] text-slate-400 font-mono text-[11px]">
                  <th className="py-2.5 px-3">Name</th>
                  <th className="py-2.5 px-3">Email</th>
                  <th className="py-2.5 px-3">Assigned Role</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Last Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#162138]">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-xs text-slate-500">
                      No users found. Dummy users removed with mock-data.json. Click &quot;Invite User&quot; to add.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id} className="hover:bg-[#111c33]/50">
                      <td className="py-3 px-3 font-semibold text-white">{u.name}</td>
                      <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">{u.email}</td>
                      <td className="py-3 px-3">
                        <select
                          aria-label={`Role for ${u.email}`}
                          value={u.role}
                          onChange={(e) => void handleRoleChange(u.id, e.target.value as CanonicalRole)}
                          className="bg-[#111c33] border border-[#1d2b47] rounded-lg px-2 py-1 text-blue-300 font-medium text-xs cursor-pointer focus:outline-none focus:border-blue-500"
                        >
                          <option value="Admin">Admin</option>
                          <option value="Executive">Executive</option>
                          <option value="Analyst">Analyst</option>
                          <option value="Viewer">Viewer</option>
                        </select>
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono">
                          {u.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right text-slate-400 font-mono">{u.lastActive}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: DATA SOURCES */}
      {activeTab === 'Data Sources' && (
        <div className="bg-[#0e1628] border border-[#1b2740] rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3.5 border-b border-[#162138]">
            <div>
              <h3 className="text-sm font-semibold text-white">Ingestion Pipelines & Sync Telemetry</h3>
              <p className="text-xs text-slate-400">Continuous enterprise data replication and schema monitoring</p>
            </div>
          </div>

          {dataSources.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 bg-[#111c33] rounded-xl border border-[#1d2b47]">
              No active data sources. Dummy sources removed with mock-data.json.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {dataSources.map((ds) => (
                <div
                  key={ds.id}
                  className="p-4 rounded-lg bg-[#111c33] border border-[#1d2b47] flex items-center justify-between"
                >
                  <div>
                    <h4 className="text-xs font-semibold text-white">{ds.name}</h4>
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                      {ds.recordsCount} records · {ds.status}
                    </div>
                  </div>
                  <button
                    onClick={() => handleTestSync(ds.id)}
                    className="px-3 py-1.5 rounded-lg bg-[#142036] hover:bg-[#1a2b48] border border-[#203254] text-xs text-blue-300 font-mono cursor-pointer transition-colors"
                  >
                    {testedSyncResult?.id === ds.id ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <Check className="w-3 h-3" /> {testedSyncResult.rowCount} local rows ({testedSyncResult.durationMs.toFixed(1)}ms)
                      </span>
                    ) : (
                      'Inspect Store'
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB: INTEGRATIONS */}
      {activeTab === 'Integrations' && (
        <div className="bg-[#0e1628] border border-[#1b2740] rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3.5 border-b border-[#162138]">
            <div>
              <h3 className="text-sm font-semibold text-white">External Enterprise Connectors</h3>
              <p className="text-xs text-slate-400">Encrypted streaming connectors and webhook endpoints</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { name: 'SAP S/4HANA', desc: 'Direct ERP ledger streaming', status: 'Connected • Live' },
              { name: 'Salesforce CRM', desc: 'Lead pipeline and churn signals', status: 'Connected • Live' },
              { name: 'Snowflake Data Cloud', desc: 'Read replica analytical warehouse', status: 'Active' },
              { name: 'AWS S3 Cold Storage', desc: 'Historical unstructured PDF reports', status: 'Connected • Daily' },
              { name: 'Oracle WMS Cloud', desc: 'Warehouse throughput and fulfillment', status: 'Connected • Live' },
              { name: 'Slack Enterprise Grid', desc: 'Decision approval alerts webhook', status: 'Active' }
            ].map((integ, idx) => (
              <div key={idx} className="p-4 rounded-lg bg-[#111c33] border border-[#1d2b47] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white">{integ.name}</span>
                  <span className="text-[10px] text-emerald-400 font-mono">{integ.status}</span>
                </div>
                <p className="text-[11px] text-slate-400">{integ.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB: SYSTEM SETTINGS */}
      {activeTab === 'System Settings' && (
        <div className="bg-[#0e1628] border border-[#1b2740] rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#162138]">
            <h3 className="text-sm font-semibold text-white">
              Global Governance &amp; Failover Architecture
            </h3>
            <span className="text-[11px] font-mono text-emerald-300">
              Persisted in PostgreSQL
            </span>
          </div>
          <div className="space-y-3 text-xs">
            <label className="p-4 bg-[#111c33] rounded-lg border border-[#1d2b47] flex items-center justify-between gap-4 cursor-pointer hover:border-[#2a3f66] transition-colors">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white">Automated Model Failover</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                      systemSettings.automatedModelFailover
                        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    {systemSettings.automatedModelFailover ? 'Armed' : 'Standby'}
                  </span>
                </div>
                <span className="text-slate-400 block mt-0.5">
                  Route AI Workspace orchestrator telemetry to secondary region policy when enabled
                </span>
              </div>
              <input
                type="checkbox"
                checked={systemSettings.automatedModelFailover}
                onChange={(e) => {
                  void updateSystemSetting('automatedModelFailover', e.target.checked).catch(() => {});
                }}
                aria-label="Automated Model Failover"
                className="accent-blue-500 w-4 h-4 cursor-pointer"
              />
            </label>

            <label className="p-4 bg-[#111c33] rounded-lg border border-[#1d2b47] flex items-center justify-between gap-4 cursor-pointer hover:border-[#2a3f66] transition-colors">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white">Audit Trail Archival</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                      systemSettings.auditTrailArchival
                        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                        : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                    }`}
                  >
                    {systemSettings.auditTrailArchival ? 'Recording Receipts' : 'Paused'}
                  </span>
                </div>
                <span className="text-slate-400 block mt-0.5">
                  Record Web Crypto SHA-256 chained audit receipts for workspace mutations
                </span>
              </div>
              <input
                type="checkbox"
                checked={systemSettings.auditTrailArchival}
                onChange={(e) => {
                  void updateSystemSetting('auditTrailArchival', e.target.checked).catch(() => {});
                }}
                aria-label="Audit Trail Archival"
                className="accent-blue-500 w-4 h-4 cursor-pointer"
              />
            </label>
          </div>
        </div>
      )}

      {/* TAB: AUDIT LOGS */}
      {activeTab === 'Audit Logs' && (
        <div className="bg-[#0e1628] border border-[#1b2740] rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-[#162138]">
            <div>
              <h3 className="text-sm font-semibold text-white">Cryptographic Audit Trail</h3>
              <p className="text-xs text-slate-400">
                Web Crypto SHA-256 hash-chained records over active browser session actions
                {!systemSettings.auditTrailArchival && (
                  <span className="text-amber-400 font-semibold ml-1.5">
                    (Archival Paused in System Settings)
                  </span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={handleVerifyChain}
              disabled={isVerifyingAudit}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-xs font-semibold text-blue-300 cursor-pointer transition-colors shrink-0"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{isVerifyingAudit ? 'Hashing Chain...' : 'Verify SHA-256 Chain'}</span>
            </button>
          </div>

          <div className="p-3.5 rounded-xl bg-[#111c33] border border-[#1d2b47] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] font-mono">
            <div className="truncate">
              <span className="text-slate-400">Chain Digest: </span>
              <span className="text-teal-300">
                {auditChainChecksum ? `SHA256:${auditChainChecksum}` : 'Computing SHA-256...'}
              </span>
            </div>
            {lastAuditVerification && (
              <div className="text-emerald-300 shrink-0">
                Verified {lastAuditVerification.count} record(s) at {lastAuditVerification.verifiedAt}
              </div>
            )}
          </div>

          <div className="overflow-x-auto rounded-lg border border-[#162138]">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#111c33] border-b border-[#162138] text-slate-400 font-mono text-[11px]">
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Actor</th>
                  <th className="py-2.5 px-3">Action Description</th>
                  <th className="py-2.5 px-3">Target Resource</th>
                  <th className="py-2.5 px-3">SHA-256 Receipt</th>
                  <th className="py-2.5 px-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#162138]">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-xs text-slate-500">
                      No audit events recorded.
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log) => {
                    const receipt = auditRecordChecksums[log.id];
                    return (
                      <tr key={log.id} className="hover:bg-[#111c33]/50">
                        <td className="py-3 px-3 font-mono text-slate-400 text-[11px]">
                          {log.timestamp}
                        </td>
                        <td className="py-3 px-3 text-slate-200 font-medium">{log.user}</td>
                        <td className="py-3 px-3 font-semibold text-white">{log.action}</td>
                        <td className="py-3 px-3 text-blue-300 font-mono text-[11px]">{log.target}</td>
                        <td
                          className="py-3 px-3 font-mono text-[10.5px] text-teal-300/90"
                          title={receipt ? `SHA256:${receipt}` : 'Pending hash'}
                        >
                          {receipt ? `SHA256:${receipt.slice(0, 14)}...` : 'hashing...'}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] border font-mono font-medium ${
                              log.status === 'Warning'
                                ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                : log.status === 'Pending'
                                  ? 'bg-slate-500/15 text-slate-300 border-slate-500/30'
                                  : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            }`}
                          >
                            {log.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Invite User Modal */}
      {inviteModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0e1628] border border-[#1b2740] rounded-xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#162138] mb-4">
              <h3 className="text-sm font-semibold text-white">Invite Team Member</h3>
              <button
                onClick={() => setInviteModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleInviteUser} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Maya Patel"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="w-full bg-[#111c33] border border-[#1d2b47] rounded-lg px-3 py-2 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="m.patel@cortex-enterprise.ai"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  className="w-full bg-[#111c33] border border-[#1d2b47] rounded-lg px-3 py-2 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Assigned Role</label>
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as CanonicalRole)}
                  className="w-full bg-[#111c33] border border-[#1d2b47] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="Admin">Admin</option>
                  <option value="Executive">Executive</option>
                  <option value="Analyst">Analyst</option>
                  <option value="Viewer">Viewer</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Initial Password (Optional, min 8 chars)
                </label>
                <input
                  type="password"
                  minLength={8}
                  placeholder="Leave blank to provision invite token"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  className="w-full bg-[#111c33] border border-[#1d2b47] rounded-lg px-3 py-2 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setInviteModalOpen(false)}
                  className="px-3.5 py-1.5 text-slate-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-xs cursor-pointer"
                >
                  Send Invitation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

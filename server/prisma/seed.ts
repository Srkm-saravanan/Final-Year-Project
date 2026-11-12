import { PrismaClient, Prisma } from '@prisma/client';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverDir = path.resolve(__dirname, '..');
const rootDir = path.resolve(serverDir, '..');

dotenv.config({ path: path.resolve(rootDir, '.env') });
dotenv.config({ path: path.resolve(serverDir, '.env') });

const prisma = new PrismaClient();

const PERMISSIONS: { key: string; description: string }[] = [
  { key: 'dashboard:read', description: 'Read executive KPIs, trends, forecasts, and slides' },
  { key: 'datasets:read', description: 'Read data sources, sales records, and custom datasets' },
  { key: 'datasets:write', description: 'Create data sources and ingest dataset records/CSVs' },
  { key: 'scenarios:read', description: 'Read saved scenarios and baseline parameters' },
  { key: 'scenarios:write', description: 'Create and update scenarios' },
  { key: 'scenarios:delete', description: 'Delete saved scenarios' },
  { key: 'recommendations:read', description: 'Read strategic recommendations' },
  { key: 'recommendations:update_status', description: 'Approve, reject, or update recommendation status' },
  { key: 'audit:read', description: 'Read governance audit logs' },
  { key: 'settings:read', description: 'Read platform system settings' },
  { key: 'settings:write', description: 'Modify platform governance & failover settings' },
  { key: 'users:read', description: 'List platform user accounts and roles' },
  { key: 'users:create', description: 'Invite or provision new user accounts' },
  { key: 'users:update_role', description: 'Modify assigned user RBAC roles' },
  { key: 'agents:write', description: 'Modify AI agent metadata configurations' },
];

const ROLE_DEFINITIONS: Record<
  'Admin' | 'Analyst' | 'Executive' | 'Viewer',
  { description: string; permissions: string[] }
> = {
  Admin: {
    description: 'Full platform governance, user/RBAC management, settings, datasets, and decisions',
    permissions: PERMISSIONS.map((p) => p.key),
  },
  Executive: {
    description: 'Executive oversight, decision approvals, scenario modeling, and audit visibility',
    permissions: [
      'dashboard:read',
      'datasets:read',
      'scenarios:read',
      'scenarios:write',
      'scenarios:delete',
      'recommendations:read',
      'recommendations:update_status',
      'audit:read',
      'settings:read',
    ],
  },
  Analyst: {
    description: 'Data ingestion, dataset profiling, and financial scenario modeling',
    permissions: [
      'dashboard:read',
      'datasets:read',
      'datasets:write',
      'scenarios:read',
      'scenarios:write',
      'scenarios:delete',
      'recommendations:read',
      'settings:read',
    ],
  },
  Viewer: {
    description: 'Read-only access to dashboards, datasets, scenarios, and recommendations',
    permissions: [
      'dashboard:read',
      'datasets:read',
      'scenarios:read',
      'recommendations:read',
      'settings:read',
    ],
  },
};

function mapMockRoleToCanonical(mockRole: string): 'Admin' | 'Analyst' | 'Executive' | 'Viewer' {
  switch (mockRole) {
    case 'Administrator':
    case 'Admin':
      return 'Admin';
    case 'Data Analyst':
    case 'Analyst':
      return 'Analyst';
    case 'Business Manager':
    case 'Strategy Lead':
    case 'Executive':
      return 'Executive';
    default:
      return 'Viewer';
  }
}

interface MockDatasetShape {
  metrics: {
    id: string;
    label: string;
    value: string;
    change: string;
    isPositive: boolean;
    history: number[];
    numericValue: number;
    unit: string;
  }[];
  insights: {
    id: string;
    title: string;
    description: string;
    type: string;
    tag?: string;
  }[];
  topOpportunities: {
    id: string;
    title: string;
    benefit: string;
    route: string;
  }[];
  keyRisks: {
    id: string;
    title: string;
    level: string;
    action: string;
  }[];
  recentRecommendations: {
    id: string;
    title: string;
    impact: string;
    date: string;
  }[];
  dataSources: {
    id: string;
    name: string;
    type: string;
    status: string;
    recordsCount: string;
    lastUpdated: string;
    category: string;
  }[];
  salesRecords: {
    id: string;
    date: string;
    region: string;
    product: string;
    category: string;
    quantity: number;
    revenue: number;
  }[];
  agents: {
    id: string;
    name: string;
    role: string;
    description: string;
    iconName: string;
    model: string;
    temperature: number;
    status: string;
    tools: string[];
    systemPrompt: string;
  }[];
  chatSessions: {
    id: string;
    title: string;
    date: string;
    messages: {
      id: string;
      sender: string;
      content: string;
      timestamp: string;
      agentBreakdowns?: { agentName: string; agentRole: string; finding: string }[];
      sources?: string[];
      recommendations?: string[];
    }[];
  }[];
  knowledgeGraph: {
    nodes: {
      id: string;
      label: string;
      type: string;
      category: string;
      x?: number;
      y?: number;
      vx?: number;
      vy?: number;
      description?: string;
      revenue?: string;
      employees?: string;
      industry?: string;
      locations?: number;
      keyProducts?: string[];
      downstreamImpact?: string[];
      connectedIds: string[];
    }[];
    edges: {
      id: string;
      source: string;
      target: string;
      relationship: string;
    }[];
  };
  recommendations: {
    id: string;
    priority: string;
    title: string;
    expectedImpact: string;
    confidence: number;
    category: string;
    status: string;
    timeHorizon: string;
    evidence: string[];
    rationale: string;
    risks: string;
  }[];
  auditLogs: {
    id: string;
    timestamp: string;
    user: string;
    action: string;
    target: string;
    status: string;
  }[];
  users: {
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
    lastActive: string;
  }[];
  trends: {
    monthly: { label: string; rev: number; profit: number }[];
    quarterly: { label: string; rev: number; profit: number }[];
  };
  forecasts: {
    historicalPoints: { label: string; val: number }[];
    forecastPoints: { label: string; val: number; low: number; high: number }[];
    driverWeights: { label: string; lift: string; width: string }[];
  };
  slides: {
    id: number;
    title: string;
    category: string;
    subtitle: string;
    layoutTip: string;
    content: string[];
    tableData?: { headers: string[]; rows: string[][] };
    asciiDiagram?: string;
    speakerScript: string;
  }[];
}

async function seed(): Promise<void> {
  const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const adminName = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || 'Platform Administrator';
  const defaultSeedPassword = process.env.SEED_DEFAULT_USER_PASSWORD || adminPassword;

  if (!adminEmail || !adminPassword || !defaultSeedPassword) {
    throw new Error(
      'BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD must be configured in .env before seeding.'
    );
  }

  const mockDataPath = path.resolve(rootDir, 'mock-data.json');
  const rawJson = fs.readFileSync(mockDataPath, 'utf-8');
  const mockData = JSON.parse(rawJson) as MockDatasetShape;

  // 1. Seed Permissions
  const permissionMap = new Map<string, string>();
  for (const perm of PERMISSIONS) {
    const record = await prisma.permission.upsert({
      where: { key: perm.key },
      create: { key: perm.key, description: perm.description },
      update: { description: perm.description },
    });
    permissionMap.set(record.key, record.id);
  }

  // 2. Seed Roles and sync RolePermissions idempotently
  const roleMap = new Map<string, string>();
  for (const [roleName, def] of Object.entries(ROLE_DEFINITIONS)) {
    const roleRecord = await prisma.role.upsert({
      where: { name: roleName },
      create: { name: roleName, description: def.description },
      update: { description: def.description },
    });
    roleMap.set(roleRecord.name, roleRecord.id);

    const desiredPermissionIds = def.permissions
      .map((k) => permissionMap.get(k))
      .filter((id): id is string => Boolean(id));

    await prisma.rolePermission.deleteMany({
      where: {
        roleId: roleRecord.id,
        permissionId: { notIn: desiredPermissionIds },
      },
    });

    for (const permissionId of desiredPermissionIds) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: roleRecord.id, permissionId },
        },
        create: { roleId: roleRecord.id, permissionId },
        update: {},
      });
    }
  }

  // 3. Seed Bootstrap Admin & CORTEX Users
  const adminPasswordHash = await bcrypt.hash(adminPassword, 10);
  const seedUserPasswordHash = await bcrypt.hash(defaultSeedPassword, 10);

  const bootstrapAdmin = await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      id: 'u-bootstrap-admin',
      name: adminName,
      email: adminEmail,
      passwordHash: adminPasswordHash,
      roleId: roleMap.get('Admin')!,
      status: 'Active',
      lastActiveLabel: 'Bootstrap Ready',
    },
    update: {
      name: adminName,
      passwordHash: adminPasswordHash,
      roleId: roleMap.get('Admin')!,
    },
  });

  const seededUserIdsByName = new Map<string, string>();
  for (const u of mockData.users) {
    const canonicalRole = mapMockRoleToCanonical(u.role);
    const emailNormalized = u.email.trim().toLowerCase();
    const record = await prisma.user.upsert({
      where: { id: u.id },
      create: {
        id: u.id,
        name: u.name,
        email: emailNormalized,
        passwordHash: seedUserPasswordHash,
        roleId: roleMap.get(canonicalRole)!,
        status: u.status,
        lastActiveLabel: u.lastActive,
      },
      update: {
        name: u.name,
        email: emailNormalized,
      },
    });
    seededUserIdsByName.set(u.name, record.id);
  }

  // Ensure an active Viewer role account exists for verification and observer sign-ins
  await prisma.user.upsert({
    where: { id: 'u-viewer' },
    create: {
      id: 'u-viewer',
      name: 'Kiran Nair',
      email: 'viewer@cortex-enterprise.ai',
      passwordHash: seedUserPasswordHash,
      roleId: roleMap.get('Viewer')!,
      status: 'Active',
      lastActiveLabel: 'Read-only observer',
    },
    update: {
      name: 'Kiran Nair',
      email: 'viewer@cortex-enterprise.ai',
    },
  });

  // 4. Seed System Settings singleton (preserve runtime edits on repeated seed)
  await prisma.systemSetting.upsert({
    where: { id: 'global' },
    create: {
      id: 'global',
      automatedModelFailover: true,
      auditTrailArchival: true,
      updatedById: bootstrapAdmin.id,
    },
    update: {},
  });

  // 5. Seed Data Sources and Sales Records
  for (const ds of mockData.dataSources) {
    await prisma.dataSource.upsert({
      where: { id: ds.id },
      create: {
        id: ds.id,
        name: ds.name,
        type: ds.type,
        status: ds.status,
        recordsCount: ds.recordsCount,
        lastUpdated: ds.lastUpdated,
        category: ds.category,
        columns: [],
        createdById: bootstrapAdmin.id,
      },
      update: {
        name: ds.name,
        type: ds.type,
        category: ds.category,
      },
    });
  }

  for (const sr of mockData.salesRecords) {
    await prisma.salesRecord.upsert({
      where: { id: sr.id },
      create: {
        id: sr.id,
        dataSourceId: 'ds-sales',
        date: sr.date,
        region: sr.region,
        product: sr.product,
        category: sr.category,
        quantity: sr.quantity,
        revenue: sr.revenue,
      },
      update: {
        date: sr.date,
        region: sr.region,
        product: sr.product,
        category: sr.category,
        quantity: sr.quantity,
        revenue: sr.revenue,
      },
    });
  }

  // 6. Seed AI Agents (preserve config overrides if already seeded)
  for (const agent of mockData.agents) {
    await prisma.aiAgent.upsert({
      where: { id: agent.id },
      create: {
        id: agent.id,
        name: agent.name,
        role: agent.role,
        description: agent.description,
        iconName: agent.iconName,
        model: agent.model,
        temperature: agent.temperature,
        status: agent.status,
        tools: agent.tools,
        systemPrompt: agent.systemPrompt,
      },
      update: {
        role: agent.role,
        description: agent.description,
        iconName: agent.iconName,
        tools: agent.tools,
      },
    });
  }

  // 7. Seed Chat Sessions and Messages
  const defaultChatOwnerId = seededUserIdsByName.get('Sri Ramar') ?? bootstrapAdmin.id;
  for (const session of mockData.chatSessions) {
    await prisma.chatSession.upsert({
      where: { id: session.id },
      create: {
        id: session.id,
        title: session.title,
        dateLabel: session.date,
        ownerId: defaultChatOwnerId,
      },
      update: {
        title: session.title,
        dateLabel: session.date,
      },
    });

    for (let idx = 0; idx < session.messages.length; idx++) {
      const msg = session.messages[idx]!;
      const uniqueMsgId = `${session.id}:${msg.id}`;
      await prisma.chatMessage.upsert({
        where: { id: uniqueMsgId },
        create: {
          id: uniqueMsgId,
          sessionId: session.id,
          sequence: idx,
          sender: msg.sender,
          content: msg.content,
          timestampLabel: msg.timestamp,
          agentBreakdowns: msg.agentBreakdowns
            ? (msg.agentBreakdowns as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          sources: msg.sources ?? [],
          recommendations: msg.recommendations ?? [],
        },
        update: {
          content: msg.content,
          timestampLabel: msg.timestamp,
        },
      });
    }
  }

  // 8. Seed Knowledge Graph Nodes first, then Edges (foreign keys)
  for (const node of mockData.knowledgeGraph.nodes) {
    await prisma.knowledgeGraphNode.upsert({
      where: { id: node.id },
      create: {
        id: node.id,
        label: node.label,
        type: node.type,
        category: node.category,
        x: node.x ?? null,
        y: node.y ?? null,
        vx: node.vx ?? null,
        vy: node.vy ?? null,
        description: node.description ?? null,
        revenue: node.revenue ?? null,
        employees: node.employees ?? null,
        industry: node.industry ?? null,
        locations: node.locations ?? null,
        keyProducts: node.keyProducts ?? [],
        downstreamImpact: node.downstreamImpact ?? [],
        connectedIds: node.connectedIds ?? [],
      },
      update: {
        label: node.label,
        type: node.type,
        category: node.category,
        description: node.description ?? null,
        connectedIds: node.connectedIds ?? [],
      },
    });
  }

  for (const edge of mockData.knowledgeGraph.edges) {
    await prisma.knowledgeGraphEdge.upsert({
      where: { id: edge.id },
      create: {
        id: edge.id,
        sourceId: edge.source,
        targetId: edge.target,
        relationship: edge.relationship,
      },
      update: {
        sourceId: edge.source,
        targetId: edge.target,
        relationship: edge.relationship,
      },
    });
  }

  // 9. Seed Recommendations (preserve user status transitions on re-seed)
  for (const rec of mockData.recommendations) {
    await prisma.recommendation.upsert({
      where: { id: rec.id },
      create: {
        id: rec.id,
        priority: rec.priority,
        title: rec.title,
        expectedImpact: rec.expectedImpact,
        confidence: rec.confidence,
        category: rec.category,
        status: rec.status,
        timeHorizon: rec.timeHorizon,
        evidence: rec.evidence,
        rationale: rec.rationale,
        risks: rec.risks,
      },
      update: {
        priority: rec.priority,
        title: rec.title,
        expectedImpact: rec.expectedImpact,
        confidence: rec.confidence,
        category: rec.category,
        timeHorizon: rec.timeHorizon,
        evidence: rec.evidence,
        rationale: rec.rationale,
        risks: rec.risks,
      },
    });
  }

  // 10. Seed Initial Scenarios (preserving user scenarios across re-seeds)
  const baselineRev = 124.3;
  const defaultScenarios = [
    {
      id: 'sc-default-premium',
      name: 'Premium Price Expansion (+8%)',
      timestampLabel: 'Oct 8, 2026',
      priceChange: 8,
      marketingBudget: 18,
      productionVolume: 12,
      staffingLevel: 'No Change',
      kpiRevenue: 138.6,
      kpiProfit: 17.5,
      kpiProfitMargin: 12.6,
      kpiMarketShare: 18.8,
      kpiRoi: 112.4,
      outlook: 'Positive Outlook (+0.7 Cr Net Gain)',
    },
    {
      id: 'sc-default-volume',
      name: 'Aggressive Volume Growth (-5% Price)',
      timestampLabel: 'Oct 9, 2026',
      priceChange: -5,
      marketingBudget: 24,
      productionVolume: 20,
      staffingLevel: '+5%',
      kpiRevenue: 141.7,
      kpiProfit: 11.7,
      kpiProfitMargin: 8.3,
      kpiMarketShare: 19.6,
      kpiRoi: 85.4,
      outlook: 'Neutral / Caution (-5.1 Cr vs Baseline)',
    },
  ];
  for (const sc of defaultScenarios) {
    await prisma.savedScenario.upsert({
      where: { id: sc.id },
      create: {
        ...sc,
        createdById: defaultChatOwnerId,
      },
      update: {},
    });
  }
  void baselineRev;

  // 11. Seed Audit Logs
  for (const log of mockData.auditLogs) {
    const matchedActorId = seededUserIdsByName.get(log.user) ?? null;
    await prisma.auditLog.upsert({
      where: { id: log.id },
      create: {
        id: log.id,
        timestampLabel: log.timestamp,
        actorUserId: matchedActorId,
        userName: log.user,
        action: log.action,
        target: log.target,
        status: log.status,
      },
      update: {},
    });
  }

  // 12. Seed Executive Overview, Trends, Forecasts, and Presentation Slides
  for (let i = 0; i < mockData.metrics.length; i++) {
    const m = mockData.metrics[i]!;
    await prisma.dashboardMetric.upsert({
      where: { id: m.id },
      create: { ...m, sortOrder: i },
      update: { ...m, sortOrder: i },
    });
  }

  for (let i = 0; i < mockData.insights.length; i++) {
    const item = mockData.insights[i]!;
    await prisma.executiveInsight.upsert({
      where: { id: item.id },
      create: {
        id: item.id,
        sortOrder: i,
        title: item.title,
        description: item.description,
        type: item.type,
        tag: item.tag ?? null,
      },
      update: {
        sortOrder: i,
        title: item.title,
        description: item.description,
        type: item.type,
        tag: item.tag ?? null,
      },
    });
  }

  for (let i = 0; i < mockData.topOpportunities.length; i++) {
    const opp = mockData.topOpportunities[i]!;
    await prisma.topOpportunity.upsert({
      where: { id: opp.id },
      create: { ...opp, sortOrder: i },
      update: { ...opp, sortOrder: i },
    });
  }

  for (let i = 0; i < mockData.keyRisks.length; i++) {
    const risk = mockData.keyRisks[i]!;
    await prisma.keyRisk.upsert({
      where: { id: risk.id },
      create: { ...risk, sortOrder: i },
      update: { ...risk, sortOrder: i },
    });
  }

  for (let i = 0; i < mockData.recentRecommendations.length; i++) {
    const rec = mockData.recentRecommendations[i]!;
    await prisma.recentRecommendation.upsert({
      where: { id: rec.id },
      create: { ...rec, sortOrder: i },
      update: { ...rec, sortOrder: i },
    });
  }

  for (let i = 0; i < mockData.trends.monthly.length; i++) {
    const pt = mockData.trends.monthly[i]!;
    await prisma.trendRecord.upsert({
      where: { id: `monthly-${i}` },
      create: {
        id: `monthly-${i}`,
        granularity: 'monthly',
        sortOrder: i,
        label: pt.label,
        rev: pt.rev,
        profit: pt.profit,
      },
      update: { label: pt.label, rev: pt.rev, profit: pt.profit, sortOrder: i },
    });
  }

  for (let i = 0; i < mockData.trends.quarterly.length; i++) {
    const pt = mockData.trends.quarterly[i]!;
    await prisma.trendRecord.upsert({
      where: { id: `quarterly-${i}` },
      create: {
        id: `quarterly-${i}`,
        granularity: 'quarterly',
        sortOrder: i,
        label: pt.label,
        rev: pt.rev,
        profit: pt.profit,
      },
      update: { label: pt.label, rev: pt.rev, profit: pt.profit, sortOrder: i },
    });
  }

  for (let i = 0; i < mockData.forecasts.historicalPoints.length; i++) {
    const pt = mockData.forecasts.historicalPoints[i]!;
    await prisma.forecastPoint.upsert({
      where: { id: `hist-${i}` },
      create: { id: `hist-${i}`, kind: 'historical', sortOrder: i, label: pt.label, val: pt.val },
      update: { label: pt.label, val: pt.val, sortOrder: i },
    });
  }

  for (let i = 0; i < mockData.forecasts.forecastPoints.length; i++) {
    const pt = mockData.forecasts.forecastPoints[i]!;
    await prisma.forecastPoint.upsert({
      where: { id: `proj-${i}` },
      create: {
        id: `proj-${i}`,
        kind: 'projected',
        sortOrder: i,
        label: pt.label,
        val: pt.val,
        low: pt.low,
        high: pt.high,
      },
      update: { label: pt.label, val: pt.val, low: pt.low, high: pt.high, sortOrder: i },
    });
  }

  for (let i = 0; i < mockData.forecasts.driverWeights.length; i++) {
    const drv = mockData.forecasts.driverWeights[i]!;
    await prisma.forecastDriver.upsert({
      where: { id: `drv-${i}` },
      create: { id: `drv-${i}`, sortOrder: i, label: drv.label, lift: drv.lift, width: drv.width },
      update: { label: drv.label, lift: drv.lift, width: drv.width, sortOrder: i },
    });
  }

  for (const slide of mockData.slides) {
    await prisma.presentationSlide.upsert({
      where: { id: slide.id },
      create: {
        id: slide.id,
        title: slide.title,
        category: slide.category,
        subtitle: slide.subtitle,
        layoutTip: slide.layoutTip,
        content: slide.content,
        tableData: slide.tableData ? (slide.tableData as Prisma.InputJsonValue) : Prisma.JsonNull,
        asciiDiagram: slide.asciiDiagram ?? null,
        speakerScript: slide.speakerScript,
      },
      update: {
        title: slide.title,
        category: slide.category,
        subtitle: slide.subtitle,
        layoutTip: slide.layoutTip,
        content: slide.content,
        tableData: slide.tableData ? (slide.tableData as Prisma.InputJsonValue) : Prisma.JsonNull,
        asciiDiagram: slide.asciiDiagram ?? null,
        speakerScript: slide.speakerScript,
      },
    });
  }

  console.log('Seed completed cleanly: roles, permissions, users, enterprise data, and telemetry.');
}

seed()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


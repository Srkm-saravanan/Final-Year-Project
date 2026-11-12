import { Router } from 'express';
import { prisma } from '../db/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requirePermission } from '../middleware/rbac.js';
import { sendSuccess } from '../utils/response.js';

const router = Router();

router.use(authenticate, requirePermission('dashboard:read'));

router.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const [
      metrics,
      insights,
      topOpportunities,
      keyRisks,
      recentRecommendations,
      forecastPoints,
      forecastDrivers,
      slides,
      agents,
      chatSessions,
      graphNodes,
      graphEdges,
    ] = await Promise.all([
      prisma.dashboardMetric.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.executiveInsight.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.topOpportunity.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.keyRisk.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.recentRecommendation.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.forecastPoint.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.forecastDriver.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.presentationSlide.findMany({ orderBy: { id: 'asc' } }),
      prisma.aiAgent.findMany({ orderBy: { id: 'asc' } }),
      prisma.chatSession.findMany({
        orderBy: { createdAt: 'asc' },
        include: { messages: { orderBy: { sequence: 'asc' } } },
      }),
      prisma.knowledgeGraphNode.findMany({ orderBy: { id: 'asc' } }),
      prisma.knowledgeGraphEdge.findMany({ orderBy: { id: 'asc' } }),
    ]);

    const historicalPoints = forecastPoints
      .filter((pt) => pt.kind === 'historical')
      .map((pt) => ({ label: pt.label, val: pt.val }));

    const projectedPoints = forecastPoints
      .filter((pt) => pt.kind === 'projected')
      .map((pt) => ({
        label: pt.label,
        val: pt.val,
        low: pt.low ?? pt.val,
        high: pt.high ?? pt.val,
      }));

    sendSuccess(res, {
      metrics: metrics.map(({ sortOrder: _s, updatedAt: _u, ...rest }) => rest),
      insights: insights.map(({ sortOrder: _s, tag, ...rest }) => ({
        ...rest,
        ...(tag ? { tag } : {}),
      })),
      topOpportunities: topOpportunities.map(({ sortOrder: _s, ...rest }) => rest),
      keyRisks: keyRisks.map(({ sortOrder: _s, ...rest }) => rest),
      recentRecommendations: recentRecommendations.map(({ sortOrder: _s, ...rest }) => rest),
      forecasts: {
        historicalPoints,
        forecastPoints: projectedPoints,
        driverWeights: forecastDrivers.map(({ label, lift, width }) => ({ label, lift, width })),
      },
      slides: slides.map((s) => ({
        id: s.id,
        title: s.title,
        category: s.category,
        subtitle: s.subtitle,
        layoutTip: s.layoutTip,
        content: s.content,
        ...(s.tableData ? { tableData: s.tableData } : {}),
        ...(s.asciiDiagram ? { asciiDiagram: s.asciiDiagram } : {}),
        speakerScript: s.speakerScript,
      })),
      agents: agents.map(({ createdAt: _c, updatedAt: _u, ...rest }) => rest),
      chatSessions: chatSessions.map((session) => ({
        id: session.id,
        title: session.title,
        date: session.dateLabel,
        messages: session.messages.map((m) => ({
          id: m.id,
          sender: m.sender,
          content: m.content,
          timestamp: m.timestampLabel,
          ...(m.agentBreakdowns ? { agentBreakdowns: m.agentBreakdowns } : {}),
          ...(m.sources.length > 0 ? { sources: m.sources } : {}),
          ...(m.recommendations.length > 0 ? { recommendations: m.recommendations } : {}),
        })),
      })),
      knowledgeGraph: {
        nodes: graphNodes.map(({ createdAt: _c, updatedAt: _u, ...node }) => ({
          ...node,
          ...(node.x !== null ? { x: node.x } : { x: undefined }),
          ...(node.y !== null ? { y: node.y } : { y: undefined }),
        })),
        edges: graphEdges.map((edge) => ({
          id: edge.id,
          source: edge.sourceId,
          target: edge.targetId,
          relationship: edge.relationship,
        })),
      },
    });
  })
);

router.get(
  '/trends',
  asyncHandler(async (_req, res) => {
    const records = await prisma.trendRecord.findMany({
      orderBy: [{ granularity: 'asc' }, { sortOrder: 'asc' }],
    });

    const monthly = records
      .filter((r) => r.granularity === 'monthly')
      .map(({ label, rev, profit }) => ({ label, rev, profit }));
    const quarterly = records
      .filter((r) => r.granularity === 'quarterly')
      .map(({ label, rev, profit }) => ({ label, rev, profit }));

    sendSuccess(res, { monthly, quarterly });
  })
);

export default router;


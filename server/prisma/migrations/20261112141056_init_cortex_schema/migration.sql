-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "lastActiveLabel" TEXT NOT NULL DEFAULT 'Just now',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "recordsCount" TEXT NOT NULL,
    "lastUpdated" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "fileName" TEXT,
    "columns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesRecord" (
    "id" TEXT NOT NULL,
    "dataSourceId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "revenue" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatasetRecord" (
    "id" TEXT NOT NULL,
    "dataSourceId" TEXT NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DatasetRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAgent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "iconName" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL,
    "tools" TEXT[],
    "systemPrompt" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatSession" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dateLabel" TEXT NOT NULL,
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "sender" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "timestampLabel" TEXT NOT NULL,
    "agentBreakdowns" JSONB,
    "sources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recommendations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeGraphNode" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "x" DOUBLE PRECISION,
    "y" DOUBLE PRECISION,
    "vx" DOUBLE PRECISION,
    "vy" DOUBLE PRECISION,
    "description" TEXT,
    "revenue" TEXT,
    "employees" TEXT,
    "industry" TEXT,
    "locations" INTEGER,
    "keyProducts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "downstreamImpact" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "connectedIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeGraphNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeGraphEdge" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeGraphEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedScenario" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timestampLabel" TEXT NOT NULL,
    "priceChange" DOUBLE PRECISION NOT NULL,
    "marketingBudget" DOUBLE PRECISION NOT NULL,
    "productionVolume" DOUBLE PRECISION NOT NULL,
    "staffingLevel" TEXT NOT NULL,
    "kpiRevenue" DOUBLE PRECISION NOT NULL,
    "kpiProfit" DOUBLE PRECISION NOT NULL,
    "kpiProfitMargin" DOUBLE PRECISION NOT NULL,
    "kpiMarketShare" DOUBLE PRECISION NOT NULL,
    "kpiRoi" DOUBLE PRECISION NOT NULL,
    "outlook" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedScenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "expectedImpact" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "timeHorizon" TEXT NOT NULL,
    "evidence" TEXT[],
    "rationale" TEXT NOT NULL,
    "risks" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "timestampLabel" TEXT NOT NULL,
    "actorUserId" TEXT,
    "userName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "automatedModelFailover" BOOLEAN NOT NULL DEFAULT true,
    "auditTrailArchival" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DashboardMetric" (
    "id" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "change" TEXT NOT NULL,
    "isPositive" BOOLEAN NOT NULL,
    "history" DOUBLE PRECISION[],
    "numericValue" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutiveInsight" (
    "id" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "tag" TEXT,

    CONSTRAINT "ExecutiveInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopOpportunity" (
    "id" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "benefit" TEXT NOT NULL,
    "route" TEXT NOT NULL,

    CONSTRAINT "TopOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KeyRisk" (
    "id" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "action" TEXT NOT NULL,

    CONSTRAINT "KeyRisk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecentRecommendation" (
    "id" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "impact" TEXT NOT NULL,
    "date" TEXT NOT NULL,

    CONSTRAINT "RecentRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrendRecord" (
    "id" TEXT NOT NULL,
    "granularity" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "rev" DOUBLE PRECISION NOT NULL,
    "profit" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "TrendRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForecastPoint" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "val" DOUBLE PRECISION NOT NULL,
    "low" DOUBLE PRECISION,
    "high" DOUBLE PRECISION,

    CONSTRAINT "ForecastPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForecastDriver" (
    "id" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "lift" TEXT NOT NULL,
    "width" TEXT NOT NULL,

    CONSTRAINT "ForecastDriver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PresentationSlide" (
    "id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL,
    "layoutTip" TEXT NOT NULL,
    "content" TEXT[],
    "tableData" JSONB,
    "asciiDiagram" TEXT,
    "speakerScript" TEXT NOT NULL,

    CONSTRAINT "PresentationSlide_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_roleId_idx" ON "User"("roleId");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- CreateIndex
CREATE INDEX "DataSource_category_idx" ON "DataSource"("category");

-- CreateIndex
CREATE INDEX "DataSource_type_idx" ON "DataSource"("type");

-- CreateIndex
CREATE INDEX "SalesRecord_dataSourceId_idx" ON "SalesRecord"("dataSourceId");

-- CreateIndex
CREATE INDEX "SalesRecord_region_idx" ON "SalesRecord"("region");

-- CreateIndex
CREATE INDEX "SalesRecord_date_idx" ON "SalesRecord"("date");

-- CreateIndex
CREATE INDEX "DatasetRecord_dataSourceId_idx" ON "DatasetRecord"("dataSourceId");

-- CreateIndex
CREATE UNIQUE INDEX "DatasetRecord_dataSourceId_rowIndex_key" ON "DatasetRecord"("dataSourceId", "rowIndex");

-- CreateIndex
CREATE INDEX "ChatSession_ownerId_idx" ON "ChatSession"("ownerId");

-- CreateIndex
CREATE INDEX "ChatMessage_sessionId_sequence_idx" ON "ChatMessage"("sessionId", "sequence");

-- CreateIndex
CREATE INDEX "KnowledgeGraphNode_type_idx" ON "KnowledgeGraphNode"("type");

-- CreateIndex
CREATE INDEX "KnowledgeGraphEdge_sourceId_idx" ON "KnowledgeGraphEdge"("sourceId");

-- CreateIndex
CREATE INDEX "KnowledgeGraphEdge_targetId_idx" ON "KnowledgeGraphEdge"("targetId");

-- CreateIndex
CREATE INDEX "SavedScenario_createdById_idx" ON "SavedScenario"("createdById");

-- CreateIndex
CREATE INDEX "SavedScenario_createdAt_idx" ON "SavedScenario"("createdAt");

-- CreateIndex
CREATE INDEX "Recommendation_category_idx" ON "Recommendation"("category");

-- CreateIndex
CREATE INDEX "Recommendation_status_idx" ON "Recommendation"("status");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_idx" ON "AuditLog"("actorUserId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "TrendRecord_granularity_sortOrder_idx" ON "TrendRecord"("granularity", "sortOrder");

-- CreateIndex
CREATE INDEX "ForecastPoint_kind_sortOrder_idx" ON "ForecastPoint"("kind", "sortOrder");

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataSource" ADD CONSTRAINT "DataSource_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesRecord" ADD CONSTRAINT "SalesRecord_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetRecord" ADD CONSTRAINT "DatasetRecord_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeGraphEdge" ADD CONSTRAINT "KnowledgeGraphEdge_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "KnowledgeGraphNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeGraphEdge" ADD CONSTRAINT "KnowledgeGraphEdge_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "KnowledgeGraphNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedScenario" ADD CONSTRAINT "SavedScenario_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemSetting" ADD CONSTRAINT "SystemSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

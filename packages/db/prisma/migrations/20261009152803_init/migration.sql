-- CreateEnum
CREATE TYPE "VersionStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ACTIVE', 'INACTIVE', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EntityStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProjectMode" AS ENUM ('DEMO', 'JIRA');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'WAITING_APPROVAL', 'RETRYING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StepStatus" AS ENUM ('PENDING', 'RUNNING', 'WAITING_APPROVAL', 'RETRYING', 'COMPLETED', 'FAILED', 'CANCELLED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ExecutionSource" AS ENUM ('UI', 'CLI', 'CLAUDE_CODE', 'API');

-- CreateEnum
CREATE TYPE "ApprovalMode" AS ENUM ('ALWAYS_APPROVE', 'BATCH_APPROVAL', 'AUTO_APPROVED', 'DENIED');

-- CreateEnum
CREATE TYPE "PolicyScope" AS ENUM ('GLOBAL', 'PROJECT');

-- CreateEnum
CREATE TYPE "ApprovalRequestStatus" AS ENUM ('PENDING', 'PARTIALLY_DECIDED', 'DECIDED', 'SUPERSEDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApprovalItemStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'DENIED_BY_POLICY', 'AUTO_APPROVED', 'CONFLICT');

-- CreateEnum
CREATE TYPE "ExternalOperationStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'SUCCEEDED', 'SIMULATED', 'FAILED', 'UNCERTAIN', 'BLOCKED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'APPLIED');

-- CreateEnum
CREATE TYPE "ProposalKind" AS ENUM ('AGENT', 'SKILL', 'ORCHESTRATOR', 'MODIFICATION');

-- CreateEnum
CREATE TYPE "ProviderKind" AS ENUM ('MOCK', 'LOCAL_CLAUDE', 'ANTHROPIC_API');

-- CreateEnum
CREATE TYPE "ConnectionKind" AS ENUM ('MCP_STDIO', 'MCP_HTTP');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'AGENT', 'SYSTEM', 'WORKER');

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "jiraProjectKey" TEXT NOT NULL,
    "mode" "ProjectMode" NOT NULL DEFAULT 'DEMO',
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "connectionId" TEXT,
    "defaultProviderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectConfiguration" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "VersionStatus" NOT NULL DEFAULT 'ACTIVE',
    "config" JSONB NOT NULL,
    "checksum" TEXT NOT NULL,
    "changeNote" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Connection" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ConnectionKind" NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'JIRA',
    "config" JSONB NOT NULL,
    "writeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "lastCheckedAt" TIMESTAMP(3),
    "capabilities" JSONB,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelProviderConfiguration" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ProviderKind" NOT NULL,
    "config" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "lastCheckedAt" TIMESTAMP(3),
    "lastDiagnosis" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelProviderConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "EntityStatus" NOT NULL DEFAULT 'DRAFT',
    "activeVersionId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentVersion" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "VersionStatus" NOT NULL DEFAULT 'DRAFT',
    "definition" JSONB NOT NULL,
    "checksum" TEXT NOT NULL,
    "changeNote" TEXT NOT NULL DEFAULT '',
    "sourceProposalId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),

    CONSTRAINT "AgentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "EntityStatus" NOT NULL DEFAULT 'DRAFT',
    "activeVersionId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillVersion" (
    "id" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "VersionStatus" NOT NULL DEFAULT 'DRAFT',
    "definition" JSONB NOT NULL,
    "checksum" TEXT NOT NULL,
    "changeNote" TEXT NOT NULL DEFAULT '',
    "sourceProposalId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),

    CONSTRAINT "SkillVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Orchestrator" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "EntityStatus" NOT NULL DEFAULT 'DRAFT',
    "activeVersionId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Orchestrator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrchestratorVersion" (
    "id" TEXT NOT NULL,
    "orchestratorId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "VersionStatus" NOT NULL DEFAULT 'DRAFT',
    "definition" JSONB NOT NULL,
    "checksum" TEXT NOT NULL,
    "changeNote" TEXT NOT NULL DEFAULT '',
    "sourceProposalId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),

    CONSTRAINT "OrchestratorVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrchestratorStep" (
    "id" TEXT NOT NULL,
    "orchestratorVersionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "handler" TEXT NOT NULL,
    "agentKey" TEXT,
    "skillKeys" TEXT[],
    "dependsOn" TEXT[],
    "position" INTEGER NOT NULL,
    "config" JSONB NOT NULL,

    CONSTRAINT "OrchestratorStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapabilityProposal" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "kind" "ProposalKind" NOT NULL,
    "targetKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "problem" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "solution" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "toolsRequested" TEXT[],
    "permissionsRequested" TEXT[],
    "expectedImpact" TEXT NOT NULL,
    "risks" TEXT[],
    "suggestedTests" TEXT[],
    "verification" JSONB,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdByType" "ActorType" NOT NULL,
    "createdBy" TEXT NOT NULL,
    "sourceExecutionId" TEXT,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionComment" TEXT,
    "appliedVersionRef" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CapabilityProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapabilityProposalRevision" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "editedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CapabilityProposalRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Execution" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "source" "ExecutionSource" NOT NULL,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "projectId" TEXT NOT NULL,
    "orchestratorVersionId" TEXT NOT NULL,
    "projectConfigurationId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "snapshot" JSONB NOT NULL,
    "simulation" JSONB NOT NULL,
    "output" JSONB,
    "error" JSONB,
    "currentStepKey" TEXT,
    "requestedBy" TEXT NOT NULL,
    "requestText" TEXT,
    "plan" JSONB,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "lockedBy" TEXT,
    "lockedUntil" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "cancelRequestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Execution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionStep" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "handler" TEXT NOT NULL,
    "agentKey" TEXT,
    "agentVersionId" TEXT,
    "position" INTEGER NOT NULL,
    "dependsOn" TEXT[],
    "status" "StepStatus" NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "input" JSONB,
    "output" JSONB,
    "error" JSONB,
    "decisions" JSONB,
    "usage" JSONB,
    "nextRunAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExecutionStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionEvent" (
    "id" BIGSERIAL NOT NULL,
    "executionId" TEXT NOT NULL,
    "stepKey" TEXT,
    "type" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExecutionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalPolicy" (
    "id" TEXT NOT NULL,
    "scope" "PolicyScope" NOT NULL,
    "projectId" TEXT,
    "orchestratorKey" TEXT,
    "operationType" TEXT NOT NULL,
    "mode" "ApprovalMode" NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "rules" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "description" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "executionId" TEXT,
    "stepKey" TEXT,
    "projectId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "status" "ApprovalRequestStatus" NOT NULL DEFAULT 'PENDING',
    "snapshot" JSONB NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "subjectType" TEXT,
    "subjectId" TEXT,
    "supersedesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalItem" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "operationType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "original" JSONB,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "history" JSONB NOT NULL DEFAULT '[]',
    "dependsOn" TEXT[],
    "status" "ApprovalItemStatus" NOT NULL DEFAULT 'PENDING',
    "policyId" TEXT,
    "policyMode" "ApprovalMode" NOT NULL,
    "policyVersion" INTEGER,
    "decidedAt" TIMESTAMP(3),
    "decisionId" TEXT,
    "approvedHash" TEXT,
    "note" TEXT,

    CONSTRAINT "ApprovalItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalDecision" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "approver" TEXT NOT NULL,
    "approverType" "ActorType" NOT NULL,
    "channel" TEXT NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "items" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalOperation" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "approvalItemId" TEXT,
    "kind" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" "ExternalOperationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "result" JSONB,
    "error" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueSnapshot" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "issueKey" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "updated" TEXT,
    "contentHash" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "projectId" TEXT,
    "executionId" TEXT,
    "summary" TEXT NOT NULL,
    "data" JSONB,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerHeartbeat" (
    "workerId" TEXT NOT NULL,
    "pid" INTEGER NOT NULL,
    "host" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL,
    "running" INTEGER NOT NULL DEFAULT 0,
    "info" JSONB,

    CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("workerId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Project_key_key" ON "Project"("key");

-- CreateIndex
CREATE INDEX "ProjectConfiguration_projectId_status_idx" ON "ProjectConfiguration"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectConfiguration_projectId_version_key" ON "ProjectConfiguration"("projectId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Connection_key_key" ON "Connection"("key");

-- CreateIndex
CREATE UNIQUE INDEX "ModelProviderConfiguration_key_key" ON "ModelProviderConfiguration"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_key_key" ON "Agent"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_activeVersionId_key" ON "Agent"("activeVersionId");

-- CreateIndex
CREATE INDEX "AgentVersion_agentId_status_idx" ON "AgentVersion"("agentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AgentVersion_agentId_version_key" ON "AgentVersion"("agentId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_key_key" ON "Skill"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_activeVersionId_key" ON "Skill"("activeVersionId");

-- CreateIndex
CREATE INDEX "SkillVersion_skillId_status_idx" ON "SkillVersion"("skillId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SkillVersion_skillId_version_key" ON "SkillVersion"("skillId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Orchestrator_key_key" ON "Orchestrator"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Orchestrator_activeVersionId_key" ON "Orchestrator"("activeVersionId");

-- CreateIndex
CREATE INDEX "OrchestratorVersion_orchestratorId_status_idx" ON "OrchestratorVersion"("orchestratorId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OrchestratorVersion_orchestratorId_version_key" ON "OrchestratorVersion"("orchestratorId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "OrchestratorStep_orchestratorVersionId_key_key" ON "OrchestratorStep"("orchestratorVersionId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "CapabilityProposal_number_key" ON "CapabilityProposal"("number");

-- CreateIndex
CREATE INDEX "CapabilityProposal_status_idx" ON "CapabilityProposal"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CapabilityProposalRevision_proposalId_revision_key" ON "CapabilityProposalRevision"("proposalId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "Execution_number_key" ON "Execution"("number");

-- CreateIndex
CREATE INDEX "Execution_status_nextRunAt_idx" ON "Execution"("status", "nextRunAt");

-- CreateIndex
CREATE INDEX "Execution_projectId_createdAt_idx" ON "Execution"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExecutionStep_executionId_key_key" ON "ExecutionStep"("executionId", "key");

-- CreateIndex
CREATE INDEX "ExecutionEvent_executionId_id_idx" ON "ExecutionEvent"("executionId", "id");

-- CreateIndex
CREATE INDEX "ApprovalPolicy_operationType_status_idx" ON "ApprovalPolicy"("operationType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRequest_number_key" ON "ApprovalRequest"("number");

-- CreateIndex
CREATE INDEX "ApprovalRequest_status_idx" ON "ApprovalRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalItem_requestId_itemKey_key" ON "ApprovalItem"("requestId", "itemKey");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalOperation_idempotencyKey_key" ON "ExternalOperation"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ExternalOperation_executionId_idx" ON "ExternalOperation"("executionId");

-- CreateIndex
CREATE UNIQUE INDEX "IssueSnapshot_executionId_issueKey_key" ON "IssueSnapshot"("executionId", "issueKey");

-- CreateIndex
CREATE INDEX "AuditEvent_at_idx" ON "AuditEvent"("at");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_executionId_idx" ON "AuditEvent"("executionId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "Connection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_defaultProviderId_fkey" FOREIGN KEY ("defaultProviderId") REFERENCES "ModelProviderConfiguration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectConfiguration" ADD CONSTRAINT "ProjectConfiguration_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_activeVersionId_fkey" FOREIGN KEY ("activeVersionId") REFERENCES "AgentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentVersion" ADD CONSTRAINT "AgentVersion_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_activeVersionId_fkey" FOREIGN KEY ("activeVersionId") REFERENCES "SkillVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillVersion" ADD CONSTRAINT "SkillVersion_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orchestrator" ADD CONSTRAINT "Orchestrator_activeVersionId_fkey" FOREIGN KEY ("activeVersionId") REFERENCES "OrchestratorVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrchestratorVersion" ADD CONSTRAINT "OrchestratorVersion_orchestratorId_fkey" FOREIGN KEY ("orchestratorId") REFERENCES "Orchestrator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrchestratorStep" ADD CONSTRAINT "OrchestratorStep_orchestratorVersionId_fkey" FOREIGN KEY ("orchestratorVersionId") REFERENCES "OrchestratorVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapabilityProposal" ADD CONSTRAINT "CapabilityProposal_sourceExecutionId_fkey" FOREIGN KEY ("sourceExecutionId") REFERENCES "Execution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapabilityProposalRevision" ADD CONSTRAINT "CapabilityProposalRevision_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "CapabilityProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Execution" ADD CONSTRAINT "Execution_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Execution" ADD CONSTRAINT "Execution_orchestratorVersionId_fkey" FOREIGN KEY ("orchestratorVersionId") REFERENCES "OrchestratorVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Execution" ADD CONSTRAINT "Execution_projectConfigurationId_fkey" FOREIGN KEY ("projectConfigurationId") REFERENCES "ProjectConfiguration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Execution" ADD CONSTRAINT "Execution_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ModelProviderConfiguration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionStep" ADD CONSTRAINT "ExecutionStep_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "Execution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionEvent" ADD CONSTRAINT "ExecutionEvent_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "Execution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalPolicy" ADD CONSTRAINT "ApprovalPolicy_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "Execution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalItem" ADD CONSTRAINT "ApprovalItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ApprovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalDecision" ADD CONSTRAINT "ApprovalDecision_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ApprovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalOperation" ADD CONSTRAINT "ExternalOperation_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "Execution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueSnapshot" ADD CONSTRAINT "IssueSnapshot_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "Execution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

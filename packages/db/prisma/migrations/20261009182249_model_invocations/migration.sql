-- CreateTable
CREATE TABLE "ModelInvocation" (
    "id" BIGSERIAL NOT NULL,
    "origin" TEXT NOT NULL,
    "executionId" TEXT,
    "stepKey" TEXT,
    "attempt" INTEGER,
    "agentKey" TEXT NOT NULL,
    "agentVersion" INTEGER,
    "task" TEXT NOT NULL,
    "provider" "ProviderKind" NOT NULL,
    "model" TEXT,
    "simulated" BOOLEAN NOT NULL DEFAULT false,
    "outcome" TEXT NOT NULL DEFAULT 'OK',
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheCreationInputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadInputTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelInvocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModelInvocation_executionId_idx" ON "ModelInvocation"("executionId");

-- CreateIndex
CREATE INDEX "ModelInvocation_agentKey_createdAt_idx" ON "ModelInvocation"("agentKey", "createdAt");

-- CreateIndex
CREATE INDEX "ModelInvocation_createdAt_idx" ON "ModelInvocation"("createdAt");

-- AddForeignKey
ALTER TABLE "ModelInvocation" ADD CONSTRAINT "ModelInvocation_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "Execution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Relleno: invocaciones ya registradas en las decisiones de cada etapa.
-- Sin desglose de caché (no se guardaba): esas filas quedan con caché en 0.
INSERT INTO "ModelInvocation" ("origin", "executionId", "stepKey", "attempt", "agentKey", "agentVersion", "task", "provider", "model", "simulated", "outcome", "inputTokens", "outputTokens", "costUsd", "durationMs", "createdAt")
SELECT 'EXECUTION', s."executionId", s."key", s."attempt",
       d->>'agentKey', (d->>'agentVersion')::numeric::int, d->>'task', (d->>'provider')::"ProviderKind", d->>'model',
       COALESCE((d->>'simulated')::boolean, false), 'OK',
       COALESCE((d->'usage'->>'inputTokens')::numeric, 0)::int,
       COALESCE((d->'usage'->>'outputTokens')::numeric, 0)::int,
       (d->'usage'->>'costUsd')::double precision,
       (d->>'durationMs')::numeric::int,
       COALESCE(s."finishedAt", s."startedAt", s."updatedAt")
FROM "ExecutionStep" s
CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(s."decisions") = 'array' THEN s."decisions" ELSE '[]'::jsonb END) AS d
WHERE d ? 'agentKey' AND d ? 'task' AND d->>'provider' IN ('MOCK', 'LOCAL_CLAUDE', 'ANTHROPIC_API');

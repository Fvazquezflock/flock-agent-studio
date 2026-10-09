-- AlterTable
ALTER TABLE "ApprovalItem" ADD COLUMN     "action" TEXT,
ADD COLUMN     "rationale" JSONB;

-- AlterTable
ALTER TABLE "CapabilityProposal" ADD COLUMN     "action" TEXT NOT NULL DEFAULT 'CREATE',
ADD COLUMN     "evidence" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Relleno: acción de los ítems existentes según el tipo de operación; los vínculos ya traían su motivo en el payload.
UPDATE "ApprovalItem" SET "action" = CASE
  WHEN "operationType" IN ('CREATE_ISSUE', 'CREATE_ISSUE_LINK') THEN 'CREATE'
  WHEN "operationType" = 'UPDATE_ISSUE' THEN 'UPDATE'
  ELSE NULL END
WHERE "action" IS NULL;
UPDATE "ApprovalItem" SET "rationale" = jsonb_build_object('reason', "payload"->>'reason', 'evidence', '[]'::jsonb)
WHERE "operationType" = 'CREATE_ISSUE_LINK' AND "rationale" IS NULL AND COALESCE("payload"->>'reason', '') <> '';

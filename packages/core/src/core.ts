import { defaultDeps, type CoreDeps } from './context';
import { AgentRuntime } from './agents/runtime';
import { ApprovalService } from './approvals/approval-service';
import { AuditService } from './audit/audit';
import { CatalogService } from './catalog/catalog-service';
import { ExportService } from './catalog/export-service';
import { CatalogFileStore } from './catalog/file-store';
import { CatalogSyncService } from './catalog/sync-service';
import { CatalogTestService } from './catalog/test-service';
import { ConfigFileService } from './config/config-files';
import { ConfigService } from './config/config-service';
import { ExecutionEngine } from './engine/engine';
import { BacklogService } from './jira/backlog-service';
import { ConnectionService } from './jira/connection-service';
import { PolicyService } from './policies/policy-service';
import { ProposalService } from './proposals/proposal-service';
import { ProviderService } from './providers/provider-service';
import { PublicationService } from './publication/publication-service';
import { SupervisorService } from './supervisor/supervisor-service';
import { UsageService } from './usage/usage-service';

/** Núcleo de la plataforma: lo comparten API, worker, seed y pruebas. La CLI y la UI son clientes de la API. */
export class Core {
  readonly deps: CoreDeps;
  readonly audit: AuditService;
  readonly config: ConfigService;
  readonly policies: PolicyService;
  readonly catalog: CatalogService;
  readonly catalogTests: CatalogTestService;
  readonly exports: ExportService;
  /** Archivos de `catalog/` (fuente de verdad versionada de definiciones y configuración). */
  readonly catalogFiles: CatalogFileStore;
  readonly catalogSync: CatalogSyncService;
  readonly configFiles: ConfigFileService;
  readonly approvals: ApprovalService;
  readonly connections: ConnectionService;
  readonly backlog: BacklogService;
  readonly providers: ProviderService;
  readonly agents: AgentRuntime;
  readonly publication: PublicationService;
  readonly engine: ExecutionEngine;
  readonly proposals: ProposalService;
  readonly supervisor: SupervisorService;
  readonly usage: UsageService;

  constructor(deps: Partial<CoreDeps> = {}) {
    this.deps = defaultDeps(deps);
    this.audit = new AuditService(this.deps);
    this.config = new ConfigService(this);
    this.policies = new PolicyService(this);
    this.catalog = new CatalogService(this);
    this.catalogTests = new CatalogTestService(this);
    this.exports = new ExportService(this);
    this.catalogFiles = new CatalogFileStore(this.deps.catalogDir);
    this.catalogSync = new CatalogSyncService(this);
    this.configFiles = new ConfigFileService(this);
    this.approvals = new ApprovalService(this);
    this.connections = new ConnectionService(this);
    this.backlog = new BacklogService(this);
    this.providers = new ProviderService(this);
    this.agents = new AgentRuntime(this);
    this.publication = new PublicationService(this);
    this.engine = new ExecutionEngine(this);
    this.proposals = new ProposalService(this);
    this.supervisor = new SupervisorService(this);
    this.usage = new UsageService(this);
  }

  async close() {
    await this.connections.closeAll();
  }
}

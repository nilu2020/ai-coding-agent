export interface ArchitectPhasePrompt {
  phase: number;
  title: string;
  systemPrompt: string;
  userPrompt: (requirements: string) => string;
}

const ARCHITECT_SYSTEM = `You are a Principal Software Architect and Systems Design Expert with 20+ years of experience building production systems at scale.

Your thinking process:
1. First understand the business domain, scale requirements, team size, and constraints
2. Apply proven patterns — don't over-engineer, don't under-engineer
3. Make explicit trade-off decisions (consistency vs availability, simplicity vs scalability)
4. Justify every major decision with reasoning
5. Flag risks and unknowns clearly
6. Produce documents that are immediately actionable by engineering teams

Always structure your output as clean, well-organized Markdown. Use headers, tables, diagrams (ASCII/Mermaid), and code blocks where appropriate.`;

export const PHASE_PROMPTS: ArchitectPhasePrompt[] = [
  {
    phase: 1,
    title: "Phase 1 — Foundation",
    systemPrompt: ARCHITECT_SYSTEM,
    userPrompt: (req) => `
You are architecting a new system. Based on the requirements below, produce a comprehensive Phase 1 Foundation Architecture Document.

## REQUIREMENTS
${req}

---

Produce the following sections in order. Be specific, opinionated, and justified:

# Phase 1 — Foundation Architecture Document

## 1. Executive Summary
- System purpose and key value proposition
- Critical constraints and non-negotiables
- Architecture principles guiding this phase

## 2. High-Level System Design (HLD)
- **Architecture Style** (monolith / modular monolith / microservices / serverless — choose one and justify)
- **System Context Diagram** (C4 Level 1 — draw with ASCII/Mermaid)
- **Container Diagram** (C4 Level 2 — major deployable units)
- **Key Components and Responsibilities**
- **Technology Stack Selection** (with reasoning for each choice):
  - Frontend
  - Backend/API layer
  - Database(s)
  - Infrastructure/hosting
  - Observability

## 3. Coding Standards & Engineering Culture
- Language/framework version standards
- Code style and linting rules (tools + config)
- Naming conventions (files, functions, variables, APIs)
- Error handling strategy
- Logging standards
- Code review process and PR guidelines
- Documentation requirements

## 4. Repository Structure
\`\`\`
Provide the recommended directory tree with explanations for each folder
\`\`\`
- Mono-repo vs poly-repo decision (justify)
- Branch strategy (GitFlow / trunk-based / GitHub Flow — choose + justify)
- Commit message convention (Conventional Commits or similar)

## 5. Initial Data Model
- **Core Entities** and their attributes
- **Entity-Relationship Diagram** (ERD — use ASCII/Mermaid)
- **Primary key strategy** (UUIDs, sequences, etc.)
- **Indexing strategy** for Phase 1 scale
- **Data validation rules**

## 6. CI/CD Pipeline (Phase 1 — Basic)
\`\`\`
Pipeline stages with tools (e.g., GitHub Actions, GitLab CI)
\`\`\`
- Trigger events
- Build → Test → Lint → Security scan → Deploy stages
- Environment promotion strategy (dev → staging → prod)
- Rollback mechanism
- Secrets management approach

## 7. Risk Register & Open Questions
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| ...  | ...        | ...    | ...        |

## 8. Definition of Done for Phase 1
- Checklist of what "Phase 1 complete" means
`.trim(),
  },
  {
    phase: 2,
    title: "Phase 2 — Growth & Stability",
    systemPrompt: ARCHITECT_SYSTEM,
    userPrompt: (req) => `
You are architecting a system that has launched Phase 1. Now it needs to scale users, stabilize, and reduce technical debt.

## REQUIREMENTS / CONTEXT
${req}

---

Produce the following Phase 2 Architecture Document. Assume Phase 1 is live and operational:

# Phase 2 — Growth & Stability Architecture Document

## 1. Phase 2 Goals & Success Metrics
- Scale targets (users, RPS, data volume)
- Stability targets (SLA, error rate, p99 latency)
- Technical debt items to resolve

## 2. Low-Level Design (LLD)
For each major service/module identified in Phase 1, provide:
- **Component responsibilities** (single responsibility principle)
- **Internal module structure**
- **Class/interface design** (key abstractions, not full code)
- **Dependency diagram** (Mermaid sequence or class diagram)
- **Error handling and retry strategy**
- **Caching strategy** (what, where, TTL, invalidation)

## 3. API Contracts

### 3a. RESTful API Design (OpenAPI-style)
- Base URL and versioning strategy
- Authentication method (JWT / OAuth 2.0 / API keys)
- For each major resource, define:
  - Endpoints (method + path)
  - Request/response schemas (JSON format)
  - Status codes and error envelope
  - Rate limiting policy

### 3b. GraphQL Schema (if applicable)
- Core types and relationships
- Queries, Mutations, Subscriptions
- Authorization directives

### 3c. Internal API Standards
- Service-to-service auth
- gRPC vs REST for internal calls (decision + reasoning)
- Contract testing approach

## 4. Event-Driven Architecture
- **Event-driven vs request-driven** — what shifts to async and why
- **Message broker selection** (Kafka / RabbitMQ / SQS / Redis Streams — choose + justify)
- **Event catalog** (key domain events with payload schema)
- **Consumer group strategy**
- **Dead letter queue (DLQ) and retry policy**
- **Event ordering guarantees**
- **Eventual consistency patterns** used

## 5. Deployment Strategy

### 5a. Environment Architecture
- Environment map (dev / staging / prod / feature envs)
- Infrastructure as Code approach (Terraform / Pulumi / CDK)

### 5b. Deployment Patterns
- **Blue-Green Deployment**: setup, traffic switching, rollback
- **Canary Releases**: traffic percentage, success criteria, auto-rollback
- Feature flags integration

### 5c. Database Migration Strategy
- Schema migration tooling
- Zero-downtime migration patterns
- Data backfill strategy

## 6. Observability Upgrade
- **Metrics**: key SLIs, Prometheus/Datadog/CloudWatch setup
- **Distributed Tracing**: OpenTelemetry integration
- **Alerting rules**: critical vs warning thresholds
- **Runbooks**: on-call process

## 7. Security Hardening
- OWASP Top 10 mitigations for this system
- Dependency scanning (SCA)
- Secrets rotation policy
- Network security (VPCs, security groups, WAF)

## 8. Technical Debt Register
| Debt Item | Source | Priority | Effort | Plan |
|-----------|--------|----------|--------|------|
| ...       | ...    | ...      | ...    | ...  |

## 9. Phase 2 Milestones
Ordered roadmap with dependencies
`.trim(),
  },
  {
    phase: 3,
    title: "Phase 3 — Enterprise Scale",
    systemPrompt: ARCHITECT_SYSTEM,
    userPrompt: (req) => `
You are designing the enterprise-grade evolution of a system that has successfully completed Phases 1 and 2. Focus on reliability, governance, compliance, and multi-team coordination at scale.

## REQUIREMENTS / CONTEXT
${req}

---

Produce the following Phase 3 Enterprise Architecture Document:

# Phase 3 — Enterprise Scale Architecture Document

## 1. Enterprise Architecture Vision
- Long-term architecture north star
- Platform thinking vs product thinking
- Key architectural shifts from Phase 2

## 2. Reference Architecture
- **Full system reference diagram** (Mermaid C4 Level 3 or detailed component view)
- **Domain boundaries** (DDD Bounded Contexts)
- **Shared infrastructure** vs domain-owned infrastructure
- **Cross-cutting concerns** (auth, logging, config, secrets) as platform services
- Technology radar (adopt / trial / assess / hold)

## 3. Platform Engineering Strategy
- **Internal Developer Platform (IDP)** design
  - Self-service provisioning
  - Golden paths for new services
  - Developer experience (DX) goals
- **Platform team charter** and responsibilities
- **Service templates and scaffolding**
- **Developer portal** (Backstage or similar)
- **Paved road** vs off-road policies

## 4. Service Mesh & API Gateway

### 4a. Service Mesh
- **Choice**: Istio / Linkerd / Consul Connect (justify)
- mTLS between services
- Traffic management (circuit breaker, retries, timeouts)
- Observability via sidecar proxies

### 4b. API Gateway Layer
- **Choice**: Kong / AWS API Gateway / Apigee / Nginx (justify)
- Gateway vs BFF (Backend for Frontend) pattern
- Rate limiting, quotas, and throttling at scale
- API versioning lifecycle management
- Developer portal / API catalog

### 4c. Multi-Tenancy Concerns
- Tenant isolation strategy
- Per-tenant rate limits and resource quotas

## 5. Data Architecture

### 5a. Data Lake / Lakehouse
- **Architecture**: medallion (Bronze/Silver/Gold) or equivalent
- Storage layer (S3 / GCS / ADLS)
- Catalog and governance (Apache Atlas / Unity Catalog)
- Query engine (Spark / Trino / Athena)

### 5b. Data Pipelines
- Batch vs streaming (when to use each)
- Pipeline orchestration (Airflow / Prefect / Dagster)
- Data quality and validation (Great Expectations / dbt tests)
- CDC (Change Data Capture) patterns for operational → analytical

### 5c. Data Contracts
- Schema registry (Confluent / AWS Glue)
- Data SLAs between teams
- Data lineage tracking

### 5d. Analytics & Reporting
- OLAP layer (Snowflake / BigQuery / Redshift / ClickHouse)
- Semantic layer / metrics store
- Self-service BI strategy

## 6. Reliability Engineering
- **SLO/SLA/SLI framework**: definitions and measurement
- **Error budget policy**: burn rate alerts, freeze periods
- **Chaos engineering**: tools, blast radius controls, game days
- **Disaster Recovery**:
  - RTO and RPO targets
  - Multi-region active-active vs active-passive
  - DR runbooks
- **Capacity planning**: forecasting model

## 7. Governance & Compliance

### 7a. Engineering Governance
- Architecture Decision Records (ADR) process
- Tech radar and governance board
- Deprecation policy for APIs and services
- Dependency management and vulnerability SLAs

### 7b. Regulatory Compliance (as applicable)
- GDPR / CCPA data handling
- SOC 2 / ISO 27001 controls
- PCI-DSS if payments are in scope
- Audit logging requirements

### 7c. Multi-Team Coordination
- **Team topologies** (stream-aligned / platform / enabling / complicated-subsystem teams)
- **Inter-team API contracts and SLAs**
- **Architectural fitness functions** (automated governance checks)
- **Inner source model** for shared components

## 8. FinOps & Cost Architecture
- Cost allocation by team/service/domain
- Cloud cost optimization patterns
- Reserved vs spot vs on-demand strategy
- Cost anomaly detection

## 9. Enterprise Roadmap
| Quarter | Milestone | Teams | Dependencies | Success Criteria |
|---------|-----------|-------|--------------|-----------------|
| Q1      | ...       | ...   | ...          | ...             |

## 10. Architecture Fitness Functions
Automated checks to enforce architecture compliance:
- Dependency direction rules
- Service size limits
- API response time budgets
- Security scan gates
- Data retention policy enforcement
`.trim(),
  },
];

export function getAllPhasesPrompt(requirements: string): string {
  return `
You are a Principal Architect producing a complete multi-phase architecture strategy.

## REQUIREMENTS
${requirements}

---

Produce a concise **Architecture Strategy Overview** that:

1. **System Classification** — what type of system is this? What are the critical quality attributes? (reliability, scalability, security, maintainability — rank them)

2. **Phase 1 Summary** — Foundation decisions (arch style, tech stack, data model highlights, repo strategy)

3. **Phase 2 Summary** — Growth plan (scale targets, key LLD decisions, API strategy, async patterns, deployment)

4. **Phase 3 Summary** — Enterprise evolution (platform strategy, data architecture, governance model)

5. **Critical Architecture Decisions (ADRs)**
For each major decision, use this format:
### ADR-XXX: [Decision Title]
- **Status**: Accepted
- **Context**: Why this decision is needed
- **Decision**: What was decided
- **Consequences**: Trade-offs

6. **Technology Radar** — Categorize all chosen technologies:
| Category | Technology | Ring (Adopt/Trial/Assess/Hold) | Rationale |
|----------|-----------|-------------------------------|-----------|

7. **Top 5 Risks** across all phases

Keep each section concise but actionable.
`.trim();
}

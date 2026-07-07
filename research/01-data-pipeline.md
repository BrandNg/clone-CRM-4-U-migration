# Data & Pipeline Layer — 5 Production-Proven CRM Patterns

## 1. Salesforce Multi-Object Party Model (Account-Contact-Opportunity)

### Schema

```typescript
interface Account {
  Id: string;
  Name: string;
  Type?: string;
  ParentId?: string;
  BillingCountry?: string;
  Industry?: string;
  AnnualRevenue?: number;
  OwnerId: string;
  IsActive: boolean;
  CreatedDate: Date;
  LastModifiedDate: Date;
}

interface Contact {
  Id: string;
  AccountId?: string;
  FirstName: string;
  LastName: string;
  Email: string;
  Phone?: string;
  Title?: string;
  ReportsToId?: string;
  OwnerId: string;
  CreatedDate: Date;
  LastModifiedDate: Date;
}

interface Lead {
  Id: string;
  FirstName: string;
  LastName: string;
  Company: string;
  Email: string;
  Phone?: string;
  Status: string;
  OwnerId: string;
  ConvertedAccountId?: string;
  ConvertedContactId?: string;
  ConvertedOpportunityId?: string;
  IsConverted: boolean;
  CreatedDate: Date;
  LastModifiedDate: Date;
}

interface Opportunity {
  Id: string;
  AccountId: string;
  Name: string;
  StageName: string;
  Amount: number;
  Probability: number;
  CloseDate: Date;
  OwnerId: string;
  IsClosed: boolean;
  IsWon: boolean;
  CreatedDate: Date;
  LastModifiedDate: Date;
}

interface OpportunityContactRole {
  Id: string;
  OpportunityId: string;
  ContactId: string;
  Role: string;
  IsPrimary: boolean;
}

interface AccountContactRelation {
  Id: string;
  AccountId: string;
  ContactId: string;
  Roles: string[];
  IsActive: boolean;
  StartDate?: Date;
  EndDate?: Date;
}

interface FieldHistory {
  Id: string;
  ParentId: string;
  Field: string;
  OldValue?: string;
  NewValue?: string;
  CreatedById: string;
  CreatedDate: Date;
}
```

### How It Works

Salesforce's data model is built around a small set of interconnected standard objects. **Account** is the organization/company. **Contact** represents individuals linked to an Account. **Lead** is an unqualified prospect (pre-account) that converts atomically into Account + Contact + Opportunity. **Opportunity** is a deal tracked through a configurable pipeline of stages, each with a probability percentage that auto-calculates weighted forecast amounts. **AccountContactRelation** and **OpportunityContactRole** support many-to-many B2B buying committees. Every standard object ships with automatic field-level history tracking via per-object history tables.

### Pros & Cons

- ✅ **Proven at planetary scale** — handles billions of records across millions of orgs
- ✅ **Atomic lead conversion** — converts Lead to Account+Contact+Opportunity in one transaction
- ✅ **Rich junction model** — supports complex B2B org charts and multi-stakeholder deals
- ❌ **Rigid schema coupling** — the five-object core is deeply wired into platform behaviors
- ❌ **Field history bloat** — per-field history rows cause massive storage growth

---

## 2. HubSpot Pipeline-as-First-Class Entity with Stage Calculated Properties

### Schema

```typescript
interface Pipeline {
  id: string;
  objectType: 'deals' | 'tickets' | 'leads' | 'appointments' | 'custom';
  label: string;
  displayOrder: number;
  stages: PipelineStage[];
  createdAt: Date;
  updatedAt: Date;
}

interface PipelineStage {
  id: string;
  pipelineId: string;
  label: string;
  displayOrder: number;
  metadata: {
    probability?: number;     // 0.0 (Closed Lost) to 1.0 (Closed Won)
    isClosed?: boolean;
    ticketState?: 'OPEN' | 'CLOSED';
  };
  createdAt: Date;
  updatedAt: Date;
}

type LifecycleStage =
  | 'subscriber' | 'lead' | 'marketing_qualified_lead'
  | 'sales_qualified_lead' | 'opportunity' | 'customer'
  | 'evangelist' | 'other';

interface Deal {
  id: string;
  pipelineId: string;
  stageId: string;
  amount: number;
  currency: string;
  closeDate?: Date;
  ownerId: string;
  contactIds: string[];
  companyIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

interface DealStageEntry {
  dealId: string;
  pipelineStageLabel: string;
  dateStageEntered: Date;
  dateStageExited?: Date;
  isClosed: boolean;
  label?: string;
}
```

### How It Works

HubSpot treats **pipelines as first-class configurable entities** — they are database rows created via API/UI, not hardcoded enums. A single object type supports multiple parallel pipelines (e.g., "New Sales" vs. "Contract Renewals"). Each stage carries a `probability` metadata for weighted revenue forecasting. **Lifecycle stages** (`subscriber → lead → MQL → SQL → opportunity → customer → evangelist`) track the marketing-to-sales handoff at the contact level, orthogonal to deal pipelines. HubSpot auto-computes **stage calculated properties** — `Date entered [stage]`, `Latest time in [stage]`, `Cumulative time in [stage]` — enabling pipeline velocity reports without custom SQL. Pipeline rules (skip prevention, backward movement, creation-stage restrictions) are enforced at the application/API layer.

### Pros & Cons

- ✅ **Multi-pipeline flexibility** — unlimited parallel pipelines per object type
- ✅ **Automatic stage analytics** — Date entered/exited and time-in-stage computed without ETL
- ✅ **Dual lifecycle + pipeline model** — separates marketing qualification from sales progression
- ❌ **Property history explosion** — each custom stage generates ~5 calculated properties, overwhelming the property list in large accounts
- ❌ **No database-level state machine** — rules enforced at API layer, bypassable by super admins and workflows
- ❌ **Pipeline-per-object coupling** — no shared governance across deal, ticket, and lead pipelines

---

## 3. Close Activity-Centric Unified Lead Model with Consolidated Event Log

### Schema

```typescript
// Lead is the root aggregate — everything nests under it
interface Lead {
  id: string;
  name: string;
  statusLabel: string;
  statusId: string;
  assignedTo: string;
  description?: string;
  addresses: Address[];
  contacts: Contact[];
  customFields: Record<string, unknown>;
  dateCreated: Date;
  dateUpdated: Date;
}

interface Contact {
  id: string;
  leadId: string;
  name: string;
  title?: string;
  emails: Array<{ type: string; email: string }>;
  phones: Array<{ type: string; phone: string }>;
  dateCreated: Date;
}

interface Opportunity {
  id: string;
  leadId: string;
  pipelineId: string;
  statusId: string;
  statusType: 'active' | 'won' | 'lost';
  value: number;         // stored in cents
  valuePeriod: 'one_time' | 'monthly' | 'yearly';
  dateCreated: Date;
}

// Unified activity — ALL interactions are activities
interface Activity {
  id: string;
  leadId: string;
  userId: string;
  type: 'call' | 'email' | 'sms' | 'meeting' | 'note' | 'custom';
  direction: 'inbound' | 'outbound';
  callData?: { duration: number; status: string; recordingUrl?: string };
  emailData?: { subject: string; sender: string; status: string };
  smsData?: { body: string };
  meetingData?: { title: string; duration: number };
  noteData?: { body: string };
  dateCreated: Date;
}

// Consolidated event log — rapid mutations coalesced into a single entry
interface EventLogEntry {
  id: string;
  objectType: string;
  objectId: string;
  leadId: string | null;
  action: 'created' | 'updated' | 'deleted' | 'merged' | 'completed';
  changedFields?: string[];
  data?: Record<string, unknown>;
  previousData?: Record<string, unknown>;
  meta?: { bulkActionId?: string; mergeDestinationId?: string };
  dateCreated: Date;
  lastConsolidatedAt: Date;
}
```

### How It Works

Close uses a **Lead-as-root-aggregate** model where a Lead represents either a company (B2B) or a person (B2C). Contacts, Opportunities, Tasks, and Activities are all children of a Lead — nothing exists without a parent Lead. There are no separate Account or Company tables. Activities are **polymorphic and unified**: calls, emails, SMS, meetings, and notes live in a single activity stream per Lead, enabling a communication timeline with one query. The **Event Log** is a consolidated mutable record of every state change — created, updated, deleted, merged. Close coalesces rapid successive updates to the same object into a single event entry (earliest `dateCreated`, latest `previousData`), reducing noise while preserving full audit history. The event log powers the lead timeline UI, restore capabilities, and integration webhooks.

### Pros & Cons

- ✅ **Radically simple data model** — Lead is the only root entity; no Account/Company separation
- ✅ **Unified activity stream** — single Activity table powers all timelines without UNION queries
- ✅ **Consolidated event log** — field-level before/after with smart coalescing of rapid updates
- ❌ **No account abstraction** — B2B companies that need Account-level rollups must reconstruct from Lead data
- ❌ **Event log can be very large** — capturing every action across the system requires partitioning and retention policies
- ❌ **Rigid nesting** — all entities must be children of a Lead; standalone Contacts or cross-Lead relationships are not natively supported

---

## 4. Pipedrive Schema-Per-Customer Multi-Tenant Architecture with JSONB Custom Fields

### Schema

```sql
-- One schema per customer (company_<id>), each with identical table structure
-- Only core tables shown; ~120 tables per schema in production

CREATE TABLE deals (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    title VARCHAR(255) NOT NULL,
    person_id BIGINT REFERENCES persons(id),
    org_id BIGINT REFERENCES organizations(id),
    pipeline_id INT NOT NULL,
    stage_id INT NOT NULL,
    status ENUM('open', 'won', 'lost', 'deleted') DEFAULT 'open',
    value DECIMAL(15,2),
    currency VARCHAR(3) DEFAULT 'USD',
    expected_close_date DATE,
    owner_id INT NOT NULL,
    -- All custom fields stored in a single JSON column
    custom_fields JSON DEFAULT (JSON_OBJECT()),
    add_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_stage (stage_id, status),
    INDEX idx_owner (owner_id),
    INDEX idx_custom_fields ((CAST(JSON_EXTRACT(custom_fields, '$.*') AS CHAR(64))))
);

CREATE TABLE persons (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    org_id BIGINT REFERENCES organizations(id),
    email JSON,              -- Array of email objects: [{"label": "work", "value": "a@b.com"}]
    phone JSON,              -- Array of phone objects
    custom_fields JSON DEFAULT (JSON_OBJECT()),
    add_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE organizations (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    address VARCHAR(500),
    custom_fields JSON DEFAULT (JSON_OBJECT()),
    add_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE activities (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    type VARCHAR(50) NOT NULL,       -- 'call', 'meeting', 'task', 'email', etc.
    subject VARCHAR(255),
    done BOOLEAN DEFAULT FALSE,
    deal_id BIGINT REFERENCES deals(id),
    person_id BIGINT REFERENCES persons(id),
    org_id BIGINT REFERENCES organizations(id),
    assigned_to_user_id INT,
    duration INT,                    -- seconds
    note TEXT,
    custom_fields JSON DEFAULT (JSON_OBJECT()),
    add_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_deal (deal_id),
    INDEX idx_user (assigned_to_user_id)
);

CREATE TABLE pipelines (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    order_nr INT DEFAULT 0,
    active BOOLEAN DEFAULT TRUE
);

CREATE TABLE stages (
    id INT PRIMARY KEY AUTO_INCREMENT,
    pipeline_id INT NOT NULL REFERENCES pipelines(id),
    name VARCHAR(100) NOT NULL,
    order_nr INT DEFAULT 0,
    probability INT DEFAULT 0,       -- 0-100
    rotten_flag_days INT DEFAULT 7,  -- days before deal is flagged "rotting"
    active_flag BOOLEAN DEFAULT TRUE,
    INDEX idx_pipeline (pipeline_id)
);

-- Metadata registry: describes custom field schema per entity type
CREATE TABLE custom_field_definitions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    entity_type VARCHAR(50) NOT NULL,  -- 'deal', 'person', 'organization', etc.
    key VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    field_type VARCHAR(50) NOT NULL,   -- 'varchar', 'text', 'int', 'double', 'date', 'enum', 'phone', 'email'
    options JSON,                      -- for enum types: ["Option A", "Option B"]
    add_time DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### How It Works

Pipedrive uses **one MySQL schema per customer** (sharded multi-tenancy) — each company gets its own isolated set of ~120 tables within a shared MySQL instance. This provides strong tenant isolation and makes scaling predictable: add new database instances to accommodate new customers. Custom fields use a **JSON column** pattern rather than EAV or ALTER-TABLE — every core entity (deals, persons, organizations, activities) has a `custom_fields JSON` column. A metadata table (`custom_field_definitions`) describes the schema of those JSON blobs. This approach replaced an earlier pattern of dynamically adding MySQL columns (which hit the 64KB row limit). Activities model a **polymorphic association** pattern — they can be attached to deals, persons, or organizations via nullable foreign keys. Pipedrive also tracks per-stage "rot" settings (`rotten_flag_days`) that flag deals stalled beyond a threshold.

### Pros & Cons

- ✅ **Strong tenant isolation** — one customer's data never mixes with another's at the schema level
- ✅ **JSON custom fields are migration-free** — users add fields without DDL ALTER TABLE locks or row-size limits
- ✅ **Rot detection built-in** — per-stage `rotten_flag_days` enables automated deal-aging alerts without external monitoring
- ❌ **Schema-per-customer operational overhead** — ~185,000 schemas across ~280 instances requires custom tooling for alters, migrations, and load balancing
- ❌ **"Noisy neighbor" problem** — large customers on a shared instance can impact neighbors; manual rebalancing needed
- ❌ **Polymorphic FK pattern** — nullable FKs across multiple entity types complicate referential integrity and query optimization

---

## 5. QBit CRM Immutable Audit Log & Activity-Centric Core (Open-Source)

### Schema

```sql
-- Unified activity table — every interaction is a row here
CREATE TABLE crm_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID REFERENCES crm_contact(id),
    company_id UUID REFERENCES crm_company(id),
    deal_id UUID REFERENCES crm_deal(id),
    activity_type_id INT NOT NULL REFERENCES crm_activity_type(id),
    subject VARCHAR(500),
    body TEXT,
    direction VARCHAR(10) CHECK (direction IN ('inbound', 'outbound')),
    status VARCHAR(50),
    duration_seconds INT,
    outcome_id INT REFERENCES crm_activity_outcome(id),
    assigned_to_id UUID REFERENCES crm_user(id),
    activity_date TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_contact (contact_id, activity_date DESC),
    INDEX idx_deal (deal_id, activity_date DESC),
    INDEX idx_user_date (assigned_to_id, activity_date DESC)
);

-- Pipeline and stage definitions
CREATE TABLE crm_pipeline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE crm_pipeline_stage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_id UUID NOT NULL REFERENCES crm_pipeline(id),
    name VARCHAR(200) NOT NULL,
    display_order INT NOT NULL,
    probability DECIMAL(5,2) DEFAULT 0,  -- 0.00 to 100.00
    rot_days INT DEFAULT 0,              -- days before deal is considered "rotting"
    required_field_gating JSONB,         -- field requirements to enter this stage
    is_terminal BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Deals move through pipeline stages
CREATE TABLE crm_deal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_id UUID NOT NULL REFERENCES crm_pipeline(id),
    current_stage_id UUID NOT NULL REFERENCES crm_pipeline_stage(id),
    company_id UUID REFERENCES crm_company(id),
    primary_contact_id UUID REFERENCES crm_contact(id),
    title VARCHAR(500) NOT NULL,
    value BIGINT,                     -- in smallest currency unit (cents)
    currency_id INT REFERENCES crm_currency(id),
    exchange_rate DECIMAL(12,6) DEFAULT 1.0,
    probability_override DECIMAL(5,2),
    weighted_value BIGINT GENERATED ALWAYS AS (
        CAST(COALESCE(value, 0) * COALESCE(probability_override,
            (SELECT probability FROM crm_pipeline_stage WHERE id = current_stage_id), 0) / 100 AS BIGINT)
    ) STORED,
    expected_close_date DATE,
    owner_id UUID REFERENCES crm_user(id),
    is_closed BOOLEAN DEFAULT FALSE,
    is_won BOOLEAN,
    closed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_stage (current_stage_id),
    INDEX idx_owner (owner_id),
    INDEX idx_pipeline (pipeline_id, is_closed)
);

-- First-class stage transition history
CREATE TABLE crm_deal_stage_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id UUID NOT NULL REFERENCES crm_deal(id),
    from_stage_id UUID REFERENCES crm_pipeline_stage(id),
    to_stage_id UUID NOT NULL REFERENCES crm_pipeline_stage(id),
    probability DECIMAL(5,2),
    value BIGINT,
    changed_by_id UUID REFERENCES crm_user(id),
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_deal_time (deal_id, changed_at DESC)
);

-- Immutable, append-only audit log
CREATE TABLE crm_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name VARCHAR(100) NOT NULL,
    record_id UUID NOT NULL,
    field_name VARCHAR(100),
    old_value TEXT,
    new_value TEXT,
    changed_by_id UUID REFERENCES crm_user(id),
    correlation_id UUID,               -- groups multiple changes in one transaction
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_record (table_name, record_id, changed_at DESC),
    INDEX idx_time (changed_at DESC),
    INDEX idx_correlation (correlation_id)
);

-- Contact/deal junction with roles
CREATE TABLE crm_deal_contact (
    deal_id UUID NOT NULL REFERENCES crm_deal(id),
    contact_id UUID NOT NULL REFERENCES crm_contact(id),
    role_id INT REFERENCES crm_contact_role(id),
    is_primary BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (deal_id, contact_id)
);

-- Contact lifecycle stages (enum-like reference table)
CREATE TABLE crm_lifecycle_stage (
    id INT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,    -- Lead, MQL, SQL, Opportunity, Customer, Evangelist
    display_order INT NOT NULL
);
```

### How It Works

QBit CRM (open-source, Apache 2.0) implements three key architectural decisions. **Activity-centric core**: a single `crm_activity` table is the heart of the system — every interaction (call, email, meeting, note, task) is stored as a row with polymorphic foreign keys to contacts, companies, and deals. This enables a unified timeline across all entities. **Pipeline-driven deals with first-class stage history**: `crm_deal_stage_history` records every stage transition as an immutable event, enabling pipeline analytics (velocity, conversion rates, stage duration) without polling or log scraping. Each stage has configurable `rot_days` and `required_field_gating` (JSONB specifying which fields must be populated before entry). **Immutable, append-only audit log**: `crm_audit_log` captures every field-level change with old/new values, correlation IDs for transaction grouping, and support for GDPR anonymization (PII scrubbed in-place rather than hard-deleted). The schema also includes computed columns like `weighted_value` (value × probability) for real-time forecasting without application-level calculation.

### Pros & Cons

- ✅ **Activity-centric query model** — one table powers all timeline views, feed widgets, and activity-count dashboards
- ✅ **First-class stage history** — `crm_deal_stage_history` is an immutable event stream, enabling reliable pipeline analytics without ETL or CDC
- ✅ **Append-only audit with GDPR support** — field-level immutable log with correlation IDs and anonymization built in
- ❌ **Polymorphic FK pattern** — `crm_activity` has nullable FKs to three entity types, complicating referential integrity enforcement
- ❌ **Generated column dependency** — `weighted_value` uses a subquery-based generated column, which can be a performance concern at scale
- ❌ **Concurrency on deal stage transitions** — no optimistic locking or versioning on `crm_deal.current_stage_id`, risking race conditions under concurrent updates

---

## 6. Lead Scoring & Qualification Model (BANT / GPCT / Custom)

### Schema

```typescript
interface LeadScoreConfig {
  id: string;
  name: string;                    // e.g. "BANT", "GPCT", "ICE", "Custom"
  modelType: 'formula' | 'weighted_sum' | 'ml_classifier';
  factors: ScoringFactor[];
  version: number;
  isActive: boolean;
  createdAt: Date;
}

interface ScoringFactor {
  id: string;
  configId: string;
  field: string;                   // e.g. "annualRevenue", "companySize", "engagementCount"
  dataType: 'number' | 'boolean' | 'enum' | 'days_since';
  scoreMap: Record<string, number>; // e.g. { "0-10": 5, "11-50": 10, "51-200": 20 }
  weight: number;                  // multiplier 0.0–1.0
  maxScore: number;
}

interface LeadScore {
  id: string;
  leadId: string;
  configId: string;
  configVersion: number;
  totalScore: number;              // final computed score
  breakdown: Record<string, number>; // per-factor score detail
  decile: number;                  // 1-10 bucket for ranking
  grade: 'hot' | 'warm' | 'cold';
  computedAt: Date;
  expiresAt?: Date;                // re-scoring deadline
}

// Persisted scoring factors for fast querying
interface LeadScoringFact {
  leadId: string;
  annualRevenueBand: string;
  employeeCountBand: string;
  engagement30d: number;
  emailOpenRate: number;
  meetingCount: number;
  timeInCurrentStageDays: number;
  isDecisionMaker: boolean;
  hasBudget: boolean;
  authorityLevel: 'user' | 'manager' | 'director' | 'vp' | 'c-level';
  lastActivityDate: Date;
  updatedAt: Date;
}

// Typical BANT model expressed as config
const bantConfig: LeadScoreConfig = {
  id: 'bant-v1',
  name: 'BANT',
  modelType: 'weighted_sum',
  version: 1,
  isActive: true,
  factors: [
    { id: 'f1', configId: 'bant-v1', field: 'hasBudget', dataType: 'boolean',
      scoreMap: { 'true': 30, 'false': 0 }, weight: 0.25, maxScore: 30 },
    { id: 'f2', configId: 'bant-v1', field: 'authorityLevel', dataType: 'enum',
      scoreMap: { 'c-level': 25, 'vp': 20, 'director': 15, 'manager': 10, 'user': 5 },
      weight: 0.25, maxScore: 25 },
    { id: 'f3', configId: 'bant-v1', field: 'companySize', dataType: 'enum',
      scoreMap: { '0-10': 5, '11-50': 10, '51-200': 15, '201-1000': 20, '1000+': 25 },
      weight: 0.25, maxScore: 25 },
    { id: 'f4', configId: 'bant-v1', field: 'timeInCurrentStageDays', dataType: 'days_since',
      scoreMap: { '0-7': 10, '8-30': 15, '31-90': 20, '90+': 5 },
      weight: 0.25, maxScore: 20 },
  ],
  createdAt: new Date(),
};
```

### How It Works

Lead scoring decouples **score configuration** from **score computation**. `LeadScoreConfig` defines which factors matter and how they map to points. `LeadScoringFact` materializes the raw input data per lead into pre-bucketed bands for performant computation. `LeadScore` stores the computed result with per-factor breakdown, decile ranking, and a grade label. Scoring can be triggered by lifecycle stage changes, field updates, or on a cron schedule. The model supports three approaches: **weighted sum** (BANT/GPCT formula), **ML classifier** (model outputs a probability), or **rule-based** (decision tree). HubSpot's predictive lead scoring and Salesforce's Einstein scoring both use this pattern under the hood — the key insight is that scores are versioned snapshots, not live calculations, so historical score changes are queryable.

### Pros & Cons

- ✅ **Configurable models** — swap BANT for GPCT or a custom model without schema changes
- ✅ **Versioned snapshots** — query score history for pipeline-quality trend analysis
- ✅ **Decile ranking** — SDRs can focus on the top 10% of leads instead of raw scores
- ❌ **Fact staleness** — scoring facts must be refreshed; stale facts produce misleading scores
- ❌ **Weight tuning requires iteration** — finding the right weight per factor is empirical, not formulaic
- ❌ **ML model drift** — classifier-based scoring degrades over time without ongoing retraining

---

## 7. Prisma Schema for a Modern Sales CRM (Unified Reference Model)

### Schema

```prisma
// Core primitives shared across all CRM features
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ── Account / Company ──
model Account {
  id            String    @id @default(uuid())
  name          String
  domain        String?   @unique
  industry      String?
  employeeCount Int?
  annualRevenue Decimal?  @db.Decimal(15, 2)
  phone         String?
  address       Json?     // { street, city, country, coordinates }
  customFields  Json?     @default("{}")
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  contacts  Contact[]
  deals     Deal[]
  activities Activity[]
}

// ── Contact / Person ──
model Contact {
  id         String   @id @default(uuid())
  accountId  String?
  firstName  String
  lastName   String
  email      String   @unique
  phone      String?
  title      String?
  authority  AuthorityLevel @default(USER)
  ownerId    String?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  account        Account?       @relation(fields: [accountId], references: [id])
  owner          User?          @relation(fields: [ownerId], references: [id])
  deals          DealContact[]
  activities     Activity[]
  leadScores     LeadScore[]
}

enum AuthorityLevel {
  USER
  MANAGER
  DIRECTOR
  VP
  C_LEVEL
}

// ── Pipeline & Stages (HubSpot-style, first-class) ──
model Pipeline {
  id          String         @id @default(uuid())
  name        String
  objectType  String         @default("deals") // deals | tickets | leads
  isActive    Boolean        @default(true)
  displayOrder Int           @default(0)
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt

  stages      PipelineStage[]
}

model PipelineStage {
  id          String    @id @default(uuid())
  pipelineId  String
  name        String
  displayOrder Int      @default(0)
  probability Float?    // 0.0 – 1.0
  rotDays     Int       @default(7)
  isTerminal  Boolean   @default(false)
  requiredGating Json?  // { "requiredFields": ["value", "closeDate"] }
  createdAt   DateTime  @default(now())

  pipeline    Pipeline     @relation(fields: [pipelineId], references: [id])
  deals       Deal[]
  stageHistory DealStageHistory[]
}

// ── Deal / Opportunity ──
model Deal {
  id              String        @id @default(uuid())
  title           String
  pipelineId      String
  stageId         String
  accountId       String?
  primaryContactId String?
  value           Decimal       @db.Decimal(15, 2)
  currency        String        @default("USD")
  probabilityOverride Float?
  expectedCloseDate DateTime?
  ownerId         String?
  isClosed        Boolean       @default(false)
  isWon           Boolean?
  closedAt        DateTime?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  // Computed via trigger or app layer
  weightedValue Decimal?       @db.Decimal(15, 2)

  pipeline         Pipeline        @relation(fields: [pipelineId], references: [id])
  stage            PipelineStage   @relation(fields: [stageId], references: [id])
  account          Account?        @relation(fields: [accountId], references: [id])
  primaryContact   Contact?        @relation(fields: [primaryContactId], references: [id])
  owner            User?           @relation(fields: [ownerId], references: [id])
  contacts         DealContact[]
  activities       Activity[]
  stageHistory     DealStageHistory[]
}

model DealContact {
  dealId    String
  contactId String
  role      String?   // "decision_maker", "champion", "influencer"
  isPrimary Boolean   @default(false)

  deal    Deal    @relation(fields: [dealId], references: [id])
  contact Contact @relation(fields: [contactId], references: [id])

  @@id([dealId, contactId])
}

model DealStageHistory {
  id        String   @id @default(uuid())
  dealId    String
  fromStageId String?
  toStageId String
  probability Float?
  value     Decimal? @db.Decimal(15, 2)
  changedById String?
  changedAt DateTime @default(now())

  deal      Deal           @relation(fields: [dealId], references: [id])
  fromStage PipelineStage? @relation("FromStage", fields: [fromStageId], references: [id])
  toStage   PipelineStage  @relation("ToStage", fields: [toStageId], references: [id])
}

// ── Unified Activity (Close-style single table) ──
model Activity {
  id          String   @id @default(uuid())
  type        ActivityType
  direction   Direction?
  subject     String?
  body        String?
  durationSec Int?
  status      String?
  activityDate DateTime @default(now())
  contactId   String?
  accountId   String?
  dealId      String?
  ownerId     String?
  createdAt   DateTime @default(now())

  contact Contact?  @relation(fields: [contactId], references: [id])
  account Account?  @relation(fields: [accountId], references: [id])
  deal    Deal?     @relation(fields: [dealId], references: [id])
  owner   User?     @relation(fields: [ownerId], references: [id])

  @@index([contactId, activityDate])
  @@index([dealId, activityDate])
  @@index([ownerId, activityDate])
}

enum ActivityType {
  CALL
  EMAIL
  SMS
  MEETING
  NOTE
  TASK
  CHAT
}

enum Direction {
  INBOUND
  OUTBOUND
}

// ── Lead Scoring ──
model LeadScore {
  id           String   @id @default(uuid())
  contactId    String
  configId     String
  configVersion Int
  totalScore   Float
  breakdown    Json?    // per-factor detail
  decile       Int?
  grade        ScoreGrade
  expiresAt    DateTime?
  computedAt   DateTime @default(now())

  contact Contact @relation(fields: [contactId], references: [id])
  @@index([contactId, computedAt])
}

enum ScoreGrade {
  HOT
  WARM
  COLD
}

// ── Immutable Audit Log (QBit-inspired) ──
model AuditLog {
  id          String   @id @default(uuid())
  tableName   String
  recordId    String
  fieldName   String?
  oldValue    String?
  newValue    String?
  changedById String?
  correlationId String?
  changedAt   DateTime @default(now())

  @@index([tableName, recordId, changedAt])
  @@index([correlationId])
}

// ── User / Team ──
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  name      String
  role      UserRole @default(MEMBER)
  avatarUrl String?
  createdAt DateTime @default(now())

  assignedContacts Contact[]
  assignedDeals    Deal[]
  activities       Activity[]
}

enum UserRole {
  ADMIN
  MANAGER
  MEMBER
}
```

### How It Works

This unified Prisma schema combines the best ideas from all five prior patterns into one reference implementation. **Account-centric** (Salesforce-style) with Contact as a child. **First-class Pipeline/PipelineStage** (HubSpot-style) with configurable stages, probabilities, and rot detection. **DealStageHistory** as an immutable transition log (QBit-style) for pipeline analytics. **Unified Activity** table (Close-style) with polymorphic FKs to Contact, Account, and Deal — powering timelines with a single query. **LeadScore** model for configurable scoring (BANT/GPCT). **AuditLog** append-only immutable log for GDPR compliance and full audit trails. The schema uses Postgres enums, JSON fields for flexible metadata, and composite indexes for the query patterns every CRM needs.

### Pros & Cons

- ✅ **Single source of truth** — all patterns unified in one runnable Prisma schema, ready for `prisma db push`
- ✅ **Type-safe** — generated TypeScript types for every model, relation, and enum
- ✅ **Migration-friendly** — Prisma Migrate handles schema evolution without manual DDL
- ❌ **Opinionated** — commits to Account-centric model; Close-style Lead-root-aggregate fans would need adaptation
- ❌ **Polymorphic Activity FKs** — nullable relations to three entities complicate query ergonomics (use `@@index` judiciously)
- ❌ **AuditLog as flat table** — can grow unbounded; needs partitioning strategy in production

---

## Pattern Comparison Matrix

| Dimension | ① Salesforce Party Model | ② HubSpot Pipeline Entity | ③ Close Lead Aggregate | ④ Pipedrive Schema-per-Tenant | ⑤ QBit Open-Source | ⑥ Lead Scoring | ⑦ Prisma Unified |
|---|---|---|---|---|---|---|---|
| **Multi-tenancy** | Implicit (org ID on every row) | Implicit (portal ID) | Implicit (workspace ID) | Schema-per-customer (isolated) | Row-level tenancy | Row-level tenancy | Row-level tenancy |
| **Schema flexibility** | Low (rigid SObject wiring) | High (JSON custom fields + pipelines as rows) | Low (Lead is fixed root) | Very High (JSONB per entity) | Medium (JSONB gating, fixed core) | High (config-driven factors) | High (JSON fields + enums) |
| **Audit capability** | Field-level history tables (per object) | Property history (auto per field) | Consolidated event log with coalescing | No built-in audit (app-layer only) | Append-only crm_audit_log (immutable) | Score-versioning only | Append-only AuditLog model |
| **Query complexity** | Many JOINs across 5+ objects | Moderate (pipeline + deal + contacts) | Low (Lead root → one query per timeline) | Moderate (polymorphic FKs + JSONB) | Moderate (polymorphic Activity) | Low (score lookup by lead) | Moderate (polymorphic Activity FKs) |
| **Pipeline analytics** | Stage history tables | Auto-calculated time-in-stage props | Via event log replay | Per-stage rot flag (no history) | crm_deal_stage_history table | Score trends over time | DealStageHistory + LeadScore |
| **Operational overhead** | Very High (platform-managed) | Medium (calculated property explosion) | Low (single model) | Very High (185K schemas to maintain) | Medium (partitioning + indexing) | Low (cron + expiration) | Low (Prisma Migrate) |
| **Best for** | Large enterprises with complex B2B buying committees | Mid-market needing flexible pipelines | SDR teams wanting simple, unified UI | Multi-tenant SaaS with custom fields | Open-source projects / self-hosted | Data-driven SDR prioritization | Greenfield CRM in Next.js + Prisma |

---

## 8. Data Import, Deduplication & Merge Engine

CRMs must ingest leads from CSV uploads, LinkedIn, Apollo, ZoomInfo, and web forms. This pattern implements a staged pipeline: raw import → field mapping → dedup resolution → merge or create.

### Schema

```typescript
interface ImportJob {
  id: string;
  source: 'csv' | 'linkedin' | 'apollo' | 'zoominfo' | 'web_form' | 'api';
  fileName?: string;
  recordCount: number;
  importedCount: number;
  skippedCount: number;
  mergedCount: number;
  errorCount: number;
  mappingConfig: FieldMapping[];
  status: 'pending' | 'mapping' | 'importing' | 'completed' | 'failed';
  createdById: string;
  createdAt: Date;
  completedAt?: Date;
}

interface FieldMapping {
  sourceField: string;         // e.g. "First Name" from CSV header
  targetField: string;         // e.g. "firstName" on Contact
  targetEntity: 'contact' | 'lead' | 'account' | 'deal';
  transform?: 'lowercase' | 'trim' | 'phone_format' | 'date_parse';
  isRequired: boolean;
  defaultValue?: string;
}

interface DedupRule {
  id: string;
  name: string;
  entityType: 'contact' | 'lead' | 'account';
  strategy: 'exact_match' | 'fuzzy' | 'email_domain' | 'phone';
  field: string;               // e.g. "email", "phone", "companyDomain"
  threshold?: number;          // 0.0–1.0 for fuzzy matching (e.g. 0.85)
  actionOnMatch: 'skip' | 'merge' | 'update' | 'create_duplicate';
  priority: number;            // rules run in priority order
}

interface MergeOperation {
  id: string;
  entityType: string;
  winnerId: string;            // surviving record
  loserIds: string[];          // absorbed records
  fieldConflicts: Array<{
    field: string;
    winnerValue: unknown;
    loserValue: unknown;
    resolution: 'use_winner' | 'use_loser' | 'append' | 'manual';
  }>;
  mergedAt: Date;
  mergedById: string;
  rollbackData?: Record<string, unknown>; // original values for undo
}

// Dedup engine — runs a chain of rules against incoming records
class DedupEngine {
  private rules: DedupRule[];

  constructor(rules: DedupRule[]) {
    this.rules = [...rules].sort((a, b) => a.priority - b.priority);
  }

  async findMatches(record: Partial<Contact>): Promise<MergeCandidate[]> {
    const candidates: MergeCandidate[] = [];

    for (const rule of this.rules) {
      const value = (record as any)[rule.field];
      if (!value) continue;

      const matches = await this.executeRule(rule, value);
      for (const match of matches) {
        candidates.push({
          ruleId: rule.id,
          matchedField: rule.field,
          matchedValue: value,
          confidence: match.score,
          existingId: match.id,
        });
      }
    }

    // De-duplicate candidates by existingId, keep highest confidence
    const best = new Map<string, MergeCandidate>();
    for (const c of candidates) {
      const existing = best.get(c.existingId);
      if (!existing || c.confidence > existing.confidence) {
        best.set(c.existingId, c);
      }
    }

    return Array.from(best.values()).sort((a, b) => b.confidence - a.confidence);
  }

  private async executeRule(rule: DedupRule, value: string): Promise<Array<{ id: string; score: number }>> {
    if (rule.strategy === 'exact_match') {
      return prisma.$queryRaw`
        SELECT id, 1.0 as score FROM "Contact"
        WHERE ${prisma.raw(rule.field)} = ${value}
        LIMIT 5
      `;
    }
    if (rule.strategy === 'fuzzy' && rule.threshold) {
      return prisma.$queryRaw`
        SELECT id, similarity(${prisma.raw(rule.field)}, ${value}) as score
        FROM "Contact"
        WHERE similarity(${prisma.raw(rule.field)}, ${value}) > ${rule.threshold}
        ORDER BY score DESC
        LIMIT 5
      `;
    }
    return [];
  }

  async resolveMerge(
    incoming: Partial<Contact>,
    match: MergeCandidate,
    rule: DedupRule,
  ): Promise<{ action: 'skipped' | 'merged' | 'updated'; mergeOp?: MergeOperation }> {
    if (rule.actionOnMatch === 'skip') {
      return { action: 'skipped' };
    }
    if (rule.actionOnMatch === 'merge') {
      return this.performMerge(match.existingId, incoming);
    }
    if (rule.actionOnMatch === 'update') {
      await prisma.contact.update({ where: { id: match.existingId }, data: incoming });
      return { action: 'updated' };
    }
    return { action: 'skipped' };
  }

  private async performMerge(winnerId: string, incoming: Partial<Contact>): Promise<{ action: 'merged'; mergeOp: MergeOperation }> {
    const conflictFields: Array<any> = [];
    const existing = await prisma.contact.findUnique({ where: { id: winnerId } });
    if (!existing) throw new Error('Winner not found');

    for (const [key, value] of Object.entries(incoming)) {
      if ((existing as any)[key] !== value && value != null) {
        conflictFields.push({ field: key, winnerValue: (existing as any)[key], loserValue: value, resolution: 'use_winner' });
      }
    }

    // Merge child records (activities, deals) from incoming record to winner
    // (simplified: relink all activities and deals to winner)

    const mergeOp: MergeOperation = {
      id: crypto.randomUUID(),
      entityType: 'contact',
      winnerId,
      loserIds: [],
      fieldConflicts: conflictFields,
      mergedAt: new Date(),
      mergedById: 'system',
    };

    return { action: 'merged', mergeOp };
  }
}

interface MergeCandidate {
  ruleId: string;
  matchedField: string;
  matchedValue: string;
  confidence: number;
  existingId: string;
}
```

### How It Works

The import pipeline separates **extraction** (parsing CSV, LinkedIn export, or API payload) from **mapping** (field name translation + transformation) from **dedup** (rule-based matching) from **action** (skip/merge/update/create). The `DedupEngine` runs a priority-ordered chain of rules — exact email match first, then fuzzy name match, then phone, then company domain. Each match gets a confidence score; for fuzzy matches Postgres `pg_trgm` similarity is used with a configurable threshold. On merge, field conflicts are recorded with a resolution strategy (`use_winner` by default) and child records are re-parented to the winner. The full `MergeOperation` is persisted for audit and rollback. This is the pattern used by Salesforce's duplicate rules, HubSpot's dedup, and Close's merge interface.

### Pros & Cons

- ✅ **Configurable rule chain** — run exact before fuzzy, email before phone; priority order prevents bad merges
- ✅ **Confidence scoring** — fuzzy matches with thresholds prevent false-positive merges
- ✅ **Auditable merge operations** — full field-conflict log enables undo and audit trail
- ❌ **Fuzzy matching performance** — `pg_trgm` similarity scans don't use B-tree indexes; requires GIN indexes at scale
- ❌ **Merge cascading** — re-parenting child records (activities, deals) is a multi-table affair that can time out for records with thousands of children
- ❌ **Rollback complexity** — undo requires restoring all child re-parenting and field values; rarely implemented in practice

---

## 9. Outbound Webhook & Integration Delivery

CRMs must notify external systems (Slack, Zapier, Make, custom webhooks) when events occur — deal stage changed, activity logged, contact created. This pattern implements a reliable webhook delivery engine with retry, dedup, and signing.

### Schema

```typescript
interface WebhookEndpoint {
  id: string;
  url: string;
  description?: string;
  events: WebhookEvent[];        // which events trigger this endpoint
  secret: string;                // HMAC signing secret
  headers: Record<string, string>; // custom headers (e.g. Authorization)
  retryConfig: {
    maxRetries: number;          // default 5
    backoffMinutes: number[];    // [1, 5, 15, 60, 360]
  };
  rateLimitPerMinute: number;
  isActive: boolean;
  lastDeliveredAt?: Date;
  lastFailureAt?: Date;
  createdAt: Date;
}

type WebhookEvent =
  | 'deal.created' | 'deal.stage_changed' | 'deal.won' | 'deal.lost'
  | 'contact.created' | 'contact.updated'
  | 'activity.logged'
  | 'lead.scored';

interface WebhookDelivery {
  id: string;
  endpointId: string;
  event: WebhookEvent;
  payload: Record<string, unknown>;
  signature: string;             // HMAC-SHA256 of payload
  status: 'queued' | 'delivering' | 'delivered' | 'failed' | 'exhausted';
  attemptCount: number;
  lastAttemptAt?: Date;
  nextRetryAt?: Date;
  responseStatusCode?: number;
  responseBody?: string;
  createdAt: Date;
}

class WebhookDispatcher {
  private queue: Queue;          // BullMQ queue for async delivery

  async dispatch(event: WebhookEvent, data: Record<string, unknown>): Promise<void> {
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { events: { has: event }, isActive: true },
    });

    for (const endpoint of endpoints) {
      const payload = this.buildPayload(event, data);
      const signature = this.sign(payload, endpoint.secret);

      const delivery = await prisma.webhookDelivery.create({
        data: {
          endpointId: endpoint.id,
          event,
          payload,
          signature,
          status: 'queued',
        },
      });

      await this.queue.add(`webhook-${delivery.id}`, {
        deliveryId: delivery.id,
        endpointId: endpoint.id,
        url: endpoint.url,
        payload,
        signature,
        headers: endpoint.headers,
        retryConfig: endpoint.retryConfig,
      });
    }
  }

  async processDelivery(job: { data: any }): Promise<boolean> {
    const { deliveryId, url, payload, signature, headers, retryConfig } = job.data;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Delivery-Id': deliveryId,
        ...headers,
      },
      body: JSON.stringify(payload),
    });

    const delivery = await prisma.webhookDelivery.findUnique({ where: { id: deliveryId } });
    if (!delivery) return true; // already processed

    if (response.ok) {
      await prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: { status: 'delivered', responseStatusCode: response.status, lastAttemptAt: new Date() },
      });
      return true;
    }

    // Retry with backoff
    const nextAttempt = delivery.attemptCount + 1;
    if (nextAttempt >= retryConfig.maxRetries) {
      await prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: { status: 'exhausted', attemptCount: nextAttempt, lastAttemptAt: new Date() },
      });
      throw new Error(`Webhook ${deliveryId} exhausted after ${nextAttempt} attempts`);
    }

    const backoffMs = retryConfig.backoffMinutes[nextAttempt - 1] * 60 * 1000;
    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: { status: 'failed', attemptCount: nextAttempt, lastAttemptAt: new Date(), nextRetryAt: new Date(Date.now() + backoffMs) },
    });

    throw new Error(`Webhook ${deliveryId} failed (attempt ${nextAttempt}), retrying in ${backoffMs}ms`);
  }

  private buildPayload(event: string, data: Record<string, unknown>): Record<string, unknown> {
    return {
      event,
      timestamp: new Date().toISOString(),
      data,
      // Idempotency key for dedup on consumer side
      id: crypto.randomUUID(),
    };
  }

  private sign(payload: Record<string, unknown>, secret: string): string {
    const crypto = require('crypto');
    return crypto.createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');
  }
}
```

### How It Works

When a CRM event fires (e.g., `deal.stage_changed`), the `WebhookDispatcher` finds all active endpoints subscribed to that event, builds a signed payload with an idempotency key, persists a `WebhookDelivery` record, and enqueues a BullMQ job. The worker POSTs the payload with an `X-Webhook-Signature` HMAC header. On non-2xx response, it retries with exponential backoff ([1min, 5min, 15min, 1h, 6h]) up to 5 attempts. After exhaustion, the delivery is marked `exhausted` and an admin alert fires. The idempotency key in the payload lets consumers detect duplicates. This is the pattern used by HubSpot's webhook system, Stripe's event delivery, and Zapier's polling architecture.

### Pros & Cons

- ✅ **Reliable delivery** — persisted queue + retry backoff guarantees at-least-once delivery
- ✅ **HMAC signing** — consumers verify payload integrity and origin
- ✅ **Idempotency keys** — consumers can safely deduplicate retried deliveries
- ❌ **At-least-once semantics** — consumers must handle duplicates; at-most-once would need a delivered-ack protocol
- ❌ **Endpoint rate limiting** — a misconfigured endpoint receiving 1000 events/minute can overwhelm a slow consumer
- ❌ **Payload size limits** — large payloads (e.g., deal with full contact history) can exceed webhook body limits (e.g., 256KB on some providers)

---

## 10. Full-Text Search Index for Cross-Entity Search

CRMs must search across contacts, deals, accounts, and activities from a single search bar. This pattern implements a unified search index using PostgreSQL full-text search with ranking, highlighting, and entity-scoped filtering.

### Schema

```sql
-- PostgreSQL full-text search configuration
-- Requires: CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Combined search view — materialized for performance
CREATE MATERIALIZED VIEW search_index AS
SELECT
  'contact' AS entity_type,
  c.id AS entity_id,
  c.first_name || ' ' || c.last_name AS title,
  c.email AS secondary_text,
  COALESCE(c.title, '') AS tertiary_text,
  -- Weighted search vector: A=name, B=email, C=title/company
  setweight(to_tsvector('english', COALESCE(c.first_name, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(c.last_name, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(c.email, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(c.title, '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(a.name, '')), 'C') AS search_vector,
  c.owner_id,
  c.updated_at AS last_activity
FROM contact c
LEFT JOIN account a ON a.id = c.account_id

UNION ALL

SELECT
  'deal' AS entity_type,
  d.id AS entity_id,
  d.title AS title,
  COALESCE(c.first_name || ' ' || c.last_name, '') AS secondary_text,
  COALESCE(d.value::text, '') AS tertiary_text,
  setweight(to_tsvector('english', COALESCE(d.title, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(d.description, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(c.first_name, '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(c.last_name, '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(a.name, '')), 'C') AS search_vector,
  d.owner_id,
  d.updated_at AS last_activity
FROM deal d
LEFT JOIN contact c ON c.id = d.primary_contact_id
LEFT JOIN account a ON a.id = d.account_id

UNION ALL

SELECT
  'account' AS entity_type,
  a.id AS entity_id,
  a.name AS title,
  COALESCE(a.domain, '') AS secondary_text,
  COALESCE(a.industry, '') AS tertiary_text,
  setweight(to_tsvector('english', COALESCE(a.name, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(a.domain, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(a.industry, '')), 'C') AS search_vector,
  a.owner_id,
  a.updated_at AS last_activity
FROM account a;

-- GIN index on the search vector
CREATE INDEX idx_search_vector ON search_index USING GIN(search_vector);

-- Refresh every 5 minutes or after mutations
CREATE OR REPLACE FUNCTION refresh_search_index()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY search_index;
END;
$$ LANGUAGE plpgsql;
```

```typescript
// Application-level search API
interface SearchQuery {
  q: string;
  entityTypes?: ('contact' | 'deal' | 'account' | 'activity')[];
  ownerId?: string;
  limit?: number;
  offset?: number;
}

interface SearchResult {
  entityType: string;
  entityId: string;
  title: string;
  secondaryText: string;
  tertiaryText: string;
  rank: number;
  highlight?: string;     // ts_headline output
  lastActivity: Date;
}

async function searchCRM(query: SearchQuery): Promise<{ results: SearchResult[]; total: number }> {
  const { q, entityTypes, ownerId, limit = 20, offset = 0 } = query;

  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  // Full-text query parsing
  const tsQuery = q
    .trim()
    .split(/\s+/)
    .map(word => word + ':*')   // prefix matching for partial words
    .join(' & ');

  conditions.push(`search_vector @@ to_tsquery('english', $${paramIndex})`);
  params.push(tsQuery);
  paramIndex++;

  if (entityTypes && entityTypes.length > 0) {
    conditions.push(`entity_type = ANY($${paramIndex}::text[])`);
    params.push(entityTypes);
    paramIndex++;
  }

  if (ownerId) {
    conditions.push(`owner_id = $${paramIndex}`);
    params.push(ownerId);
    paramIndex++;
  }

  const whereClause = conditions.join(' AND ');

  const results = await prisma.$queryRaw<SearchResult[]>`
    SELECT
      entity_type AS "entityType",
      entity_id AS "entityId",
      title,
      secondary_text AS "secondaryText",
      tertiary_text AS "tertiaryText",
      ts_rank(search_vector, to_tsquery('english', ${tsQuery})) AS rank,
      ts_headline('english', title, to_tsquery('english', ${tsQuery}),
        'StartSel=<mark>, StopSel=</mark>, MaxWords=30, MinWords=15') AS highlight,
      last_activity AS "lastActivity"
    FROM search_index
    WHERE ${prisma.raw(whereClause)}
    ORDER BY rank DESC, last_activity DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;

  const total = await prisma.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*) as count FROM search_index
    WHERE ${prisma.raw(whereClause)}
  `;

  return { results, total: Number(total[0].count) };
}
```

### How It Works

A materialized view `search_index` union-query joins contacts, deals, and accounts into a single flat table with a `tsvector` column. `setweight` assigns priority: name/ title gets weight `A` (highest), email/description gets `B`, secondary fields get `C`. The GIN index on `search_vector` enables fast `@@` contains queries. At query time, user input is parsed into a `tsquery` with prefix matching (`word:*`) so partial typing works. `ts_rank` scores results by relevance and `ts_headline` produces highlighted snippets with `<mark>` tags. The materialized view refreshes every 5 minutes via `pg_cron` or after mutations via a trigger-based refresh. This is the pattern used by Discourse's search, GitLab's global search, and close.io's cross-entity search.

### Pros & Cons

- ✅ **Single query, all entities** — one search returns contacts, deals, accounts ranked together
- ✅ **Weighted ranking** — name matches rank higher than email matches without application logic
- ✅ **Highlighted snippets** — `ts_headline` produces context-aware highlights for the UI
- ❌ **Materialized view staleness** — up to 5 minutes behind real-time; not suitable for "search right after create" flows
- ❌ **No fuzzy/typo tolerance** — `tsquery` with prefix matching doesn't handle misspellings or transpositions
- ❌ **PostgreSQL-specific** — the `tsvector`/`tsquery` syntax is not portable to MySQL or SQLite

---

## 11. GDPR / Data Retention & Soft Delete

CRMs must handle data lifecycle: soft delete with configurable retention periods, automatic anonymization of stale records, and permanent purging. This pattern implements a policy-driven data management engine.

### Schema

```sql
-- All core entities use a soft-delete pattern
ALTER TABLE contact ADD COLUMN deleted_at TIMESTAMP;
ALTER TABLE contact ADD COLUMN deleted_by_id UUID REFERENCES crm_user(id);
ALTER TABLE contact ADD COLUMN purge_at TIMESTAMP;     -- auto-purge after retention

ALTER TABLE deal ADD COLUMN deleted_at TIMESTAMP;
ALTER TABLE deal ADD COLUMN deleted_by_id UUID REFERENCES crm_user(id);
ALTER TABLE deal ADD COLUMN purge_at TIMESTAMP;

ALTER TABLE account ADD COLUMN deleted_at TIMESTAMP;
ALTER TABLE account ADD COLUMN deleted_by_id UUID REFERENCES crm_user(id);
ALTER TABLE account ADD COLUMN purge_at TIMESTAMP;

-- Retention policy configuration
CREATE TABLE retention_policy (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(50) NOT NULL,       -- 'contact', 'deal', 'account', 'activity', 'audit_log'
    soft_delete_retention_days INT NOT NULL, -- days before permanent purge (default 90)
    anonymize_after_days INT,               -- days before PII fields are nulled (default 365)
    anonymize_fields JSONB,                 -- ['email', 'phone', 'firstName', 'lastName']
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Default policies
INSERT INTO retention_policy (entity_type, soft_delete_retention_days, anonymize_after_days, anonymize_fields) VALUES
    ('contact', 90, 365, '["email", "phone", "firstName", "lastName", "title"]'::jsonb),
    ('deal', 90, NULL, NULL),
    ('account', 180, 365, '["name", "domain", "phone"]'::jsonb),
    ('activity', 30, NULL, NULL),
    ('audit_log', 730, NULL, NULL);          -- audit logs kept 2 years
```

```typescript
interface RetentionPolicy {
  entityType: string;
  softDeleteRetentionDays: number;
  anonymizeAfterDays: number | null;
  anonymizeFields: string[] | null;
}

class DataLifecycleManager {
  async softDelete(entityType: string, entityId: string, userId: string): Promise<void> {
    const model = this.getModel(entityType);
    const purgeAt = new Date();
    purgeAt.setDate(purgeAt.getDate() + 90); // default 90 days

    await model.update({
      where: { id: entityId },
      data: {
        deletedAt: new Date(),
        deletedById: userId,
        purgeAt,
      },
    });

    // Cascade soft-delete to child records
    if (entityType === 'contact') {
      await prisma.activity.updateMany({
        where: { contactId: entityId },
        data: { deletedAt: new Date() },
      });
    }
    if (entityType === 'account') {
      await prisma.contact.updateMany({
        where: { accountId: entityId },
        data: { deletedAt: new Date(), purgeAt },
      });
      await prisma.deal.updateMany({
        where: { accountId: entityId },
        data: { deletedAt: new Date(), purgeAt },
      });
    }
  }

  async restore(entityType: string, entityId: string): Promise<void> {
    const model = this.getModel(entityType);
    await model.update({
      where: { id: entityId },
      data: { deletedAt: null, deletedById: null, purgeAt: null },
    });
  }

  async purgeExpired(): Promise<number> {
    // Called by cron job — permanently deletes records past their purge date
    let totalPurged = 0;

    const policies = await prisma.retentionPolicy.findMany({ where: { isActive: true } });

    for (const policy of policies) {
      const model = this.getModel(policy.entityType);
      const expired = await model.findMany({
        where: {
          deletedAt: { not: null },
          purgeAt: { lte: new Date() },
        },
        select: { id: true },
      });

      if (expired.length === 0) continue;

      await model.deleteMany({
        where: { id: { in: expired.map((e: any) => e.id) } },
      });
      totalPurged += expired.length;
    }

    return totalPurged;
  }

  async anonymizeStalePII(): Promise<number> {
    // Null out PII fields on records that have passed the anonymization threshold
    let totalAnonymized = 0;

    const policies = await prisma.retentionPolicy.findMany({
      where: { isActive: true, anonymizeAfterDays: { not: null } },
    });

    for (const policy of policies) {
      const model = this.getModel(policy.entityType);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - policy.anonymizeAfterDays!);

      const anonFields: Record<string, null> = {};
      for (const field of (policy.anonymizeFields as string[]) || []) {
        anonFields[field] = null;
      }

      if (Object.keys(anonFields).length === 0) continue;

      const result = await model.updateMany({
        where: { updatedAt: { lte: cutoff }, deletedAt: null },
        data: { ...anonFields, updatedAt: new Date() },
      });

      totalAnonymized += result.count;
    }

    return totalAnonymized;
  }

  async exportDataForSubject(contactId: string): Promise<Record<string, unknown>> {
    // GDPR Article 15 — data subject access request
    const contact = await prisma.contact.findUnique({ where: { id: contactId } });
    const activities = await prisma.activity.findMany({ where: { contactId } });
    const deals = await prisma.deal.findMany({ where: { primaryContactId: contactId } });

    return {
      exportedAt: new Date().toISOString(),
      contact,
      activities,
      deals,
    };
  }

  private getModel(entityType: string): any {
    const models: Record<string, any> = {
      contact: prisma.contact,
      deal: prisma.deal,
      account: prisma.account,
      activity: prisma.activity,
    };
    return models[entityType];
  }
}
```

### How It Works

Every core entity gets `deleted_at`, `deleted_by_id`, and `purge_at` columns — soft delete hides records from all queries via a `WHERE deleted_at IS NULL` default scope. The `DataLifecycleManager` provides three cron-eligible operations: **softDelete** sets the timestamp and cascades to children; **purgeExpired** permanently deletes records past their `purge_at` date (configurable per entity via `retention_policy` table); **anonymizeStalePII** nulls out email, phone, name fields on records that haven't been updated in the configured anonymization window. `exportDataForSubject` assembles all data for a contact (GDPR Article 15). The audit log itself has a 2-year retention — after that, it's archived to cold storage. This matches the approach used by HubSpot's data retention, Salesforce's recycle bin (15–90 days), and Close's GDPR export tool.

### Pros & Cons

- ✅ **Configurable per entity** — contacts purge after 90 days, audit logs after 2 years
- ✅ **Automatic PII anonymization** — stale records become anonymous without manual admin work
- ✅ **Cascade soft deletes** — deleting an account also hides its contacts and deals
- ❌ **`WHERE deleted_at IS NULL` everywhere** — forgetting the filter leaks deleted records; use Prisma `@@where` or a view
- ❌ **Referential integrity on purge** — hard-deleting a contact with linked deals/activities requires nullifying FKs first
- ❌ **GDPR export completeness** — fully compliant export must include integration/webhook logs, email body content, and call recordings, not just database rows


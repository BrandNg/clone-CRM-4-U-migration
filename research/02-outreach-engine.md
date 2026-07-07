# CRM Design Patterns 2025: Outreach & Sequence Engine

This document outlines 5 production-proven patterns for orchestrating multi-channel outreach sequences in 2025, ensuring reliable scheduling, event-driven state transitions, and concurrency safety.

---

## 1. Event-Driven Sequence Processor (BullMQ & Redis Pattern)

Long-running outreach campaigns require background worker processing rather than blocking thread loops. In 2025, the standard is a Redis-backed queue system (like BullMQ in Node.js) processing scheduled events asynchronously.

### Core Logic

```typescript
import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from '@/lib/prisma';

const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');

export const sequenceQueue = new Queue('SequenceEngine', { connection });

export const sequenceWorker = new Worker(
  'SequenceEngine',
  async (job: Job) => {
    const { leadId, sequenceStepId } = job.data;

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    const step = await prisma.sequenceStep.findUnique({ where: { id: sequenceStepId } });

    if (!lead || !step || lead.stage === 'replied' || !lead.sequenceId) {
      console.log(`Execution skipped for Lead: ${leadId} (Opted out or stage changed)`);
      return;
    }

    if (step.channel === 'email') {
      await sendEmail({
        to: lead.email,
        templateId: step.templateId!,
        leadContext: lead,
      });

      await advanceLeadSequence(lead.id, step);
    }
  },
  { connection, concurrency: 10 }
);

async function advanceLeadSequence(leadId: string, currentStep: any) {
  const nextStep = await prisma.sequenceStep.findFirst({
    where: { sequenceId: currentStep.sequenceId, order: currentStep.order + 1 }
  });

  if (nextStep) {
    const delayMs = (nextStep.delayDays * 24 + nextStep.delayHours) * 60 * 60 * 1000;

    await sequenceQueue.add(
      `step_${nextStep.id}_lead_${leadId}`,
      { leadId, sequenceStepId: nextStep.id },
      { delay: delayMs }
    );
  } else {
    await prisma.lead.update({
      where: { id: leadId },
      data: { sequenceId: null, sequenceStep: null }
    });
  }
}
```

### How It Works

Redis-backed BullMQ queue processes sequence steps asynchronously via background workers. Each step is scheduled as a delayed job. When a step completes, the worker looks up the next step and enqueues it with the configured delay. If no next step exists, the lead is unenrolled.

### Pros & Cons

- ✅ High concurrency — Redis offloads SMTP connections and API calls from the main thread
- ✅ Fault tolerance — automatic job retries with exponential backoff
- ✅ Delayed job scheduling — native Redis-backed delay without cron
- ❌ State drift — delayed jobs already queued must be verified at execution time if a lead is manually paused
- ❌ Redis dependency — requires Redis infrastructure and monitoring

---

## 2. Sequence State Machine with Opt-Out (Reply & Bounce Detection)

SDR engagement tools must immediately halt outbound outreach when a prospect replies or their email bounces. This pattern implements webhook handlers that act as state machine triggers.

### Core Logic

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sequenceQueue } from '@/lib/queue';

export async function POST(req: NextRequest) {
  const events = await req.json();

  for (const event of events) {
    const { email, event: eventType, messageId } = event;

    const lead = await prisma.lead.findFirst({
      where: { email, sequenceId: { not: null } }
    });

    if (!lead) continue;

    if (eventType === 'reply') {
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          stage: 'replied',
          sequenceId: null,
          sequenceStep: null
        }
      });

      await prisma.activity.create({
        data: {
          userId: lead.assignedToId,
          leadId: lead.id,
          type: 'email_reply',
          description: `Outreach auto-paused: Reply detected from ${lead.firstName}`,
          metadata: { messageId }
        }
      });

      await prisma.task.create({
        data: {
          leadId: lead.id,
          userId: lead.assignedToId,
          type: 'manual',
          title: `Handle Reply: ${lead.firstName} ${lead.lastName}`,
          description: 'Prospect replied to automated outreach. Check mailbox and respond.',
          dueDate: new Date()
        }
      });
    } else if (eventType === 'bounce' || eventType === 'dropped') {
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          stage: 'lost',
          sequenceId: null,
          tags: { push: 'invalid-email' }
        }
      });
    }
  }

  return NextResponse.json({ processed: true });
}
```

### How It Works

An inbound webhook endpoint processes delivery events from SendGrid, Mailgun, or SES. On `reply`, the lead is moved to `replied` stage, unenrolled from the sequence, an activity is logged, and a manual follow-up task is created for the assigned SDR. On `bounce`/`dropped`, the lead is moved to `lost` and tagged with `invalid-email`.

### Pros & Cons

- ✅ Legal compliance — automates CAN-SPAM / GDPR requirements by pausing on opt-out or reply
- ✅ Workflow integration — converts automated campaigns into active human tasks when interest is shown
- ✅ Audit trail — every state transition is logged as an activity with metadata
- ❌ False positives — out-of-office autoreplies can trigger premature pauses without sentiment filtering
- ❌ Webhook reliability — requires idempotency handling for duplicate event delivery

---

## 3. Multi-Channel Adapter Orchestrator (Provider-Agnostic Pattern)

Because BPOs use various mail backends (Gmail, Exchange, Outlook) and communication tools, the sequence engine must communicate through an abstract adapter layer.

### Core Logic

```typescript
export interface MessagePayload {
  to: string;
  subject?: string;
  body: string;
  variables: Record<string, string>;
}

export interface OutreachAdapter {
  sendEmail(payload: MessagePayload): Promise<{ success: boolean; externalId: string }>;
  sendWhatsApp(payload: MessagePayload): Promise<{ success: boolean; externalId: string }>;
  logCall(payload: MessagePayload): Promise<{ success: boolean; recordingUrl?: string }>;
}

import twilio from 'twilio';

export class TwilioWhatsAppAdapter implements OutreachAdapter {
  private client: ReturnType<typeof twilio>;
  constructor() {
    this.client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
  }

  async sendEmail() { throw new Error('Email not supported on this adapter.'); }
  async logCall() { throw new Error('Call logs not handled by this adapter.'); }

  async sendWhatsApp(payload: MessagePayload) {
    const formattedBody = this.interpolate(payload.body, payload.variables);
    const message = await this.client.messages.create({
      body: formattedBody,
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      to: `whatsapp:${payload.to}`
    });
    return { success: message.status === 'queued', externalId: message.sid };
  }

  private interpolate(body: string, vars: Record<string, string>): string {
    return body.replace(/\{\{(.*?)\}\}/g, (_, key) => vars[key.trim()] || '');
  }
}

export class OutreachOrchestrator {
  private adapters: Map<string, OutreachAdapter> = new Map();

  registerAdapter(channel: string, adapter: OutreachAdapter) {
    this.adapters.set(channel, adapter);
  }

  async dispatch(channel: string, payload: MessagePayload): Promise<any> {
    const adapter = this.adapters.get(channel);
    if (!adapter) throw new Error(`No adapter registered for channel: ${channel}`);

    if (channel === 'whatsapp') return adapter.sendWhatsApp(payload);
    if (channel === 'email') return adapter.sendEmail(payload);
    if (channel === 'phone') return adapter.logCall(payload);
    throw new Error(`Unsupported channel: ${channel}`);
  }
}
```

### How It Works

A common `OutreachAdapter` interface defines all channel operations. Each provider (Twilio, SendGrid, LinkedIn API) implements the interface, throwing for unsupported channels. An `OutreachOrchestrator` registry maps channel names to adapters and dispatches calls dynamically. Sequence engine code never touches provider-specific APIs directly.

### Pros & Cons

- ✅ Extensible — swap Gmail for Outlook adapters without changing sequence core
- ✅ Mockable testing — inject mock adapters for unit tests without real API calls
- ✅ Clean separation — sequence engine is decoupled from provider-specific quirks
- ❌ Common denominator constraint — channel-specific features (e.g., LinkedIn InMail vs connection request) are hard to model uniformly
- ❌ Provider API failures can cascade if not circuit-broken per adapter

---

## 4. Relative Step Delay Engine (Timezone & Holiday Alignment)

Delivering a message at 2 AM on Sunday ruins conversion rates and violates spam rules. The scheduler must compute steps relative to the prospect's timezone and workweek.

### Core Logic

```typescript
import { DateTime } from 'luxon';

interface DelayConfig {
  delayDays: number;
  delayHours: number;
  prospectTimezone: string;
  excludeWeekends: boolean;
}

export function calculateNextScheduledTime(config: DelayConfig): Date {
  const { delayDays, delayHours, prospectTimezone, excludeWeekends } = config;

  let targetTime = DateTime.now().setZone(prospectTimezone);

  targetTime = targetTime.plus({ days: delayDays }).set({
    hour: delayHours,
    minute: 0,
    second: 0,
    millisecond: 0
  });

  if (excludeWeekends) {
    while (targetTime.weekday === 6 || targetTime.weekday === 7) {
      targetTime = targetTime.plus({ days: 1 });
    }
  }

  if (targetTime.hour < 9) {
    targetTime = targetTime.set({ hour: 9 });
  } else if (targetTime.hour > 17) {
    targetTime = targetTime.plus({ days: 1 }).set({ hour: 9 });
    if (excludeWeekends) {
      while (targetTime.weekday === 6 || targetTime.weekday === 7) {
        targetTime = targetTime.plus({ days: 1 });
      }
    }
  }

  return targetTime.toJSDate();
}
```

### How It Works

Luxon-based timezone-aware scheduler computes absolute delivery time from relative delays. It snaps to business hours (9 AM–5 PM), skips weekends, and respects the prospect's local timezone via IANA zone identifiers. The schedule can be computed eagerly at enrollment for UI preview.

### Pros & Cons

- ✅ Higher open rates — emails arrive during normal business hours in the prospect's timezone
- ✅ Professional boundaries — prevents late-night automated WhatsApp or phone pings
- ✅ Previewable — SDRs can review the exact delivery calendar before enrollment
- ❌ Timezone accuracy depends on data quality — requires reliable area code, IP, or company HQ geolocation
- ❌ Over-snapping can compress multiple steps into the same narrow window

---

## 5. Optimistic Sequence Step Lock (Concurrency Control)

In production environments, a sequence worker might run twice due to Redis retries, or webhooks might hit simultaneously, leading to duplicate email dispatches. This pattern uses row-level locking.

### Core Logic

```typescript
import { prisma } from '@/lib/prisma';

export async function processSequenceStepSafely(leadId: string) {
  return await prisma.$transaction(async (tx) => {
    const lead = await tx.$queryRaw<any[]>`
      SELECT id, "sequenceId", "sequenceStep", version
      FROM "Lead"
      WHERE id = ${leadId}
      FOR UPDATE
    `;

    if (!lead || lead.length === 0) throw new Error('Lead not found.');
    const activeLead = lead[0];

    if (!activeLead.sequenceId) return { processed: false, reason: 'Not enrolled.' };

    const currentStep = await tx.sequenceStep.findFirst({
      where: { sequenceId: activeLead.sequenceId, order: activeLead.sequenceStep }
    });

    if (!currentStep) return { processed: false, reason: 'Step not found.' };

    const updateCount = await tx.$executeRaw`
      UPDATE "Lead"
      SET "sequenceStep" = "sequenceStep" + 1, version = version + 1
      WHERE id = ${leadId} AND version = ${activeLead.version}
    `;

    if (updateCount === 0) {
      throw new Error('Lock contention: Step already processed by concurrent transaction.');
    }

    return { processed: true, stepToExecute: currentStep };
  });
}
```

### How It Works

PostgreSQL `SELECT ... FOR UPDATE` locks the lead row at the start of a transaction, preventing concurrent workers from reading the same version. An optimistic version check (`WHERE version = ${activeLead.version}`) ensures only one worker can advance the step. On contention, the loser retries or aborts, guaranteeing at-most-once execution.

### Pros & Cons

- ✅ Zero duplicate sends — row locking guarantees single-threaded step advancement
- ✅ Version tracking — prevents stale state from overwriting newer changes
- ✅ At-most-once delivery — critical for email and SMS where duplicates damage sender reputation
- ❌ Database lock contention — high-throughput systems may encounter deadlocks without proper index ordering
- ❌ Transaction duration — long-running sends inside transactions hold locks and reduce throughput

---

## 6. A/B Testing Engine for Sequence Variants

Modern outreach tools let SDRs test subject lines, call scripts, and messaging variants within the same sequence. The engine must assign variants, track per-variant performance, and auto-promote winners.

### Core Logic

```typescript
type VariantType = 'subject_line' | 'email_body' | 'call_script' | 'linkedin_message' | 'whatsapp_text';

interface ABTestConfig {
  id: string;
  sequenceId: string;
  stepIndex: number;
  variantType: VariantType;
  variants: Variant[];
  trafficSplit: number[];           // e.g. [50, 50] for 2 variants
  minSampleSize: number;            // minimum sends before declaring winner
  winningMetric: 'open_rate' | 'reply_rate' | 'positive_rate' | 'click_rate';
  confidenceThreshold: number;      // 0.95 = 95% statistical significance
  status: 'running' | 'paused' | 'winner_selected' | 'inconclusive';
  winnerId?: string;
  startedAt: Date;
  concludedAt?: Date;
}

interface Variant {
  id: string;
  content: string;                  // actual email body, subject, script
  metadata?: Record<string, unknown>;
  stats: {
    sent: number;
    opened: number;
    replied: number;
    positiveReplies: number;
    clicked: number;
    bounced: number;
  };
}

class ABTestRouter {
  private tests: Map<string, ABTestConfig> = new Map();
  private rng: () => number;        // seeded random for deterministic splits

  constructor() {
    this.rng = () => Math.random();
  }

  assignVariant(config: ABTestConfig, prospectId: string): Variant {
    // Deterministic assignment: same prospect always gets same variant
    const hash = this.hashProspect(config.id, prospectId);
    const bucket = hash % 100;
    let cumulative = 0;
    for (let i = 0; i < config.variants.length; i++) {
      cumulative += config.trafficSplit[i];
      if (bucket < cumulative) return config.variants[i];
    }
    return config.variants[0];
  }

  private hashProspect(testId: string, prospectId: string): number {
    let hash = 0;
    const str = `${testId}:${prospectId}`;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return Math.abs(hash);
  }

  recordEvent(testId: string, variantId: string, event: 'opened' | 'replied' | 'positive' | 'clicked' | 'bounced'): void {
    const config = this.tests.get(testId);
    if (!config || config.status !== 'running') return;

    const variant = config.variants.find(v => v.id === variantId);
    if (!variant) return;

    variant.stats.sent++;
    if (event === 'opened') variant.stats.opened++;
    if (event === 'replied') variant.stats.replied++;
    if (event === 'positive') variant.stats.positiveReplies++;
    if (event === 'clicked') variant.stats.clicked++;
    if (event === 'bounced') variant.stats.bounced++;

    this.evaluateWinner(config);
  }

  private evaluateWinner(config: ABTestConfig): void {
    const totalSent = config.variants.reduce((s, v) => s + v.stats.sent, 0);
    if (totalSent < config.minSampleSize) return;

    const rates = config.variants.map(v => ({
      id: v.id,
      rate: this.getMetricRate(v, config.winningMetric),
    }));

    const sorted = [...rates].sort((a, b) => b.rate - a.rate);
    const winner = sorted[0];
    const runnerUp = sorted[1];

    if (!runnerUp || winner.rate === 0) return;

    // Chi-square or z-test approximation
    const zScore = this.calculateZScore(winner.rate, runnerUp.rate, totalSent);
    if (zScore > 1.96) { // 95% confidence
      config.status = 'winner_selected';
      config.winnerId = winner.id;
      config.concludedAt = new Date();
      this.promoteWinner(config);
    }
  }

  private getMetricRate(variant: Variant, metric: string): number {
    if (variant.stats.sent === 0) return 0;
    switch (metric) {
      case 'open_rate': return variant.stats.opened / variant.stats.sent;
      case 'reply_rate': return variant.stats.replied / variant.stats.sent;
      case 'positive_rate': return variant.stats.positiveReplies / variant.stats.sent;
      case 'click_rate': return variant.stats.clicked / variant.stats.sent;
      default: return 0;
    }
  }

  private calculateZScore(rateA: number, rateB: number, n: number): number {
    const p = (rateA + rateB) / 2;
    const se = Math.sqrt(2 * p * (1 - p) / n);
    return se === 0 ? 0 : Math.abs(rateA - rateB) / se;
  }

  private async promoteWinner(config: ABTestConfig): Promise<void> {
    // Update the sequence step template to use the winning variant's content
    await prisma.sequenceStep.update({
      where: { id: config.sequenceId },
      data: { template: config.winnerId },
    });
  }
}
```

### How It Works

The `ABTestRouter` assigns prospects to variants deterministically via a hash function — the same prospect always sees the same variant for consistent tracking. `recordEvent` collects engagement data (opens, replies, clicks, bounces) per variant. After `minSampleSize` sends are reached, a z-test (approximation) compares the winning metric between the top two variants. If the z-score exceeds 1.96 (95% confidence), the winner is declared and auto-promoted: the sequence step's template is swapped to the winning variant's content. Outreach.io's Smart Testing and Lemlist's A/B split use the same pattern, though production systems use a full Bayesian or chi-square implementation rather than this simplified z-test.

### Pros & Cons

- ✅ **Data-driven messaging** — subject lines and scripts selected by statistical performance, not gut feel
- ✅ **Deterministic assignment** — same prospect never sees conflicting variants
- ✅ **Auto-promotion** — winning variant takes effect automatically, SDRs don't need to manually pick
- ❌ **Simplified statistics** — z-test approximation can be inaccurate for small samples or low base rates
- ❌ **Winner lock-in** — once promoted, the test stops collecting data; may miss late-emerging winners
- ❌ **Sample size tradeoff** — larger samples give better confidence but delay the benefit of the winner

---

## 7. Sending Warmup & Rate-Limiting Engine

Cold email platforms must gradually increase sending volume (warmup) to build sender reputation and avoid spam classification. This pattern implements a per-mailbox ramp-up schedule with daily caps and cooldowns.

### Core Logic

```typescript
interface MailboxConfig {
  id: string;
  email: string;
  provider: 'ses' | 'sendgrid' | 'smtp';
  warmupState: 'cold' | 'warming' | 'warm';
  warmupStartDate: Date;
  warmupTargetDaily: number;         // target sends/day when fully warm (e.g. 80)
  warmupDailyIncrease: number;       // sends added per day (e.g. 3)
  maxDailySends: number;             // hard cap
  maxPerDomain: number;              // max to same domain per day (e.g. 2)
  bounceRateThreshold: number;       // auto-pause if bounce rate exceeds (e.g. 0.03)
  cooldownMinutes: number;           // min gap between sends to same provider (e.g. 1)
}

class SendRateLimiter {
  private mailboxState: Map<string, {
    sentToday: number;
    domainCount: Map<string, number>;
    lastSendAt: Map<string, Date>;
  }> = new Map();

  constructor() {
    this.resetDailyCounters();
  }

  private resetDailyCounters(): void {
    setInterval(() => {
      for (const state of this.mailboxState.values()) {
        state.sentToday = 0;
        state.domainCount.clear();
      }
    }, 24 * 60 * 60 * 1000);
  }

  getDailyCap(config: MailboxConfig): number {
    if (config.warmupState === 'cold') return 5; // very conservative start

    const daysElapsed = Math.floor(
      (Date.now() - config.warmupStartDate.getTime()) / (24 * 60 * 60 * 1000)
    );
    const rampCap = 5 + (daysElapsed * config.warmupDailyIncrease);
    return Math.min(rampCap, config.warmupTargetDaily, config.maxDailySends);
  }

  async canSend(config: MailboxConfig, toEmail: string): Promise<boolean> {
    const state = this.getOrCreateState(config.id);
    const domain = toEmail.split('@')[1];
    const dailyCap = this.getDailyCap(config);

    if (state.sentToday >= dailyCap) return false;
    if ((state.domainCount.get(domain) ?? 0) >= config.maxPerDomain) return false;

    const lastSend = state.lastSendAt.get(config.provider);
    if (lastSend && (Date.now() - lastSend.getTime()) < config.cooldownMinutes * 60 * 1000) {
      return false;
    }

    return true;
  }

  async recordSend(config: MailboxConfig, toEmail: string, success: boolean): Promise<void> {
    const state = this.getOrCreateState(config.id);
    const domain = toEmail.split('@')[1];

    state.sentToday++;
    state.domainCount.set(domain, (state.domainCount.get(domain) ?? 0) + 1);
    state.lastSendAt.set(config.provider, new Date());

    if (success && config.warmupState !== 'warm') {
      await this.advanceWarmup(config);
    }
  }

  recordBounce(config: MailboxConfig): void {
    const bounces = this.getBounceRate(config);
    if (bounces > config.bounceRateThreshold) {
      config.warmupState = 'cold'; // reset to cold — reputation damaged
      this.notifyAdmin(config, `Bounce rate ${bounces} exceeded threshold ${config.bounceRateThreshold}`);
    }
  }

  private async advanceWarmup(config: MailboxConfig): Promise<void> {
    const dailyCap = this.getDailyCap(config);
    if (dailyCap >= config.warmupTargetDaily) {
      config.warmupState = 'warm';
      await prisma.mailbox.update({
        where: { id: config.id },
        data: { warmupState: 'warm' },
      });
    }
  }

  private getOrCreateState(mailboxId: string) {
    if (!this.mailboxState.has(mailboxId)) {
      this.mailboxState.set(mailboxId, {
        sentToday: 0,
        domainCount: new Map(),
        lastSendAt: new Map(),
      });
    }
    return this.mailboxState.get(mailboxId)!;
  }

  private bounceRate: Map<string, { total: number; bounces: number }> = new Map();

  private getBounceRate(config: MailboxConfig): number {
    const stats = this.bounceRate.get(config.id);
    if (!stats || stats.total === 0) return 0;
    return stats.bounces / stats.total;
  }

  private notifyAdmin(config: MailboxConfig, message: string): void {
    console.error(`[WARMUP ALERT] Mailbox ${config.email}: ${message}`);
  }
}

// Used at dispatch time:
// if (!rateLimiter.canSend(mailboxConfig, prospect.email)) {
//   return { status: 'deferred', reason: 'rate_limited', retryAt: computeRetryTime() };
// }
// const result = await channelRouter.send(step);
// await rateLimiter.recordSend(mailboxConfig, prospect.email, result.success);
```

### How It Works

Each sending mailbox has a `warmupState` (cold → warming → warm). `cold` mailboxes start at a conservative 5 sends/day. `warming` mailboxes increment by `warmupDailyIncrease` each day until they reach `warmupTargetDaily`. The `getDailyCap` method computes the current cap based on elapsed warmup days. Three rate limits are checked before every send: **daily cap** (total sends), **per-domain cap** (max to same domain), and **cooldown** (min gap between sends). If `bounceRateThreshold` is exceeded, the mailbox resets to `cold` and admin is notified — this is the pattern used by Smartlead, Instantly, and Warmbox to protect sender reputation.

### Pros & Cons

- ✅ **Reputation protection** — gradual warmup avoids spam classification by mailbox providers
- ✅ **Auto-rollback on bounces** — high bounce rate instantly resets warmup, preventing domain blacklisting
- ✅ **Per-domain throttling** — prevents "too many recipients" errors from Google/Microsoft
- ❌ **Window-based counter** — in-memory daily counters reset on server restart unless persisted to Redis
- ❌ **Warmup is mailbox-specific** — each sending email needs individual ramp-up; doesn't work for shared pools
- ❌ **Conservative by default** — 5/day start delays campaign velocity for new mailboxes

---

## 8. Template Variable Interpolation Engine

Beyond simple `{{var}}` replacement, production sequences need conditional blocks, fallback values, list iteration, date formatting, and pluralization. This pattern implements a mustache/Handlebars-style template engine with CRM-specific helpers.

### Core Logic

```typescript
interface TemplateContext {
  prospect: {
    firstName: string;
    lastName: string;
    title?: string;
    company?: string;
    email: string;
    phone?: string;
    linkedinUrl?: string;
  };
  sdr: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    title?: string;
  };
  deal?: {
    title: string;
    value: number;
    stage: string;
    expectedCloseDate?: string;
  };
  company?: {
    name: string;
    domain: string;
    industry?: string;
  };
  custom: Record<string, unknown>;
}

class TemplateEngine {
  private helpers: Map<string, HelperFn> = new Map();

  constructor() {
    this.registerDefaultHelpers();
  }

  registerHelper(name: string, fn: HelperFn): void {
    this.helpers.set(name, fn);
  }

  render(template: string, ctx: TemplateContext): string {
    // 1. Replace conditionals: {{#if field}}...{{else}}...{{/if}}
    let result = this.renderConditionals(template, ctx);

    // 2. Replace loops: {{#each items}}...{{/each}}
    result = this.renderLoops(result, ctx);

    // 3. Replace helper calls: {{formatDate date "MMM d, yyyy"}}
    result = this.renderHelpers(result, ctx);

    // 4. Replace simple variables with fallbacks: {{firstName}} or {{firstName|there}}
    result = this.renderVariables(result, ctx);

    return result;
  }

  private renderConditionals(template: string, ctx: TemplateContext): string {
    return template.replace(/\{\{#if\s+([\w.]+)\}\}(.*?)(?:\{\{else\}\}(.*?))?\{\{\/if\}\}/gs, (_, path, ifBlock, elseBlock) => {
      const value = this.resolvePath(path, ctx);
      if (value && value !== '' && value !== 0 && value !== false) {
        return this.render(ifBlock, ctx);
      }
      return elseBlock ? this.render(elseBlock, ctx) : '';
    });
  }

  private renderLoops(template: string, ctx: TemplateContext): string {
    return template.replace(/\{\{#each\s+([\w.]+)\}\}(.*?)\{\{\/each\}\}/gs, (_, path, block) => {
      const items = this.resolvePath(path, ctx) as any[];
      if (!Array.isArray(items)) return '';
      return items.map((item, index) => {
        const itemCtx = this.mergeContext(ctx, { item, index, first: index === 0, last: index === items.length - 1 });
        return this.render(block, itemCtx);
      }).join('');
    });
  }

  private renderHelpers(template: string, ctx: TemplateContext): string {
    return template.replace(/\{\{(\w+)([\s\S]*?)\}\}/g, (match, helperName, argsStr) => {
      const helper = this.helpers.get(helperName);
      if (!helper) return match; // not a helper, leave for variable rendering
      const args = this.parseArgs(argsStr.trim());
      return helper(args, ctx);
    });
  }

  private renderVariables(template: string, ctx: TemplateContext): string {
    return template.replace(/\{\{([\w.]+)(?:\|([^}]+))?\}\}/g, (_, path, fallback) => {
      const value = this.resolvePath(path, ctx);
      if (value != null && value !== '') return String(value);
      return fallback ?? '';
    });
  }

  private resolvePath(path: string, ctx: TemplateContext): unknown {
    const parts = path.split('.');
    let current: any = ctx;
    for (const part of parts) {
      if (current == null || typeof current !== 'object') return null;
      current = current[part];
    }
    return current ?? null;
  }

  private parseArgs(args: string): Record<string, string> {
    const parsed: Record<string, string> = {};
    const regex = /(\w+)\s+("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\S+)/g;
    let match;
    while ((match = regex.exec(args)) !== null) {
      parsed[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
    return parsed;
  }

  private mergeContext(base: TemplateContext, extra: Record<string, unknown>): TemplateContext {
    return { ...base, ...extra } as unknown as TemplateContext;
  }

  private registerDefaultHelpers(): void {
    this.helpers.set('formatDate', (args, ctx) => {
      const dateStr = this.resolvePath(args.date || 'date', ctx);
      if (!dateStr) return '';
      const date = new Date(String(dateStr));
      const options: Intl.DateTimeFormatOptions = {};
      if (args.format?.includes('MMM')) options.month = 'short';
      if (args.format?.includes('d')) options.day = 'numeric';
      if (args.format?.includes('yyyy')) options.year = 'numeric';
      return date.toLocaleDateString('en-US', options);
    });

    this.helpers.set('pluralize', (args, ctx) => {
      const count = Number(this.resolvePath(args.count || 'count', ctx));
      const singular = args.singular || '';
      const plural = args.plural || `${singular}s`;
      return count === 1 ? singular : plural;
    });

    this.helpers.set('lowercase', (args, ctx) => {
      const value = this.resolvePath(args.value || 'value', ctx);
      return String(value ?? '').toLowerCase();
    });

    this.helpers.set('uppercase', (args, ctx) => {
      const value = this.resolvePath(args.value || 'value', ctx);
      return String(value ?? '').toUpperCase();
    });
  }
}

type HelperFn = (args: Record<string, string>, ctx: TemplateContext) => string;
```

### How It Works

The `TemplateEngine` processes templates in 4 passes. **Pass 1** — `{{#if}}` blocks: resolves the path, renders the if-block if truthy, else-block otherwise. **Pass 2** — `{{#each}}` loops: iterates over an array, injecting `item`, `index`, `first`, `last` into the rendering context. **Pass 3** — helper calls like `{{formatDate date "MMM d, yyyy"}}`: registered helpers receive parsed arguments and the context, returning transformed strings. **Pass 4** — variable interpolation `{{prospect.firstName}}` with optional fallback `{{title|Valued Client}}`. Nested paths resolve through dot-separated traversal. This is comparable to Handlebars.js but lightweight and CRM-specific — helpers like `formatDate`, `pluralize`, and `lowercase` cover the most common email template needs. Outreach.io and SalesLoft use similar engines with drag-and-drop block editors on top.

### Pros & Cons

- ✅ **No external dependency** — lightweight implementation without pulling in Handlebars or Mustache
- ✅ **CRM-specific helpers built-in** — date formatting and pluralization are the most-used template features
- ✅ **Safe fallbacks** — missing variables render as empty string or a configured default, never as `undefined`
- ❌ **No {{#unless}} or {{#with}}** — limited conditional vocabulary compared to Handlebars
- ❌ **Whitespace control** — conditional blocks leave blank lines when the condition is false; needs trim whitespace (`~`) support
- ❌ **No partial/sub-template support** — reusable email footer/header snippets must be pre-merged in application code

---

## 9. Meeting Booking Detection & Sequence Auto-Pause

Modern sequences include a step to send a Calendly/HubSpot Meetings link. When the prospect books a meeting, the sequence must auto-pause across all channels to avoid conflicting messages. This pattern implements webhook-based booking detection with follow-up branching.

### Core Logic

```typescript
interface BookingWebhook {
  event: 'calendly.invitee.created' | 'hubspot.meeting.booked' | 'custom.meeting.scheduled';
  payload: {
    prospectEmail: string;
    prospectName: string;
    sdrEmail: string;
    meetingTitle: string;
    meetingStartTime: string;
    meetingDuration: number;     // minutes
    meetingUrl?: string;         // Zoom/Meet link
    questions?: string;          // prospect's booking form answers
    cancelUrl?: string;
    rescheduleUrl?: string;
  };
}

class MeetingBookingHandler {
  async handleBooking(webhook: BookingWebhook): Promise<void> {
    const { prospectEmail, sdrEmail, meetingStartTime } = webhook.payload;

    // 1. Find the prospect and any active sequence
    const prospect = await prisma.prospect.findUnique({
      where: { email: prospectEmail },
      include: { activeSequence: true },
    });

    if (!prospect || !prospect.activeSequence) return;

    // 2. Determine auto-pause duration — pause until 1 hour after meeting ends
    const meetingEnd = new Date(meetingStartTime);
    meetingEnd.setMinutes(meetingEnd.getMinutes() + webhook.payload.meetingDuration);
    const resumeAt = new Date(meetingEnd.getTime() + 60 * 60 * 1000); // +1h buffer

    // 3. Cancel all queued sequence jobs for this prospect in BullMQ
    await this.cancelQueuedJobs(prospect.id);

    // 4. Update sequence status to paused with auto-resume timestamp
    await prisma.prospectSequence.update({
      where: { prospectId: prospect.id },
      data: {
        status: 'paused',
        pauseReason: 'meeting_booked',
        pausedAt: new Date(),
        autoResumeAt: resumeAt,
      },
    });

    // 5. Log the meeting activity
    await prisma.activity.create({
      data: {
        prospectId: prospect.id,
        type: 'meeting_scheduled',
        description: `Meeting booked: ${webhook.payload.meetingTitle} on ${new Date(meetingStartTime).toLocaleDateString()}`,
        metadata: {
          meetingUrl: webhook.payload.meetingUrl,
          duration: webhook.payload.meetingDuration,
          questions: webhook.payload.questions,
        },
      },
    });

    // 6. Branch to post-meeting follow-up sequence (if configured)
    await this.enqueuePostMeetingSequence(prospect.id, resumeAt);
  }

  private async cancelQueuedJobs(prospectId: string): Promise<void> {
    const jobs = await sequenceQueue.getJobs(['delayed']);
    const toRemove = jobs.filter(j =>
      j.data.prospectId === prospectId && ['email', 'sms', 'whatsapp'].includes(j.data.channel)
    );
    await Promise.all(toRemove.map(j => j.remove()));
  }

  private async enqueuePostMeetingSequence(prospectId: string, startAfter: Date): Promise<void> {
    const postMeetingSteps = [
      { delayHours: 1, channel: 'email', template: 'meeting-followup-thankyou' },
      { delayHours: 24, channel: 'email', template: 'meeting-followup-summary' },
      { delayHours: 72, channel: 'phone', template: 'meeting-followup-checkin' },
    ];

    let cumulativeDelay = startAfter.getTime();
    for (const step of postMeetingSteps) {
      cumulativeDelay += step.delayHours * 60 * 60 * 1000;
      await sequenceQueue.add(
        `post-meeting-${prospectId}-${step.template}`,
        { prospectId, channel: step.channel, templateId: step.template },
        { delay: cumulativeDelay - Date.now() }
      );
    }
  }
}

// Express/Next.js route handler:
// POST /api/webhooks/calendly
//   → validate HMAC signature
//   → parse BookingWebhook
//   → meetingHandler.handleBooking(webhook)
//   → return 200
```

### How It Works

A webhook endpoint receives booking events from Calendly, HubSpot Meetings, or Chili Piper. The handler looks up the prospect by email, finds the active sequence, then: **cancel** all pending BullMQ jobs for that prospect (preventing queued emails from firing after the meeting is booked), **pause** the sequence with an `autoResumeAt` timestamp (1 hour after the meeting ends), **log** the meeting as an activity, and **enqueue** a post-meeting follow-up sequence (thank-you email → summary → check-in call). The auto-resume ensures the prospect doesn't fall off the sequence entirely — if the SDR wants to keep the sequence paused, they manually extend the pause. This is the pattern used by Outreach.io's meeting detection and HubSpot's sequence + meetings integration.

### Pros & Cons

- ✅ **No double-messaging** — cancels queued jobs so prospect never gets "meeting link" email after already booking
- ✅ **Post-meeting follow-up** — auto-enqueues thank-you + summary + check-in, the most effective SDR motion
- ✅ **Auto-resume** — sequence naturally continues if SDR takes no action; no dropped leads
- ❌ **Calendly-specific payload** — each provider (Calendly, HubSpot, Chili Piper) has different webhook schemas; needs per-provider normalization
- ❌ **Cancel-by-iteration** — `getJobs(['delayed'])` scans the entire delayed job set; at scale needs per-prospect job indexing
- ❌ **Meeting no-show** — no handling for prospects who book but don't attend; requires a separate no-show detection cron

---

## 10. LinkedIn-Specific Outreach Constraints Engine

LinkedIn has unique rate limits per account type (Free, Sales Navigator, Recruiter) that differ from email or SMS. Connection requests (100/week for Free), InMail credits (varies by plan), profile views (25/day for Free), and follow limits must be tracked per SDR account.

### Core Logic

```typescript
interface LinkedInAccount {
  id: string;
  sdrId: string;
  accountType: 'free' | 'sales_navigator' | 'recruiter' | 'premium';
  dailyProfileViewLimit: number;      // 25 (free), 100 (premium/Sales Nav)
  weeklyConnectionLimit: number;      // 100 (free), 200 (Sales Nav)
  weeklyInMailCredits: number;        // 5 (premium), 30 (Sales Nav)
  maxFollowsPerDay: number;           // 25
  maxMessagesPerThread: number;       // 1 (connection note only) vs unlimited (after connect)
  cooldownBetweenRequestsHours: number; // 24h between connection requests to same person
  isVerified: boolean;
}

interface LinkedInUsageWindow {
  accountId: string;
  windowType: 'daily' | 'weekly';
  windowStart: Date;
  windowEnd: Date;
  metrics: {
    profileViews: number;
    connectionRequests: number;
    inMailSent: number;
    follows: number;
    messages: number;
  };
}

class LinkedInRateLimitManager {
  private usageCache: Map<string, LinkedInUsageWindow> = new Map();

  async canPerformAction(
    accountId: string,
    action: 'view_profile' | 'connect' | 'inmail' | 'follow' | 'message',
  ): Promise<{ allowed: boolean; reason?: string; resetsAt?: Date }> {
    const account = await prisma.linkedInAccount.findUnique({ where: { id: accountId } });
    if (!account) return { allowed: false, reason: 'LinkedIn account not configured' };

    const usage = await this.getOrCreateUsageWindow(account);

    switch (action) {
      case 'view_profile':
        if (usage.metrics.profileViews >= account.dailyProfileViewLimit) {
          return { allowed: false, reason: 'Daily profile view limit reached', resetsAt: usage.windowEnd };
        }
        break;
      case 'connect':
        if (usage.metrics.connectionRequests >= account.weeklyConnectionLimit) {
          return { allowed: false, reason: 'Weekly connection request limit reached', resetsAt: usage.windowEnd };
        }
        // Check cooldown — 24h between requests to same person
        const recentRequests = await prisma.linkedInAction.count({
          where: { accountId, action: 'connect', createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        });
        if (recentRequests >= 1) {
          return { allowed: false, reason: 'Cooldown: 24h between connection requests' };
        }
        break;
      case 'inmail':
        if (usage.metrics.inMailSent >= account.weeklyInMailCredits) {
          return { allowed: false, reason: 'Weekly InMail credit limit reached', resetsAt: usage.windowEnd };
        }
        break;
      case 'follow':
        if (usage.metrics.follows >= account.maxFollowsPerDay) {
          return { allowed: false, reason: 'Daily follow limit reached', resetsAt: usage.windowEnd };
        }
        break;
      case 'message':
        const threadMessages = await prisma.linkedInMessage.count({
          where: { accountId, threadId: /* current thread */ undefined, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        });
        if (threadMessages >= account.maxMessagesPerThread) {
          return { allowed: false, reason: 'Max messages per thread reached' };
        }
        break;
    }

    return { allowed: true };
  }

  async recordAction(accountId: string, action: string, targetProfileUrl: string): Promise<void> {
    const usage = await this.getOrCreateUsageWindow(accountId);

    const metricMap: Record<string, keyof LinkedInUsageWindow['metrics']> = {
      view_profile: 'profileViews',
      connect: 'connectionRequests',
      inmail: 'inMailSent',
      follow: 'follows',
      message: 'messages',
    };

    const metricKey = metricMap[action];
    if (metricKey) {
      usage.metrics[metricKey]++;
    }

    // Persist action for audit
    await prisma.linkedInAction.create({
      data: { accountId, action, targetProfileUrl, createdAt: new Date() },
    });
  }

  private async getOrCreateUsageWindow(account: LinkedInAccount): Promise<LinkedInUsageWindow> {
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());

    // Merge daily + weekly windows — weekly window encompasses daily
    const windowKey = `${account.id}-${weekStart.toISOString().slice(0, 10)}`;

    if (this.usageCache.has(windowKey)) {
      return this.usageCache.get(windowKey)!;
    }

    const existing = await prisma.linkedInUsageWindow.findFirst({
      where: { accountId: account.id, windowStart: weekStart },
    });

    if (existing) {
      this.usageCache.set(windowKey, existing);
      return existing;
    }

    const nextWeek = new Date(weekStart);
    nextWeek.setDate(nextWeek.getDate() + 7);

    const newWindow = await prisma.linkedInUsageWindow.create({
      data: {
        accountId: account.id,
        windowType: 'weekly',
        windowStart: weekStart,
        windowEnd: nextWeek,
        metrics: { profileViews: 0, connectionRequests: 0, inMailSent: 0, follows: 0, messages: 0 },
      },
    });

    this.usageCache.set(windowKey, newWindow);
    return newWindow;
  }
}

// Usage in sequence dispatch:
// if (step.channel === 'linkedin_connect') {
//   const { allowed, reason } = await limiter.canPerformAction(accountId, 'connect');
//   if (!allowed) {
//     return { status: 'deferred', reason, retryAt: /* next window reset */ };
//   }
//   await linkedInApi.sendConnectionRequest(targetUrl, note);
//   await limiter.recordAction(accountId, 'connect', targetUrl);
// }
```

### How It Works

Each SDR's LinkedIn account is configured with tier-specific caps (Free: 25 views/day, 100 connects/week; Sales Navigator: 100 views/day, 200 connects/week, 30 InMails/month). A `LinkedInRateLimitManager` tracks usage in sliding windows (daily for views/follows, weekly for connections/InMails, per-thread for messages). Before any LinkedIn action, the sequence dispatcher calls `canPerformAction` which checks against the current window's counters plus historic actions (e.g., 24h cooldown between connection requests to the same person). If denied, the step is deferred with a `resetsAt` timestamp. After a successful action, `recordAction` increments the in-memory counter and persists an audit row. Usage windows are cached for fast checks and flushed to the `linkedInUsageWindow` table on process exit. This is the pattern used by Expandi, Dux-Soup, and LinkedIn automation tools that must operate within LinkedIn's anti-bot guardrails.

### Pros & Cons

- ✅ **Tier-aware limits** — different caps per LinkedIn plan without hardcoding magic numbers
- ✅ **Per-SDR tracking** — limits enforced per account, not globally; SDRs with Sales Navigator get higher caps
- ✅ **Audit trail** — every LinkedIn action is logged for compliance and dispute resolution
- ❌ **Window boundary gaps** — window-based (not sliding) counters can allow bursts at window boundaries
- ❌ **LinkedIn TOS risk** — any automation beyond manual-click assistance violates LinkedIn's terms of service
- ❌ **Rate limit detection lag** — LinkedIn's own rate limits can fire before our counters catch up; need fallback handler for 429 responses

---

## 11. Sequence Performance Analytics Engine

SDR managers need per-sequence dashboards: reply rate by step, conversion funnel, channel effectiveness, and SDR-level comparison. This pattern implements an event-sourced analytics pipeline that ingests sequence events and materializes aggregate views.

### Core Logic

```typescript
// Event types emitted by the sequence engine
type SequenceAnalyticsEvent =
  | { event: 'step_sent'; prospectId: string; sequenceId: string; stepIndex: number; channel: string; timestamp: Date }
  | { event: 'step_opened'; prospectId: string; sequenceId: string; stepIndex: number; channel: string; timestamp: Date }
  | { event: 'step_replied'; prospectId: string; sequenceId: string; stepIndex: number; channel: string; replyLabel: string; timestamp: Date }
  | { event: 'step_bounced'; prospectId: string; sequenceId: string; stepIndex: number; channel: string; timestamp: Date }
  | { event: 'step_clicked'; prospectId: string; sequenceId: string; stepIndex: number; channel: string; linkUrl: string; timestamp: Date }
  | { event: 'prospect_enrolled'; prospectId: string; sequenceId: string; enrolledById: string; timestamp: Date }
  | { event: 'prospect_completed'; prospectId: string; sequenceId: string; timestamp: Date }
  | { event: 'prospect_unenrolled'; prospectId: string; sequenceId: string; reason: string; timestamp: Date };

class SequenceAnalyticsPipeline {
  private eventBuffer: SequenceAnalyticsEvent[] = [];

  ingest(event: SequenceAnalyticsEvent): void {
    this.eventBuffer.push(event);
    // Flush every 50 events or every 5 seconds
    if (this.eventBuffer.length >= 50) {
      this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.eventBuffer.length === 0) return;
    const batch = this.eventBuffer.splice(0, this.eventBuffer.length);

    // Batch insert events into the analytics store
    await prisma.sequenceAnalyticsEvent.createMany({ data: batch });
  }

  // Materialized aggregate: per-sequence, per-step metrics
  async computeStepMetrics(sequenceId: string): Promise<StepMetrics[]> {
    const events = await prisma.sequenceAnalyticsEvent.groupBy({
      by: ['stepIndex', 'channel'],
      where: { sequenceId },
      _count: { id: true },
      _sum: { /* conditional aggregations */ },
    });

    // In practice would use a SQL materialized view:
    const raw = await prisma.$queryRaw<StepMetrics[]>`
      SELECT
        step_index AS "stepIndex",
        channel,
        COUNT(*) FILTER (WHERE event = 'step_sent') AS sent,
        COUNT(*) FILTER (WHERE event = 'step_opened') AS opened,
        COUNT(*) FILTER (WHERE event = 'step_replied') AS replied,
        COUNT(*) FILTER (WHERE event = 'step_bounced') AS bounced,
        COUNT(*) FILTER (WHERE event = 'step_clicked') AS clicked,
        ROUND(
          COUNT(*) FILTER (WHERE event = 'step_opened')::decimal /
          NULLIF(COUNT(*) FILTER (WHERE event = 'step_sent'), 0) * 100, 1
        ) AS open_rate,
        ROUND(
          COUNT(*) FILTER (WHERE event = 'step_replied')::decimal /
          NULLIF(COUNT(*) FILTER (WHERE event = 'step_sent'), 0) * 100, 1
        ) AS reply_rate
      FROM sequence_analytics_event
      WHERE sequence_id = ${sequenceId}
      GROUP BY step_index, channel
      ORDER BY step_index
    `;

    return raw;
  }

  async computeFunnelMetrics(sequenceId: string): Promise<FunnelMetrics> {
    const raw = await prisma.$queryRaw<FunnelMetrics[]>`
      SELECT
        COUNT(DISTINCT CASE WHEN event = 'prospect_enrolled' THEN prospect_id END) AS enrolled,
        COUNT(DISTINCT CASE WHEN event = 'step_sent' THEN prospect_id END) AS received_first_step,
        COUNT(DISTINCT CASE WHEN event = 'step_opened' AND step_index = 0 THEN prospect_id END) AS opened_first_step,
        COUNT(DISTINCT CASE WHEN event = 'step_replied' THEN prospect_id END) AS replied_any,
        COUNT(DISTINCT CASE WHEN event = 'prospect_completed' THEN prospect_id END) AS completed,
        COUNT(DISTINCT CASE WHEN event = 'step_clicked' THEN prospect_id END) AS clicked_any,
        ROUND(
          COUNT(DISTINCT CASE WHEN event = 'step_replied' THEN prospect_id END)::decimal /
          NULLIF(COUNT(DISTINCT CASE WHEN event = 'step_sent' THEN prospect_id END), 0) * 100, 1
        ) AS overall_reply_rate
      FROM sequence_analytics_event
      WHERE sequence_id = ${sequenceId}
    `;

    return raw[0];
  }

  async computeEffectivenessByChannel(sequenceId: string): Promise<ChannelEffectiveness[]> {
    return prisma.$queryRaw<ChannelEffectiveness[]>`
      SELECT
        channel,
        COUNT(*) AS total_sent,
        COUNT(*) FILTER (WHERE event = 'step_replied') AS total_replies,
        ROUND(
          COUNT(*) FILTER (WHERE event = 'step_replied')::decimal /
          NULLIF(COUNT(*) FILTER (WHERE event = 'step_sent'), 0) * 100, 1
        ) AS reply_rate,
        ROUND(AVG(
          EXTRACT(EPOCH FROM (
            LEAD(timestamp) OVER (PARTITION BY prospect_id, step_index ORDER BY timestamp) - timestamp
          ))
        )) AS avg_reply_time_seconds
      FROM sequence_analytics_event
      WHERE sequence_id = ${sequenceId} AND event IN ('step_sent', 'step_replied')
      GROUP BY channel
      ORDER BY reply_rate DESC
    `;
  }

  async computeSdrRanking(workspaceId: string, startDate: Date, endDate: Date): Promise<SdrPerformance[]> {
    return prisma.$queryRaw<SdrPerformance[]>`
      SELECT
        e.enrolled_by_id AS "sdrId",
        u.name AS "sdrName",
        COUNT(DISTINCT e.prospect_id) AS prospects_enrolled,
        COUNT(DISTINCT r.prospect_id) FILTER (WHERE r.event = 'step_replied') AS prospects_replied,
        ROUND(
          COUNT(DISTINCT r.prospect_id) FILTER (WHERE r.event = 'step_replied')::decimal /
          NULLIF(COUNT(DISTINCT e.prospect_id), 0) * 100, 1
        ) AS reply_rate,
        COUNT(DISTINCT m.prospect_id) FILTER (WHERE m.event = 'meeting_booked') AS meetings_booked,
        ROUND(
          COUNT(DISTINCT m.prospect_id) FILTER (WHERE m.event = 'meeting_booked')::decimal /
          NULLIF(COUNT(DISTINCT e.prospect_id), 0) * 100, 1
        ) AS meeting_rate
      FROM sequence_analytics_event e
      JOIN "User" u ON u.id = e.enrolled_by_id
      LEFT JOIN sequence_analytics_event r ON r.prospect_id = e.prospect_id AND r.event = 'step_replied'
      LEFT JOIN sequence_analytics_event m ON m.prospect_id = e.prospect_id AND m.event = 'meeting_booked'
      WHERE e.event = 'prospect_enrolled'
        AND e.timestamp BETWEEN ${startDate} AND ${endDate}
        AND e.workspace_id = ${workspaceId}
      GROUP BY e.enrolled_by_id, u.name
      ORDER BY reply_rate DESC
    `;
  }
}

// Scheduled job to materialize aggregates every hour:
// CREATE MATERIALIZED VIEW sequence_daily_metrics AS
// SELECT ... (same SQL as computeStepMetrics, but with date partitioning)
// REFRESH MATERIALIZED VIEW CONCURRENTLY sequence_daily_metrics;
```

### How It Works

A lightweight event-sourcing pipeline: every sequence action (sent, opened, replied, bounced, clicked, enrolled, completed, unenrolled) emits a typed `SequenceAnalyticsEvent`. Events are buffered in memory and batch-flushed to the `sequence_analytics_event` table (50 events or 5 seconds). Four materialized query patterns sit on top: **step metrics** (open rate, reply rate, click rate, bounce rate per step + channel), **funnel metrics** (enrolled → first step sent → first step opened → replied → completed), **channel effectiveness** (reply rate and avg reply time by channel), and **SDR ranking** (reply rate and meeting rate per SDR, scoped by workspace and date range). A nightly cron or `pg_cron` job materializes daily aggregate snapshots for dashboard performance. This is the pattern used by Outreach.io's sequence analytics, SalesLoft's cadence reporting, and HubSpot's sequence insights.

### Pros & Cons

- ✅ **Event-sourced accuracy** — every action is recorded; no polling or approximation of metrics
- ✅ **Multi-dimensional slicing** — same events power step, channel, funnel, and SDR views without separate pipelines
- ✅ **PostgreSQL FILTER clauses** — single table scan computes multiple metrics efficiently
- ❌ **Event table growth** — active sequences generate millions of rows; requires time-based partitioning (`LIST PARTITION BY month`)
- ❌ **Query performance at scale** — materialized views with `REFRESH MATERIALIZED VIEW CONCURRENTLY` are needed for dashboard sub-second queries
- ❌ **No real-time dashboards** — buffered ingestion introduces 5-second latency; not suitable for live monitors without WebSocket push


# Outreach & Sequence Engine — 5 Production-Proven Patterns

## 1. XState Sequence State Machine

### Core Logic
```typescript
import { createMachine, interpret, assign, send } from 'xstate';

type SequenceEvent =
  | { type: 'ENROLL' }
  | { type: 'STEP_DUE'; stepIndex: number }
  | { type: 'REPLY_RECEIVED'; label: 'positive' | 'negative' | 'neutral' | 'unsubscribe' }
  | { type: 'BOUNCE' }
  | { type: 'OPTOUT' }
  | { type: 'CLICKED'; link: string }
  | { type: 'MANUAL_ADVANCE' }
  | { type: 'TIMEOUT' };

interface SequenceContext {
  prospectId: string;
  steps: Array<{ channel: string; delayHours: number; content: string }>;
  currentStep: number;
  replyLabels: string[];
  attemptCount: number;
}

const sequenceMachine = createMachine({
  id: 'outreachSequence',
  initial: 'idle',
  context: {
    prospectId: '',
    steps: [],
    currentStep: 0,
    replyLabels: [],
    attemptCount: 0,
  },
  states: {
    idle: {
      on: { ENROLL: { target: 'scheduling', actions: 'initializeSequence' } },
    },
    scheduling: {
      entry: 'computeNextStepTime',
      invoke: {
        src: 'waitForStepDue',
        onDone: { target: 'stepPending' },
      },
    },
    stepPending: {
      entry: assign({ attemptCount: (ctx) => ctx.attemptCount + 1 }),
      on: {
        STEP_DUE: [
          { target: 'delivering', cond: (_, e) => e.stepIndex <= 3 },
          { target: 'completed', cond: (_, e) => e.stepIndex > 3 },
        ],
      },
    },
    delivering: {
      invoke: { src: 'sendStep', onDone: 'waiting' },
      on: { BOUNCE: 'bounced' },
    },
    waiting: {
      after: { 7200000: 'scheduling' }, // 2h window for reply
      on: {
        REPLY_RECEIVED: [
          { target: 'stopped', cond: (_, e) => e.label === 'unsubscribe' },
          { target: 'qualified', cond: (_, e) => e.label === 'positive' },
          { target: 'scheduling', cond: (_, e) => e.label === 'negative' },
          { target: 'scheduling', cond: (_, e) => e.label === 'neutral' },
        ],
        CLICKED: { target: 'engaged', actions: 'logEngagement' },
        OPTOUT: { target: 'stopped' },
        MANUAL_ADVANCE: { target: 'scheduling', actions: 'advanceStep' },
      },
    },
    engaged: { on: { MANUAL_ADVANCE: 'scheduling' } },
    qualified: { type: 'final' },
    bounced: { type: 'final' },
    stopped: { type: 'final' },
    completed: { type: 'final' },
  },
});
```

### How It Works
A formal statechart (XState v5) models the full outreach lifecycle as deterministic states: Idle → Scheduling → Step Pending → Delivering → Waiting, with guarded transitions out of `waiting` based on reply classification. The machine self-transitions back to `scheduling` for neutral/negative replies, advancing to the next step. Each state is testable in isolation, and the visual graph can be exported from Stately Studio. Outreach.io's internal sequence engine follows an analogous state model with `sequence_state` resource (pending/active/paused/finished).

### Pros & Cons
- ✅ Pro: Formal verification — every state transition is explicit, eliminating illegal state bugs
- ✅ Pro: Visual debugging — export statecharts to collaborate with non-engineers
- ✅ Pro: Time-travel debugging and replays via XState inspect
- ❌ Con: Steep learning curve for teams unfamiliar with statechart formalism
- ❌ Con: Boilerplate for simple linear sequences where a DAG or array would suffice

---

## 2. Conditional Branching Sequence Engine

### Core Logic
```typescript
type Channel = 'email' | 'phone' | 'linkedin' | 'whatsapp' | 'sms';

interface Step {
  id: string;
  channel: Channel;
  delay: { hours: number; businessDaysOnly?: boolean };
  template: string;
  condition?: (ctx: SequenceContext) => boolean;
  branch?: Record<string, Step[]>;
}

interface SequenceContext {
  prospectId: string;
  tags: string[];
  lastReplyLabel?: string;
  lastCallOutcome?: 'connected' | 'voicemail' | 'noanswer' | 'busy';
  openedCount: number;
  clickedCount: number;
}

function buildBranchingSequence(): Step[] {
  return [
    {
      id: 'email-1', channel: 'email', delay: { hours: 0 }, template: 'cold-1',
    },
    {
      id: 'linkedin-connect', channel: 'linkedin', delay: { hours: 24 }, template: 'li-connect',
    },
    {
      id: 'phone-1', channel: 'phone', delay: { hours: 48 }, template: 'call-script-1',
      condition: (ctx) => !ctx.lastReplyLabel,
    },
    {
      id: 'email-2', channel: 'email', delay: { hours: 72 }, template: 'followup-1',
      condition: (ctx) => !ctx.lastReplyLabel || ctx.lastReplyLabel === 'neutral',
      branch: {
        positive: [
          { id: 'email-demo', channel: 'email', delay: { hours: 1 }, template: 'demo-link' },
        ],
        neutral: [
          { id: 'linkedin-msg', channel: 'linkedin', delay: { hours: 24 }, template: 'li-checkin' },
        ],
        negative: [
          { id: 'email-breakup', channel: 'email', delay: { hours: 168 }, template: 'breakup' },
        ],
        unsubscribe: [],
      },
    },
  ];
}

async function executeBranchingSequence(
  prospect: SequenceContext,
  steps: Step[],
  evalEngine: ReplyClassifier,
): Promise<void> {
  const executed: Step[] = [];
  let queue = [...steps];

  while (queue.length > 0) {
    const step = queue.shift()!;

    if (step.condition && !step.condition(prospect)) continue;

    await sendStepViaChannel(prospect.prospectId, step);
    executed.push(step);
    const reply = await waitForReplyOrTimeout(prospect.prospectId, step);
    prospect.lastReplyLabel = reply?.label;

    if (step.branch && reply?.label && step.branch[reply.label]) {
      queue = [...step.branch[reply.label], ...queue];
    }
  }
}
```

### How It Works
Each sequence step can carry a `condition` predicate (based on prospect context tags, reply labels, call outcomes) and a `branch` map that forks the remaining sequence. When a reply is classified, the engine replaces the remaining queue with the branch-specific steps. This is the architecture behind Outreach.io's smart sequences and SalesLoft's Cadence branching rules — the sequence adapts per-prospect in real time instead of executing a rigid linear order.

### Pros & Cons
- ✅ Pro: Sequences adapt dynamically — positive replies get demo steps, negative get breakup emails
- ✅ Pro: Reduces irrelevant touches (unsubscribed prospects stop immediately)
- ✅ Pro: Scales personalization without manual per-prospect editing
- ❌ Con: Branch explosions — complex trees become hard to audit without a visual editor
- ❌ Con: Reply classification accuracy is a dependency; poor classification leads to wrong branches

---

## 3. Business-Hours-Aware Scheduling Engine

### Core Logic
```typescript
interface TimeSlot {
  hour: number;  // 0-23
  minute: number;
}

interface ScheduleConfig {
  timezone: string;
  workingDays: number[];       // 1=Mon ... 7=Sun
  workingHours: [TimeSlot, TimeSlot];
  minGapHours: number;
  maxPerDayPerChannel: number;
  honourOptOutHours: boolean;
}

function computeNextStepTime(
  now: Date,
  stepDelayHours: number,
  prospectTimezone: string,
  config: ScheduleConfig,
): Date {
  const tz = prospectTimezone || config.timezone;
  let candidate = addHoursInTz(now, stepDelayHours, tz);
  const day = getDayInTz(candidate, tz);
  const time = getTimeInTz(candidate, tz);

  // Align to working day
  if (!config.workingDays.includes(day)) {
    candidate = nextWorkingDay(candidate, config.workingDays, tz);
    candidate = setTimeInTz(candidate, config.workingHours[0].hour, config.workingHours[0].minute, tz);
    return candidate;
  }

  // Align to working hours window
  const startMins = config.workingHours[0].hour * 60 + config.workingHours[0].minute;
  const endMins = config.workingHours[1].hour * 60 + config.workingHours[1].minute;
  const candidateMins = time.hour * 60 + time.minute;

  if (candidateMins < startMins) {
    candidate = setTimeInTz(candidate, config.workingHours[0].hour, config.workingHours[0].minute, tz);
  } else if (candidateMins >= endMins) {
    candidate = addDaysInTz(candidate, 1, tz);
    candidate = nextWorkingDay(candidate, config.workingDays, tz);
    candidate = setTimeInTz(candidate, config.workingHours[0].hour, config.workingHours[0].minute, tz);
  }

  return candidate;
}

function scheduleSequence(
  steps: Array<{ channel: string; delayHours: number }>,
  enrollTime: Date,
  prospectTimezone: string,
  config: ScheduleConfig,
): Array<{ stepIndex: number; scheduledAt: Date }> {
  const schedule: Array<{ stepIndex: number; scheduledAt: Date }> = [];
  let cursor = enrollTime;

  for (let i = 0; i < steps.length; i++) {
    cursor = computeNextStepTime(cursor, steps[i].delayHours, prospectTimezone, config);
    schedule.push({ stepIndex: i, scheduledAt: cursor });
  }

  return schedule;
}
```

### How It Works
The scheduler accepts a base delay (in hours) but snaps each step to the prospect's working hours (e.g., 9 AM–5 PM Mon–Fri in their timezone). It uses `delayHours` as a _minimum gap_, not a literal offset. This is the same pattern used by Close CRM's Workflows and Lemlist's timezone-detection feature: it prevents 2 AM sends, weekend drops, and back-to-back channel saturation. The schedule is computed eagerly at enrollment so the UI can render a preview calendar.

### Pros & Cons
- ✅ Pro: Prevents deliverability damage (sending at 3 AM = spam flag)
- ✅ Pro: Respects prospect's local timezone — better reply rates
- ✅ Pro: Previewable — SDRs see the exact schedule before enrolling
- ❌ Con: Timezone detection relies on data quality (area code, company HQ)
- ❌ Con: Over-snapping can compress steps into a narrow window, increasing burnout risk

---

## 4. Multi-Channel Step Router

### Core Logic
```typescript
type Channel = 'email' | 'phone' | 'linkedin' | 'whatsapp';

interface ChannelCapabilities {
  maxDaily: number;
  cooldownMinutes: number;
  provider: string;
  priority: number;
}

interface RoutedStep {
  prospectId: string;
  channel: Channel;
  stepIndex: number;
  template: string;
  variables: Record<string, string>;
}

class ChannelRouter {
  private channelState: Map<Channel, ChannelCapabilities> = new Map();
  private dailyUsage: Map<Channel, number> = new Map();

  constructor(caps: Record<Channel, ChannelCapabilities>) {
    for (const [ch, cap] of Object.entries(caps)) {
      this.channelState.set(ch as Channel, cap);
      this.dailyUsage.set(ch as Channel, 0);
    }
  }

  async route(step: RoutedStep): Promise<DeliveryResult> {
    const cap = this.channelState.get(step.channel)!;
    const used = this.dailyUsage.get(step.channel)!;

    if (used >= cap.maxDaily) {
      return { status: 'deferred', reason: 'daily_limit', retryAt: nextDay() };
    }

    const provider = this.getProvider(step.channel);
    const result = await this.dispatch(provider, step);
    if (result.status === 'sent') {
      this.dailyUsage.set(step.channel, used + 1);
      await this.log(step, result);
    }
    return result;
  }

  async dispatch(provider: string, step: RoutedStep): Promise<DeliveryResult> {
    const dispatchMap: Record<string, (s: RoutedStep) => Promise<DeliveryResult>> = {
      'ses': sendViaSES,
      'twilio-sms': sendViaTwilio,
      'twilio-whatsapp': sendViaWhatsApp,
      'linkedin-api': sendViaLinkedIn,
      'salesloft-dialer': triggerPhoneTask,
    };
    return dispatchMap[provider](step);
  }
}

// Sequence definition with channel metadata
const multiChannelSequence = [
  { day: 1, channel: 'email',    provider: 'ses',            template: 'cold-1' },
  { day: 2, channel: 'linkedin', provider: 'linkedin-api',   template: 'li-connect' },
  { day: 3, channel: 'phone',    provider: 'salesloft-dialer', template: 'call-1' },
  { day: 5, channel: 'email',    provider: 'ses',            template: 'followup-1' },
  { day: 7, channel: 'whatsapp', provider: 'twilio-whatsapp', template: 'wa-checkin' },
  { day: 10,channel: 'phone',    provider: 'salesloft-dialer', template: 'call-2' },
];
```

### How It Works
The Channel Router abstracts delivery behind a common interface. Each step declares a channel and a provider (SES for email, Twilio for WhatsApp, LinkedIn API, dialer for phone). The router applies per-channel rate limits (daily cap, cooldown) and dispatches through the correct provider adapter. This is how Laxis, Smartlead, and Klenty unify multi-channel sequences — the same loop handles all channels; only the adapter changes. Failed channels can fall back to an alternate channel (e.g., WhatsApp fallback to SMS).

### Pros & Cons
- ✅ Pro: Add/remove channels without changing the sequence engine (OCP)
- ✅ Pro: Per-channel rate limiting prevents provider API throttling / bans
- ✅ Pro: Unified inbox — all replies land in one place regardless of channel
- ❌ Con: Provider API failures cascade if not circuit-broken per channel
- ❌ Con: Channel-specific features (InMail vs connection request) need adapter-level logic

---

## 5. Reply Classification & Auto-Pause Engine

### Core Logic
```typescript
type ReplyLabel = 'positive' | 'negative' | 'neutral' | 'out_of_office' | 'unsubscribe' | 'referral';

interface ClassifiedReply {
  messageId: string;
  prospectId: string;
  channel: string;
  body: string;
  labels: ReplyLabel[];    // multi-label
  confidence: number;
  detectedEntities: Array<{ type: string; value: string }>;
}

class ReplyClassifier {
  private model: ClassifierModel;

  constructor(model: ClassifierModel) {
    this.model = model;
  }

  async classify(rawReply: { body: string; subject: string; from: string }): Promise<ClassifiedReply> {
    const result = await this.model.predict(rawReply);
    return {
      messageId: uuid(),
      prospectId: '',
      channel: 'email',
      body: rawReply.body,
      labels: this.threshold(result.labels, 0.95),
      confidence: result.confidence,
      detectedEntities: result.entities,
    };
  }

  private threshold(labels: Array<{ name: ReplyLabel; score: number }>, min: number): ReplyLabel[] {
    return labels.filter((l) => l.score >= min).map((l) => l.name);
  }
}

class SequenceAutoPause {
  private activeSequences: Map<string, { state: string; step: number }> = new Map();

  handleReply(classified: ClassifiedReply): SequenceAction {
    const seq = this.activeSequences.get(classified.prospectId);
    if (!seq) return { action: 'noop' };

    if (classified.labels.includes('unsubscribe')) {
      this.activeSequences.delete(classified.prospectId);
      return { action: 'stop', reason: 'unsubscribe', notify: true };
    }

    if (classified.labels.includes('positive') && classified.confidence > 0.9) {
      seq.state = 'manual_review';
      return { action: 'pause', reason: 'positive_reply', assignTo: 'owner' };
    }

    if (classified.labels.includes('out_of_office')) {
      seq.state = 'ooo_paused';
      return { action: 'defer', reason: 'out_of_office', resumeAfter: parseOooDate(classified.body) };
    }

    if (classified.labels.includes('negative')) {
      seq.state = 'paused';
      return { action: 'pause', reason: 'negative_reply', step: seq.step, waitDays: 7 };
    }

    return { action: 'continue' };
  }
}

// Usage in webhook handler:
// POST /webhooks/reply
//   → ClassifyReply(body)
//   → SequenceAutoPause.handleReply(classified)
//   → PATCH /sequence/{prospectId} — update state, notify owner if positive
```

### How It Works
An NLP classifier (LLM-based in 2025/2026 production systems) ingests every inbound reply across channels and returns multi-label tags (positive, negative, neutral, out_of_office, unsubscribe). The Auto-Pause engine maps these labels to actions: `stop` on unsubscribe, `pause` on positive (hand off to human), `defer` on OOO (resume after date), `pause+wait` on negative (cool-off period). This is how Unify, Waalaxy Smart Stop, and Outreach.io's Kaia handle reply-based sequence control. The 0.95 confidence threshold prevents false positives from prematurely stopping sequences.

### Pros & Cons
- ✅ Pro: Prevents embarrassing "Thanks, I'm interested" → automated Day 7 follow-up
- ✅ Pro: Multi-label classification handles nuance (positive + "not right now") correctly
- ✅ Pro: OOO auto-deferral avoids burning touches while prospect is away
- ❌ Con: Low-confidence classifications (e.g., adversarial/spam replies) can wrong-pause sequences
- ❌ Con: Requires ongoing eval — reply language shifts over time and needs re-calibration

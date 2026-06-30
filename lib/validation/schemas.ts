import { z } from 'zod';
import { id, isoDate, longText, nullableShortText, nullableLongText, nullableText } from './core';

// Enums mirrored from prisma/schema.prisma — keep in sync with the DB enums.
export const leadStage = z.enum(['new', 'sequence_active', 'replied', 'meeting_booked', 'won', 'lost']);
export const priority = z.enum(['hot', 'warm', 'cold']);
export const channel = z.enum(['email', 'phone', 'linkedin', 'whatsapp']);
export const taskType = z.enum(['email', 'phone', 'linkedin', 'whatsapp', 'manual']);
export const taskStatus = z.enum(['pending', 'completed', 'skipped']);
export const taskPriority = z.enum(['high', 'medium', 'low']);
export const role = z.enum(['director', 'floor_manager', 'team_lead', 'sdr', 'leadgen']);
export const campaignStatus = z.enum(['active', 'paused', 'completed']);
export const activityType = z.enum([
  'email_sent', 'call_made', 'call_logged', 'linkedin_sent', 'linkedin_touch',
  'whatsapp_sent', 'whatsapp_message', 'note_added', 'stage_changed',
  'task_completed', 'task_skipped', 'lead_created', 'meeting_booked',
  'sequence_enrolled', 'sequence_completed', 'sequence_unenrolled',
  'email_task_completed', 'lead_reassigned',
]);

// ─── Leads ───────────────────────────────────────────────────────────────────

export const createLeadSchema = z.object({
  firstName: z.string().min(1).max(120),
  lastName: z.string().min(1).max(120),
  company: z.string().min(1).max(200),
  title: nullableShortText,
  email: z.string().email().max(320),
  phone: nullableText(40),
  linkedIn: nullableText(500),
  whatsApp: nullableText(40),
  stage: leadStage.optional(),
  assignedToId: id.optional(),
  campaignId: id,
  source: nullableShortText,
  tags: z.array(z.string().max(60)).max(30).optional(),
  priority: priority.optional(),
}).refine(data => data.stage !== 'sequence_active', {
  message: "Cannot create lead directly in sequence_active stage",
  path: ['stage'],
});

export const updateLeadSchema = z.object({
  firstName: z.string().min(1).max(120).optional(),
  lastName: z.string().min(1).max(120).optional(),
  company: z.string().min(1).max(200).optional(),
  title: nullableShortText.optional(),
  email: z.string().email().max(320).optional(),
  phone: nullableText(40).optional(),
  linkedIn: nullableText(500).optional(),
  whatsApp: nullableText(40).optional(),
  stage: leadStage.optional(),
  assignedToId: id.optional(),
  priority: priority.optional(),
  tags: z.array(z.string().max(60)).max(30).optional(),
  lastContactedAt: isoDate.nullish().optional(),
});

// ─── Tasks ───────────────────────────────────────────────────────────────────

export const createTaskSchema = z.object({
  leadId: id,
  userId: id.optional(),
  type: taskType,
  title: z.string().min(1).max(300),
  description: nullableLongText,
  dueDate: isoDate,
  sequenceId: id.nullish().optional(),
  sequenceStep: z.number().int().min(1).max(100).nullish().optional(),
  priority: taskPriority.optional(),
});

export const updateTaskSchema = z.object({
  status: taskStatus.optional(),
  dueDate: isoDate.optional(),
  notes: nullableLongText.optional(),
  outcome: nullableText(100).optional(),
});

// ─── Sequences ───────────────────────────────────────────────────────────────

const sequenceStepSchema = z.object({
  order: z.number().int().min(1).max(100).optional(),
  channel,
  delayDays: z.number().int().min(0).max(365).optional(),
  delayHours: z.number().int().min(0).max(23).optional(),
  templateId: id.nullish().optional(),
  instructions: nullableLongText.optional(),
  autoComplete: z.boolean().optional(),
});

export const createSequenceSchema = z.object({
  name: z.string().min(1).max(200),
  description: nullableLongText.optional(),
  isActive: z.boolean().optional(),
  steps: z.array(sequenceStepSchema).max(50).optional(),
});

export const updateSequenceSchema = createSequenceSchema.partial();

export const enrollSchema = z.object({ leadId: id });

// ─── Templates ───────────────────────────────────────────────────────────────

export const createTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  channel,
  subject: z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? null : value), z.string().max(998).nullish()).optional(),
  body: longText.min(1),
  category: nullableShortText.optional(),
});

export const updateTemplateSchema = createTemplateSchema.partial();

// ─── Email ───────────────────────────────────────────────────────────────────

export const sendEmailSchema = z.object({
  accountId: id,
  to: z.string().email().max(320),
  subject: z.string().min(1).max(998).optional(),
  body: longText.min(1).optional(),
  text: longText.optional(),
  html: longText.optional(),
  replyTo: z.string().email().max(320).optional(),
  leadId: id.optional(),
  templateId: id.optional(),
});

// ─── Users ───────────────────────────────────────────────────────────────────

export const createUserSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(200),
  firstName: z.string().min(1).max(120),
  lastName: z.string().min(1).max(120),
  role,
  managerId: id.nullish().optional(),
  timezone: z.string().max(60).optional(),
});

export const updateUserSchema = z.object({
  firstName: z.string().min(1).max(120).optional(),
  lastName: z.string().min(1).max(120).optional(),
  timezone: z.string().max(60).optional(),
  avatarUrl: z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? null : value), z.string().max(1000).nullish()).optional(),
  role: role.optional(),
  managerId: id.nullish().optional(),
  isActive: z.boolean().optional(),
  newPassword: z.string().min(8).max(200).optional(),
});

// ─── Notes / Reminders / Activities / Campaigns / Notifications ─────────────

export const createNoteSchema = z.object({
  leadId: id,
  content: longText.min(1),
  isPinned: z.boolean().optional(),
});

export const updateNoteSchema = z.object({
  content: longText.min(1).optional(),
  isPinned: z.boolean().optional(),
});

export const updateReminderSchema = z.object({
  isDismissed: z.boolean().optional(),
  text: z.string().min(1).max(500).optional(),
  dueAt: isoDate.optional(),
});

export const createReminderSchema = z.object({
  text: z.string().min(1).max(500),
  dueAt: isoDate,
  leadId: id.nullish().optional(),
});

export const createActivitySchema = z.object({
  leadId: id.nullish().optional(),
  sequenceId: id.nullish().optional(),
  type: activityType,
  channel: channel.nullish().optional(),
  description: nullableShortText.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const createCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  clientId: id.optional(),
  newClientName: z.string().min(1).max(200).optional(),
  targetVertical: nullableShortText.optional(),
  targetGeo: nullableShortText.optional(),
  status: campaignStatus.optional(),
  startDate: isoDate.optional(),
});

export const updateCampaignSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  targetVertical: nullableShortText.optional(),
  targetGeo: nullableShortText.optional(),
  status: campaignStatus.optional(),
});

export const markNotificationSchema = z.object({
  id: id.optional(),
});

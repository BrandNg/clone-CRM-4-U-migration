import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import type { SessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { streamChat, DEFAULT_MODEL } from '@/lib/ai/provider';
import type { ModelId } from '@/lib/ai/provider';
import { readFileSync } from 'fs';
import path from 'path';

// Read the SDR skills file once at module load
let SDR_SKILLS: string;
try {
  SDR_SKILLS = readFileSync(path.join(process.cwd(), 'lib/ai/sdr-skills.md'), 'utf-8');
} catch {
  SDR_SKILLS = 'SDR knowledge base unavailable.';
}

interface ChatContext {
  page?: string;
  userName?: string;
  userRole?: string;
  overdueTasks?: number;
  todayTasks?: number;
  leadName?: string;
  leadCompany?: string;
  leadStage?: string;
  leadDaysSinceContact?: number;
  campaignName?: string;
  campaignDescription?: string;
  clientName?: string;
  sdrCallsToday?: number;
  sdrEmailsToday?: number;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function POST(req: NextRequest) {
  const userOrRes = await requireAuth();
  if (userOrRes instanceof NextResponse) return userOrRes;
  const user = userOrRes as SessionUser;

  const { messages, modelId, context } = await req.json() as {
    messages: ChatMessage[];
    modelId?: ModelId;
    context?: ChatContext;
  };

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'messages required' }, { status: 400 });
  }

  // Fetch user memories (server-side, always uses session userId)
  const memories = await prisma.aiMemory.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 25,
    select: { memory: true },
  });

  const memoryBlock = memories.length > 0
    ? `\n\n[What I remember about ${user.firstName}]\n${memories.map((m) => `- ${m.memory}`).join('\n')}`
    : '';

  // Build live context block
  const contextLines: string[] = [];
  if (context?.page) contextLines.push(`Current page: ${context.page}`);
  if (context?.overdueTasks != null) contextLines.push(`Overdue tasks: ${context.overdueTasks}`);
  if (context?.todayTasks != null) contextLines.push(`Tasks due today: ${context.todayTasks}`);
  if (context?.sdrCallsToday != null) contextLines.push(`Calls logged today: ${context.sdrCallsToday}`);
  if (context?.sdrEmailsToday != null) contextLines.push(`Emails sent today: ${context.sdrEmailsToday}`);
  if (context?.leadName) {
    contextLines.push(`\nCurrent lead: ${context.leadName}`);
    if (context.leadCompany) contextLines.push(`Company: ${context.leadCompany}`);
    if (context.leadStage) contextLines.push(`Pipeline stage: ${context.leadStage}`);
    if (context.leadDaysSinceContact != null) contextLines.push(`Days since last contact: ${context.leadDaysSinceContact}`);
    if (context.campaignName) contextLines.push(`Campaign: ${context.campaignName}`);
    if (context.campaignDescription) contextLines.push(`Campaign pitch: ${context.campaignDescription}`);
    if (context.clientName) contextLines.push(`Client: ${context.clientName}`);
  }

  const contextBlock = contextLines.length > 0
    ? `\n\n[Live CRM context]\n${contextLines.join('\n')}`
    : '';

  const systemPrompt = `You are the AI SDR Assistant for ${user.firstName} ${user.lastName} (${user.role} at Telestar).
Today's date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.${memoryBlock}${contextBlock}

${SDR_SKILLS}

IMPORTANT REMINDERS:
- Always address the SDR by their first name: ${user.firstName}
- Never make calls, send emails, or complete tasks autonomously — you coach humans who take the actions
- When you learn something important the SDR tells you, say "I'll remember that" and they can confirm
- Role-based note: ${user.role === 'sdr' || user.role === 'leadgen' ? 'This SDR sees only their own leads and tasks.' : `This user has ${user.role} access and can see team-level data.`}`;

  // Detect today's date for task tool
  const today = new Date().toISOString().split('T')[0];

  // Set up streaming response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const generator = streamChat({
          messages: messages.map((m) => ({ role: m.role, content: m.content })) as Array<{role: 'user' | 'assistant' | 'system'; content: string}>,
          systemPrompt,
          modelId: (modelId as ModelId) || DEFAULT_MODEL,
          userId: user.id,
          today,
        });

        for await (const chunk of generator) {
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        // Never leak raw provider error payloads (JSON, stack traces) to the SDR.
        const raw = err instanceof Error ? err.message : 'AI error';
        const isRate = /rate.?limit|\b429\b|tokens per day|\bTPD\b|quota/i.test(raw);
        console.error('[ai/chat] stream error:', raw);
        const friendly = isRate
          ? "I've hit today's usage limit on the AI models — please try again in a little while."
          : 'Sorry, I ran into a problem generating that. Please try again in a moment.';
        controller.enqueue(encoder.encode(friendly));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
    },
  });
}

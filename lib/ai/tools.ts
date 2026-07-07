// AI tool definitions for Groq/Gemini function calling

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, { type: string; description: string; enum?: string[] }>;
      required: string[];
    };
  };
}

export const AI_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'search_web',
      description:
        'Search the web for information about a company, person, or topic. Use this for prospect research, company news, or any question that requires current information from the internet.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'The search query. Be specific — include company name, person name, or topic.',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'visit_page',
      description:
        "Visit a specific URL and read the full page content. Use this after search_web to get detailed information from a specific website, company page, LinkedIn profile, or news article. Don't use this as the first step — search first to find the right URL.",
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The full URL to visit (must start with https://).',
          },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_task',
      description:
        "Create a new task in the CRM for the current SDR. Use this when the SDR asks you to add, create, or schedule a task. The task is always created for the logged-in user — you cannot create tasks for other users.",
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Short title for the task (e.g., "Call Sarah Chen at Acme Corp")',
          },
          channel: {
            type: 'string',
            description: 'The outreach channel for this task.',
            enum: ['email', 'phone', 'linkedin', 'whatsapp'],
          },
          dueDate: {
            type: 'string',
            description:
              'Due date in ISO 8601 format (e.g., "2026-06-18T09:00:00.000Z"). Use the correct date based on context.',
          },
          leadId: {
            type: 'string',
            description:
              'The CRM lead ID if this task is linked to a specific lead. Only include if the user is viewing a lead panel and you have the leadId from context.',
          },
          notes: {
            type: 'string',
            description: 'Optional notes or context for the task.',
          },
        },
        required: ['title', 'channel', 'dueDate'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_my_tasks',
      description:
        "Fetch the current SDR's tasks from the CRM. Use when the SDR asks about their pending tasks, what they have left today, or what's overdue.",
      parameters: {
        type: 'object',
        properties: {
          filter: {
            type: 'string',
            description: 'Which tasks to fetch.',
            enum: ['today', 'overdue', 'pending', 'all'],
          },
          limit: {
            type: 'string',
            description: 'Maximum number of tasks to return. Default is 10.',
          },
        },
        required: ['filter'],
      },
    },
  },
];

// Execute tool calls and return results
export async function executeTool(
  toolName: string,
  args: Record<string, string>,
  context: { userId: string; leadId?: string; today: string }
): Promise<string> {
  switch (toolName) {
    case 'search_web':
      return searchWeb(args.query);

    case 'visit_page':
      return visitPage(args.url);

    case 'create_task':
      return createTask(args, context.userId, context.leadId);

    case 'get_my_tasks':
      return getMyTasks(args.filter, parseInt(args.limit || '10'), context.userId, context.today);

    default:
      return `Unknown tool: ${toolName}`;
  }
}

async function searchWeb(query: string): Promise<string> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return 'Search unavailable — TAVILY_API_KEY not configured.';

  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'basic',
        max_results: 4,
        include_answer: true,
      }),
    });

    if (!res.ok) return `Search failed: ${res.status}`;

    const data = await res.json();
    const results = data.results
      ?.slice(0, 4)
      .map(
        (r: { title: string; url: string; content: string }) =>
          `[${r.title}](${r.url})\n${r.content?.slice(0, 300)}`
      )
      .join('\n\n');

    return data.answer
      ? `Summary: ${data.answer}\n\nSources:\n${results}`
      : results || 'No results found.';
  } catch {
    return 'Search temporarily unavailable.';
  }
}

async function visitPage(url: string): Promise<string> {
  if (!url.startsWith('https://') && !url.startsWith('http://')) {
    return 'Invalid URL — must start with https://';
  }

  try {
    const jinaUrl = `https://r.jina.ai/${url}`;
    const res = await fetch(jinaUrl, {
      headers: {
        Accept: 'text/plain',
        'X-Return-Format': 'markdown',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return `Could not access that page (${res.status}). LinkedIn may have blocked access — using search results instead.`;

    const text = await res.text();
    // Trim to reasonable size to avoid massive token usage
    return text.slice(0, 3000) + (text.length > 3000 ? '\n\n[Content truncated for brevity]' : '');
  } catch {
    return 'Could not read that page — it may be behind a login or blocked by the site.';
  }
}

async function createTask(
  args: Record<string, string>,
  userId: string,
  contextLeadId?: string
): Promise<string> {
  const leadId = args.leadId || contextLeadId;

  try {
    const body: Record<string, string | undefined> = {
      title: args.title,
      channel: args.channel,
      dueDate: args.dueDate,
      userId,
      notes: args.notes,
    };
    if (leadId) body.leadId = leadId;

    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ai-internal': 'true' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      return `Task creation failed: ${err}`;
    }

    const task = await res.json();
    return `Task created: "${task.title}" scheduled for ${new Date(task.dueDate).toLocaleString()}. Task ID: ${task.id}`;
  } catch {
    return 'Could not create the task — please add it manually in the CRM.';
  }
}

async function getMyTasks(
  filter: string,
  limit: number,
  userId: string,
  today: string
): Promise<string> {
  try {
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const params = new URLSearchParams({ filter, limit: String(limit), userId, today });
    const res = await fetch(`${baseUrl}/api/tasks?${params}`, {
      headers: { 'x-ai-internal': 'true' },
    });

    if (!res.ok) return 'Could not fetch tasks.';

    const tasks = await res.json();
    if (!tasks.length) return `No ${filter} tasks found.`;

    return tasks
      .map(
        (t: { title: string; dueDate: string; channel: string; lead?: { firstName: string; lastName: string } }) =>
          `• ${t.channel.toUpperCase()} — ${t.title}${t.lead ? ` (${t.lead.firstName} ${t.lead.lastName})` : ''} — due ${new Date(t.dueDate).toLocaleString()}`
      )
      .join('\n');
  } catch {
    return 'Could not fetch tasks.';
  }
}

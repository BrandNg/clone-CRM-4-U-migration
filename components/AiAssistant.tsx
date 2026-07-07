'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useAppContext } from '@/context/AppContext';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { X, Send, Copy, ThumbsUp, ThumbsDown, ChevronDown } from 'lucide-react';
import { MODEL_LABELS, MODEL_DESCRIPTIONS, DEFAULT_MODEL } from '@/lib/ai/provider';
import type { ModelId } from '@/lib/ai/provider';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  feedback?: 'up' | 'down';
}

const MODELS = Object.keys(MODEL_LABELS) as ModelId[];

const MEMORY_TRIGGERS = [
  'remember', 'i prefer', 'always', 'never again', 'my client', 'my campaign',
  "don't forget", 'keep in mind', 'note that', 'your name is', 'call you',
];

function detectMemoryIntent(text: string): boolean {
  const lower = text.toLowerCase();
  return MEMORY_TRIGGERS.some((t) => lower.includes(t));
}

function getContextChips(page: string, hasLead: boolean): string[] {
  if (hasLead) return ['Best angle for this lead', 'Research this company', 'Prep me for a call', 'Write an opener'];
  if (page === '/') return ['Morning brief', 'What to focus on?', 'Summarize my day', 'Teach me SPIN'];
  if (page === '/templates') return ['Write a cold email', 'Improve this subject line', 'LinkedIn message', 'Break-up email'];
  if (page === '/leads') return ['Research a lead', 'Handle objection', 'Best angle for a prospect', 'After no reply'];
  return ['Cold email opener', 'Handle objection', 'After no reply', 'Book a meeting'];
}

// Robot character component
function RobotIcon({ hasUnread, isThinking }: { hasUnread: boolean; isThinking: boolean }) {
  return (
    <div className="relative flex flex-col items-center select-none" style={{ width: 52, height: 64 }}>
      {/* Antenna */}
      <div className="flex flex-col items-center mb-0.5">
        <div style={{ width: 2, height: 14, background: '#E8611A', borderRadius: 2 }} />
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: isThinking ? '#F5A623' : '#FEDD44',
          boxShadow: isThinking ? '0 0 6px #F5A623' : 'none',
          marginTop: -4,
          transition: 'all 0.3s',
        }} />
      </div>

      {/* Head */}
      <div style={{
        width: 46, height: 36,
        background: '#D42B1E',
        borderRadius: 10,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 0,
        boxShadow: '0 2px 8px rgba(212,43,30,0.4)',
      }}>
        {/* Eyes row */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 4 }}>
          {[0, 1].map((i) => (
            <div key={i} style={{
              width: 10, height: 10, borderRadius: '50%',
              background: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: hasUnread ? `0 0 4px #E8611A` : 'none',
            }}>
              <div style={{
                width: 5, height: 5, borderRadius: '50%',
                background: hasUnread ? '#E8611A' : '#0A0A0A',
                transition: 'background 0.3s',
              }} />
            </div>
          ))}
        </div>
        {/* Mouth */}
        <div style={{
          width: 16, height: 4,
          borderRadius: '0 0 8px 8px',
          background: 'rgba(255,255,255,0.6)',
        }} />
      </div>

      {/* Body/base */}
      <div style={{
        width: 30, height: 10,
        background: '#C0271B',
        borderRadius: '0 0 8px 8px',
        marginTop: 2,
      }} />

      {/* Unread badge */}
      {hasUnread && (
        <div style={{
          position: 'absolute', top: 8, right: -4,
          width: 16, height: 16, borderRadius: '50%',
          background: '#F5A623', color: '#0A0A0A',
          fontSize: 10, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>!</div>
      )}
    </div>
  );
}

export default function AiAssistant() {
  const { currentUserId, currentUser, currentRole, isSessionLoading } = useAppContext();
  const pathname = usePathname();
  const isDesktop = useIsDesktop();

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [modelId, setModelId] = useState<ModelId>(DEFAULT_MODEL);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [feedbackPendingIdx, setFeedbackPendingIdx] = useState<number | null>(null);
  const [assistantName, setAssistantName] = useState('AI SDR Assistant');

  // Onboarding state
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  // Prevents React StrictMode from double-firing the memory fetch in dev
  const memoryFetchedRef = useRef(false);

  const firstName = currentUser?.firstName || 'there';

  function bustMemCache() {
    try { sessionStorage.removeItem(`ai_mem_${currentUserId || 'anon'}`); } catch { /* ignore */ }
  }

  const getCrmContext = useCallback(() => {
    const w = typeof window !== 'undefined' ? (window as unknown as Record<string, Record<string, unknown> | null>) : null;
    const leadCtx = w?.__crm_lead_context ?? null;
    const sdrStats = w?.__crm_sdr_stats ?? null;
    return {
      page: pathname,
      userName: firstName,
      userRole: currentRole,
      ...(sdrStats || {}),
      ...(leadCtx || {}),
    };
  }, [pathname, firstName, currentRole]);

  // Load memories and setup state on mount — guarded against login page and StrictMode double-invoke
  useEffect(() => {
    if (!currentUserId || pathname === '/login') return;
    if (memoryFetchedRef.current) return;
    memoryFetchedRef.current = true;

    const cacheKey = `ai_mem_${currentUserId}`;

    function applyMemories(mems: string[]) {
      const nameMem = mems.find((m) => m.startsWith('assistant_name: '));
      if (nameMem) setAssistantName(nameMem.replace('assistant_name: ', ''));

      const modelMem = mems.find((m) => m.startsWith('preferred_model: '));
      if (modelMem) {
        const saved = modelMem.replace('preferred_model: ', '') as ModelId;
        if (MODELS.includes(saved)) setModelId(saved);
      }

      const isDone = mems.some((m) => m === 'setup_complete: true');
      setSetupComplete(isDone);
      if (!isDone) setIsOnboarding(true);
    }

    // Serve from sessionStorage cache on repeat visits — avoids cold DB hit
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        applyMemories(JSON.parse(cached));
        return;
      }
    } catch { /* sessionStorage unavailable */ }

    fetch('/api/ai/memory')
      .then((r) => r.json())
      .then((mems: string[]) => {
        try { sessionStorage.setItem(cacheKey, JSON.stringify(mems)); } catch { /* ignore */ }
        applyMemories(mems);
      })
      .catch(() => setSetupComplete(true));
  }, [currentUserId, pathname]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // If the panel is open and onboarding is active but has no messages (race between
  // memory fetch and click), inject the intro message so the SDR isn't staring at blank.
  useEffect(() => {
    if (isOpen && isOnboarding && messages.length === 0) {
      setMessages([{ role: 'assistant', content: `Hey ${firstName}! I'm your AI SDR Assistant. Before I can help you properly, I need to understand your work — just 5 quick questions.\n\n**Question 1 of 5:** What campaign or client are you currently working on?` }]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isOnboarding]);

  // Close model menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setShowModelMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Morning briefing — fires once per day on first open
  const fireMorningBriefing = useCallback(async () => {
    const today = new Date().toISOString().split('T')[0];
    const key = `ai_briefing_${today}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');

    try {
      const res = await fetch('/api/ai/briefing?type=morning');
      if (!res.ok) return;
      const data = await res.json();

      const lines: string[] = [`Good morning, ${firstName}! Here's your day at a glance:`];

      if (data.overdueTasks > 0) {
        lines.push(`\n⚠️ **${data.overdueTasks} overdue task${data.overdueTasks > 1 ? 's' : ''}** — tackle these first.`);
      }

      if (data.todayTaskCount > 0) {
        const channelBreakdown = Object.entries(data.todayTasksByChannel as Record<string, number>)
          .map(([ch, n]) => `${n} ${ch}`)
          .join(', ');
        lines.push(`\n📋 **${data.todayTaskCount} tasks due today** (${channelBreakdown})`);
      } else {
        lines.push(`\n✅ No tasks due today — great time to prospect or enroll leads in sequences.`);
      }

      if (data.staleLeads > 0) {
        lines.push(`\n🕐 **${data.staleLeads} leads untouched for 7+ days** — they're going cold.`);
      }

      if (data.recentReplies?.length > 0) {
        const names = (data.recentReplies as Array<{ firstName: string; lastName: string; company: string }>)
          .map((l) => `${l.firstName} ${l.lastName} at ${l.company}`)
          .join(', ');
        lines.push(`\n🔥 **Hot leads who replied recently:** ${names}`);
      }

      if (data.hotLeads?.length > 0) {
        lines.push(`\n→ I'd start with these leads first — they have the highest conversion potential.`);
      }

      lines.push(`\nWhat do you want to tackle first?`);

      setMessages([{ role: 'assistant', content: lines.join('') }]);
    } catch {
      // silently skip if briefing fails
    }
  }, [firstName]);

  const handleOpen = useCallback(() => {
    setIsOpen(true);
    setHasUnread(false);

    if (setupComplete === true && messages.length === 0) {
      fireMorningBriefing();
    } else if (setupComplete === false && messages.length === 0) {
      startOnboarding();
    }

    setTimeout(() => inputRef.current?.focus(), 100);
    // startOnboarding is declared later in the component (TDZ) and is stable for this
    // handler's purpose; including it would crash the dep array. Intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupComplete, messages.length, fireMorningBriefing]);

  // Onboarding intro shown on first question — uses firstName so defined inside component
  const ONBOARDING_INTRO = `Hey ${firstName}! I'm your AI SDR Assistant. Before I can help you properly, I need to understand your work — just 5 quick questions.\n\n**Question 1 of 5:** What campaign or client are you currently working on?`;

  const ONBOARDING_QUESTION_PROMPTS = [
    `**Question 1 of 5:** What campaign or client are you currently working on?`,
    `**Question 2 of 5:** Who is your ideal buyer — their job title and type of company?`,
    `**Question 3 of 5:** In 1–2 sentences, what problem does your product or service solve for them?`,
    `**Question 4 of 5:** What outreach channels do you use and in what order? (e.g., "LinkedIn first, then email, then WhatsApp")`,
    `**Question 5 of 5:** Any personal preferences I should know about? (e.g., tone, things to avoid, how you like to work)`,
  ];

  const ONBOARDING_MEMORY_KEYS = [
    'campaign',
    'target_buyer',
    'value_prop',
    'preferred_channels',
    'preferences',
  ];

  function startOnboarding() {
    setIsOnboarding(true);
    setOnboardingStep(0);
    setMessages([{ role: 'assistant', content: ONBOARDING_INTRO }]);
  }

  async function handleOnboardingAnswer(answer: string) {
    // Show user message + loading dots immediately
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: answer },
      { role: 'assistant', content: '' },
    ]);
    setIsStreaming(true);

    try {
      const res = await fetch('/api/ai/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionKey: ONBOARDING_MEMORY_KEYS[onboardingStep],
          answer,
          firstName,
        }),
      });

      const { valid, message } = await res.json() as { valid: boolean; message: string };

      if (valid) {
        // Save the validated answer as memory
        await fetch('/api/ai/memory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ memory: `${ONBOARDING_MEMORY_KEYS[onboardingStep]}: ${answer}` }),
        }).then(() => bustMemCache());

        const nextStep = onboardingStep + 1;

        if (nextStep >= ONBOARDING_QUESTION_PROMPTS.length) {
          // All 5 questions answered — mark setup complete
          await fetch('/api/ai/memory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ memory: 'setup_complete: true' }),
          }).then(() => bustMemCache());

          const fullMessage = `${message}\n\n✅ All set! I've saved your campaign context, target buyer, value prop, preferred channels, and preferences. I'll use these in every response — no need to repeat yourself.\n\nYou can say "reset my setup" any time to change anything.\n\nWhat would you like help with first?`;

          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: 'assistant', content: fullMessage };
            return updated;
          });
          setSetupComplete(true);
          setIsOnboarding(false);
          setOnboardingStep(0);
        } else {
          // Advance to the next question, show AI confirmation + next prompt
          const fullMessage = `${message}\n\n${ONBOARDING_QUESTION_PROMPTS[nextStep]}`;
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: 'assistant', content: fullMessage };
            return updated;
          });
          setOnboardingStep(nextStep);
        }
      } else {
        // Answer was invalid — show the challenge, stay on same step (don't advance)
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: message };
          return updated;
        });
      }
    } catch {
      // Fail open — don't leave the SDR stuck
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: 'Got it, let\'s keep going.' };
        return updated;
      });
    } finally {
      setIsStreaming(false);
    }
  }

  async function sendMessage(text?: string) {
    const content = (text || input).trim();
    if (!content || isStreaming) return;
    setInput('');

    // Detect reset/setup commands
    const lower = content.toLowerCase();
    if (lower.includes('reset my context') || lower.includes('redo my setup') || lower.includes('reset my setup')) {
      await fetch('/api/ai/memory', { method: 'DELETE' });
      bustMemCache();
      memoryFetchedRef.current = false;
      setSetupComplete(false);
      const resetMsg = { role: 'assistant' as const, content: `Memory cleared. Let's start fresh — I'll ask you the setup questions again.` };
      setMessages((prev) => [...prev, { role: 'user', content }, resetMsg]);
      setTimeout(() => startOnboarding(), 800);
      return;
    }

    if (isOnboarding) {
      setMessages((prev) => [...prev]);
      await handleOnboardingAnswer(content);
      return;
    }

    const userMsg: Message = { role: 'user', content };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);

    // Auto-save memory if detected
    if (detectMemoryIntent(content)) {
      fetch('/api/ai/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memory: content }),
      }).then(() => bustMemCache()).catch(() => {});
    }

    // Handle EOD summary trigger
    const isEodRequest = /summarize my day|end of day|what did i do today|eod report|daily summary/i.test(content);
    let injectedContext = getCrmContext();

    if (isEodRequest) {
      try {
        const eodRes = await fetch('/api/ai/briefing?type=eod');
        if (eodRes.ok) {
          const eodData = await eodRes.json();
          injectedContext = { ...injectedContext, eodData: JSON.stringify(eodData) } as typeof injectedContext;
        }
      } catch {}
    }

    setIsStreaming(true);
    let assistantContent = '';
    const assistantIdx = newMessages.length;

    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          modelId,
          context: injectedContext,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('No stream');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        assistantContent += chunk;
        setMessages((prev) => {
          const updated = [...prev];
          updated[assistantIdx] = { role: 'assistant', content: assistantContent };
          return updated;
        });
      }

      // Detect if AI says it will remember something and save it
      if (/i.?ll remember|noted|got it|i.?ve saved/i.test(assistantContent) && detectMemoryIntent(content)) {
        // Already saved above
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setMessages((prev) => {
        const updated = [...prev];
        updated[assistantIdx] = { role: 'assistant', content: `Sorry, I hit an issue: ${msg}. Try again in a moment.` };
        return updated;
      });
    } finally {
      setIsStreaming(false);
    }
  }

  async function handleModelChange(id: ModelId) {
    setModelId(id);
    setShowModelMenu(false);
    await fetch('/api/ai/memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memory: `preferred_model: ${id}` }),
    }).then(() => bustMemCache()).catch(() => {});
  }

  async function handleFeedback(idx: number, type: 'up' | 'down') {
    const msg = messages[idx];
    if (!msg || msg.feedback) return;

    if (type === 'down') {
      setFeedbackPendingIdx(idx);
      return;
    }

    setMessages((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], feedback: type };
      return updated;
    });
  }

  async function handleFeedbackReason(idx: number, reason: string) {
    const msg = messages[idx];
    setFeedbackPendingIdx(null);
    setMessages((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], feedback: 'down' };
      return updated;
    });
    await fetch('/api/ai/memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memory: `feedback: response not helpful (${reason}) — context: "${msg.content.slice(0, 100)}"` }),
    }).then(() => bustMemCache()).catch(() => {});
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).catch(() => {});
  }

  const hasLead = typeof window !== 'undefined' && !!(window as unknown as Record<string, unknown>).__crm_lead_context;
  const chips = getContextChips(pathname, hasLead);

  if (isSessionLoading || !currentUserId || pathname === '/login' || !isDesktop) return null;

  return (
    <>
      {/* Global CSS for robot animations */}
      <style>{`
        @keyframes aiRobotFloat {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-4px); }
        }
        @keyframes aiRobotBounce {
          0%, 100% { transform: translateY(0px) scale(1); }
          50% { transform: translateY(-6px) scale(1.05); }
        }
        @keyframes aiRobotPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        .ai-robot-idle { animation: aiRobotFloat 3s ease-in-out infinite; }
        .ai-robot-unread { animation: aiRobotBounce 1.2s ease-in-out infinite; }
        .ai-robot-thinking { animation: aiRobotPulse 0.8s ease-in-out infinite; }
        .ai-chat-panel {
          box-shadow: 0 8px 40px rgba(0,0,0,0.4), 0 2px 12px rgba(212,43,30,0.15);
        }
        .ai-message-content { white-space: pre-wrap; word-break: break-word; }
        .ai-message-content strong { font-weight: 600; }
      `}</style>

      {/* Collapsed robot */}
      {!isOpen && (
        <button
          onClick={handleOpen}
          className={`fixed bottom-6 right-6 z-50 flex flex-col items-center cursor-pointer border-0 bg-transparent p-0 ${hasUnread ? 'ai-robot-unread' : isStreaming ? 'ai-robot-thinking' : 'ai-robot-idle'}`}
          title={`Open ${assistantName}`}
          aria-label={`Open ${assistantName}`}
          style={{ outline: 'none' }}
        >
          <RobotIcon hasUnread={hasUnread} isThinking={isStreaming} />
          <span style={{ fontSize: 9, color: '#D42B1E', fontWeight: 600, marginTop: 2, letterSpacing: 0.5 }}>AI</span>
        </button>
      )}

      {/* Expanded chat panel */}
      {isOpen && (
        <div
          className="ai-chat-panel fixed bottom-6 right-6 z-50 flex flex-col bg-white dark:bg-[#111] border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden"
          style={{ width: 390, height: 560 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-[#0A0A0A] border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <RobotIcon hasUnread={false} isThinking={isStreaming} />
              <div>
                <div className="text-white font-semibold text-sm leading-tight">{assistantName}</div>
                {isOnboarding && (
                  <div className="text-[#F5A623] text-xs">Setup — Step {onboardingStep + 1} of 5</div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Model selector */}
              <div className="relative" ref={modelMenuRef}>
                <button
                  onClick={() => setShowModelMenu((v) => !v)}
                  className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white transition-colors px-2 py-1 rounded-md hover:bg-zinc-800"
                >
                  {MODEL_LABELS[modelId]} <ChevronDown size={12} />
                </button>
                {showModelMenu && (
                  <div className="absolute bottom-8 right-0 w-72 bg-[#1A1A1A] border border-zinc-700 rounded-xl shadow-2xl overflow-hidden z-10">
                    {MODELS.map((id) => (
                      <button
                        key={id}
                        onClick={() => handleModelChange(id)}
                        className={`w-full text-left px-3 py-2.5 hover:bg-zinc-800 transition-colors ${id === modelId ? 'bg-zinc-800' : ''}`}
                      >
                        <div className="text-white text-xs font-medium">{MODEL_LABELS[id]}</div>
                        <div className="text-zinc-500 text-xs mt-0.5 leading-snug">{MODEL_DESCRIPTIONS[id]}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={() => setIsOpen(false)} className="text-zinc-400 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ background: '#FAFAFA' }}>
            {messages.length === 0 && !isOnboarding && (
              <div className="text-center text-zinc-400 text-sm mt-8">
                <div className="mb-2">👋 Hey {firstName}!</div>
                <div>Ask me anything about your leads, outreach, or pipeline.</div>
              </div>
            )}
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] ${msg.role === 'user' ? 'order-1' : 'order-0'}`}>
                  <div
                    className={`rounded-2xl px-3 py-2 text-sm ${
                      msg.role === 'user'
                        ? 'bg-[#D42B1E] text-white rounded-tr-sm'
                        : 'bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700 rounded-tl-sm shadow-sm'
                    }`}
                  >
                    {msg.role === 'assistant' && isStreaming && idx === messages.length - 1 && msg.content === '' ? (
                      <span className="flex gap-1 items-center py-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </span>
                    ) : (
                      <span className="ai-message-content" dangerouslySetInnerHTML={{
                        __html: msg.content
                          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                          .replace(/\n/g, '<br/>')
                      }} />
                    )}
                  </div>
                  {/* AI message actions */}
                  {msg.role === 'assistant' && msg.content && !(isStreaming && idx === messages.length - 1) && (
                    <>
                      <div className="flex items-center gap-2 mt-1 px-1">
                        <button
                          onClick={() => copyToClipboard(msg.content)}
                          className="text-zinc-400 hover:text-zinc-600 transition-colors"
                          title="Copy"
                        >
                          <Copy size={12} />
                        </button>
                        <button
                          onClick={() => handleFeedback(idx, 'up')}
                          className={`transition-colors ${msg.feedback === 'up' ? 'text-emerald-500' : 'text-zinc-400 hover:text-emerald-500'}`}
                          title="Helpful"
                        >
                          <ThumbsUp size={12} />
                        </button>
                        <button
                          onClick={() => handleFeedback(idx, 'down')}
                          className={`transition-colors ${msg.feedback === 'down' ? 'text-red-500' : 'text-zinc-400 hover:text-red-500'}`}
                          title="Not helpful"
                        >
                          <ThumbsDown size={12} />
                        </button>
                      </div>
                      {feedbackPendingIdx === idx && (
                        <div className="mt-1.5 px-1 flex flex-wrap gap-1">
                          {['Too generic', 'Not accurate', 'Too long', 'Not relevant'].map((reason) => (
                            <button
                              key={reason}
                              onClick={() => handleFeedbackReason(idx, reason)}
                              className="text-[10px] px-2 py-0.5 rounded-full border border-red-400/40 text-red-400 hover:bg-red-400/10 transition-colors"
                            >
                              {reason}
                            </button>
                          ))}
                          <button
                            onClick={() => setFeedbackPendingIdx(null)}
                            className="text-[10px] px-2 py-0.5 rounded-full border border-zinc-600 text-zinc-500 hover:bg-zinc-700/30 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick action chips */}
          {!isOnboarding && (
            <div className="flex gap-2 px-4 pb-2 pt-1 overflow-x-auto" style={{ background: '#FAFAFA' }}>
              {chips.map((chip) => (
                <button
                  key={chip}
                  onClick={() => sendMessage(chip)}
                  disabled={isStreaming}
                  className="flex-shrink-0 text-xs px-3 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-[#D42B1E] hover:text-[#D42B1E] transition-colors whitespace-nowrap disabled:opacity-50"
                >
                  {chip}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="px-3 pb-3 pt-1 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111]">
            <div className="flex gap-2 items-end bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 px-3 py-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder={isOnboarding ? 'Type your answer...' : 'Ask me anything...'}
                rows={1}
                disabled={isStreaming}
                className="flex-1 bg-transparent text-sm text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 resize-none border-0 outline-none leading-snug"
                style={{ maxHeight: 80, overflowY: 'auto' }}
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || isStreaming}
                className="p-1.5 rounded-lg bg-[#D42B1E] text-white disabled:opacity-40 hover:bg-[#B82418] transition-colors flex-shrink-0"
                aria-label="Send"
              >
                <Send size={14} />
              </button>
            </div>
            <div className="text-center text-zinc-400 text-xs mt-1">Enter to send · Shift+Enter for newline</div>
          </div>
        </div>
      )}
    </>
  );
}

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import Groq from 'groq-sdk';


// Client-side pre-screening: obvious non-answers that don't need an API call
const NON_ANSWER_PATTERNS = [
  /^(idk|i don'?t know|no idea|dunno|not sure|unsure)$/i,
  /^(lol|haha|hehe|lmao|xd)$/i,
  /^(whatever|anything|something|nothing|none|idc|don'?t care)$/i,
  /^(yes|no|ok|okay|sure|fine|maybe|perhaps|perhaps)$/i,
  /^(test|testing|foo|bar|baz|hello|hi|hey)$/i,
  /^[^a-zA-Z0-9]+$/, // only punctuation/symbols
];

function isObviousNonAnswer(text: string): boolean {
  const t = text.trim();
  // All single characters are non-answers
  if (t.length <= 1) return true;
  // All keyboard-mash-like strings (no vowels and >= 5 chars, or all same char repeated)
  if (t.length >= 4 && !/[aeiou]/i.test(t)) return true;
  if (t.length >= 3 && new Set(t.toLowerCase()).size <= 2) return true;
  return NON_ANSWER_PATTERNS.some((re) => re.test(t));
}

const QUESTION_CONTEXT: Record<string, string> = {
  campaign: 'the name of a campaign, client, or product they are currently pitching (e.g. "TechViet B2B SaaS", "Acme Corp enterprise deal", "our SDR outsourcing service"). Even a short company or product name counts.',
  target_buyer: 'a description of their ideal buyer — must mention a job title, role, or type of company (e.g. "VP Sales at SaaS companies", "startup founders in SEA", "HR Managers at 100-500 person firms"). Generic filler like "idk", "anyone", or "companies" alone does NOT count.',
  value_prop: 'what problem their product/service solves or what benefit it provides — must be a coherent phrase or sentence that actually describes value (e.g. "we help SaaS companies get pipeline without hiring in-house SDRs"). Vague filler or deflections do NOT count.',
  preferred_channels: 'outreach channels they use — must name at least one specific channel: email, phone/call, LinkedIn, WhatsApp, cold call, etc. A simple list or sequence is fine (e.g. "LinkedIn then email", "cold calls and email").',
  preferences: 'personal style or preferences — flexible, almost anything coherent counts: tone style, things to avoid, time preferences (e.g. "casual tone", "no jargon", "I prefer mornings", "keep emails under 3 lines"). Even a single style word is valid.',
};

const CHALLENGE_FOR: Record<string, string> = {
  campaign: "I need the actual name of your campaign or client — something like 'TechViet B2B SaaS', 'Acme Corp', or a brief description of what you're pitching. What is it?",
  target_buyer: "I need a job title or type of company you're targeting — for example 'VP Sales at SaaS companies' or 'startup founders'. Who specifically are you going after?",
  value_prop: "I need to understand what your product actually does — in one sentence, what problem does it solve? Give me the real pitch, not a placeholder.",
  preferred_channels: "I need to know which channels you use — email, phone, LinkedIn, WhatsApp, or a combination. Which ones do you actually use for outreach?",
  preferences: "Even a one-word answer works here — 'casual', 'formal', 'no jargon', anything that tells me how you like to communicate. What's your style?",
};

export async function POST(req: NextRequest) {
  try {
    const userOrRes = await requireAuth();
    if (userOrRes instanceof NextResponse) return userOrRes;

    const { questionKey, answer, firstName } = await req.json() as {
      questionKey: string;
      answer: string;
      firstName: string;
    };

    const trimmed = (answer || '').trim();

    if (trimmed.length < 2) {
      return NextResponse.json({
        valid: false,
        message: "I need at least a brief answer — even one word works. What should I know?",
      });
    }

    // Fast-path: obvious non-answers skip the LLM call entirely
    if (isObviousNonAnswer(trimmed)) {
      const fallback = CHALLENGE_FOR[questionKey] ?? "That doesn't quite answer the question. Could you give me something more specific?";
      return NextResponse.json({ valid: false, message: fallback });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ valid: true, message: 'Got it!' });
    }

    const context = QUESTION_CONTEXT[questionKey] ?? 'a coherent, relevant answer to the question asked';
    const groq = new Groq({ apiKey });

    const prompt = `You are validating an SDR onboarding answer. Be STRICT — only accept answers that genuinely answer the question.

SDR name: ${firstName || 'the user'}
What we need: ${context}
Their answer: "${trimmed}"

INVALID answers include (but are not limited to):
- Deflections: "idk", "not sure", "whatever", "anything", "someone", "companies", "people"
- Filler: "I'll think about it", "maybe", "yes/no", "ok"
- Off-topic: content that has nothing to do with what was asked
- Too vague to be useful: answers that name no specific details relevant to the question

VALID answers are ones that actually answer the question with real, specific content — even if brief.

CRITICAL: If VALID, your confirmation must ONLY reference what they literally said. Do NOT invent, assume, or hallucinate details they didn't provide. If they said "VP Sales", say "VP Sales" back — don't add "at SaaS companies" unless they said that.

Reply in EXACTLY this format, no other text:
VALID: [1-sentence confirmation that references only what they actually said]
or
INVALID: [1-2 sentence friendly challenge that tells them specifically what you need]`;

    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 130,
      temperature: 0.2,
    });

    const raw = (response.choices[0]?.message?.content ?? '').trim();

    if (/^VALID:/i.test(raw)) {
      return NextResponse.json({
        valid: true,
        message: raw.replace(/^VALID:\s*/i, '').trim(),
      });
    }

    const challenge = raw.replace(/^INVALID:\s*/i, '').trim();
    return NextResponse.json({
      valid: false,
      message: challenge || (CHALLENGE_FOR[questionKey] ?? "That doesn't quite answer the question — could you be more specific?"),
    });
  } catch (err) {
    console.error('[ai/onboarding]', err instanceof Error ? err.message : err);
    return NextResponse.json({ valid: true, message: 'Got it, noted!' });
  }
}

export interface AIScoreResult {
  score: number;
  label: 'hot' | 'warm' | 'cold';
  insights: string[];
  recommendation: string;
}

interface LeadScoringInput {
  id: string;
  firstName: string;
  lastName: string;
  company: string;
  title?: string | null;
  email: string;
  phone?: string | null;
  linkedIn?: string | null;
  whatsApp?: string | null;
  stage: string;
  crmPriorityScore: string;
  source?: string | null;
  tags?: string[];
  lastContactedAt?: string | null;
  nextTaskDue?: string | null;
  createdAt: string;
  assignedTo?: string | { id: string; firstName: string; lastName: string } | null;
  sequenceId?: string | null;
  activities?: { type: string; createdAt: string }[];
  tasks?: { status: string; dueDate: string }[];
}

function daysSince(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / 86400000);
}

function hasActivityType(activities: { type: string; createdAt: string }[], type: string, maxDays: number): boolean {
  return activities.some(a => a.type === type && daysSince(a.createdAt) <= maxDays);
}

function getChannelScore(lead: LeadScoringInput): number {
  let score = 0;
  if (lead.email) score += 10;
  if (lead.phone) score += 8;
  if (lead.linkedIn) score += 6;
  if (lead.whatsApp) score += 6;
  return Math.min(score, 25);
}

function getStageScore(stage: string): number {
  const map: Record<string, number> = {
    meeting_booked: 25,
    replied: 20,
    sequence_active: 15,
    new: 5,
    won: 0,
    lost: -10,
  };
  return map[stage] ?? 0;
}

function getRecencyScore(lastContactedAt?: string | null): number {
  if (!lastContactedAt) return 0;
  const d = daysSince(lastContactedAt);
  if (d <= 1) return 20;
  if (d <= 3) return 15;
  if (d <= 7) return 10;
  if (d <= 14) return 5;
  return 0;
}

function getPriorityScore(priority: string): number {
  const map: Record<string, number> = { hot: 15, warm: 10, cold: 5 };
  return map[priority] ?? 5;
}

function getSourceScore(source?: string | null): number {
  if (!source) return 0;
  const s = source.toLowerCase();
  if (s.includes('inbound') || s.includes('referral') || s.includes('form')) return 10;
  if (s.includes('linkedin')) return 7;
  if (s.includes('apollo') || s.includes('scrape')) return 5;
  return 3;
}

function getEngagementScore(activities?: { type: string; createdAt: string }[]): number {
  if (!activities || activities.length === 0) return 0;
  let score = 0;
  if (hasActivityType(activities, 'email_sent', 7)) score += 5;
  if (hasActivityType(activities, 'call_made', 7) || hasActivityType(activities, 'call_logged', 7)) score += 5;
  if (hasActivityType(activities, 'meeting_booked', 14)) score += 8;
  if (hasActivityType(activities, 'stage_changed', 7)) score += 3;
  return Math.min(score, 15);
}

function getPenaltyScore(lead: LeadScoringInput): number {
  let penalty = 0;
  if (lead.stage === 'lost') penalty -= 15;
  if (!lead.title) penalty -= 3;
  if (lead.tasks) {
    const overdue = lead.tasks.filter(t => t.status === 'pending' && new Date(t.dueDate) < new Date());
    penalty -= overdue.length * 4;
  }
  return penalty;
}

function generateInsights(lead: LeadScoringInput, _score: number): string[] {
  const insights: string[] = [];
  const stage = lead.stage.replace(/_/g, ' ');
  insights.push(`Stage: ${stage} (${getStageScore(lead.stage)} pts)`);

  if (lead.lastContactedAt) {
    const d = daysSince(lead.lastContactedAt);
    if (d <= 1) insights.push('Contacted very recently');
    else if (d <= 3) insights.push('Contacted this week');
    else if (d <= 7) insights.push('No contact for a week');
    else insights.push(`No contact for ${d} days — follow up needed`);
  } else {
    insights.push('Never contacted — prioritize initial outreach');
  }

  if (lead.title) insights.push(`Has valid title (${lead.title})`);
  else insights.push('Missing title — try to research');

  const channels = [];
  if (lead.email) channels.push('email');
  if (lead.phone) channels.push('phone');
  if (lead.linkedIn) channels.push('LinkedIn');
  if (lead.whatsApp) channels.push('WhatsApp');
  insights.push(`${channels.length} outreach channels available (${channels.join(', ')})`);

  if (lead.tasks) {
    const overdue = lead.tasks.filter(t => t.status === 'pending' && new Date(t.dueDate) < new Date());
    if (overdue.length > 0) insights.push(`${overdue.length} overdue task${overdue.length > 1 ? 's' : ''} — risk factor`);
  }

  if (lead.activities && lead.activities.length > 3) {
    insights.push('High engagement — multiple recorded activities');
  }

  return insights;
}

function generateRecommendation(score: number, stage: string, _priority: string): string {
  if (stage === 'won') return 'Lead converted. Move to account management.';
  if (stage === 'lost') return 'Lead lost. Review notes for future re-engagement.';

  if (score >= 70) {
    if (stage === 'meeting_booked') return 'High-value lead. Prioritize meeting preparation.';
    if (stage === 'replied') return 'Strong interest. Reply immediately and push to book a meeting.';
    return 'Hot prospect. Fast-track to sequence enrollment and prioritize outreach.';
  }
  if (score >= 45) {
    if (stage === 'sequence_active') return 'On track. Continue current sequence. Consider increasing touch frequency.';
    if (stage === 'new') return 'Moderate potential. Enroll in outreach sequence promptly.';
    return 'Warm lead. Maintain regular cadence. Personalize next touchpoint.';
  }
  if (stage === 'sequence_active') return 'Low engagement signal. Consider re-qualifying or adjusting sequence approach.';
  if (stage === 'new') return 'Low priority for now. Batch process with similar leads when bandwidth allows.';
  return 'Low priority. Focus energy on higher-scoring leads first.';
}

export function scoreLead(lead: LeadScoringInput): AIScoreResult {
  const scores = {
    channels: getChannelScore(lead),
    stage: getStageScore(lead.stage),
    recency: getRecencyScore(lead.lastContactedAt),
    priority: getPriorityScore(lead.crmPriorityScore),
    source: getSourceScore(lead.source),
    engagement: getEngagementScore(lead.activities),
    penalty: getPenaltyScore(lead),
  };

  const rawScore = Object.values(scores).reduce((sum, v) => sum + v, 0);
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  const label: 'hot' | 'warm' | 'cold' = score >= 60 ? 'hot' : score >= 35 ? 'warm' : 'cold';

  const insights = generateInsights(lead, score);
  const recommendation = generateRecommendation(score, lead.stage, lead.crmPriorityScore);

  return { score, label, insights, recommendation };
}

/**
 * Merge-field rendering for outreach templates (SKILL.md §4).
 *
 * Supported fields: {{firstName}} {{lastName}} {{company}} {{title}}
 * {{email}} {{phone}} {{sdrName}} {{sdrTitle}}, plus fallback syntax
 * {{firstName|there}}. Missing values render as '' — never "undefined".
 *
 * Pure module (no prisma import) so it can be shared by server routes
 * and client-side template previews.
 */

export interface RenderLead {
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface RenderSdr {
  firstName?: string | null;
  lastName?: string | null;
  role?: string | null;
}

const ROLE_TITLES: Record<string, string> = {
  director: 'Director',
  floor_manager: 'Floor Manager',
  team_lead: 'Team Lead',
  sdr: 'Sales Development Representative',
  leadgen: 'Lead Generation Specialist',
};

export function buildMergeContext(lead: RenderLead, sdr?: RenderSdr): Record<string, string> {
  const sdrName = [sdr?.firstName, sdr?.lastName].filter(Boolean).join(' ');
  return {
    firstName: lead.firstName ?? '',
    lastName: lead.lastName ?? '',
    company: lead.company ?? '',
    title: lead.title ?? '',
    email: lead.email ?? '',
    phone: lead.phone ?? '',
    sdrName,
    sdrTitle: (sdr?.role && ROLE_TITLES[sdr.role]) || '',
  };
}

const MERGE_FIELD_RE = /\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*(?:\|([^}]*))?\}\}/g;

export function renderTemplate(text: string, lead: RenderLead, sdr?: RenderSdr): string {
  const ctx = buildMergeContext(lead, sdr);
  return text.replace(MERGE_FIELD_RE, (match, field: string, fallback?: string) => {
    if (!(field in ctx)) return match; // unknown field — leave visible so it gets noticed
    const value = ctx[field];
    return value !== '' ? value : (fallback ?? '').trim();
  });
}

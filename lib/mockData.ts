// Helpers to compute task dates relative to today — keeps the demo always fresh
function td(dayOffset: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'director' | 'floor_manager' | 'team_lead' | 'sdr';
  managerId: string | null;
  avatarUrl: string | null;
  timezone: string;
  isActive: boolean;
  createdAt: string;
}

export interface Client {
  id: string;
  name: string;
  industry: string;
  contactName: string;
  contactEmail: string;
  status: 'active' | 'paused' | 'churned';
  createdAt: string;
}

export interface Campaign {
  id: string;
  clientId: string;
  name: string;
  assignedSdrs: string[];
  targetVertical: string | null;
  targetGeo: string | null;
  status: 'active' | 'paused' | 'completed';
  startDate: string;
  endDate: string | null;
}

export interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  company: string;
  title: string;
  email: string;
  phone: string;
  linkedIn: string;
  whatsApp: string;
  stage: 'new' | 'sequence_active' | 'replied' | 'meeting_booked' | 'won' | 'lost';
  assignedTo: string; // User ID
  campaignId: string;
  sequenceId: string | null;
  sequenceStep: number | null;
  source: string;
  tags: string[];
  crmPriorityScore: 'hot' | 'warm' | 'cold';
  lastContactedAt: string | null;
  nextTaskDue: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  id: string;
  leadId: string;
  content: string;
  createdBy: string;
  createdAt: string;
  isPinned: boolean;
}

export interface SequenceStep {
  id: string;
  order: number;
  channel: 'email' | 'phone' | 'linkedin' | 'whatsapp';
  delayDays: number;
  delayHours: number;
  templateId: string | null;
  instructions: string;
  autoComplete: boolean;
}

export interface Sequence {
  id: string;
  name: string;
  description: string;
  steps: SequenceStep[];
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  enrolledCount: number;
}

export interface Template {
  id: string;
  name: string;
  channel: 'email' | 'phone' | 'linkedin' | 'whatsapp';
  subject: string | null;
  body: string;
  category: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  leadId: string;
  userId: string;
  type: 'email' | 'phone' | 'linkedin' | 'whatsapp' | 'manual';
  title: string;
  description: string;
  dueDate: string;
  completedAt: string | null;
  status: 'pending' | 'completed' | 'skipped';
  sequenceId: string | null;
  sequenceStep: number | null;
  priority: 'high' | 'medium' | 'low';
  createdAt: string;
}

export interface Activity {
  id: string;
  userId: string;
  leadId: string;
  type: 'task_completed' | 'task_skipped' | 'stage_changed' | 'note_added' | 'email_sent' | 'call_logged' | 'linkedin_touch' | 'whatsapp_message' | 'whatsapp_sent' | 'sequence_enrollment' | 'meeting_booked' | 'lead_created';
  channel: 'email' | 'phone' | 'linkedin' | 'whatsapp' | null;
  description: string;
  metadata: Record<string, any>;
  createdAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: 'overdue_task' | 'lead_reply' | 'email_bounce' | 'meeting_booked' | 'lead_assigned';
  title: string;
  text: string;
  linkTo: string;
  isRead: boolean;
  createdAt: string;
}

// anchor date: Wednesday, June 3, 2026
export const ANCHOR_DATE = '2026-06-03T12:00:00+07:00';

export const mockUsers: User[] = [
  {
    id: 'u1',
    email: 'son@telestar.co',
    firstName: 'Son',
    lastName: 'Nguyen',
    role: 'director',
    managerId: null,
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    timezone: 'Asia/Ho_Chi_Minh',
    isActive: true,
    createdAt: '2026-01-01T08:00:00Z',
  },
  // Floor Managers
  {
    id: 'u2',
    email: 'alex.smith@telestar.co',
    firstName: 'Alex',
    lastName: 'Smith',
    role: 'floor_manager',
    managerId: 'u1',
    avatarUrl: null,
    timezone: 'Europe/London',
    isActive: true,
    createdAt: '2026-01-15T08:00:00Z',
  },
  {
    id: 'u3',
    email: 'minh.tran@telestar.co',
    firstName: 'Minh',
    lastName: 'Tran',
    role: 'floor_manager',
    managerId: 'u1',
    avatarUrl: null,
    timezone: 'Asia/Ho_Chi_Minh',
    isActive: true,
    createdAt: '2026-01-15T08:00:00Z',
  },
  // Team Leads (Pods)
  {
    id: 'u4',
    email: 'sarah.jones@telestar.co',
    firstName: 'Sarah',
    lastName: 'Jones',
    role: 'team_lead',
    managerId: 'u2', // under Alex
    avatarUrl: null,
    timezone: 'Europe/London',
    isActive: true,
    createdAt: '2026-02-01T08:00:00Z',
  },
  {
    id: 'u5',
    email: 'bao.le@telestar.co',
    firstName: 'Bao',
    lastName: 'Le',
    role: 'team_lead',
    managerId: 'u3', // under Minh
    avatarUrl: null,
    timezone: 'Asia/Ho_Chi_Minh',
    isActive: true,
    createdAt: '2026-02-01T08:00:00Z',
  },
  // Sample SDRs
  {
    id: 'u6',
    email: 'rep.lan@telestar.co',
    firstName: 'Lan',
    lastName: 'Pham',
    role: 'sdr',
    managerId: 'u5', // reports to TL Bao Le
    avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    timezone: 'Asia/Ho_Chi_Minh',
    isActive: true,
    createdAt: '2026-03-01T08:00:00Z',
  },
  {
    id: 'u7',
    email: 'rep.david@telestar.co',
    firstName: 'David',
    lastName: 'Miller',
    role: 'sdr',
    managerId: 'u4', // reports to TL Sarah Jones
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    timezone: 'Europe/London',
    isActive: true,
    createdAt: '2026-03-01T08:00:00Z',
  },
  {
    id: 'u8',
    email: 'rep.vy@telestar.co',
    firstName: 'Vy',
    lastName: 'Hoang',
    role: 'sdr',
    managerId: 'u5', // reports to TL Bao Le
    avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    timezone: 'Asia/Ho_Chi_Minh',
    isActive: true,
    createdAt: '2026-03-10T08:00:00Z',
  }
];

export interface CampaignSdr {
  id: string;
  campaignId: string;
  userId: string;
}

export const mockClients: Client[] = [
  { id: 'c1', name: 'Acme SaaS Corp', industry: 'SaaS', contactName: 'John Doe', contactEmail: 'john@acmesaas.com', status: 'active', createdAt: '2026-01-10T08:00:00Z' },
  { id: 'c2', name: 'PayFlow Fintech', industry: 'Fintech', contactName: 'Jane Smith', contactEmail: 'jane@payflow.com', status: 'active', createdAt: '2026-02-15T08:00:00Z' },
  { id: 'c3', name: 'Logix Logistics', industry: 'Logistics', contactName: 'Mark Lee', contactEmail: 'mark@logix.com', status: 'active', createdAt: '2026-03-05T08:00:00Z' },
  { id: 'c4', name: 'Telestar', industry: 'BPO', contactName: 'Son Nguyen', contactEmail: 'son.nguyen@telestar.co', status: 'active', createdAt: '2026-01-01T00:00:00Z' },
];

export const mockCampaigns: Campaign[] = [
  { id: 'cmp1', clientId: 'c1', name: 'Acme ERP Outreach', assignedSdrs: ['u6', 'u7'], targetVertical: 'Enterprise Resource Planning', targetGeo: 'North America', status: 'active', startDate: '2026-02-01T00:00:00Z', endDate: null },
  { id: 'cmp2', clientId: 'c2', name: 'PayFlow SMB Retail', assignedSdrs: ['u6', 'u8'], targetVertical: 'SMB Retailers', targetGeo: 'Southeast Asia', status: 'active', startDate: '2026-03-01T00:00:00Z', endDate: null },
  { id: 'cmp3', clientId: 'c3', name: 'Logix Supply Chain', assignedSdrs: ['u7'], targetVertical: 'Logistics Managers', targetGeo: 'Europe', status: 'active', startDate: '2026-03-15T00:00:00Z', endDate: null },
  { id: 'cmp4', clientId: 'c4', name: 'Telestar Campaign', assignedSdrs: ['u6', 'u7', 'u8'], targetVertical: null, targetGeo: null, status: 'active', startDate: '2026-01-01T00:00:00Z', endDate: null },
];

export const mockCampaignSdrs: CampaignSdr[] = [
  { id: 'cs1', campaignId: 'cmp1', userId: 'u6' },
  { id: 'cs2', campaignId: 'cmp1', userId: 'u7' },
  { id: 'cs3', campaignId: 'cmp2', userId: 'u6' },
  { id: 'cs4', campaignId: 'cmp2', userId: 'u8' },
  { id: 'cs5', campaignId: 'cmp3', userId: 'u7' },
  { id: 'cs6', campaignId: 'cmp4', userId: 'u6' },
  { id: 'cs7', campaignId: 'cmp4', userId: 'u7' },
  { id: 'cs8', campaignId: 'cmp4', userId: 'u8' },
];

export const mockTemplates: Template[] = [
  {
    id: 't1',
    name: 'Cold Email Intro - Acme ERP',
    channel: 'email',
    subject: 'Optimizing ERP for {{company}}',
    body: 'Hi {{firstName}},\n\nI noticed that {{company}} is expanding your operations. How are you handling your ERP workflows at the moment?\n\nWe help {{title}}s streamline resource tracking. Would you be open to a 10-minute chat next Tuesday?\n\nBest,\n{{sdrName}}\n{{sdrTitle}}',
    category: 'Cold Outreach',
    createdBy: 'u1',
    createdAt: '2026-02-01T08:00:00Z',
    updatedAt: '2026-02-01T08:00:00Z'
  },
  {
    id: 't2',
    name: 'LinkedIn Connection Request - Tech',
    channel: 'linkedin',
    subject: null,
    body: 'Hi {{firstName}} - came across your profile and noticed your focus on {{title}} at {{company}}. Would love to connect and share notes on the industry. Cheers!',
    category: 'LinkedIn Connection',
    createdBy: 'u1',
    createdAt: '2026-02-05T08:00:00Z',
    updatedAt: '2026-02-05T08:00:00Z'
  },
  {
    id: 't3',
    name: 'WhatsApp Pitch - PayFlow Fintech',
    channel: 'whatsapp',
    subject: null,
    body: 'Hello {{firstName}}, checking in from PayFlow. We recently helped small businesses in the retail space reduce processing fees by 25%. Happy to send a quick 2-page brief if you are interested?',
    category: 'Warm Re-engage',
    createdBy: 'u1',
    createdAt: '2026-03-01T08:00:00Z',
    updatedAt: '2026-03-01T08:00:00Z'
  },
  {
    id: 't4',
    name: 'Discovery Call Script - Logix',
    channel: 'phone',
    subject: null,
    body: '[SDR introduces self and Telestar/Logix]\n\n"Reason for my call, {{firstName}}, is that we help logistics departments at companies like {{company}} bypass customs clearance delays.\n\nAre you currently working with an agent in Southeast Asia, or are you handling custom clearance in-house?"\n\n[Pivot to booking meeting if pain point is confirmed]',
    category: 'Cold Call',
    createdBy: 'u1',
    createdAt: '2026-03-15T08:00:00Z',
    updatedAt: '2026-03-15T08:00:00Z'
  }
];

export const mockSequences: Sequence[] = [
  {
    id: 'seq1',
    name: 'Cold Outreach — 5 Step',
    description: 'General B2B outbound cadence mixing Email, Phone, and LinkedIn touches',
    isActive: true,
    createdBy: 'u1',
    createdAt: '2026-02-01T08:00:00Z',
    enrolledCount: 15,
    steps: [
      { id: 'seq1_s1', order: 1, channel: 'email', delayDays: 0, delayHours: 0, templateId: 't1', instructions: 'Send initial cold email customized with research notes.', autoComplete: true },
      { id: 'seq1_s2', order: 2, channel: 'linkedin', delayDays: 2, delayHours: 0, templateId: 't2', instructions: 'Send LinkedIn connection request.', autoComplete: false },
      { id: 'seq1_s3', order: 3, channel: 'phone', delayDays: 1, delayHours: 4, templateId: 't4', instructions: 'Perform initial discovery phone call.', autoComplete: false },
      { id: 'seq1_s4', order: 4, channel: 'email', delayDays: 3, delayHours: 0, templateId: null, instructions: 'Send custom email follow-up summarizing previous phone touchpoint or reference connection.', autoComplete: true },
      { id: 'seq1_s5', order: 5, channel: 'linkedin', delayDays: 2, delayHours: 0, templateId: null, instructions: 'Send LinkedIn message or comment on their recent post.', autoComplete: false }
    ]
  },
  {
    id: 'seq2',
    name: 'Warm Re-engage',
    description: 'High-touch short campaign using WhatsApp and Phone follow-up for hand-scraped leads',
    isActive: true,
    createdBy: 'u1',
    createdAt: '2026-03-01T08:00:00Z',
    enrolledCount: 8,
    steps: [
      { id: 'seq2_s1', order: 1, channel: 'whatsapp', delayDays: 0, delayHours: 0, templateId: 't3', instructions: 'Drop a short WhatsApp intro note.', autoComplete: false },
      { id: 'seq2_s2', order: 2, channel: 'phone', delayDays: 1, delayHours: 0, templateId: null, instructions: 'Follow up via call referencing WhatsApp chat.', autoComplete: false }
    ]
  },
  {
    id: 'seq3',
    name: 'Post-Meeting Follow-up',
    description: 'Nurture cadence for closed-lost or post-meeting leads',
    isActive: true,
    createdBy: 'u1',
    createdAt: '2026-03-10T08:00:00Z',
    enrolledCount: 3,
    steps: [
      { id: 'seq3_s1', order: 1, channel: 'email', delayDays: 1, delayHours: 0, templateId: null, instructions: 'Send slide deck and calendar link.', autoComplete: true },
      { id: 'seq3_s2', order: 2, channel: 'linkedin', delayDays: 5, delayHours: 0, templateId: null, instructions: 'Connect on LinkedIn and write a personal recommendation.', autoComplete: false }
    ]
  }
];

export const mockLeads: Lead[] = [
  {
    id: 'l1',
    firstName: 'Sarah',
    lastName: 'Chen',
    company: 'Acme Corp',
    title: 'VP Operations',
    email: 'sarah.chen@acme.com',
    phone: '+1 555-019-2834',
    linkedIn: 'https://linkedin.com/in/sarahchen-ops',
    whatsApp: '+1 555-019-2834',
    stage: 'sequence_active',
    assignedTo: 'u6', // Lan Pham
    campaignId: 'cmp1',
    sequenceId: 'seq1',
    sequenceStep: 2,
    source: 'Apollo Scrape',
    tags: ['Tech', 'Enterprise', 'US-West'],
    crmPriorityScore: 'hot',
    lastContactedAt: '2026-06-01T09:00:00+07:00',
    nextTaskDue: '2026-06-03T10:00:00+07:00', // Today
    createdAt: '2026-05-15T08:00:00Z',
    updatedAt: '2026-06-01T09:00:00Z',
  },
  {
    id: 'l2',
    firstName: 'James',
    lastName: 'Okafor',
    company: 'TechVault',
    title: 'Director of IT',
    email: 'j.okafor@techvault.io',
    phone: '+44 20 7946 0912',
    linkedIn: 'https://linkedin.com/in/j-okafor-it',
    whatsApp: '+44 20 7946 0912',
    stage: 'sequence_active',
    assignedTo: 'u6', // Lan Pham
    campaignId: 'cmp1',
    sequenceId: 'seq1',
    sequenceStep: 3,
    source: 'LinkedIn Sales Nav',
    tags: ['Security', 'Europe'],
    crmPriorityScore: 'warm',
    lastContactedAt: '2026-05-28T14:30:00+07:00',
    nextTaskDue: '2026-06-03T15:30:00+07:00', // Today
    createdAt: '2026-05-18T08:00:00Z',
    updatedAt: '2026-05-28T14:30:00Z',
  },
  {
    id: 'l3',
    firstName: 'Maria',
    lastName: 'Santos',
    company: 'Nexus AI',
    title: 'Procurement Specialist',
    email: 'm.santos@nexus-ai.ph',
    phone: '+63 2 8123 4567',
    linkedIn: 'https://linkedin.com/in/m-santos-procure',
    whatsApp: '+63 917 123 4567',
    stage: 'sequence_active',
    assignedTo: 'u6', // Lan Pham
    campaignId: 'cmp2',
    sequenceId: 'seq2',
    sequenceStep: 1,
    source: 'Apollo Scrape',
    tags: ['AI', 'APAC', 'Fast-Track'],
    crmPriorityScore: 'warm',
    lastContactedAt: '2026-06-02T16:00:00+07:00',
    nextTaskDue: '2026-06-03T11:00:00+07:00', // Today
    createdAt: '2026-05-20T08:00:00Z',
    updatedAt: '2026-06-02T16:00:00Z',
  },
  {
    id: 'l4',
    firstName: 'Takahiro',
    lastName: 'Sato',
    company: 'Kyoto Logistics',
    title: 'VP Supply Chain',
    email: 'sato@kyotologistics.jp',
    phone: '+81 3 5555 0143',
    linkedIn: 'https://linkedin.com/in/tsato-supply',
    whatsApp: '',
    stage: 'new',
    assignedTo: 'u7', // David Miller
    campaignId: 'cmp3',
    sequenceId: null,
    sequenceStep: null,
    source: 'Website Form',
    tags: ['Inbound', 'Japan', 'Enterprise'],
    crmPriorityScore: 'hot',
    lastContactedAt: null,
    nextTaskDue: '2026-06-03T09:00:00+07:00', // Today (Needs enrolling)
    createdAt: '2026-06-02T03:00:00Z',
    updatedAt: '2026-06-02T03:00:00Z',
  },
  {
    id: 'l5',
    firstName: 'Emily',
    lastName: 'Watson',
    company: 'Nordic Retail',
    title: 'COO',
    email: 'emily.watson@nordic.se',
    phone: '+46 8 123 45 67',
    linkedIn: 'https://linkedin.com/in/emily-w-nordic',
    whatsApp: '+46 8 123 45 67',
    stage: 'replied',
    assignedTo: 'u6', // Lan Pham
    campaignId: 'cmp2',
    sequenceId: 'seq1',
    sequenceStep: 4, // Paused because replied
    source: 'LinkedIn Sales Nav',
    tags: ['Retail', 'Nordic'],
    crmPriorityScore: 'hot',
    lastContactedAt: '2026-06-02T10:15:00+07:00', // Replied yesterday
    nextTaskDue: '2026-06-03T14:00:00+07:00', // Handle Reply task
    createdAt: '2026-05-10T08:00:00Z',
    updatedAt: '2026-06-02T10:15:00Z',
  },
  {
    id: 'l6',
    firstName: 'Nguyen',
    lastName: 'Tran',
    company: 'VinaGroup',
    title: 'General Director',
    email: 'nguyen.tran@vinagroup.vn',
    phone: '+84 28 3829 1234',
    linkedIn: 'https://linkedin.com/in/nguyentran-vina',
    whatsApp: '+84 903 888 999',
    stage: 'meeting_booked',
    assignedTo: 'u6', // Lan Pham
    campaignId: 'cmp2',
    sequenceId: null,
    sequenceStep: null,
    source: 'Referral',
    tags: ['VN', 'Conglomerate'],
    crmPriorityScore: 'hot',
    lastContactedAt: '2026-06-02T15:00:00+07:00', // Meeting booked yesterday
    nextTaskDue: null,
    createdAt: '2026-05-12T08:00:00Z',
    updatedAt: '2026-06-02T15:00:00Z',
  },
  {
    id: 'l7',
    firstName: 'Marcus',
    lastName: 'Aurelius',
    company: 'Rome Deliveries',
    title: 'Fleet Manager',
    email: 'marcus@romedeliveries.it',
    phone: '+39 06 123456',
    linkedIn: 'https://linkedin.com/in/marcus-fleet',
    whatsApp: '',
    stage: 'lost',
    assignedTo: 'u7',
    campaignId: 'cmp3',
    sequenceId: null,
    sequenceStep: null,
    source: 'Apollo Scrape',
    tags: ['Italy', 'Challenging'],
    crmPriorityScore: 'cold',
    lastContactedAt: '2026-05-26T17:00:00+07:00',
    nextTaskDue: null,
    createdAt: '2026-05-01T08:00:00Z',
    updatedAt: '2026-05-26T17:00:00Z',
  },
  {
    id: 'l8',
    firstName: 'Sophia',
    lastName: 'Loren',
    company: 'Milano Commerce',
    title: 'Marketing Manager',
    email: 'sophia@milanocommerce.com',
    phone: '+39 02 987654',
    linkedIn: 'https://linkedin.com/in/sophialoren-milan',
    whatsApp: '+39 333 456 7890',
    stage: 'won',
    assignedTo: 'u8',
    campaignId: 'cmp2',
    sequenceId: null,
    sequenceStep: null,
    source: 'Website Inbound',
    tags: ['Retail', 'Italy', 'Won-Lead'],
    crmPriorityScore: 'hot',
    lastContactedAt: '2026-06-02T11:00:00+07:00',
    nextTaskDue: null,
    createdAt: '2026-05-22T08:00:00Z',
    updatedAt: '2026-06-02T11:00:00Z',
  },
  // Overdue leads
  {
    id: 'l9',
    firstName: 'Arjun',
    lastName: 'Mehta',
    company: 'Deccan Logistics',
    title: 'Director Operations',
    email: 'arjun@deccanlogistics.in',
    phone: '+91 22 2789 0123',
    linkedIn: 'https://linkedin.com/in/arjunmehta-deccan',
    whatsApp: '+91 98200 12345',
    stage: 'sequence_active',
    assignedTo: 'u6', // Lan Pham
    campaignId: 'cmp1',
    sequenceId: 'seq1',
    sequenceStep: 3, // Call task
    source: 'Apollo Scrape',
    tags: ['Logistics', 'India'],
    crmPriorityScore: 'hot',
    lastContactedAt: '2026-05-25T11:00:00+07:00',
    nextTaskDue: '2026-05-28T10:00:00+07:00', // 6 Days Overdue!
    createdAt: '2026-05-10T08:00:00Z',
    updatedAt: '2026-05-25T11:00:00Z',
  },
  {
    id: 'l10',
    firstName: 'Clara',
    lastName: 'Dupont',
    company: 'Parisian Tech',
    title: 'Infrastructure Manager',
    email: 'c.dupont@parisiantech.fr',
    phone: '+33 1 42 27 78 90',
    linkedIn: 'https://linkedin.com/in/clara-dupont-paris',
    whatsApp: '',
    stage: 'sequence_active',
    assignedTo: 'u6', // Lan Pham
    campaignId: 'cmp1',
    sequenceId: 'seq1',
    sequenceStep: 1, // Email
    source: 'LinkedIn Sales Nav',
    tags: ['Infrastructure', 'France'],
    crmPriorityScore: 'cold',
    lastContactedAt: '2026-05-29T15:00:00+07:00',
    nextTaskDue: '2026-06-01T15:00:00+07:00', // 2 Days Overdue!
    createdAt: '2026-05-24T08:00:00Z',
    updatedAt: '2026-05-29T15:00:00Z',
  }
];

export const mockTasks: Task[] = [
  // Today's Tasks
  {
    id: 'tsk1',
    leadId: 'l1', // Sarah Chen
    userId: 'u6',
    type: 'linkedin',
    title: 'LinkedIn Message - Connection Request',
    description: 'Send LinkedIn message or connection request using template "LinkedIn Connection Request - Tech". Check connection status.',
    dueDate: td(0, 10),
    completedAt: null,
    status: 'pending',
    sequenceId: 'seq1',
    sequenceStep: 2,
    priority: 'high',
    createdAt: td(-2, 9),
  },
  {
    id: 'tsk2',
    leadId: 'l3', // Maria Santos
    userId: 'u6',
    type: 'whatsapp',
    title: 'WhatsApp Message - Intro',
    description: 'Send WhatsApp message: "WhatsApp Pitch - PayFlow Fintech" template.',
    dueDate: td(0, 11),
    completedAt: null,
    status: 'pending',
    sequenceId: 'seq2',
    sequenceStep: 1,
    priority: 'medium',
    createdAt: td(-1, 16),
  },
  {
    id: 'tsk3',
    leadId: 'l5', // Emily Watson
    userId: 'u6',
    type: 'manual',
    title: 'Handle Reply - Emily Watson',
    description: 'Emily replied to our cold email saying "Please send details about integrations". Send ERP integrations flyer.',
    dueDate: td(0, 14),
    completedAt: null,
    status: 'pending',
    sequenceId: null,
    sequenceStep: null,
    priority: 'high',
    createdAt: td(-1, 10),
  },
  {
    id: 'tsk4',
    leadId: 'l2', // James Okafor
    userId: 'u6',
    type: 'phone',
    title: 'Phone Call - Discovery',
    description: 'Execute discovery phone call using "Discovery Call Script - Logix" template.',
    dueDate: td(0, 15, 30),
    completedAt: null,
    status: 'pending',
    sequenceId: 'seq1',
    sequenceStep: 3,
    priority: 'medium',
    createdAt: td(-7, 14),
  },
  {
    id: 'tsk5',
    leadId: 'l4', // Takahiro Sato
    userId: 'u7',
    type: 'manual',
    title: 'Enroll in Sequence - Takahiro Sato',
    description: 'Inbound web form submitted. Check fit and enroll in "Cold Outreach — 5 Step" sequence.',
    dueDate: td(0, 9),
    completedAt: null,
    status: 'pending',
    sequenceId: null,
    sequenceStep: null,
    priority: 'high',
    createdAt: td(-1, 3),
  },
  // Yesterday's Completed Tasks
  {
    id: 'tsk_y1',
    leadId: 'l6', // Nguyen Tran
    userId: 'u6',
    type: 'phone',
    title: 'Phone Call - Follow up',
    description: 'Follow up on calendar link. Log call outcome.',
    dueDate: td(-1, 14),
    completedAt: td(-1, 15),
    status: 'completed',
    sequenceId: null,
    sequenceStep: null,
    priority: 'high',
    createdAt: td(-2, 8),
  },
  {
    id: 'tsk_y2',
    leadId: 'l8', // Sophia Loren
    userId: 'u8',
    type: 'email',
    title: 'Email - Proposal Draft',
    description: 'Send contract draft and pricing matrix.',
    dueDate: td(-1, 10),
    completedAt: td(-1, 11),
    status: 'completed',
    sequenceId: null,
    sequenceStep: null,
    priority: 'high',
    createdAt: td(-5, 8),
  },
  // Yesterday's Missed / Skipped Tasks
  {
    id: 'tsk_y3',
    leadId: 'l7', // Marcus Aurelius
    userId: 'u7',
    type: 'linkedin',
    title: 'LinkedIn Message - Follow up',
    description: 'Follow up message on LinkedIn.',
    dueDate: td(-1, 16),
    completedAt: td(-1, 17),
    status: 'skipped',
    sequenceId: null,
    sequenceStep: null,
    priority: 'low',
    createdAt: td(-7, 8),
  },
  // Overdue Tasks
  {
    id: 'tsk_o1',
    leadId: 'l9', // Arjun Mehta
    userId: 'u6',
    type: 'phone',
    title: 'Phone Call - Discovery',
    description: 'Discovery call (overdue by 6 days). Walk through ERP value prop.',
    dueDate: td(-6, 10),
    completedAt: null,
    status: 'pending',
    sequenceId: 'seq1',
    sequenceStep: 3,
    priority: 'high',
    createdAt: td(-9, 11),
  },
  {
    id: 'tsk_o2',
    leadId: 'l10', // Clara Dupont
    userId: 'u6',
    type: 'email',
    title: 'Email - Cold Intro',
    description: 'Send introductory email (overdue by 2 days). Template "Cold Email Intro - Acme ERP".',
    dueDate: td(-2, 15),
    completedAt: null,
    status: 'pending',
    sequenceId: 'seq1',
    sequenceStep: 1,
    priority: 'low',
    createdAt: td(-5, 15),
  }
];

export const mockActivities: Activity[] = [
  {
    id: 'act1',
    userId: 'u6',
    leadId: 'l6',
    type: 'meeting_booked',
    channel: 'phone',
    description: 'Booked discovery call with Nguyen Tran (VinaGroup)',
    metadata: { notes: 'Prospect is highly interested in pricing options for multiple offices.' },
    createdAt: '2026-06-02T15:00:00+07:00'
  },
  {
    id: 'act_h1',
    userId: 'u6',
    leadId: 'l1',
    type: 'email_sent',
    channel: 'email',
    description: 'Sent cold email to Sarah Chen (Acme Corp)',
    metadata: { subject: 'Optimizing ERP for Acme Corp' },
    createdAt: '2026-06-01T09:00:00+07:00'
  },
  {
    id: 'act_h2',
    userId: 'u6',
    leadId: 'l1',
    type: 'call_logged',
    channel: 'phone',
    description: 'Follow-up call with Sarah Chen',
    metadata: { outcome: 'connected_interested', duration_seconds: 240, notes: 'Interested in Q3 pilot.' },
    createdAt: '2026-06-02T11:30:00+07:00'
  },
  {
    id: 'act_h3',
    userId: 'u6',
    leadId: 'l5',
    type: 'email_sent',
    channel: 'email',
    description: 'Received email reply from Emily Watson (Nordic Retail)',
    metadata: { subject: 'Re: Optimizing ERP for Nordic Retail', snippet: 'Please send details about integrations...' },
    createdAt: '2026-06-02T10:15:00+07:00'
  },
  {
    id: 'act_h4',
    userId: 'u6',
    leadId: 'l5',
    type: 'email_sent',
    channel: 'email',
    description: 'Sent follow-up with integrations PDF',
    metadata: { subject: 'Integration Capabilities Overview' },
    createdAt: '2026-06-03T09:00:00+07:00'
  },
  {
    id: 'act_h5',
    userId: 'u6',
    leadId: 'l3',
    type: 'whatsapp_sent',
    channel: 'whatsapp',
    description: 'WhatsApp intro to Maria Santos (Nexus AI)',
    metadata: { action: 'First Message Sent', response_received: true },
    createdAt: '2026-06-02T16:00:00+07:00'
  },
  {
    id: 'act_h6',
    userId: 'u6',
    leadId: 'l9',
    type: 'email_sent',
    channel: 'email',
    description: 'Sent cold email to Arjun Mehta (Deccan Logistics)',
    metadata: { subject: 'Optimizing Logistics for Deccan' },
    createdAt: '2026-05-24T09:00:00+07:00'
  },
  {
    id: 'act_h7',
    userId: 'u7',
    leadId: 'l4',
    type: 'lead_created',
    channel: null,
    description: 'Inbound lead from website form',
    metadata: {},
    createdAt: '2026-06-02T03:00:00+07:00'
  },
  {
    id: 'act_h8',
    userId: 'u6',
    leadId: 'l6',
    type: 'stage_changed',
    channel: null,
    description: 'Moved Nguyen Tran to Meeting Booked',
    metadata: { previousStage: 'replied', newStage: 'meeting_booked' },
    createdAt: '2026-06-02T14:30:00+07:00'
  },
  {
    id: 'act2',
    userId: 'u6', // Lan Pham
    leadId: 'l8',
    type: 'stage_changed',
    channel: null,
    description: 'Moved Sophia Loren (Milano Commerce) to WON',
    metadata: { previousStage: 'meeting_booked', newStage: 'won' },
    createdAt: '2026-06-02T11:00:00+07:00'
  },
  {
    id: 'act3',
    userId: 'u6', // Lan Pham
    leadId: 'l5',
    type: 'email_sent',
    channel: 'email',
    description: 'Received email reply from Emily Watson (Nordic Retail)',
    metadata: { subject: 'Re: Optimizing ERP for Nordic Retail', snippet: 'Please send details about integrations...' },
    createdAt: '2026-06-02T10:15:00+07:00'
  },
  {
    id: 'act4',
    userId: 'u7', // David Miller
    leadId: 'l7',
    type: 'task_skipped',
    channel: 'linkedin',
    description: 'Skipped LinkedIn touchpoint for Marcus Aurelius (Rome Deliveries)',
    metadata: { reason: 'Lead profile seems inactive. Marked Closed-Lost.' },
    createdAt: '2026-06-02T17:00:00+07:00'
  },
  {
    id: 'act5',
    userId: 'u6', // Lan Pham
    leadId: 'l1',
    type: 'email_sent',
    channel: 'email',
    description: 'Sent Cold Email to Sarah Chen (Acme Corp)',
    metadata: { subject: 'Optimizing ERP for Acme Corp' },
    createdAt: '2026-06-01T09:00:00+07:00'
  }
];

export const mockNotifications: Notification[] = [
  {
    id: 'n1',
    userId: 'u6',
    type: 'lead_reply',
    title: 'Lead Replied',
    text: 'Emily Watson (Nordic Retail) replied to your email.',
    linkTo: 'l5',
    isRead: false,
    createdAt: '2026-06-02T10:15:00+07:00',
  },
  {
    id: 'n2',
    userId: 'u6',
    type: 'overdue_task',
    title: 'Task Overdue Alert',
    text: 'Phone call to Arjun Mehta is now 6 days overdue.',
    linkTo: 'l9',
    isRead: false,
    createdAt: '2026-06-03T08:00:00+07:00',
  },
  {
    id: 'n3',
    userId: 'u6',
    type: 'lead_assigned',
    title: 'New Lead Assigned',
    text: 'Takahiro Sato (Kyoto Logistics) has been assigned to you.',
    linkTo: 'l4',
    isRead: true,
    createdAt: '2026-06-02T03:00:00+07:00',
  }
];

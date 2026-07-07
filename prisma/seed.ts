import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { tenantStorage } from '@/lib/tenant-context';

const raw = new PrismaClient();

const TODAY = new Date();
const d = (offsetDays: number, hour = 10) => {
  const dt = new Date(TODAY);
  dt.setDate(dt.getDate() + offsetDays);
  dt.setHours(hour, 0, 0, 0);
  return dt;
};

async function main() {
  const tenantId = 'default-tenant';
  console.log('🌱 Seeding Telestar CRM...');

  // ─── Clean (use raw client for cleanup to avoid tenant scoping issues) ─────
  await raw.activity.deleteMany();
  await raw.notification.deleteMany();
  await raw.reminder.deleteMany();
  await raw.note.deleteMany();
  await raw.task.deleteMany();
  await raw.sequenceStep.deleteMany();
  await raw.lead.deleteMany();
  await raw.sequence.deleteMany();
  await raw.template.deleteMany();
  await raw.campaignSdr.deleteMany();
  await raw.campaign.deleteMany();
  await raw.client.deleteMany();
  await raw.emailAccount.deleteMany();
  await raw.user.deleteMany();
  await raw.tenant.deleteMany();

  // ─── Tenants ──────────────────────────────────────────────────────────────
  await raw.tenant.upsert({
    where: { id: 'default-tenant' },
    update: {},
    create: {
      id: 'default-tenant',
      name: 'Default Tenant',
    },
  });

  // ─── Users ────────────────────────────────────────────────────────────────
  const pw = await hash('telestar2026', 12);

  const dean = await prisma.user.create({
    data: {
      email: 'dean@telestar.vn',
      password: pw,
      firstName: 'Dean',
      lastName: '',
      role: 'director',
      timezone: 'Asia/Ho_Chi_Minh',
    },
  });

  const fm1 = await prisma.user.create({
    data: {
      email: 'sonny@telestar.vn',
      password: pw,
      firstName: 'Sonny',
      lastName: '',
      role: 'floor_manager',
      managerId: dean.id,
      timezone: 'Asia/Ho_Chi_Minh',
    },
  });

  const fm2 = await prisma.user.create({
    data: {
      email: 'alayna@telestar.vn',
      password: pw,
      firstName: 'Alayna',
      lastName: '',
      role: 'floor_manager',
      managerId: dean.id,
      timezone: 'Asia/Ho_Chi_Minh',
    },
  });

  const tl1 = await prisma.user.create({
    data: {
      email: 'brandon@telestar.vn',
      password: pw,
      firstName: 'Brandon',
      lastName: '',
      role: 'team_lead',
      managerId: fm1.id,
      timezone: 'Asia/Ho_Chi_Minh',
    },
  });

  const tl2 = await prisma.user.create({
    data: {
      email: 'jackie@telestar.vn',
      password: pw,
      firstName: 'Jackie',
      lastName: '',
      role: 'team_lead',
      managerId: fm1.id,
      timezone: 'Asia/Ho_Chi_Minh',
    },
  });

  const tl3 = await prisma.user.create({
    data: {
      email: 'vie@telestar.vn',
      password: pw,
      firstName: 'Vie',
      lastName: '',
      role: 'team_lead',
      managerId: fm1.id,
      timezone: 'Asia/Ho_Chi_Minh',
    },
  });

  const tl4 = await prisma.user.create({
    data: {
      email: 'meixi@telestar.vn',
      password: pw,
      firstName: 'Meixi',
      lastName: '',
      role: 'team_lead',
      managerId: fm1.id,
      timezone: 'Asia/Ho_Chi_Minh',
    },
  });

  const tl5 = await prisma.user.create({
    data: {
      email: 'hayden@telestar.vn',
      password: pw,
      firstName: 'Hayden',
      lastName: '',
      role: 'team_lead',
      managerId: fm2.id,
      timezone: 'Asia/Ho_Chi_Minh',
    },
  });

  const tl6 = await prisma.user.create({
    data: {
      email: 'selina@telestar.vn',
      password: pw,
      firstName: 'Selina',
      lastName: '',
      role: 'team_lead',
      managerId: fm2.id,
      timezone: 'Asia/Ho_Chi_Minh',
    },
  });

  const tl7 = await prisma.user.create({
    data: {
      email: 'kim@telestar.vn',
      password: pw,
      firstName: 'Kim',
      lastName: '',
      role: 'team_lead',
      managerId: fm2.id,
      timezone: 'Asia/Ho_Chi_Minh',
    },
  });

  // SDRs
  const lan = await prisma.user.create({
    data: {
      email: 'lan.pham@telestar.vn',
      password: pw,
      firstName: 'Lan',
      lastName: 'Pham',
      role: 'sdr',
      managerId: tl1.id,
      timezone: 'Asia/Ho_Chi_Minh',
    },
  });

  const david = await prisma.user.create({
    data: {
      email: 'david.miller@telestar.vn',
      password: pw,
      firstName: 'David',
      lastName: 'Miller',
      role: 'sdr',
      managerId: tl1.id,
      timezone: 'Europe/London',
    },
  });

  const vy = await prisma.user.create({
    data: {
      email: 'vy.hoang@telestar.vn',
      password: pw,
      firstName: 'Vy',
      lastName: 'Hoang',
      role: 'sdr',
      managerId: tl2.id,
      timezone: 'Asia/Ho_Chi_Minh',
    },
  });

  const carlos = await prisma.user.create({
    data: {
      email: 'carlos.reyes@telestar.vn',
      password: pw,
      firstName: 'Carlos',
      lastName: 'Reyes',
      role: 'sdr',
      managerId: tl2.id,
      timezone: 'America/Mexico_City',
    },
  });

  // Leadgen team
  const dominic = await prisma.user.create({
    data: {
      email: 'dominic@telestar.vn',
      password: pw,
      firstName: 'Dominic',
      lastName: '',
      role: 'leadgen',
      managerId: dean.id,
      timezone: 'Asia/Ho_Chi_Minh',
    },
  });

  const alexLG = await prisma.user.create({
    data: {
      email: 'alex@telestar.vn',
      password: pw,
      firstName: 'Alex',
      lastName: '',
      role: 'leadgen',
      managerId: dominic.id,
      timezone: 'Europe/London',
    },
  });

  const priyaLG = await prisma.user.create({
    data: {
      email: 'priya@telestar.vn',
      password: pw,
      firstName: 'Priya',
      lastName: '',
      role: 'leadgen',
      managerId: dominic.id,
      timezone: 'Asia/Kolkata',
    },
  });

  console.log('✅ Users created');

  // ─── Clients ──────────────────────────────────────────────────────────────
  const acme = await prisma.client.create({
    data: {
      name: 'Acme Corp',
      industry: 'SaaS / ERP',
      contactName: 'Tom Bradley',
      contactEmail: 'tom.bradley@acmecorp.io',
      status: 'active',
    },
  });

  const payflow = await prisma.client.create({
    data: {
      name: 'PayFlow',
      industry: 'Fintech / SMB',
      contactName: 'Lisa Tran',
      contactEmail: 'lisa.tran@payflow.com',
      status: 'active',
    },
  });

  const logix = await prisma.client.create({
    data: {
      name: 'Logix Supply Chain',
      industry: 'Logistics / SaaS',
      contactName: 'Raj Sharma',
      contactEmail: 'raj@logixsupply.co',
      status: 'active',
    },
  });

  const telestarClient = await prisma.client.create({
    data: {
      name: 'Telestar',
      industry: 'BPO / SDR-as-a-Service',
      contactName: 'Dean',
      contactEmail: 'dean@telestar.vn',
      status: 'active',
    },
  });

  console.log('✅ Clients created');

  // ─── Campaigns ────────────────────────────────────────────────────────────
  const cmp1 = await prisma.campaign.create({
    data: {
      clientId: acme.id,
      name: 'Acme ERP Outreach Q2',
      targetVertical: 'Manufacturing & Retail',
      targetGeo: 'SEA + ANZ',
      status: 'active',
      startDate: new Date('2026-04-01'),
    },
  });

  const cmp2 = await prisma.campaign.create({
    data: {
      clientId: payflow.id,
      name: 'PayFlow SMB Retail Push',
      targetVertical: 'SMB Retail',
      targetGeo: 'SEA',
      status: 'active',
      startDate: new Date('2026-05-01'),
    },
  });

  const cmp3 = await prisma.campaign.create({
    data: {
      clientId: logix.id,
      name: 'Logix Supply Chain Expansion',
      targetVertical: 'Logistics & 3PL',
      targetGeo: 'Global',
      status: 'active',
      startDate: new Date('2026-05-15'),
    },
  });

  const cmpLG = await prisma.campaign.create({
    data: {
      clientId: acme.id,
      name: 'Leadgen Qualification Pool',
      targetVertical: 'Multi-sector',
      targetGeo: 'Global',
      status: 'active',
      startDate: new Date('2026-06-01'),
    },
  });

  const cmpFallback = await prisma.campaign.create({
    data: {
      clientId: telestarClient.id,
      name: 'Telestar Campaign',
      targetVertical: 'Internal',
      targetGeo: 'Global',
      status: 'active',
      startDate: new Date('2026-06-01'),
    },
  });

  // Assign SDRs to campaigns
  await prisma.campaignSdr.createMany({
    data: [
      { campaignId: cmp1.id, userId: lan.id },
      { campaignId: cmp1.id, userId: david.id },
      { campaignId: cmp2.id, userId: vy.id },
      { campaignId: cmp3.id, userId: carlos.id },
      { campaignId: cmpLG.id, userId: dominic.id },
      { campaignId: cmpLG.id, userId: alexLG.id },
      { campaignId: cmpLG.id, userId: priyaLG.id },
    ],
  });

  console.log('✅ Campaigns created');

  // ─── Templates ────────────────────────────────────────────────────────────
  const tmplColdEmail = await prisma.template.create({
    data: {
      name: 'Cold Email — ERP Intro',
      channel: 'email',
      subject: 'Quick question about {{company}}\'s operations',
      body: `Hi {{firstName}},

I noticed {{company}} has been scaling its operations — congrats on the growth.

I'm {{sdrName}} from Telestar. We help companies like yours streamline ERP workflows and cut manual reporting by 40%.

Would you be open to a 15-minute call this week to see if there's a fit?

Best,
{{sdrName}}
{{sdrTitle}}, Telestar`,
      category: 'cold-outreach',
      createdById: dean.id,
    },
  });

  const tmplFollowUp = await prisma.template.create({
    data: {
      name: 'Follow-Up Email #2',
      channel: 'email',
      subject: 'Re: Quick question about {{company}}',
      body: `Hi {{firstName}},

Just circling back on my previous email. I know you're busy — I'll keep it short.

We recently helped a similar company in {{company}}'s space reduce their ops overhead by 35% in 90 days.

Happy to share the case study if that's useful. 15 mins this week?

{{sdrName}}`,
      category: 'follow-up',
      createdById: dean.id,
    },
  });

  const tmplLinkedIn = await prisma.template.create({
    data: {
      name: 'LinkedIn Connection Request',
      channel: 'linkedin',
      subject: null,
      body: `Hi {{firstName}} — saw your work at {{company}} and thought we might have some overlap. I help ops leaders streamline their workflows. Would love to connect!`,
      category: 'cold-outreach',
      createdById: dean.id,
    },
  });

  const tmplWhatsApp = await prisma.template.create({
    data: {
      name: 'WhatsApp Follow-Up',
      channel: 'whatsapp',
      subject: null,
      body: `Hi {{firstName}}, this is {{sdrName}} from Telestar. Following up on my email — did you get a chance to look at it? Happy to answer any questions here. 🙏`,
      category: 'follow-up',
      createdById: dean.id,
    },
  });

  const tmplCallScript = await prisma.template.create({
    data: {
      name: 'Call Script — Discovery',
      channel: 'phone',
      subject: null,
      body: `Opening: "Hi {{firstName}}, this is {{sdrName}} from Telestar — hope I caught you at a good time. I'm calling about {{company}}'s operations workflow."

Discovery questions:
- How are you currently managing your ERP reporting?
- What's the biggest operational bottleneck for your team right now?
- Have you evaluated any new solutions in the last 12 months?

Value statement: "Based on what you've shared, I think we could help. We've helped companies similar to {{company}} save 8+ hours per week on reporting alone."

Close: "Would a 20-minute demo be worth your time this week?"`,
      category: 'cold-outreach',
      createdById: dean.id,
    },
  });

  console.log('✅ Templates created');

  // ─── Sequences ────────────────────────────────────────────────────────────
  const seqCold = await prisma.sequence.create({
    data: {
      name: 'Cold Outreach',
      description: 'Standard cold outreach across email, phone, and LinkedIn for ERP prospects.',
      isActive: true,
      createdById: dean.id,
      steps: {
        create: [
          { order: 1, channel: 'email', delayDays: 0, delayHours: 0, templateId: tmplColdEmail.id, instructions: 'Send personalised cold intro email. Reference company size or recent news.', autoComplete: true, tenantId },
          { order: 2, channel: 'email', delayDays: 3, delayHours: 0, templateId: tmplFollowUp.id, instructions: 'Send follow-up email if no reply to Day 0.', autoComplete: true, tenantId },
          { order: 3, channel: 'phone', delayDays: 2, delayHours: 0, templateId: tmplCallScript.id, instructions: 'Make discovery call. Log outcome. If connected, attempt to book meeting.', autoComplete: false, tenantId },
          { order: 4, channel: 'linkedin', delayDays: 1, delayHours: 0, templateId: tmplLinkedIn.id, instructions: 'Send LinkedIn connection request with personalised note.', autoComplete: false, tenantId },
          { order: 5, channel: 'email', delayDays: 4, delayHours: 0, instructions: 'Final break-up email. Keep it short — give them an easy out.', autoComplete: true, tenantId },
        ],
      },
    },
  });

  const seqWarm = await prisma.sequence.create({
    data: {
      name: 'Warm Re-Engage',
      description: 'For leads that showed early interest but went cold. Re-engage over 3 steps.',
      isActive: true,
      createdById: dean.id,
      steps: {
        create: [
          { order: 1, channel: 'email', delayDays: 0, delayHours: 0, instructions: 'Re-engagement email — reference previous conversation. New value prop or case study.', autoComplete: true, tenantId },
          { order: 2, channel: 'whatsapp', delayDays: 2, delayHours: 0, templateId: tmplWhatsApp.id, instructions: 'Send WhatsApp message — short, casual, not pushy.', autoComplete: false, tenantId },
          { order: 3, channel: 'phone', delayDays: 3, delayHours: 0, instructions: 'Final call attempt. If no answer, leave voicemail.', autoComplete: false, tenantId },
        ],
      },
    },
  });

  const seqPostMeeting = await prisma.sequence.create({
    data: {
      name: 'Post-Meeting Follow-Up',
      description: 'Nurture sequence after a meeting is booked — keep momentum before the call.',
      isActive: true,
      createdById: dean.id,
      steps: {
        create: [
          { order: 1, channel: 'email', delayDays: 0, delayHours: 2, instructions: 'Send meeting confirmation + agenda. Attach relevant case study.', autoComplete: true, tenantId },
          { order: 2, channel: 'linkedin', delayDays: 1, delayHours: 0, instructions: 'Send LinkedIn follow-up — connect if not already connected.', autoComplete: false, tenantId },
        ],
      },
    },
  });

  console.log('✅ Sequences created');

  // ─── Leads ────────────────────────────────────────────────────────────────
  const leadsData = [
    // Lan's leads (cmp1 — Acme ERP)
    { firstName: 'Marcus', lastName: 'Webb', company: 'OmniRetail SEA', title: 'VP Operations', email: 'marcus.webb@omniretail.sg', phone: '+65 9123 4567', linkedIn: 'https://linkedin.com/in/marcuswebb', stage: 'replied', priority: 'hot', assignedTo: lan.id, campaign: cmp1 },
    { firstName: 'Priya', lastName: 'Nair', company: 'BuildTech Vietnam', title: 'COO', email: 'priya.nair@buildtech.vn', phone: '+84 912 345 678', linkedIn: 'https://linkedin.com/in/priyanair', stage: 'sequence_active', priority: 'warm', assignedTo: lan.id, campaign: cmp1 },
    { firstName: 'Jake', lastName: 'Morrison', company: 'FlexSupply ANZ', title: 'Head of Supply Chain', email: 'jake.morrison@flexsupply.com.au', phone: '+61 412 345 678', stage: 'sequence_active', priority: 'hot', assignedTo: lan.id, campaign: cmp1 },
    { firstName: 'Nguyen', lastName: 'Thanh', company: 'MekongTrade Co', title: 'Director of Logistics', email: 'n.thanh@mekong-trade.vn', phone: '+84 903 456 789', stage: 'new', priority: 'warm', assignedTo: lan.id, campaign: cmp1 },
    { firstName: 'Fatima', lastName: 'Al-Rashid', company: 'DXB Retail Group', title: 'GM Operations', email: 'f.alrashid@dxbretail.ae', stage: 'meeting_booked', priority: 'hot', assignedTo: lan.id, campaign: cmp1 },
    { firstName: 'Kevin', lastName: 'Tang', company: 'SinoLogix', title: 'Operations Manager', email: 'kevin.tang@sinologix.hk', phone: '+852 9234 5678', stage: 'new', priority: 'cold', assignedTo: lan.id, campaign: cmp1 },
    { firstName: 'Ana', lastName: 'Santos', company: 'PhilTech ERP Solutions', title: 'IT Director', email: 'a.santos@philtech.ph', stage: 'won', priority: 'hot', assignedTo: lan.id, campaign: cmp1 },
    // David's leads (cmp1)
    { firstName: 'Hiroshi', lastName: 'Tanaka', company: 'Osaka Precision', title: 'VP Procurement', email: 'h.tanaka@osaka-precision.jp', phone: '+81 90 1234 5678', stage: 'sequence_active', priority: 'warm', assignedTo: david.id, campaign: cmp1 },
    { firstName: 'Elena', lastName: 'Vasquez', company: 'MadridOps SL', title: 'Head of Operations', email: 'e.vasquez@madridops.es', stage: 'replied', priority: 'warm', assignedTo: david.id, campaign: cmp1 },
    { firstName: 'Thomas', lastName: 'Berg', company: 'NordSupply AB', title: 'Logistics Director', email: 't.berg@nordsupply.se', stage: 'new', priority: 'cold', assignedTo: david.id, campaign: cmp1 },
    // Vy's leads (cmp2 — PayFlow)
    { firstName: 'Linh', lastName: 'Vo', company: 'Saigon Mart', title: 'CFO', email: 'linh.vo@saigonmart.vn', phone: '+84 908 123 456', stage: 'sequence_active', priority: 'hot', assignedTo: vy.id, campaign: cmp2 },
    { firstName: 'Ryan', lastName: 'Chow', company: 'FreshGrocers SG', title: 'Finance Manager', email: 'ryan.chow@freshgrocers.sg', stage: 'replied', priority: 'warm', assignedTo: vy.id, campaign: cmp2 },
    { firstName: 'Nam', lastName: 'Nguyen', company: 'Hanoi Electronics', title: 'Owner / CEO', email: 'nam@hanoielectronics.vn', phone: '+84 96 789 0123', stage: 'new', priority: 'warm', assignedTo: vy.id, campaign: cmp2 },
    // Carlos's leads (cmp3 — Logix)
    { firstName: 'Diego', lastName: 'Morales', company: 'Cartagena Freight', title: 'Head of Logistics', email: 'd.morales@cartagenafreight.co', stage: 'sequence_active', priority: 'warm', assignedTo: carlos.id, campaign: cmp3 },
    { firstName: 'Sophie', lastName: 'Laurent', company: 'Lyon 3PL', title: 'Operations Director', email: 's.laurent@lyon3pl.fr', stage: 'new', priority: 'cold', assignedTo: carlos.id, campaign: cmp3 },
    { firstName: 'Ahmad', lastName: 'Karimi', company: 'Tehran Trade Hub', title: 'Supply Chain Manager', email: 'a.karimi@tehranhub.ir', stage: 'lost', priority: 'cold', assignedTo: carlos.id, campaign: cmp3 },
    // Leadgen team leads (cmpLG)
    { firstName: 'Adam', lastName: 'Clarke', company: 'NorthBridge Capital', title: 'CFO', email: 'a.clarke@northbridge.co', stage: 'new', priority: 'hot', assignedTo: dominic.id, campaign: cmpLG },
    { firstName: 'Clara', lastName: 'Wu', company: 'ShenZhen Tech', title: 'VP Sales', email: 'c.wu@shenzhentech.cn', stage: 'new', priority: 'warm', assignedTo: dominic.id, campaign: cmpLG },
    { firstName: 'Omar', lastName: 'Hassan', company: 'Cairo Trade Co', title: 'Director', email: 'o.hassan@cairotrade.eg', stage: 'replied', priority: 'hot', assignedTo: dominic.id, campaign: cmpLG },
    { firstName: 'James', lastName: 'Okafor', company: 'Lagos Fintech Hub', title: 'CEO', email: 'j.okafor@lagosfintech.ng', stage: 'replied', priority: 'hot', assignedTo: alexLG.id, campaign: cmpLG },
    { firstName: 'Nia', lastName: 'Bartel', company: 'BerlinGrowth GmbH', title: 'Head of Partnerships', email: 'n.bartel@berlingrowth.de', stage: 'new', priority: 'warm', assignedTo: alexLG.id, campaign: cmpLG },
    { firstName: 'Elena', lastName: 'Popov', company: 'Sofia Analytics', title: 'CTO', email: 'e.popov@sofiaanalytics.bg', stage: 'meeting_booked', priority: 'hot', assignedTo: alexLG.id, campaign: cmpLG },
    { firstName: 'Raj', lastName: 'Mehta', company: 'Mumbai StartupLab', title: 'Founder', email: 'raj.mehta@mumbai-lab.in', stage: 'new', priority: 'cold', assignedTo: priyaLG.id, campaign: cmpLG },
    { firstName: 'Sara', lastName: 'Lindqvist', company: 'StockholmOps', title: 'Operations Manager', email: 's.lindqvist@stockholmops.se', stage: 'replied', priority: 'warm', assignedTo: priyaLG.id, campaign: cmpLG },
  ];

  // ─── Accounts (from distinct lead companies) ───────────────────────────────
  const uniqueCompanies = [...new Set(leadsData.map(l => l.company).filter(Boolean))];
  const accounts = new Map<string, string>();
  for (const company of uniqueCompanies) {
    const account = await prisma.account.upsert({
      where: { tenantId_name: { tenantId, name: company } },
      create: { name: company, tenantId },
      update: {},
    });
    accounts.set(company, account.id);
  }
  console.log(`✅ ${accounts.size} Accounts created`);

  const createdLeads: any[] = [];
  for (const l of leadsData) {
    // Create or find Contact (person-level dedup)
    const normalizedEmail = l.email.toLowerCase().trim();
    let contact = await prisma.contact.findUnique({
      where: { tenantId_normalizedEmail: { tenantId, normalizedEmail } },
    });
    if (contact) {
      contact = await prisma.contact.update({
        where: { id: contact.id },
        data: { firstName: l.firstName, lastName: l.lastName, company: l.company, title: l.title, email: l.email, phone: l.phone ?? null, linkedIn: l.linkedIn ?? null, normalizedEmail, normalizedPhone: l.phone?.replace(/\D/g, '') ?? null, normalizedLinkedIn: l.linkedIn?.toLowerCase().trim() ?? null },
      });
    } else {
      contact = await prisma.contact.create({
        data: { firstName: l.firstName, lastName: l.lastName, company: l.company, title: l.title, email: l.email, phone: l.phone ?? null, linkedIn: l.linkedIn ?? null, normalizedEmail, normalizedPhone: l.phone?.replace(/\D/g, '') ?? null, normalizedLinkedIn: l.linkedIn?.toLowerCase().trim() ?? null, tenantId },
      });
    }

    const lead = await prisma.lead.create({
      data: {
        contactId: contact.id,
        accountId: accounts.get(l.company) ?? null,
        firstName: l.firstName,
        lastName: l.lastName,
        company: l.company,
        title: l.title,
        email: l.email,
        phone: l.phone ?? null,
        linkedIn: l.linkedIn ?? null,
        stage: l.stage as any,
        assignedToId: l.assignedTo,
        campaignId: l.campaign.id,
        source: 'CSV Import',
        tags: ['B2B', l.campaign.id === cmp1.id ? 'ERP' : l.campaign.id === cmp2.id ? 'Fintech' : 'Logistics'],
        crmPriorityScore: l.priority as any,
        normalizedEmail,
        // Only genuinely-active leads carry an active enrollment. Leads that have
        // replied (or moved to meeting/won/lost) are auto-unenrolled per the product
        // rules, so they get no sequence link — keeps the UI from showing a phantom
        // "Active Sequence" on a lead that's no longer being sequenced.
        sequenceId: l.stage === 'sequence_active' ? seqCold.id : null,
        sequenceStep: l.stage === 'sequence_active' ? 2 : null,
        sequenceStatus: l.stage === 'sequence_active' ? 'active' : null,
        lastContactedAt: ['replied', 'meeting_booked', 'won'].includes(l.stage) ? d(-2) : null,
      },
    });
    createdLeads.push(lead);
  }

  console.log('✅ Leads created');

  // ─── Tasks ────────────────────────────────────────────────────────────────
  // Lan's leads for tasks
  const lanLeads = createdLeads.filter((l) => l.assignedToId === lan.id);

  const tasksData = [
    // Today's tasks (Lan)
    { lead: lanLeads[0], type: 'phone', title: 'Discovery call — Marcus Webb', description: 'Follow up on the ERP deck sent Tuesday. Try to qualify and book demo.', due: d(0, 9), status: 'pending', userId: lan.id, priority: 'high' },
    { lead: lanLeads[1], type: 'email', title: 'Send follow-up #2 — Priya Nair', description: 'Auto-sequence step 2 follow-up. Reference their construction project scale.', due: d(0, 10), status: 'pending', userId: lan.id, priority: 'medium' },
    { lead: lanLeads[2], type: 'linkedin', title: 'LinkedIn connection — Jake Morrison', description: 'Send connection request with personalised note about ANZ supply chain.', due: d(0, 11), status: 'pending', userId: lan.id, priority: 'high' },
    { lead: lanLeads[3], type: 'email', title: 'Cold intro — Nguyen Thanh', description: 'First touch. Reference MekongTrade logistics expansion news from May.', due: d(0, 14), status: 'pending', userId: lan.id, priority: 'medium' },
    { lead: lanLeads[0], type: 'manual', title: 'Update CRM notes after Marcus call', description: 'Log call outcome and update pipeline stage if meeting booked.', due: d(0, 16), status: 'pending', userId: lan.id, priority: 'low' },
    // Yesterday's tasks (Lan — mix of completed and missed)
    { lead: lanLeads[1], type: 'email', title: 'Cold email — Priya Nair', description: 'Sequence step 1 cold intro.', due: d(-1, 9), status: 'completed', userId: lan.id, priority: 'medium' },
    { lead: lanLeads[0], type: 'email', title: 'ERP deck follow-up — Marcus Webb', description: 'Send custom ERP demo video link.', due: d(-1, 11), status: 'completed', userId: lan.id, priority: 'high' },
    { lead: lanLeads[5], type: 'phone', title: 'Outreach call — Kevin Tang', description: 'First call attempt to SinoLogix.', due: d(-1, 14), status: 'skipped', userId: lan.id, priority: 'low' },
    // Overdue tasks (Lan)
    { lead: lanLeads[2], type: 'email', title: 'Follow-up email #1 — Jake Morrison', description: 'Sequence step 2. Sent initial email 5 days ago, no reply.', due: d(-5, 10), status: 'pending', userId: lan.id, priority: 'high' },
    { lead: lanLeads[3], type: 'phone', title: 'Discovery call — Nguyen Thanh', description: 'Was supposed to call last week. Priority to reschedule.', due: d(-3, 9), status: 'pending', userId: lan.id, priority: 'medium' },
    // David's tasks
    { lead: createdLeads[7], type: 'email', title: 'Cold email — Hiroshi Tanaka', description: 'Sequence step 1 in Japanese market ERP approach.', due: d(0, 10), status: 'pending', userId: david.id, priority: 'medium' },
    { lead: createdLeads[8], type: 'phone', title: 'Follow-up call — Elena Vasquez', description: 'Elena replied positively to email — call to qualify.', due: d(0, 14), status: 'pending', userId: david.id, priority: 'high' },
    // Vy's tasks
    { lead: createdLeads[10], type: 'email', title: 'Cold intro — Linh Vo', description: 'PayFlow fintech outreach step 1.', due: d(0, 9), status: 'pending', userId: vy.id, priority: 'hot' as any },
    { lead: createdLeads[11], type: 'whatsapp', title: 'WhatsApp follow-up — Ryan Chow', description: 'Send WhatsApp after email reply.', due: d(0, 11), status: 'pending', userId: vy.id, priority: 'medium' },
  ];

  for (const t of tasksData) {
    await prisma.task.create({
      data: {
        leadId: t.lead.id,
        userId: t.userId,
        type: t.type as any,
        title: t.title,
        description: t.description,
        dueDate: t.due,
        status: t.status as any,
        completedAt: t.status === 'completed' ? t.due : null,
        priority: (t.priority === 'hot' ? 'high' : t.priority) as any,
      },
    });
  }

  console.log('✅ Tasks created');

  // ─── Notes ────────────────────────────────────────────────────────────────
  await prisma.note.createMany({
    data: [
      { leadId: lanLeads[0].id, content: 'Initial prospecting done. Company confirmed as ERP buyer — expanding to 3 new warehouses in Q3.', createdById: dean.id, isPinned: true, createdAt: d(-10) },
      { leadId: lanLeads[0].id, content: 'Marcus responded to email! Said he\'s evaluating 2 platforms this quarter. Need to move fast.', createdById: lan.id, isPinned: false, createdAt: d(-2) },
      { leadId: lanLeads[4].id, content: 'Fatima booked a demo for June 10. She wants to see the reporting module specifically.', createdById: lan.id, isPinned: true, createdAt: d(-1) },
      { leadId: createdLeads[8].id, content: 'Elena is the decision maker — confirmed budget is approved. Strong buying signal.', createdById: david.id, isPinned: false, createdAt: d(-3) },
    ],
  });

  console.log('✅ Notes created');

  // ─── Activities ───────────────────────────────────────────────────────────
  const activityTypes = ['email_sent', 'call_logged', 'linkedin_touch', 'note_added', 'stage_changed', 'meeting_booked'];

  const activitiesData: any[] = [
    // Lan — last 2 weeks
    { userId: lan.id, leadId: lanLeads[0].id, type: 'email_sent', channel: 'email', description: 'Sent cold intro to Marcus Webb', metadata: { subject: 'Quick question about OmniRetail SEA\'s operations' }, createdAt: d(-10) },
    { userId: lan.id, leadId: lanLeads[0].id, type: 'call_logged', channel: 'phone', description: 'Called Marcus Webb — voicemail left', metadata: { outcome: 'voicemail_left', duration_seconds: 42 }, createdAt: d(-7) },
    { userId: lan.id, leadId: lanLeads[0].id, type: 'email_sent', channel: 'email', description: 'Sent ERP deck follow-up to Marcus', createdAt: d(-1) },
    { userId: lan.id, leadId: lanLeads[0].id, type: 'stage_changed', description: 'Stage changed: sequence_active → replied', metadata: { from: 'sequence_active', to: 'replied' }, createdAt: d(-2) },
    { userId: lan.id, leadId: lanLeads[1].id, type: 'email_sent', channel: 'email', description: 'Cold intro email to Priya Nair', createdAt: d(-1) },
    { userId: lan.id, leadId: lanLeads[2].id, type: 'email_sent', channel: 'email', description: 'Cold intro to Jake Morrison', createdAt: d(-5) },
    { userId: lan.id, leadId: lanLeads[4].id, type: 'call_logged', channel: 'phone', description: 'Connected with Fatima — booked demo for June 10', metadata: { outcome: 'connected_meeting_booked', duration_seconds: 312 }, createdAt: d(-1) },
    { userId: lan.id, leadId: lanLeads[4].id, type: 'meeting_booked', description: 'Meeting booked with Fatima Al-Rashid 🎉', createdAt: d(-1) },
    { userId: lan.id, leadId: lanLeads[6].id, type: 'stage_changed', description: 'Stage changed: meeting_booked → won', metadata: { from: 'meeting_booked', to: 'won' }, createdAt: d(-4) },
    // David
    { userId: david.id, leadId: createdLeads[7].id, type: 'email_sent', channel: 'email', description: 'Cold email to Hiroshi Tanaka', createdAt: d(-6) },
    { userId: david.id, leadId: createdLeads[8].id, type: 'email_sent', channel: 'email', description: 'Cold email to Elena Vasquez', createdAt: d(-5) },
    { userId: david.id, leadId: createdLeads[8].id, type: 'call_logged', channel: 'phone', description: 'Connected with Elena — very interested', metadata: { outcome: 'connected_interested', duration_seconds: 480 }, createdAt: d(-3) },
    { userId: david.id, leadId: createdLeads[8].id, type: 'stage_changed', description: 'Stage: sequence_active → replied', metadata: { from: 'sequence_active', to: 'replied' }, createdAt: d(-3) },
    // Vy
    { userId: vy.id, leadId: createdLeads[10].id, type: 'email_sent', channel: 'email', description: 'PayFlow cold intro to Linh Vo', createdAt: d(-4) },
    { userId: vy.id, leadId: createdLeads[10].id, type: 'call_logged', channel: 'phone', description: 'Called Linh Vo — connected, pitched PayFlow', metadata: { outcome: 'connected_interested', duration_seconds: 250 }, createdAt: d(-2) },
    { userId: vy.id, leadId: createdLeads[11].id, type: 'email_sent', channel: 'email', description: 'Cold email to Ryan Chow', createdAt: d(-3) },
    { userId: vy.id, leadId: createdLeads[11].id, type: 'whatsapp_message', channel: 'whatsapp', description: 'WhatsApp follow-up to Ryan Chow', metadata: { action: 'Follow-up Message Sent', response_received: true }, createdAt: d(-1) },
    // Carlos
    { userId: carlos.id, leadId: createdLeads[13].id, type: 'email_sent', channel: 'email', description: 'Cold email to Diego Morales', createdAt: d(-5) },
    { userId: carlos.id, leadId: createdLeads[13].id, type: 'linkedin_touch', channel: 'linkedin', description: 'LinkedIn connection request to Diego', metadata: { action: 'Connection Request Sent', response_received: false }, createdAt: d(-3) },
    // Leadgen team — Dominic, Alex, Priya (indices 16-23 in createdLeads)
    { userId: dominic.id, leadId: createdLeads[16].id, type: 'lead_created', description: 'Lead imported: Adam Clarke / NorthBridge Capital', createdAt: d(-6) },
    { userId: dominic.id, leadId: createdLeads[17].id, type: 'lead_created', description: 'Lead imported: Clara Wu / ShenZhen Tech', createdAt: d(-6) },
    { userId: dominic.id, leadId: createdLeads[18].id, type: 'email_sent', channel: 'email', description: 'Outreach to Omar Hassan', createdAt: d(-4) },
    { userId: dominic.id, leadId: createdLeads[18].id, type: 'stage_changed', description: 'Stage: new → replied', metadata: { from: 'new', to: 'replied' }, createdAt: d(-2) },
    { userId: alexLG.id, leadId: createdLeads[19].id, type: 'email_sent', channel: 'email', description: 'Cold email to James Okafor', createdAt: d(-5) },
    { userId: alexLG.id, leadId: createdLeads[19].id, type: 'stage_changed', description: 'Stage: new → replied', metadata: { from: 'new', to: 'replied' }, createdAt: d(-3) },
    { userId: alexLG.id, leadId: createdLeads[20].id, type: 'lead_created', description: 'Lead imported: Nia Bartel / BerlinGrowth', createdAt: d(-4) },
    { userId: alexLG.id, leadId: createdLeads[21].id, type: 'meeting_booked', description: 'Meeting booked with Elena Popov 🎉', createdAt: d(-1) },
    { userId: priyaLG.id, leadId: createdLeads[22].id, type: 'lead_created', description: 'Lead imported: Raj Mehta / Mumbai StartupLab', createdAt: d(-3) },
    { userId: priyaLG.id, leadId: createdLeads[23].id, type: 'email_sent', channel: 'email', description: 'Cold email to Sara Lindqvist', createdAt: d(-4) },
    { userId: priyaLG.id, leadId: createdLeads[23].id, type: 'stage_changed', description: 'Stage: new → replied', metadata: { from: 'new', to: 'replied' }, createdAt: d(-2) },
  ];

  for (const act of activitiesData) {
    await prisma.activity.create({ data: act });
  }

  console.log('✅ Activities created');

  // ─── Reminders ────────────────────────────────────────────────────────────
  await prisma.reminder.create({
    data: {
      userId: lan.id,
      leadId: lanLeads[4].id,
      text: 'Prepare demo deck for Fatima — she wants reporting module',
      dueAt: d(1, 8),
    },
  });

  await prisma.reminder.create({
    data: {
      userId: lan.id,
      leadId: lanLeads[0].id,
      text: 'Send Marcus Webb the Q3 pricing sheet he requested',
      dueAt: d(0, 15),
    },
  });

  console.log('✅ Reminders created');

  // ─── Notifications ────────────────────────────────────────────────────────
  await prisma.notification.create({
    data: {
      userId: lan.id,
      type: 'meeting_booked',
      text: 'Meeting booked with Fatima Al-Rashid! 🎉',
      linkTo: '/leads',
      isRead: false,
    },
  });

  // Note: overdue-task notifications are created live (and de-duplicated) by
  // /api/notifications/check on dashboard load — we don't seed one here, otherwise
  // it duplicates the live one with near-identical wording in the bell.

  console.log('✅ Notifications created');
  console.log('\n🚀 Seed complete! Login credentials: all users use password: telestar2026');
  console.log(`   Director:      dean@telestar.vn`);
  console.log(`   Floor Manager: sonny@telestar.vn / alayna@telestar.vn`);
  console.log(`   Team Lead:     brandon@telestar.vn / jackie@telestar.vn / vie@telestar.vn`);
  console.log(`                  meixi@telestar.vn / hayden@telestar.vn / selina@telestar.vn / kim@telestar.vn`);
  console.log(`   SDR:           lan.pham@telestar.vn`);
  console.log(`   Leadgen:       dominic@telestar.vn / alex@telestar.vn / priya@telestar.vn`);
}

tenantStorage.run({ tenantId: 'default-tenant', bypassRls: true }, () => {
  main()
    .catch(console.error)
    .finally(() => { prisma.$disconnect(); raw.$disconnect(); });
});

import * as mock from './mockData';

// Persistent global state — survives Next.js module hot-reload and Turbopack re-evaluation.
// Plain module-level arrays get reset on every re-evaluation; global refs do not.
const _g = global as any;
if (!_g.__crm_init) {
  _g.__crm_init = true;
  _g.__crm_leads = [...mock.mockLeads];
  _g.__crm_tasks = [...mock.mockTasks];
  _g.__crm_notifications = [...mock.mockNotifications];
  _g.__crm_activities = [...mock.mockActivities];
  _g.__crm_emailAccounts = [];
  _g.__crm_notes = [
    { id: 'note1', leadId: 'l1', content: 'Spoke with Sarah — she is very interested in the ERP module for inventory. Follow up with case studies.', isPinned: true, createdById: 'u6', createdBy: { id: 'u6', firstName: 'Lan', lastName: 'Pham' }, createdAt: '2026-06-01T09:30:00+07:00' },
    { id: 'note2', leadId: 'l5', content: 'Emily replied asking for integration details. Send the integrations PDF.', isPinned: false, createdById: 'u6', createdBy: { id: 'u6', firstName: 'Lan', lastName: 'Pham' }, createdAt: '2026-06-02T10:20:00+07:00' },
  ];
  if (!_g.__reminders) _g.__reminders = [];
}

// Reference aliases — mutations on these arrays persist across hot-reloads
const leads: any[] = _g.__crm_leads;
const tasks: any[] = _g.__crm_tasks;
const notes: any[] = _g.__crm_notes;
const notifications: any[] = _g.__crm_notifications;
const activities: any[] = _g.__crm_activities;
const emailAccounts: any[] = _g.__crm_emailAccounts;



export const prismaMock: any = {
  user: {
    findUnique: async ({ where }: any) =>
      mock.mockUsers.find((u) => u.email === where.email || u.id === where.id) || null,
    findFirst: async ({ where }: any = {}) => {
      let result = [...mock.mockUsers];
      if (where?.id) result = result.filter((u) => u.id === where.id);
      if (where?.email) result = result.filter((u) => u.email === where.email);
      return result[0] || null;
    },
    findMany: async ({ where }: any = {}) => {
      let result = [...mock.mockUsers];
      if (where?.isActive !== undefined) result = result.filter((u) => u.isActive === where.isActive);
      if (where?.role?.in) result = result.filter((u) => where.role.in.includes(u.role));
      else if (where?.role) result = result.filter((u) => u.role === where.role);
      return result;
    },
    create: async ({ data }: any) => {
      const user = { id: 'u_' + Math.random().toString(36).slice(2), isActive: true, createdAt: new Date().toISOString(), ...data };
      mock.mockUsers.push(user);
      return user;
    },
    update: async ({ where, data }: any) => {
      const user = mock.mockUsers.find((u) => u.id === where.id);
      if (!user) throw new Error('User not found');
      Object.assign(user, data);
      return user;
    },
  },

  lead: {
    findMany: async ({ where }: any) => {
      let result = [...leads];
      if (where?.assignedToId) result = result.filter((l) => (l.assignedTo ?? l.assignedToId) === where.assignedToId);
      if (where?.stage) result = result.filter((l) => l.stage === where.stage);
      if (where?.crmPriorityScore) result = result.filter((l) => l.crmPriorityScore === where.crmPriorityScore);
      if (where?.campaignId) result = result.filter((l) => l.campaignId === where.campaignId);
      if (where?.OR) {
        const q = where.OR[0]?.firstName?.contains?.toLowerCase() || '';
        if (q) {
          result = result.filter(
            (l) =>
              l.firstName.toLowerCase().includes(q) ||
              l.lastName.toLowerCase().includes(q) ||
              l.company.toLowerCase().includes(q) ||
              l.email.toLowerCase().includes(q)
          );
        }
      }
      return result.map((l) => ({
        ...l,
        assignedTo: mock.mockUsers.find((u) => u.id === (l.assignedTo ?? l.assignedToId)) || null,
        campaign: mock.mockCampaigns.find((c) => c.id === l.campaignId) || null,
        _count: { tasks: tasks.filter((t) => t.leadId === l.id).length, notes: notes.filter((n) => n.leadId === l.id).length },
        activities: activities.filter((a: any) => a.leadId === l.id).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 20).map((a: any) => ({ type: a.type, createdAt: a.createdAt })),
        tasks: tasks.filter((t: any) => t.leadId === l.id && t.status === 'pending').map((t: any) => ({ dueDate: t.dueDate, status: t.status, type: t.type })),
      }));
    },
    findUnique: async ({ where }: any) => {
      const l = leads.find((lead) => lead.id === where.id);
      if (!l) return null;
      const seq = mock.mockSequences.find((s) => s.id === l.sequenceId);
      return {
        ...l,
        assignedTo: mock.mockUsers.find((u) => u.id === (l.assignedTo ?? l.assignedToId)) || null,
        campaign: mock.mockCampaigns.find((c) => c.id === l.campaignId) || null,
        sequence: seq ? { ...seq, steps: seq.steps } : null,
        notes: notes
          .filter((n) => n.leadId === l.id)
          .sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
        tasks: tasks.filter((t) => t.leadId === l.id).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()),
        activities: activities
          .filter((a) => a.leadId === l.id)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 20)
          .map((a) => ({ ...a, user: mock.mockUsers.find((u) => u.id === a.userId) || null })),
        reminders: (_g.__reminders || []).filter((r: any) => r.leadId === l.id && !r.isDismissed),
      };
    },
    groupBy: async ({ by, where }: any) => {
      const byKey = Array.isArray(by) ? by[0] : by;
      // Filter leads if `where` clause is provided
      let filtered: any[] = leads;
      if (where) {
        if (where.stage?.in) filtered = filtered.filter((l: any) => where.stage.in.includes(l.stage));
        if (where.sequenceId?.in) filtered = filtered.filter((l: any) => where.sequenceId.in.includes(l.sequenceId));
        if (where.assignedToId) filtered = filtered.filter((l: any) => (l.assignedToId ?? l.assignedTo?.id) === where.assignedToId);
        if (where.campaignId) filtered = filtered.filter((l: any) => l.campaignId === where.campaignId);
      }
      if (byKey === 'campaignId') {
        const campaignGroups: Record<string, Record<string, number>> = {};
        filtered.forEach((l: any) => {
          if (!campaignGroups[l.campaignId]) campaignGroups[l.campaignId] = {};
          campaignGroups[l.campaignId][l.stage] = (campaignGroups[l.campaignId][l.stage] || 0) + 1;
        });
        const out: any[] = [];
        Object.entries(campaignGroups).forEach(([campaignId, stages]) => {
          Object.entries(stages).forEach(([stage, count]) => {
            out.push({ campaignId, stage, _count: { id: count } });
          });
        });
        return out;
      }
      if (byKey === 'sequenceId') {
        const seqGroups: Record<string, number> = {};
        filtered.forEach((l: any) => {
          if (l.sequenceId) seqGroups[l.sequenceId] = (seqGroups[l.sequenceId] || 0) + 1;
        });
        return Object.entries(seqGroups).map(([sequenceId, count]) => ({ sequenceId, _count: { id: count } }));
      }
      // Group by stage — compute from actual leads data
      const stageCounts: Record<string, number> = {};
      filtered.forEach((l: any) => {
        stageCounts[l.stage] = (stageCounts[l.stage] || 0) + 1;
      });
      return Object.entries(stageCounts).map(([stage, count]) => ({ stage, _count: { id: count } }));
    },
    create: async ({ data }: any) => {
      const resolvedUserId = data.assignedToId ?? data.assignedTo;
      const resolvedUser = mock.mockUsers.find((u) => u.id === resolvedUserId) || null;
      const lead = {
        id: 'l_' + Math.random().toString(36).slice(2),
        stage: 'new',
        crmPriorityScore: 'warm',
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...data,
        assignedToId: resolvedUserId,
        assignedTo: resolvedUser,
      };
      leads.push(lead);
      return lead;
    },
    update: async ({ where, data }: any) => {
      const lead = leads.find((l) => l.id === where.id);
      if (lead) Object.assign(lead, data, { updatedAt: new Date().toISOString() });
      if (!lead) return null;
      const resolvedUserId = lead.assignedToId ?? lead.assignedTo;
      return {
        ...lead,
        assignedTo: typeof resolvedUserId === 'string'
          ? mock.mockUsers.find((u) => u.id === resolvedUserId) || null
          : resolvedUserId,
      };
    },
    delete: async ({ where }: any) => {
      const idx = leads.findIndex((l) => l.id === where.id);
      if (idx !== -1) leads.splice(idx, 1);
      return { id: where.id };
    },
  },

  task: {
    findMany: async ({ where }: any) => {
      let result = [...tasks];
      if (where?.userId) result = result.filter((t) => t.userId === where.userId);
      if (where?.leadId) result = result.filter((t) => t.leadId === where.leadId);
      if (where?.status) result = result.filter((t) => t.status === where.status);
      if (where?.dueDate?.gte) result = result.filter((t) => new Date(t.dueDate) >= new Date(where.dueDate.gte));
      if (where?.dueDate?.lt) result = result.filter((t) => new Date(t.dueDate) < new Date(where.dueDate.lt));
      return result.map((t) => ({
        ...t,
        lead: leads.find((l) => l.id === t.leadId) || null,
        user: mock.mockUsers.find((u) => u.id === t.userId) || null,
      }));
    },
    findUnique: async ({ where }: any) => {
      const t = tasks.find((task) => task.id === where.id);
      if (!t) return null;
      return { ...t, lead: leads.find((l) => l.id === t.leadId) || null };
    },
    groupBy: async ({ where }: any) => {
      let result = [...tasks];
      if (where?.status) result = result.filter((t) => t.status === where.status);
      if (where?.dueDate?.lt) result = result.filter((t) => new Date(t.dueDate) < new Date(where.dueDate.lt));
      const byUser: Record<string, number> = {};
      result.forEach((t) => { byUser[t.userId] = (byUser[t.userId] || 0) + 1; });
      return Object.entries(byUser).map(([userId, count]) => ({ userId, _count: { id: count } }));
    },
    create: async ({ data }: any) => {
      const task = {
        id: 'tsk_' + Math.random().toString(36).slice(2),
        status: 'pending',
        createdAt: new Date().toISOString(),
        completedAt: null,
        ...data,
      };
      tasks.push(task);
      return { ...task, lead: leads.find((l) => l.id === task.leadId) || null };
    },
    update: async ({ where, data }: any) => {
      const task = tasks.find((t) => t.id === where.id);
      if (task) Object.assign(task, data);
      return task;
    },
    delete: async ({ where }: any) => {
      const idx = tasks.findIndex((t) => t.id === where.id);
      if (idx !== -1) tasks.splice(idx, 1);
      return { id: where.id };
    },
  },

  activity: {
    findMany: async ({ where, take }: any) => {
      let result = [...activities];
      if (where?.userId) result = result.filter((a) => a.userId === where.userId);
      if (where?.leadId) result = result.filter((a) => a.leadId === where.leadId);
      if (where?.type) result = result.filter((a) => a.type === where.type);
      result = result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      if (take) result = result.slice(0, take);
      return result.map((a) => ({
        ...a,
        user: mock.mockUsers.find((u) => u.id === a.userId) || null,
        lead: leads.find((l) => l.id === a.leadId) || null,
      }));
    },
    groupBy: async ({ where }: any) => {
      let result = [...activities];
      if (where?.createdAt?.gte) result = result.filter((a) => new Date(a.createdAt) >= new Date(where.createdAt.gte));
      const grouped: Record<string, Record<string, number>> = {};
      result.forEach((a) => {
        if (!grouped[a.userId]) grouped[a.userId] = {};
        grouped[a.userId][a.type] = (grouped[a.userId][a.type] || 0) + 1;
      });
      const out: any[] = [];
      Object.entries(grouped).forEach(([userId, types]) => {
        Object.entries(types).forEach(([type, count]) => {
          out.push({ userId, type, _count: { id: count } });
        });
      });
      return out;
    },
    create: async ({ data }: any) => {
      const activity = {
        id: 'act_' + Math.random().toString(36).slice(2),
        channel: null,
        metadata: {},
        createdAt: new Date().toISOString(),
        ...data,
      };
      activities.push(activity);
      return activity;
    },
  },

  note: {
    findMany: async ({ where }: any) => {
      let result = [...notes];
      if (where?.leadId) result = result.filter((n) => n.leadId === where.leadId);
      return result.sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },
    create: async ({ data }: any) => {
      const author = mock.mockUsers.find((u) => u.id === data.createdById);
      const note = {
        id: 'note_' + Math.random().toString(36).slice(2),
        isPinned: false,
        createdAt: new Date().toISOString(),
        ...data,
        createdBy: author
          ? { id: author.id, firstName: author.firstName, lastName: author.lastName }
          : { id: data.createdById ?? 'u1', firstName: 'Unknown', lastName: '' },
      };
      notes.push(note);
      return note;
    },
    update: async ({ where, data }: any) => {
      const note = notes.find((n) => n.id === where.id);
      if (note) Object.assign(note, data);
      return note;
    },
    delete: async ({ where }: any) => {
      const idx = notes.findIndex((n) => n.id === where.id);
      if (idx !== -1) notes.splice(idx, 1);
      return { id: where.id };
    },
  },

  notification: {
    findMany: async ({ where, take }: any) => {
      let result = [...notifications];
      if (where?.userId) result = result.filter((n) => n.userId === where.userId);
      if (where?.isRead === false) result = result.filter((n) => !n.isRead);
      result = result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      if (take) result = result.slice(0, take);
      return result;
    },
    count: async ({ where }: any) => {
      let result = [...notifications];
      if (where?.userId) result = result.filter((n) => n.userId === where.userId);
      if (where?.isRead === false) result = result.filter((n) => !n.isRead);
      return result.length;
    },
    create: async ({ data }: any) => {
      const notification = {
        id: 'notif_' + Math.random().toString(36).slice(2),
        isRead: false,
        createdAt: new Date().toISOString(),
        ...data,
      };
      notifications.push(notification);
      return notification;
    },
    update: async ({ where, data }: any) => {
      const notif = notifications.find((n) => n.id === where.id);
      if (notif) Object.assign(notif, data);
      return notif;
    },
    updateMany: async ({ where, data }: any) => {
      let updateCount = 0;
      notifications.forEach((n) => {
        if (where?.userId && n.userId !== where.userId) return;
        if (where?.isRead === false && n.isRead) return;
        if (where?.id && n.id !== where.id) return;
        Object.assign(n, data);
        updateCount++;
      });
      return { count: updateCount };
    },
  },

  campaignSdr: {
    findMany: async ({ where }: any) => {
      let result = [...mock.mockCampaignSdrs];
      if (where?.userId) result = result.filter(cs => cs.userId === where.userId);
      if (where?.campaignId) result = result.filter(cs => cs.campaignId === where.campaignId);
      return result;
    },
  },
  campaign: {
    findMany: async ({ where }: any = {}) => {
      let result = [...mock.mockCampaigns];
      if (where?.id?.in) result = result.filter(c => where.id.in.includes(c.id));
      if (where?.isActive === true) result = result.filter(c => c.status === 'active');
      return result.map(c => ({
        ...c,
        client: mock.mockClients.find(cl => cl.id === c.clientId) || null,
      }));
    },
    findUnique: async ({ where }: any) => {
      const c = mock.mockCampaigns.find(camp => camp.id === where.id);
      if (!c) return null;
      return {
        ...c,
        client: mock.mockClients.find(cl => cl.id === c.clientId) || null,
      };
    },
    create: async ({ data }: any) => {
      const campaign = {
        id: 'camp_' + Math.random().toString(36).slice(2),
        assignedSdrs: [],
        endDate: null,
        createdAt: new Date().toISOString(),
        ...data,
        startDate: data.startDate instanceof Date ? data.startDate.toISOString() : data.startDate,
      };
      mock.mockCampaigns.push(campaign as any);
      return campaign;
    },
  },
  client: {
    findMany: async ({ select }: any = {}) => {
      const result = [...mock.mockClients];
      return result.map(c => select ? Object.fromEntries(Object.keys(select).map(k => [k, (c as any)[k]])) : c);
    },
    create: async ({ data }: any) => {
      const client = {
        id: 'cli_' + Math.random().toString(36).slice(2),
        createdAt: new Date().toISOString(),
        ...data,
      };
      mock.mockClients.push(client as any);
      return client;
    },
  },
  sequence: {
    findMany: async () =>
      mock.mockSequences.map((s) => ({
        ...s,
        steps: s.steps,
        createdBy: mock.mockUsers.find((u) => u.id === s.createdBy) || null,
        _count: { leads: s.enrolledCount },
      })),
    findUnique: async ({ where }: any) => {
      const s = mock.mockSequences.find((seq) => seq.id === where.id);
      if (!s) return null;
      return {
        ...s,
        createdBy: mock.mockUsers.find((u) => u.id === s.createdBy) || null,
        steps: s.steps.map((step: any) => ({
          ...step,
          template: mock.mockTemplates.find((t) => t.id === step.templateId) || null,
        })),
        _count: { leads: s.enrolledCount },
      };
    },
    create: async ({ data }: any) => {
      const seq = {
        id: 'seq_' + Math.random().toString(36).slice(2),
        isActive: true,
        enrolledCount: 0,
        createdAt: new Date().toISOString(),
        ...data,
        steps: data.steps?.create ?? [],
      };
      mock.mockSequences.push(seq as any);
      return seq;
    },
    update: async ({ where, data }: any) => {
      const seq = mock.mockSequences.find((s) => s.id === where.id);
      if (seq) Object.assign(seq, data);
      return seq;
    },
  },

  sequenceStep: {
    deleteMany: async ({ where }: any) => {
      const seq = mock.mockSequences.find((s) => s.id === where.sequenceId);
      if (seq) seq.steps = [];
      return { count: 0 };
    },
    create: async ({ data }: any) => {
      const step = { id: 'step_' + Math.random().toString(36).slice(2), ...data };
      const seq = mock.mockSequences.find((s) => s.id === data.sequenceId);
      if (seq) seq.steps.push(step as any);
      return step;
    },
    createMany: async ({ data }: any) => {
      for (const stepData of data) {
        const step = { id: 'step_' + Math.random().toString(36).slice(2), ...stepData };
        const seq = mock.mockSequences.find((s) => s.id === stepData.sequenceId);
        if (seq) seq.steps.push(step as any);
      }
      return { count: data.length };
    },
  },

  template: {
    findMany: async () => mock.mockTemplates,
    findUnique: async ({ where }: any) => mock.mockTemplates.find((t) => t.id === where.id) || null,
    create: async ({ data }: any) => {
      const tpl = { id: 'tpl_' + Math.random().toString(36).slice(2), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...data };
      mock.mockTemplates.push(tpl as any);
      return tpl;
    },
    update: async ({ where, data }: any) => {
      const tpl = mock.mockTemplates.find((t) => t.id === where.id);
      if (tpl) Object.assign(tpl, data, { updatedAt: new Date().toISOString() });
      return tpl;
    },
    delete: async ({ where }: any) => {
      const idx = mock.mockTemplates.findIndex((t) => t.id === where.id);
      if (idx !== -1) mock.mockTemplates.splice(idx, 1);
      return { id: where.id };
    },
  },

  reminder: {
    findMany: async ({ where }: any = {}) => {
      const store = (global as any).__reminders ?? [];
      let result = [...store];
      if (where?.userId) result = result.filter((r: any) => r.userId === where.userId);
      if (where?.isDismissed !== undefined) result = result.filter((r: any) => r.isDismissed === where.isDismissed);
      return result.sort((a: any, b: any) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
    },
    create: async ({ data }: any) => {
      if (!(global as any).__reminders) (global as any).__reminders = [];
      const reminder = {
        id: 'rem_' + Math.random().toString(36).slice(2),
        isDismissed: false,
        createdAt: new Date().toISOString(),
        ...data,
        dueAt: data.dueAt instanceof Date ? data.dueAt.toISOString() : data.dueAt,
      };
      (global as any).__reminders.push(reminder);
      return reminder;
    },
    update: async ({ where, data }: any) => {
      const store = (global as any).__reminders ?? [];
      const r = store.find((rem: any) => rem.id === where.id);
      if (r) Object.assign(r, data);
      return r ?? { id: where.id, ...data };
    },
  },

  emailAccount: {
    findMany: async ({ where }: any = {}) => {
      let result = [...emailAccounts];
      if (where?.userId) result = result.filter((a) => a.userId === where.userId);
      if (where?.isActive !== undefined) result = result.filter((a) => a.isActive === where.isActive);
      return result;
    },
    findFirst: async ({ where }: any = {}) => {
      let result = [...emailAccounts];
      if (where?.userId) result = result.filter((a) => a.userId === where.userId);
      if (where?.id) result = result.filter((a) => a.id === where.id);
      return result[0] ?? null;
    },
    findUnique: async ({ where }: any) => {
      return emailAccounts.find(
        (a) => a.id === where.id && (where.userId === undefined || a.userId === where.userId)
      ) ?? null;
    },
    create: async ({ data }: any) => {
      const account = {
        id: 'ema_' + Math.random().toString(36).slice(2),
        isActive: true,
        lastSyncAt: null,
        createdAt: new Date().toISOString(),
        ...data,
      };
      emailAccounts.push(account);
      return account;
    },
    update: async ({ where, data }: any) => {
      const account = emailAccounts.find((a) => a.id === where.id);
      if (account) Object.assign(account, data);
      return account ?? { id: where.id, ...data };
    },
    delete: async ({ where }: any) => {
      const idx = emailAccounts.findIndex((a) => a.id === where.id);
      if (idx !== -1) emailAccounts.splice(idx, 1);
      return { id: where.id };
    },
  },
};

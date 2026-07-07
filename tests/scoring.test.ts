import { describe, it, expect } from 'vitest';
import { scoreLead } from '@/lib/ai/scoring';

const base = {
  id: 'l1',
  firstName: 'Anh',
  lastName: 'Tran',
  company: 'VinaTech',
  email: 'anh@vinatech.vn',
  stage: 'new',
  crmPriorityScore: 'warm',
  createdAt: new Date().toISOString(),
};

describe('scoreLead', () => {
  it('labels by score boundaries: >=60 hot, >=35 warm, else cold', () => {
    // Rich lead recently contacted in a strong stage → hot
    const hot = scoreLead({
      ...base,
      stage: 'replied',
      crmPriorityScore: 'hot',
      phone: '123',
      linkedIn: 'x',
      whatsApp: 'y',
      title: 'CTO',
      source: 'inbound form',
      lastContactedAt: new Date().toISOString(),
    });
    expect(hot.score).toBeGreaterThanOrEqual(60);
    expect(hot.label).toBe('hot');

    // Bare minimum lead → cold
    const cold = scoreLead({
      ...base,
      email: '',
      stage: 'lost',
      crmPriorityScore: 'cold',
    });
    expect(cold.score).toBeLessThan(35);
    expect(cold.label).toBe('cold');
  });

  it('penalizes overdue pending tasks', () => {
    const without = scoreLead({ ...base, title: 'CTO' });
    const withOverdue = scoreLead({
      ...base,
      title: 'CTO',
      tasks: [
        { status: 'pending', dueDate: new Date(Date.now() - 5 * 86400000).toISOString() },
        { status: 'pending', dueDate: new Date(Date.now() - 2 * 86400000).toISOString() },
      ],
    });
    expect(withOverdue.score).toBe(Math.max(0, without.score - 8));
  });

  it('always returns a label matching the Priority enum', () => {
    const result = scoreLead(base);
    expect(['hot', 'warm', 'cold']).toContain(result.label);
  });
});

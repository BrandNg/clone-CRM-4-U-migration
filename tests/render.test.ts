import { describe, it, expect } from 'vitest';
import { renderTemplate } from '@/lib/templates/render';

const lead = {
  firstName: 'Anh',
  lastName: 'Tran',
  company: 'VinaTech',
  title: 'CTO',
  email: 'anh@vinatech.vn',
  phone: '+84 90 123 4567',
};
const sdr = { firstName: 'Son', lastName: 'Nguyen', role: 'director' };

describe('renderTemplate', () => {
  it('substitutes all supported merge fields', () => {
    const out = renderTemplate(
      'Hi {{firstName}} {{lastName}} at {{company}} ({{title}}, {{email}}, {{phone}}) — {{sdrName}}, {{sdrTitle}}',
      lead,
      sdr
    );
    expect(out).toBe(
      'Hi Anh Tran at VinaTech (CTO, anh@vinatech.vn, +84 90 123 4567) — Son Nguyen, Director'
    );
  });

  it('renders missing values as empty string, never "undefined"', () => {
    const out = renderTemplate('Hi {{firstName}}, title: {{title}}.', { firstName: 'Anh', title: null });
    expect(out).toBe('Hi Anh, title: .');
    expect(out).not.toContain('undefined');
  });

  it('uses fallback syntax when the value is missing', () => {
    expect(renderTemplate('Hi {{firstName|there}}!', {})).toBe('Hi there!');
    expect(renderTemplate('Hi {{firstName|there}}!', { firstName: 'Anh' })).toBe('Hi Anh!');
  });

  it('leaves unknown fields visible so typos get noticed', () => {
    expect(renderTemplate('{{notAField}}', lead)).toBe('{{notAField}}');
  });

  it('tolerates whitespace inside braces', () => {
    expect(renderTemplate('{{ firstName }}', lead)).toBe('Anh');
  });
});

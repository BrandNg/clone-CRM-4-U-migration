import { describe, it, expect } from 'vitest';
import { computeVisibleUserIds, type OrgUser } from '@/lib/podScoping';

// director → fm1 → tl1 → sdr1, sdr2
//                → tl2 → sdr3
//          → fm2 → tl3 → sdr4
const org: OrgUser[] = [
  { id: 'director', role: 'director', managerId: null },
  { id: 'fm1', role: 'floor_manager', managerId: 'director' },
  { id: 'fm2', role: 'floor_manager', managerId: 'director' },
  { id: 'tl1', role: 'team_lead', managerId: 'fm1' },
  { id: 'tl2', role: 'team_lead', managerId: 'fm1' },
  { id: 'tl3', role: 'team_lead', managerId: 'fm2' },
  { id: 'sdr1', role: 'sdr', managerId: 'tl1' },
  { id: 'sdr2', role: 'sdr', managerId: 'tl1' },
  { id: 'sdr3', role: 'sdr', managerId: 'tl2' },
  { id: 'sdr4', role: 'sdr', managerId: 'tl3' },
];

describe('computeVisibleUserIds', () => {
  it('director sees everyone (null = unrestricted)', () => {
    expect(computeVisibleUserIds(org, { id: 'director', role: 'director' })).toBeNull();
  });

  it('floor manager sees their whole floor, not the other floor', () => {
    const ids = computeVisibleUserIds(org, { id: 'fm1', role: 'floor_manager' })!;
    expect(ids.sort()).toEqual(['fm1', 'sdr1', 'sdr2', 'sdr3', 'tl1', 'tl2']);
    expect(ids).not.toContain('sdr4');
    expect(ids).not.toContain('fm2');
  });

  it('team lead sees only their pod + self', () => {
    const ids = computeVisibleUserIds(org, { id: 'tl1', role: 'team_lead' })!;
    expect(ids.sort()).toEqual(['sdr1', 'sdr2', 'tl1']);
  });

  it('SDR sees only themself', () => {
    expect(computeVisibleUserIds(org, { id: 'sdr1', role: 'sdr' })).toEqual(['sdr1']);
  });

  it('survives a managerId cycle without infinite looping', () => {
    const cyclic: OrgUser[] = [
      { id: 'a', role: 'team_lead', managerId: 'b' },
      { id: 'b', role: 'team_lead', managerId: 'a' },
    ];
    const ids = computeVisibleUserIds(cyclic, { id: 'a', role: 'team_lead' })!;
    expect(ids.sort()).toEqual(['a', 'b']);
  });
});

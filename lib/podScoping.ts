/**
 * Pure pod-scoping core (SKILL.md §17), unit-testable without a DB or auth.
 * Returns the user IDs whose data the viewer may see, or `null` for
 * unrestricted (director). Walks the `managerId` chain:
 *   director → everyone · floor_manager → their TLs + those TLs' reports
 *   team_lead/leadgen → direct reports + self · sdr → self only
 */

export type OrgUser = { id: string; role: string; managerId: string | null };

export function computeVisibleUserIds(
  allUsers: OrgUser[],
  viewer: Pick<OrgUser, 'id' | 'role'>
): string[] | null {
  if (viewer.role === 'director') return null;
  if (viewer.role === 'sdr') return [viewer.id];

  // BFS down the managerId tree from the viewer
  const visible = new Set<string>([viewer.id]);
  let frontier = [viewer.id];
  while (frontier.length > 0) {
    const next = allUsers
      .filter((u) => u.managerId !== null && frontier.includes(u.managerId) && !visible.has(u.id))
      .map((u) => u.id);
    next.forEach((uid) => visible.add(uid));
    frontier = next;
  }
  return [...visible];
}

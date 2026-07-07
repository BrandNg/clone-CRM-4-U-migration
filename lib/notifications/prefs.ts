// Shared notification-preference model used by the Settings page (writes the toggles) and the
// Topbar bell (reads them to filter muted events). Prefs are per-browser, stored in localStorage.

export const NOTIF_PREFS_KEY = 'crm:notifPrefs';
/** Window event dispatched when prefs change so an open bell can re-filter live. */
export const NOTIF_PREFS_EVENT = 'crm:notif-prefs-updated';

export interface NotifEvent {
  key: string;
  label: string;
  /** Always-on events cannot be muted (critical alerts). */
  always: boolean;
}

/** User-facing toggle list (Settings → Notification Preferences). */
export const NOTIF_EVENTS: NotifEvent[] = [
  { key: 'task_overdue', label: 'Task Overdue', always: false },
  { key: 'reminder_due', label: 'Reminder Due', always: true },
  { key: 'sequence_step_due', label: 'Sequence Step Due Today', always: false },
  { key: 'sequence_completed', label: 'Sequence Completed', always: false },
  { key: 'lead_stage_changed', label: 'Lead Stage Changed (by others)', always: false },
  { key: 'lead_reply', label: 'Lead Replied', always: false },
  { key: 'lead_reassigned', label: 'Lead Reassigned to Me', always: true },
  { key: 'meeting_booked', label: 'Meeting Booked', always: false },
  { key: 'sdr_overdue_alert', label: 'SDR Overdue Alert (managers)', always: false },
];

const ALWAYS_ON = new Set(NOTIF_EVENTS.filter((e) => e.always).map((e) => e.key));
const VALID_KEYS = new Set(NOTIF_EVENTS.map((e) => e.key));

/**
 * Map a server-side notification `type` to its preference key. The server emits a few `type`
 * values that don't match the toggle keys 1:1 (e.g. `overdue_tasks`/`task_overdue`, `stage_changed`),
 * so normalize them here. Unknown types return `null` → never muted (fail open).
 */
export function typeToPrefKey(type: string): string | null {
  switch (type) {
    case 'overdue_tasks':
    case 'task_overdue':
      return 'task_overdue';
    case 'reminder_due':
      return 'reminder_due';
    case 'sequence_step_due':
      return 'sequence_step_due';
    case 'sequence_completed':
      return 'sequence_completed';
    case 'stage_changed':
    case 'lead_stage_changed':
      return 'lead_stage_changed';
    case 'lead_reply':
      return 'lead_reply';
    case 'lead_reassigned':
    case 'lead_assigned':
      return 'lead_reassigned';
    case 'meeting_booked':
      return 'meeting_booked';
    case 'sdr_overdue_alert':
      return 'sdr_overdue_alert';
    default:
      return null;
  }
}

/** Read the saved prefs from localStorage. Safe on the server (returns {}). */
export function readNotifPrefs(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(NOTIF_PREFS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

/** A pref is enabled unless explicitly set to `false`. */
export function isPrefEnabled(prefs: Record<string, boolean>, key: string): boolean {
  return prefs[key] !== false;
}

/**
 * Should a notification of this `type` be hidden from the bell? Always-on events and unknown
 * types are never muted; everything else is muted when its pref is explicitly disabled.
 */
export function isMuted(type: string, prefs: Record<string, boolean>): boolean {
  const key = typeToPrefKey(type);
  if (!key || !VALID_KEYS.has(key) || ALWAYS_ON.has(key)) return false;
  return prefs[key] === false;
}

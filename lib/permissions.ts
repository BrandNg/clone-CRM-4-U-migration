import type { UserRole } from '@/context/AppContext';

/**
 * Client-side mirror of `canImportExport` in lib/auth.ts — for UI gating only.
 * The server still enforces this; never rely on the client check for security.
 * SDR + Team Lead are intentionally excluded from import/export.
 */
export function canImportExport(role: UserRole): boolean {
  return role === 'director' || role === 'floor_manager' || role === 'leadgen';
}

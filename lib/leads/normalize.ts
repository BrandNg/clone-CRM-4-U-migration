export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  return email.toLowerCase().trim();
}

export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  return phone.replace(/\D/g, '');
}

export function normalizeLinkedIn(linkedIn: string | null | undefined): string | null {
  if (!linkedIn) return null;
  return linkedIn.toLowerCase().trim();
}

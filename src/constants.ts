export const LIFF_ID = '2009693707-DihGx8m5';
export const LIFF_URL = `https://liff.line.me/${LIFF_ID}`;

/** Generate a random 6-char alphanumeric join code */
export function generateJoinCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export const COUPON_TYPES = [
  { label: '100點', value: '100pt' },
  { label: '50點', value: '50pt' },
  { label: '20點', value: '20pt' },
] as const;

export const ROLES = [
  { label: '管理員', value: 'admin' },
  { label: '店家', value: 'store' },
  { label: '一般用戶', value: 'user' },
] as const;

/**
 * Returns ISO 8601 week key, e.g. "2025-W03"
 * Week starts on Monday; Week 1 = first week with Thursday.
 */
export function getISOWeekKey(date: Date = new Date()): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // Thursday in current week decides the year
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum =
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 -
        3 +
        ((week1.getDay() + 6) % 7)) /
        7
    );
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/** Unique Firestore document ID for a user's weekly draw at a store */
export function weeklyDrawDocId(userId: string, storeId: string, week: string) {
  return `${userId}_${storeId}_${week}`;
}

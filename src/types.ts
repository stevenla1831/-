export type UserRole = 'admin' | 'store' | 'user';

export interface UserProfile {
  uid: string;
  displayName: string;
  photoURL: string;
  phoneNumber?: string;
  role: UserRole;
  assignedStores?: string[]; // For store owners
  unlockedStores?: string[]; // legacy — no longer used
  createdAt: number;
}

export interface Store {
  id: string;
  name: string;
  description: string;
  isActive: boolean; // false = lottery paused for this store
  joinCode?: string; // legacy — no longer used
  createdAt: number;
}

export type CouponType = '100pt' | '50pt' | '20pt';
export type CouponStatus = 'available' | 'assigned' | 'used'; // 'used' kept for legacy data

export interface Coupon {
  id: string;
  storeId: string;
  batchId?: string;    // links to CouponBatch (new coupons only)
  type: CouponType;
  code: string;
  status: CouponStatus;
  userId?: string;
  assignedAt?: number;
  usedAt?: number;     // legacy
  // Optional fields from CSV import
  eventName?: string;
  validFrom?: number;
  validTo?: number;
  minAmount?: number;
  maxUses?: number;
}

// ── Draw Rule ────────────────────────────────────────────────
export type DrawRuleType = 'countdown' | 'cycle' | 'milestone';

export interface DrawRule {
  type: DrawRuleType;
  // countdown: store triggers a limited-time draw window
  countdownSeconds?: number;     // window duration in seconds
  // cycle: users can draw every N days
  intervalDays?: number;
  cycleLimitCount?: number;      // max total draws (undefined = unlimited)
  cycleEndDate?: number;         // end date timestamp
  // milestone: earn bonus draws after N successful draws
  milestoneTrigger?: number;
  milestoneBonusDraws?: number;
}

export interface CouponBatch {
  id: string;
  storeId: string;
  name: string;
  couponType: CouponType;
  drawRule: DrawRule;
  countdownStartedAt?: number;   // for countdown batches: when admin triggered it
  createdAt: number;
}

// ── Draw Records ─────────────────────────────────────────────
export interface DrawRecord {
  id: string;
  userId: string;
  storeId: string;
  couponId: string;
  week: string; // ISO week key e.g. "2025-W01"
  timestamp: number;
  source: 'draw' | 'gift';
}

export interface WeeklyDraw {
  userId: string;
  storeId: string;
  week: string;
  couponId: string;
  drawnAt: number;
}

export interface Announcement {
  id: string;          // Firestore doc ID
  message: string;     // Markdown-safe plain text
  active: boolean;     // show on DrawPage when true
  createdAt: number;
  updatedAt: number;
  storeIds?: string[] | 'all'; // undefined or 'all' = show to all stores
  imageUrl?: string;   // Firebase Storage URL for banner image/GIF
}

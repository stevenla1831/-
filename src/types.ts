export type UserRole = 'admin' | 'store' | 'user';

export interface UserProfile {
  uid: string;
  displayName: string;
  photoURL: string;
  phoneNumber?: string;
  role: UserRole;
  assignedStores?: string[]; // For store owners
  createdAt: number;
}

export interface Store {
  id: string;
  name: string;
  description: string;
  isActive: boolean; // false = lottery paused for this store
  createdAt: number;
}

export type CouponType = '100pt' | '50pt' | '20pt';
export type CouponStatus = 'available' | 'assigned' | 'used';

export interface Coupon {
  id: string;
  storeId: string;
  type: CouponType;
  code: string;
  status: CouponStatus;
  userId?: string;
  assignedAt?: number; // when drawn/gifted
  usedAt?: number;     // when marked used by store
}

export interface DrawRecord {
  id: string;
  userId: string;
  storeId: string;
  couponId: string;
  week: string; // ISO week key e.g. "2025-W01"
  timestamp: number;
  source: 'draw' | 'gift'; // how coupon was obtained
}

export interface WeeklyDraw {
  userId: string;
  storeId: string;
  week: string;
  couponId: string;
  drawnAt: number;
}

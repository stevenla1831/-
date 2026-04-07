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
  createdAt: number;
}

export type CouponType = '100pt' | '50pt' | '20pt';

export interface Coupon {
  id: string;
  storeId: string;
  type: CouponType;
  code: string;
  status: 'available' | 'used';
  userId?: string;
  drawnAt?: number;
}

export interface DrawRecord {
  id: string;
  userId: string;
  storeId: string;
  couponId: string;
  timestamp: number;
}

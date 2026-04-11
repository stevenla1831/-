import React, { useState, useEffect, useCallback } from 'react';
import {
  collection, query, where, getDocs, addDoc, doc, updateDoc, orderBy, limit, setDoc, getDoc,
} from 'firebase/firestore';
import {
  Package, Gift, BarChart2, Plus, ChevronRight, Search, CheckCircle2,
  AlertCircle, Loader2, ArrowLeft, X, Users,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Store, Coupon, CouponBatch, CouponType, DrawRule, DrawRuleType, UserProfile, DrawRecord } from '../types';
import { COUPON_TYPES, getISOWeekKey } from '../constants';

type StoreView = 'menu' | 'inventory' | 'gift' | 'stats' | 'addbatch';

interface StorePanelProps {
  store: Store;
  onBack: () => void;
  currentUserUid: string;
}

/* ─── Gift Coupon Modal (gift a specific coupon to a user) ─────── */
const GiftCouponModal: React.FC<{
  coupon: Coupon;
  store: Store;
  onClose: () => void;
  onSuccess: (couponId: string) => void;
}> = ({ coupon, store, onClose, onSuccess }) => {
  const [search, setSearch] = useState('');
  const [foundUsers, setFoundUsers] = useState<UserProfile[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [gifting, setGifting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!search.trim()) return;
    setFoundUsers([]); setSelectedUser(null); setError(null);
    try {
      const [nameSnap, phoneSnap] = await Promise.all([
        getDocs(query(collection(db, 'users'), where('displayName', '==', search.trim()), limit(5))),
        getDocs(query(collection(db, 'users'), where('phoneNumber', '==', search.trim()), limit(5))),
      ]);
      const seen = new Set<string>();
      const users: UserProfile[] = [];
      [...nameSnap.docs, ...phoneSnap.docs].forEach(d => {
        if (!seen.has(d.id)) { seen.add(d.id); users.push(d.data() as UserProfile); }
      });
      if (users.length === 0) setError('找不到該用戶');
      else setFoundUsers(users);
    } catch { setError('搜尋失敗，請稍後再試'); }
  };

  const handleGift = async () => {
    if (!selectedUser) return;
    setGifting(true); setError(null);
    try {
      const now = Date.now();
      await updateDoc(doc(db, 'coupons', coupon.id), { status: 'assigned', userId: selectedUser.uid, assignedAt: now });
      await addDoc(collection(db, 'drawRecords'), {
        id: crypto.randomUUID(), userId: selectedUser.uid, storeId: store.id,
        couponId: coupon.id, week: getISOWeekKey(), timestamp: now, source: 'gift',
      });
      onSuccess(coupon.id);
    } catch { setError('贈送失敗，請稍後再試'); } finally { setGifting(false); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center p-4"
      onClick={onClose}>
      <motion.div initial={{ y: 80 }} animate={{ y: 0 }}
        className="bg-white rounded-3xl p-6 w-full max-w-sm space-y-4 shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start">
          <div>
            <p className="font-bold text-gray-900">贈送優惠碼</p>
            <p className="text-xs font-mono text-gray-400 mt-0.5">{coupon.code}</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="flex gap-2">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="搜尋 LINE 名稱 / 手機號碼"
            className="flex-1 p-3 rounded-xl border border-gray-200 outline-none text-sm focus:ring-2 focus:ring-[#27ae60]" />
          <button onClick={handleSearch} className="bg-[#27ae60] text-white p-3 rounded-xl">
            <Search className="w-4 h-4" />
          </button>
        </div>
        {error && <p className="text-red-500 text-xs flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" />{error}</p>}
        {foundUsers.map(u => (
          <button key={u.uid} onClick={() => setSelectedUser(u)}
            className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
              selectedUser?.uid === u.uid ? 'border-[#27ae60] bg-[#f0fff4]' : 'border-gray-100 hover:border-gray-200'
            }`}>
            <img src={u.photoURL || ''} alt="" className="w-8 h-8 rounded-full shrink-0" />
            <div className="text-left flex-1 min-w-0">
              <p className="font-bold text-sm truncate">{u.displayName}</p>
              <p className="text-[10px] text-gray-400">{u.phoneNumber || u.uid.slice(0, 12)}</p>
            </div>
            {selectedUser?.uid === u.uid && <CheckCircle2 className="w-4 h-4 text-[#27ae60] shrink-0" />}
          </button>
        ))}
        {selectedUser && (
          <button onClick={handleGift} disabled={gifting}
            className="w-full bg-[#27ae60] text-white py-3 rounded-2xl font-bold disabled:opacity-50 flex items-center justify-center gap-2">
            {gifting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />}
            確認贈送給 {selectedUser.displayName}
          </button>
        )}
      </motion.div>
    </motion.div>
  );
};

/* ─── Inventory (batch-based) ───────────────────────────────── */
const InventoryPanel: React.FC<{ store: Store; currentUserUid: string }> = ({ store, currentUserUid }) => {
  const [batches, setBatches] = useState<CouponBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBatch, setSelectedBatch] = useState<CouponBatch | null>(null);
  const [batchCoupons, setBatchCoupons] = useState<Coupon[]>([]);
  const [loadingCoupons, setLoadingCoupons] = useState(false);
  const [giftCoupon, setGiftCoupon] = useState<Coupon | null>(null);
  const [startingCountdown, setStartingCountdown] = useState(false);

  const loadBatches = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'couponBatches'), where('storeId', '==', store.id)));
      const list = snap.docs.map(d => ({ ...d.data(), id: d.id } as CouponBatch));
      list.sort((a, b) => b.createdAt - a.createdAt);
      setBatches(list);
    } catch (err) { handleFirestoreError(err, OperationType.LIST, 'couponBatches'); }
    finally { setLoading(false); }
  }, [store.id]);

  useEffect(() => { loadBatches(); }, [loadBatches]);

  const openBatch = async (batch: CouponBatch) => {
    setSelectedBatch(batch);
    setBatchCoupons([]);
    setLoadingCoupons(true);
    try {
      const snap = await getDocs(query(collection(db, 'coupons'), where('batchId', '==', batch.id)));
      const list = snap.docs.map(d => ({ ...d.data(), id: d.id } as Coupon));
      list.sort((a, b) => (a.status === 'available' ? -1 : 1) - (b.status === 'available' ? -1 : 1));
      setBatchCoupons(list);
    } catch { setBatchCoupons([]); }
    finally { setLoadingCoupons(false); }
  };

  const handleStartCountdown = async () => {
    if (!selectedBatch) return;
    setStartingCountdown(true);
    try {
      const now = Date.now();
      await updateDoc(doc(db, 'couponBatches', selectedBatch.id), { countdownStartedAt: now });
      const updated = { ...selectedBatch, countdownStartedAt: now };
      setSelectedBatch(updated);
      setBatches(prev => prev.map(b => b.id === updated.id ? updated : b));
    } catch (err) { handleFirestoreError(err, OperationType.UPDATE, `couponBatches/${selectedBatch.id}`); }
    finally { setStartingCountdown(false); }
  };

  const drawRuleLabel = (batch: CouponBatch) => {
    const r = batch.drawRule;
    if (r.type === 'countdown') {
      const secs = r.countdownSeconds ?? 0;
      const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
      return `倒數計時 ${h > 0 ? h + '小時' : ''}${m > 0 ? m + '分' : ''}`;
    }
    if (r.type === 'cycle') {
      let s = `每${r.intervalDays ?? 7}天抽一次`;
      if (r.cycleLimitCount) s += `・最多${r.cycleLimitCount}次`;
      if (r.cycleEndDate) s += `・至${new Date(r.cycleEndDate).toLocaleDateString()}`;
      return `循環式・${s}`;
    }
    return `里程碑・抽${r.milestoneTrigger ?? 0}次送${r.milestoneBonusDraws ?? 0}次`;
  };

  const countdownInfo = (batch: CouponBatch) => {
    if (batch.drawRule.type !== 'countdown') return null;
    const start = batch.countdownStartedAt;
    const dur = (batch.drawRule.countdownSeconds ?? 0) * 1000;
    if (!start) return { active: false, label: '尚未啟動' };
    const rem = start + dur - Date.now();
    if (rem <= 0) return { active: false, label: '已結束' };
    const m = Math.floor(rem / 60000), s = Math.floor((rem % 60000) / 1000);
    return { active: true, label: `進行中・剩 ${m}分${s}秒` };
  };

  const ruleBadgeColor = (type: DrawRuleType) =>
    type === 'countdown' ? 'bg-orange-50 text-orange-600' :
    type === 'cycle' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600';

  /* ── Batch Detail View ── */
  if (selectedBatch) {
    const available = batchCoupons.filter(c => c.status === 'available');
    const issued = batchCoupons.filter(c => c.status !== 'available');
    const cInfo = countdownInfo(selectedBatch);

    return (
      <div className="p-6 space-y-5">
        <div className="bg-[#f0fff4] border border-green-100 rounded-2xl p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-bold text-gray-900">{selectedBatch.name}</p>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ruleBadgeColor(selectedBatch.drawRule.type)}`}>
                {drawRuleLabel(selectedBatch)}
              </span>
            </div>
            <button onClick={() => { setSelectedBatch(null); setBatchCoupons([]); }}
              className="text-xs border border-gray-200 px-2.5 py-1 rounded-lg text-gray-500 hover:bg-gray-50">返回</button>
          </div>
          {selectedBatch.drawRule.type === 'countdown' && (
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${cInfo?.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {cInfo?.label ?? '—'}
              </span>
              {!cInfo?.active && (
                <button onClick={handleStartCountdown} disabled={startingCountdown}
                  className="text-xs bg-orange-500 text-white px-3 py-1 rounded-lg font-bold disabled:opacity-50">
                  {startingCountdown ? '啟動中...' : '啟動倒數'}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-green-50 border border-green-100 rounded-2xl p-4 text-center">
            <p className="text-3xl font-black text-[#27ae60]">{available.length}</p>
            <p className="text-xs font-bold text-green-700 mt-1">庫存</p>
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-center">
            <p className="text-3xl font-black text-blue-600">{issued.length}</p>
            <p className="text-xs font-bold text-blue-600 mt-1">已發放</p>
          </div>
        </div>

        {loadingCoupons
          ? <div className="py-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-300" /></div>
          : (
            <div className="space-y-4">
              {available.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">庫存（點擊贈送）</p>
                  <div className="space-y-2">
                    {available.map(c => (
                      <div key={c.id} className="bg-white p-4 rounded-xl border border-gray-100 flex justify-between items-center">
                        <div>
                          <p className="font-mono font-bold text-gray-900">{c.code}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">{COUPON_TYPES.find(t => t.value === c.type)?.label}</p>
                        </div>
                        <button onClick={() => setGiftCoupon(c)}
                          className="bg-purple-500 text-white text-xs font-bold px-3 py-1.5 rounded-xl hover:bg-purple-600 transition-colors">
                          贈送
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {issued.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">已發放</p>
                  <div className="space-y-2">
                    {issued.map(c => (
                      <div key={c.id} className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex justify-between items-center">
                        <div>
                          <p className="font-mono font-bold text-gray-600">{c.code}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {COUPON_TYPES.find(t => t.value === c.type)?.label}
                            {c.assignedAt ? ` · 發放於 ${new Date(c.assignedAt).toLocaleDateString()}` : ''}
                          </p>
                        </div>
                        <span className="text-[10px] bg-blue-100 text-blue-500 font-bold px-2 py-1 rounded-full shrink-0">已發放</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {batchCoupons.length === 0 && <p className="text-center text-gray-300 py-8 text-sm">此批次尚無優惠碼</p>}
            </div>
          )}

        {giftCoupon && (
          <GiftCouponModal
            coupon={giftCoupon}
            store={store}
            onClose={() => setGiftCoupon(null)}
            onSuccess={couponId => {
              setBatchCoupons(prev => prev.map(c => c.id === couponId ? { ...c, status: 'assigned', assignedAt: Date.now() } : c));
              setGiftCoupon(null);
            }}
          />
        )}
      </div>
    );
  }

  /* ── Batch List View ── */
  if (loading) return <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-300" /></div>;

  return (
    <div className="p-6 space-y-4">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">優惠券批次</p>
      {batches.length === 0 && (
        <div className="text-center py-10">
          <Package className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-sm font-bold text-gray-400">尚無優惠券批次</p>
          <p className="text-xs text-gray-300 mt-1">請至「新增優惠券批次」建立</p>
        </div>
      )}
      {batches.map(batch => (
        <button key={batch.id} onClick={() => openBatch(batch)}
          className="w-full bg-white p-4 rounded-xl border border-gray-100 shadow-sm text-left hover:border-[#27ae60]/40 transition-colors">
          <div className="flex justify-between items-center mb-1.5">
            <p className="font-bold text-gray-900">{batch.name}</p>
            <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ruleBadgeColor(batch.drawRule.type)}`}>
              {drawRuleLabel(batch)}
            </span>
            <span className="text-[10px] text-gray-400">{new Date(batch.createdAt).toLocaleDateString()}</span>
          </div>
        </button>
      ))}
    </div>
  );
};

/* ─── Gift Coupon ────────────────────────────────────────────── */
const GiftPanel: React.FC<{ store: Store; currentUserUid: string }> = ({ store, currentUserUid }) => {
  const [search, setSearch] = useState('');
  const [foundUsers, setFoundUsers] = useState<UserProfile[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [couponType, setCouponType] = useState<string>('100pt');
  const [gifting, setGifting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!search.trim()) return;
    setFoundUsers([]);
    setSelectedUser(null);
    try {
      const byName = query(collection(db, 'users'), where('displayName', '==', search.trim()), limit(5));
      const byPhone = query(collection(db, 'users'), where('phoneNumber', '==', search.trim()), limit(5));
      const [nameSnap, phoneSnap] = await Promise.all([getDocs(byName), getDocs(byPhone)]);
      const seen = new Set<string>();
      const users: UserProfile[] = [];
      [...nameSnap.docs, ...phoneSnap.docs].forEach(d => {
        if (!seen.has(d.id)) { seen.add(d.id); users.push(d.data() as UserProfile); }
      });
      if (users.length === 0) setError('找不到該用戶');
      else { setFoundUsers(users); setError(null); }
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'users');
    }
  };

  const handleGift = async () => {
    if (!selectedUser) return;
    setGifting(true);
    setError(null);
    try {
      // Find available coupon of selected type
      const q = query(
        collection(db, 'coupons'),
        where('storeId', '==', store.id),
        where('status', '==', 'available'),
        where('type', '==', couponType),
        limit(1)
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        setError(`${COUPON_TYPES.find(t => t.value === couponType)?.label} 庫存已空`);
        setGifting(false);
        return;
      }
      const couponDoc = snap.docs[0];
      const now = Date.now();
      await updateDoc(doc(db, 'coupons', couponDoc.id), {
        status: 'assigned',
        userId: selectedUser.uid,
        assignedAt: now,
      });
      // Create draw record for gift
      await addDoc(collection(db, 'drawRecords'), {
        id: crypto.randomUUID(),
        userId: selectedUser.uid,
        storeId: store.id,
        couponId: couponDoc.id,
        week: getISOWeekKey(),
        timestamp: now,
        source: 'gift',
      } satisfies DrawRecord);
      setSuccess(true);
      setSelectedUser(null);
      setSearch('');
      setFoundUsers([]);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'gift-coupon');
      setError('贈送失敗，請稍後再試');
    } finally {
      setGifting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {success && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
          <p className="text-sm font-bold text-green-700">優惠碼已成功贈送！</p>
          <button onClick={() => setSuccess(false)} className="ml-auto text-green-500 text-xs">關閉</button>
        </motion.div>
      )}

      {/* Search */}
      <div>
        <label className="block text-sm font-bold text-gray-700 mb-2">搜尋用戶（LINE 名稱 / 手機號碼）</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="輸入名稱或手機..."
            className="flex-1 p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#27ae60] outline-none text-sm"
          />
          <button onClick={handleSearch} className="bg-[#27ae60] text-white p-3 rounded-xl">
            <Search className="w-5 h-5" />
          </button>
        </div>
      </div>

      {error && (
        <p className="text-red-500 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />{error}
        </p>
      )}

      {/* User results */}
      {foundUsers.map(u => (
        <button
          key={u.uid}
          onClick={() => setSelectedUser(u)}
          className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
            selectedUser?.uid === u.uid ? 'border-[#27ae60] bg-[#f0fff4]' : 'border-gray-100 hover:border-gray-200'
          }`}
        >
          <img src={u.photoURL || '/placeholder.png'} alt="" className="w-10 h-10 rounded-full" />
          <div className="text-left">
            <p className="font-bold text-gray-900 text-sm">{u.displayName}</p>
            <p className="text-[10px] text-gray-400">{u.phoneNumber || u.uid.slice(0, 12) + '...'}</p>
          </div>
          {selectedUser?.uid === u.uid && <CheckCircle2 className="w-5 h-5 text-[#27ae60] ml-auto" />}
        </button>
      ))}

      {/* Gift form */}
      {selectedUser && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4 shadow-sm">
          <p className="font-bold text-gray-900">贈送給：{selectedUser.displayName}</p>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2">選擇優惠券類型</label>
            <div className="flex gap-2">
              {COUPON_TYPES.map(t => (
                <button key={t.value} onClick={() => setCouponType(t.value)}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold border-2 transition-all ${
                    couponType === t.value ? 'border-[#27ae60] bg-[#f0fff4] text-[#27ae60]' : 'border-gray-100 text-gray-400'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={handleGift}
            disabled={gifting}
            className="w-full bg-[#27ae60] text-white py-3 rounded-2xl font-bold shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {gifting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Gift className="w-5 h-5" />}
            {gifting ? '贈送中...' : '確認贈送'}
          </button>
        </motion.div>
      )}
    </div>
  );
};

/* ─── Stats ──────────────────────────────────────────────────── */
const StatsPanel: React.FC<{ store: Store }> = ({ store }) => {
  const [records, setRecords] = useState<DrawRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRecords = async () => {
      try {
        const q = query(
          collection(db, 'drawRecords'),
          where('storeId', '==', store.id),
          orderBy('timestamp', 'desc'),
          limit(50)
        );
        const snap = await getDocs(q);
        setRecords(snap.docs.map(d => d.data() as DrawRecord));
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'drawRecords');
      } finally {
        setLoading(false);
      }
    };
    fetchRecords();
  }, [store.id]);

  const thisWeek = getISOWeekKey();
  const thisWeekCount = records.filter(r => r.week === thisWeek).length;

  if (loading) return <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-300" /></div>;

  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#f0fff4] border border-green-100 rounded-2xl p-4 text-center">
          <p className="text-3xl font-black text-[#27ae60]">{thisWeekCount}</p>
          <p className="text-xs font-bold text-green-700 mt-1">本週抽獎次數</p>
        </div>
        <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 text-center">
          <p className="text-3xl font-black text-gray-700">{records.length}</p>
          <p className="text-xs font-bold text-gray-500 mt-1">歷史總計</p>
        </div>
      </div>

      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">最近抽獎紀錄</p>
        <div className="space-y-2">
          {records.slice(0, 20).map((r, i) => (
            <div key={i} className="bg-white p-3 rounded-xl border border-gray-100 flex justify-between items-center">
              <div>
                <p className="text-xs font-bold text-gray-700">{r.userId.slice(0, 16)}...</p>
                <p className="text-[10px] text-gray-400">{new Date(r.timestamp).toLocaleString()}</p>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                r.source === 'gift' ? 'bg-purple-50 text-purple-500' : 'bg-green-50 text-green-500'
              }`}>
                {r.source === 'gift' ? '贈送' : '抽獎'}
              </span>
            </div>
          ))}
          {records.length === 0 && <p className="text-center text-gray-300 py-8 text-sm">尚無抽獎紀錄</p>}
        </div>
      </div>
    </div>
  );
};

/* ─── Add Batch Panel ────────────────────────────────────────── */
const AddBatchPanel: React.FC<{ store: Store; onDone: () => void }> = ({ store, onDone }) => {
  const [batchName, setBatchName] = useState('');
  const [couponType, setCouponType] = useState<CouponType>('100pt');
  const [ruleType, setRuleType] = useState<DrawRuleType>('cycle');
  const [codesText, setCodesText] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: number; dupes: number } | null>(null);

  // Countdown params
  const [cHours, setCHours] = useState(1);
  const [cMins, setCMins] = useState(0);
  // Cycle params
  const [intervalDays, setIntervalDays] = useState(7);
  const [cycleLimitType, setCycleLimitType] = useState<'none' | 'count' | 'date'>('none');
  const [cycleLimitCount, setCycleLimitCount] = useState(10);
  const [cycleEndDateStr, setCycleEndDateStr] = useState('');
  // Milestone params
  const [mTrigger, setMTrigger] = useState(5);
  const [mBonus, setMBonus] = useState(1);

  const buildRule = (): DrawRule => {
    if (ruleType === 'countdown') return { type: 'countdown', countdownSeconds: cHours * 3600 + cMins * 60 };
    if (ruleType === 'cycle') return {
      type: 'cycle', intervalDays,
      cycleLimitCount: cycleLimitType === 'count' ? cycleLimitCount : undefined,
      cycleEndDate: cycleLimitType === 'date' && cycleEndDateStr ? new Date(cycleEndDateStr).getTime() : undefined,
    };
    return { type: 'milestone', milestoneTrigger: mTrigger, milestoneBonusDraws: mBonus };
  };

  const handleCreate = async () => {
    if (!batchName.trim()) { alert('請填入批次名稱'); return; }
    const codes = codesText.split('\n').map(c => c.trim()).filter(Boolean);
    if (codes.length === 0) { alert('請輸入至少一組優惠碼'); return; }
    setImporting(true); setResult(null);
    try {
      const batchId = crypto.randomUUID();
      const batch: CouponBatch = { id: batchId, storeId: store.id, name: batchName.trim(), couponType, drawRule: buildRule(), createdAt: Date.now() };
      await setDoc(doc(db, 'couponBatches', batchId), batch);
      const existingSnap = await getDocs(query(collection(db, 'coupons'), where('storeId', '==', store.id)));
      const existingCodes = new Set(existingSnap.docs.map(d => d.data().code));
      let success = 0, dupes = 0;
      for (const code of codes) {
        if (existingCodes.has(code)) { dupes++; continue; }
        await addDoc(collection(db, 'coupons'), { id: crypto.randomUUID(), storeId: store.id, batchId, type: couponType, code, status: 'available' });
        success++;
      }
      setResult({ success, dupes });
      setBatchName(''); setCodesText('');
    } catch (err) { handleFirestoreError(err, OperationType.CREATE, 'couponBatches'); }
    finally { setImporting(false); }
  };

  const RULE_OPTIONS = [
    { id: 'countdown' as DrawRuleType, label: '倒數計時', desc: '商家手動啟動後，限時窗口內才可抽獎' },
    { id: 'cycle' as DrawRuleType, label: '循環式', desc: '每隔 N 天可抽一次，可設上限或截止日' },
    { id: 'milestone' as DrawRuleType, label: '抽獎里程', desc: '累積抽 N 次後，獲得額外抽獎機會' },
  ];

  return (
    <div className="p-6 space-y-5">
      {result && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-green-50 border border-green-100 rounded-2xl p-4 flex items-center justify-between">
          <p className="text-sm font-bold text-green-700">
            批次建立完成！成功新增 {result.success} 組{result.dupes > 0 ? `，略過 ${result.dupes} 重複` : ''}
          </p>
          <button onClick={onDone} className="text-xs text-[#27ae60] font-bold underline ml-2 shrink-0">查看庫存</button>
        </motion.div>
      )}

      <div>
        <label className="block text-sm font-bold text-gray-700 mb-2">批次名稱 *</label>
        <input type="text" value={batchName} onChange={e => setBatchName(e.target.value)}
          placeholder="例：4月春季活動、五一連假批次"
          className="w-full p-3 rounded-xl border border-gray-200 outline-none text-sm focus:ring-2 focus:ring-[#27ae60]" />
      </div>

      <div>
        <label className="block text-sm font-bold text-gray-700 mb-2">優惠券類型</label>
        <div className="flex gap-2">
          {COUPON_TYPES.map(t => (
            <button key={t.value} onClick={() => setCouponType(t.value as CouponType)}
              className={`flex-1 py-2 rounded-xl text-sm font-bold border-2 transition-all ${
                couponType === t.value ? 'border-[#27ae60] bg-[#f0fff4] text-[#27ae60]' : 'border-gray-100 text-gray-400'
              }`}>{t.label}</button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-bold text-gray-700 mb-2">發放方式</label>
        <div className="space-y-2">
          {RULE_OPTIONS.map(opt => (
            <button key={opt.id} onClick={() => setRuleType(opt.id)}
              className={`w-full p-3 rounded-xl border-2 text-left transition-all ${
                ruleType === opt.id ? 'border-[#27ae60] bg-[#f0fff4]' : 'border-gray-100 hover:border-gray-200'
              }`}>
              <p className={`font-bold text-sm ${ruleType === opt.id ? 'text-[#27ae60]' : 'text-gray-700'}`}>{opt.label}</p>
              <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {ruleType === 'countdown' && (
        <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 space-y-3">
          <p className="text-sm font-bold text-orange-700">倒數時長設定</p>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <p className="text-xs text-gray-500 mb-1">小時</p>
              <input type="number" min={0} max={23} value={cHours} onChange={e => setCHours(+e.target.value || 0)}
                className="w-full p-2 rounded-xl border border-gray-200 text-sm outline-none text-center font-bold" />
            </div>
            <span className="text-gray-400 font-bold pb-2">:</span>
            <div className="flex-1">
              <p className="text-xs text-gray-500 mb-1">分鐘</p>
              <input type="number" min={0} max={59} value={cMins} onChange={e => setCMins(+e.target.value || 0)}
                className="w-full p-2 rounded-xl border border-gray-200 text-sm outline-none text-center font-bold" />
            </div>
          </div>
          <p className="text-xs text-orange-600">抽獎窗口：共 {cHours * 60 + cMins} 分鐘</p>
        </div>
      )}

      {ruleType === 'cycle' && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 space-y-3">
          <p className="text-sm font-bold text-blue-700">循環設定</p>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">每</span>
            <input type="number" min={1} value={intervalDays} onChange={e => setIntervalDays(+e.target.value || 1)}
              className="w-16 p-2 rounded-xl border border-gray-200 text-sm outline-none text-center font-bold" />
            <span className="text-sm text-gray-600">天可抽一次</span>
          </div>
          <div className="space-y-1.5">
            {([['none','不限次數'],['count','最多幾次'],['date','截止日期']] as const).map(([val, label]) => (
              <button key={val} onClick={() => setCycleLimitType(val)}
                className={`flex items-center gap-2 w-full p-2 rounded-xl transition-all ${cycleLimitType === val ? 'bg-white border border-blue-300' : ''}`}>
                <div className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 ${cycleLimitType === val ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`} />
                <span className={`text-sm font-bold ${cycleLimitType === val ? 'text-blue-700' : 'text-gray-500'}`}>{label}</span>
              </button>
            ))}
          </div>
          {cycleLimitType === 'count' && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">最多</span>
              <input type="number" min={1} value={cycleLimitCount} onChange={e => setCycleLimitCount(+e.target.value || 1)}
                className="w-20 p-2 rounded-xl border border-gray-200 text-sm outline-none text-center font-bold" />
              <span className="text-sm text-gray-600">次</span>
            </div>
          )}
          {cycleLimitType === 'date' && (
            <input type="date" value={cycleEndDateStr} onChange={e => setCycleEndDateStr(e.target.value)}
              className="w-full p-2 rounded-xl border border-gray-200 text-sm outline-none" />
          )}
        </div>
      )}

      {ruleType === 'milestone' && (
        <div className="bg-purple-50 border border-purple-100 rounded-2xl p-4 space-y-3">
          <p className="text-sm font-bold text-purple-700">里程碑設定</p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-600">抽獎滿</span>
            <input type="number" min={1} value={mTrigger} onChange={e => setMTrigger(+e.target.value || 1)}
              className="w-16 p-2 rounded-xl border border-gray-200 text-sm outline-none text-center font-bold" />
            <span className="text-sm text-gray-600">次，送</span>
            <input type="number" min={1} value={mBonus} onChange={e => setMBonus(+e.target.value || 1)}
              className="w-16 p-2 rounded-xl border border-gray-200 text-sm outline-none text-center font-bold" />
            <span className="text-sm text-gray-600">次額外機會</span>
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-bold text-gray-700 mb-2">優惠碼（每行一組）</label>
        <textarea rows={10} value={codesText} onChange={e => setCodesText(e.target.value)}
          placeholder={'ABC123\nDEF456\nGHI789'}
          className="w-full p-3 rounded-xl border border-gray-200 outline-none font-mono text-sm focus:ring-2 focus:ring-[#27ae60]" />
        <p className="text-xs text-gray-400 mt-1">共 {codesText.split('\n').filter(c => c.trim()).length} 組</p>
      </div>

      <button onClick={handleCreate} disabled={importing || !batchName.trim() || !codesText.trim()}
        className="w-full bg-[#27ae60] text-white py-4 rounded-2xl font-bold shadow-md disabled:opacity-50 flex items-center justify-center gap-2">
        {importing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
        {importing ? '建立中...' : '建立批次並匯入'}
      </button>
    </div>
  );
};


/* ─── Store Panel (wrapper with sub-nav) ────────────────────── */
export const StorePanel: React.FC<StorePanelProps> = ({ store, onBack, currentUserUid }) => {
  const [view, setView] = useState<StoreView>('menu');

  const menuItems = [
    { id: 'inventory' as StoreView, label: '優惠券庫存管理', icon: Package, color: 'text-blue-500' },
    { id: 'gift' as StoreView, label: '贈送優惠碼', icon: Gift, color: 'text-purple-500' },
    { id: 'stats' as StoreView, label: '抽獎統計', icon: BarChart2, color: 'text-orange-500' },
    { id: 'addbatch' as StoreView, label: '新增批次', icon: Plus, color: 'text-teal-500' },
  ];

  const viewLabel = menuItems.find(m => m.id === view)?.label ?? store.name;

  return (
    <div>
      <div className="bg-white px-6 py-4 border-b border-gray-100 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={view === 'menu' ? onBack : () => setView('menu')} className="text-[#27ae60]">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <p className="text-xs text-gray-400">{store.name}</p>
          <h2 className="font-bold text-gray-900">{view === 'menu' ? '店家管理' : viewLabel}</h2>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {view === 'menu' && (
          <motion.div key="menu" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {menuItems.map(item => (
                <button key={item.id} onClick={() => setView(item.id)}
                  className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center gap-3 hover:border-gray-200 transition-colors">
                  <item.icon className={`w-8 h-8 ${item.color}`} />
                  <span className="font-bold text-gray-700 text-sm">{item.label}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
        {view === 'inventory' && (
          <motion.div key="inventory" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <InventoryPanel store={store} currentUserUid={currentUserUid} />
          </motion.div>
        )}
        {view === 'gift' && (
          <motion.div key="gift" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <GiftPanel store={store} currentUserUid={currentUserUid} />
          </motion.div>
        )}
        {view === 'stats' && (
          <motion.div key="stats" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <StatsPanel store={store} />
          </motion.div>
        )}
        {view === 'addbatch' && (
          <motion.div key="addbatch" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <AddBatchPanel store={store} onDone={() => setView('inventory')} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/* ─── Store Dashboard (top-level) ────────────────────────────── */
const StoreDashboard: React.FC<{ profile: UserProfile }> = ({ profile }) => {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);

  useEffect(() => {
    const fetchStores = async () => {
      try {
        let storeList: Store[] = [];
        if (profile.role === 'admin') {
          const snap = await getDocs(query(collection(db, 'stores'), orderBy('createdAt', 'desc')));
          storeList = snap.docs.map(d => ({ ...d.data(), id: d.id } as Store));
        } else {
          // store role: only assigned stores
          const assignedIds = profile.assignedStores ?? [];
          const results = await Promise.all(assignedIds.map(id => getDoc(doc(db, 'stores', id))));
          storeList = results.filter(d => d.exists()).map(d => ({ ...d.data(), id: d.id } as Store));
        }
        setStores(storeList);
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'stores');
      } finally {
        setLoading(false);
      }
    };
    fetchStores();
  }, [profile]);

  if (selectedStore) {
    return (
      <StorePanel
        store={selectedStore}
        onBack={() => setSelectedStore(null)}
        currentUserUid={profile.uid}
      />
    );
  }

  return (
    <div className="pb-24">
      <div className="bg-white px-6 py-5 border-b border-gray-100 sticky top-0 z-10">
        <h1 className="text-xl font-bold text-gray-900">店家管理</h1>
        <p className="text-xs text-gray-400 mt-0.5">選擇要管理的店家</p>
      </div>

      {loading ? (
        <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-300" /></div>
      ) : (
        <div className="p-6 space-y-3">
          {stores.map(store => (
            <button
              key={store.id}
              onClick={() => setSelectedStore(store)}
              className="w-full bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center hover:border-[#27ae60]/30 transition-colors"
            >
              <div className="text-left">
                <p className="font-bold text-gray-900">{store.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{store.description || 'ID: ' + store.id}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-300" />
            </button>
          ))}
          {stores.length === 0 && (
            <div className="text-center py-16">
              <Users className="w-12 h-12 text-gray-200 mx-auto mb-4" />
              <p className="text-gray-400 text-sm">尚未被指派任何店家</p>
              <p className="text-gray-300 text-xs mt-1">請聯繫管理員進行設定</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StoreDashboard;

import React, { useState, useEffect, useCallback } from 'react';
import {
  collection, query, where, getDocs, addDoc, doc, updateDoc, orderBy, limit, getDoc,
} from 'firebase/firestore';
import {
  Package, Gift, BarChart2, FileUp, ChevronRight, Search, CheckCircle2,
  AlertCircle, Loader2, ArrowLeft, Users, Tag,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Store, Coupon, UserProfile, DrawRecord } from '../types';
import { COUPON_TYPES, getISOWeekKey } from '../constants';

type StoreView = 'menu' | 'inventory' | 'gift' | 'stats' | 'import';

interface StorePanelProps {
  store: Store;
  onBack: () => void;
  currentUserUid: string;
}

/* ─── Inventory ─────────────────────────────────────────────── */
const InventoryPanel: React.FC<{ store: Store }> = ({ store }) => {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCoupons = useCallback(async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'coupons'), where('storeId', '==', store.id), orderBy('status'));
      const snap = await getDocs(q);
      setCoupons(snap.docs.map(d => ({ ...d.data(), id: d.id } as Coupon)));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'coupons');
    } finally {
      setLoading(false);
    }
  }, [store.id]);

  useEffect(() => { loadCoupons(); }, [loadCoupons]);

  const counts = {
    available: coupons.filter(c => c.status === 'available').length,
    assigned: coupons.filter(c => c.status === 'assigned').length,
    used: coupons.filter(c => c.status === 'used').length,
  };

  const handleMarkUsed = async (coupon: Coupon) => {
    if (coupon.status !== 'assigned') return;
    try {
      await updateDoc(doc(db, 'coupons', coupon.id), { status: 'used', usedAt: Date.now() });
      setCoupons(prev => prev.map(c => c.id === coupon.id ? { ...c, status: 'used', usedAt: Date.now() } : c));
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `coupons/${coupon.id}`);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>;

  return (
    <div className="p-6 space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '可用', count: counts.available, color: 'bg-green-50 text-green-600 border-green-100' },
          { label: '已派發', count: counts.assigned, color: 'bg-blue-50 text-blue-600 border-blue-100' },
          { label: '已使用', count: counts.used, color: 'bg-gray-50 text-gray-500 border-gray-100' },
        ].map(item => (
          <div key={item.label} className={`${item.color} border rounded-2xl p-3 text-center`}>
            <p className="text-2xl font-black">{item.count}</p>
            <p className="text-xs font-bold mt-1">{item.label}</p>
          </div>
        ))}
      </div>

      {/* Coupon list — show assigned ones first so store can mark used */}
      <div className="space-y-2">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">已派發（點擊標記已使用）</p>
        {coupons.filter(c => c.status === 'assigned').map(coupon => (
          <button
            key={coupon.id}
            onClick={() => handleMarkUsed(coupon)}
            className="w-full bg-white p-4 rounded-xl border border-blue-100 flex justify-between items-center hover:bg-blue-50 transition-colors"
          >
            <div className="text-left">
              <p className="font-mono font-bold text-gray-900">{coupon.code}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {COUPON_TYPES.find(t => t.value === coupon.type)?.label} ·
                派發於 {coupon.assignedAt ? new Date(coupon.assignedAt).toLocaleDateString() : '—'}
              </p>
            </div>
            <span className="text-xs bg-blue-100 text-blue-600 font-bold px-2 py-1 rounded-full">標記使用</span>
          </button>
        ))}
        {counts.assigned === 0 && (
          <p className="text-center text-gray-300 py-4 text-sm">無待核銷序號</p>
        )}
      </div>
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

/* ─── Import ─────────────────────────────────────────────────── */
const ImportPanel: React.FC<{ store: Store }> = ({ store }) => {
  const [couponType, setCouponType] = useState<string>('100pt');
  const [codesText, setCodesText] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: number; dupes: number } | null>(null);

  const handleImport = async () => {
    if (!codesText.trim()) return;
    setImporting(true);
    setResult(null);
    const codes = codesText.split('\n').map(c => c.trim()).filter(Boolean);

    // Check for duplicate codes in same store
    const existingQ = query(collection(db, 'coupons'), where('storeId', '==', store.id));
    const existingSnap = await getDocs(existingQ);
    const existingCodes = new Set(existingSnap.docs.map(d => d.data().code));

    let success = 0;
    let dupes = 0;
    try {
      for (const code of codes) {
        if (existingCodes.has(code)) { dupes++; continue; }
        await addDoc(collection(db, 'coupons'), {
          id: crypto.randomUUID(),
          storeId: store.id,
          type: couponType,
          code,
          status: 'available',
        });
        success++;
      }
      setResult({ success, dupes });
      setCodesText('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'coupons');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="p-6 space-y-5">
      {result && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-green-50 border border-green-100 rounded-2xl p-4">
          <p className="text-sm font-bold text-green-700">
            成功匯入 {result.success} 組 {result.dupes > 0 ? `（略過 ${result.dupes} 組重複）` : ''}
          </p>
        </motion.div>
      )}
      <div>
        <label className="block text-sm font-bold text-gray-700 mb-2">序號類型</label>
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
      <div>
        <label className="block text-sm font-bold text-gray-700 mb-2">貼上序號（每行一組）</label>
        <textarea
          rows={10}
          value={codesText}
          onChange={e => setCodesText(e.target.value)}
          placeholder="ABC123&#10;DEF456&#10;GHI789"
          className="w-full p-3 rounded-xl border border-gray-200 outline-none font-mono text-sm focus:ring-2 focus:ring-[#27ae60]"
        />
        <p className="text-xs text-gray-400 mt-1">
          共 {codesText.split('\n').filter(c => c.trim()).length} 組序號
        </p>
      </div>
      <button
        onClick={handleImport}
        disabled={importing || !codesText.trim()}
        className="w-full bg-[#27ae60] text-white py-4 rounded-2xl font-bold shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {importing ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileUp className="w-5 h-5" />}
        {importing ? '匯入中...' : '確認匯入'}
      </button>
    </div>
  );
};

/* ─── Store Panel (wrapper with sub-nav) ────────────────────── */
const StorePanel: React.FC<StorePanelProps> = ({ store, onBack, currentUserUid }) => {
  const [view, setView] = useState<StoreView>('menu');

  const menuItems = [
    { id: 'inventory' as StoreView, label: '庫存管理', icon: Package, color: 'text-blue-500' },
    { id: 'gift' as StoreView, label: '贈送優惠碼', icon: Gift, color: 'text-purple-500' },
    { id: 'stats' as StoreView, label: '抽獎統計', icon: BarChart2, color: 'text-orange-500' },
    { id: 'import' as StoreView, label: '批量匯入', icon: FileUp, color: 'text-green-500' },
  ];

  const viewLabel = menuItems.find(m => m.id === view)?.label ?? store.name;

  return (
    <div>
      <div className="bg-white px-6 py-4 border-b border-gray-100 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={view === 'menu' ? onBack : () => setView('menu')} className="text-[#27ae60]">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <p className="text-xs text-gray-400">{store.name}</p>
          <h2 className="font-bold text-gray-900">{view === 'menu' ? '店家管理' : viewLabel}</h2>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {view === 'menu' && (
          <motion.div key="menu" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="grid grid-cols-2 gap-4 p-6">
            {menuItems.map(item => (
              <button key={item.id} onClick={() => setView(item.id)}
                className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center gap-3 hover:border-gray-200 transition-colors">
                <item.icon className={`w-8 h-8 ${item.color}`} />
                <span className="font-bold text-gray-700 text-sm">{item.label}</span>
              </button>
            ))}
          </motion.div>
        )}
        {view === 'inventory' && (
          <motion.div key="inventory" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <InventoryPanel store={store} />
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
        {view === 'import' && (
          <motion.div key="import" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ImportPanel store={store} />
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

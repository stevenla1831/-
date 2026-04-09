import React, { useState, useEffect, useCallback } from 'react';
import {
  collection, query, getDocs, setDoc, doc, updateDoc, deleteDoc,
  orderBy, limit, getDoc, where,
} from 'firebase/firestore';
import {
  Store as StoreIcon, Users, BarChart2, ArrowLeft, Plus, Trash2,
  Search, CheckCircle2, AlertCircle, Loader2, ChevronRight, ShieldCheck,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Store, UserProfile, DrawRecord, Coupon, UserRole } from '../types';
import { ROLES } from '../constants';

type AdminView = 'menu' | 'stores' | 'users' | 'stats';

/* ─── Store Management ──────────────────────────────────────── */
const StoreManagement: React.FC = () => {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchStores = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'stores'), orderBy('createdAt', 'desc')));
      setStores(snap.docs.map(d => ({ ...d.data(), id: d.id } as Store)));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'stores');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStores(); }, [fetchStores]);

  const handleAddStore = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const id = newName.trim().toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
      const store: Store = { id, name: newName.trim(), description: newDesc.trim(), createdAt: Date.now() };
      await setDoc(doc(db, 'stores', id), store);
      setNewName('');
      setNewDesc('');
      setAdding(false);
      fetchStores();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'stores');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (store: Store) => {
    if (!window.confirm(`確定要刪除「${store.name}」嗎？此操作無法復原。`)) return;
    setDeletingId(store.id);
    try {
      await deleteDoc(doc(db, 'stores', store.id));
      setStores(prev => prev.filter(s => s.id !== store.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `stores/${store.id}`);
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) return <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-300" /></div>;

  return (
    <div className="p-6 space-y-4">
      {stores.map(store => (
        <div key={store.id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex justify-between items-center">
          <div>
            <p className="font-bold text-gray-900">{store.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">{store.description || '—'}</p>
            <p className="text-[10px] text-gray-300 mt-0.5">ID: {store.id}</p>
          </div>
          <button
            onClick={() => handleDelete(store)}
            disabled={deletingId === store.id}
            className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
          >
            {deletingId === store.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </button>
        </div>
      ))}

      {/* Add new store */}
      {adding ? (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white p-5 rounded-2xl border-2 border-[#27ae60]/30 space-y-3 shadow-sm">
          <p className="font-bold text-gray-900 text-sm">新增店家</p>
          <input
            type="text"
            placeholder="店家名稱 *"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className="w-full p-3 rounded-xl border border-gray-200 outline-none text-sm focus:ring-2 focus:ring-[#27ae60]"
          />
          <input
            type="text"
            placeholder="店家描述（選填）"
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
            className="w-full p-3 rounded-xl border border-gray-200 outline-none text-sm focus:ring-2 focus:ring-[#27ae60]"
          />
          <div className="flex gap-2">
            <button onClick={() => setAdding(false)} className="flex-1 py-2 rounded-xl border border-gray-200 text-gray-500 text-sm font-bold">取消</button>
            <button
              onClick={handleAddStore}
              disabled={saving || !newName.trim()}
              className="flex-1 py-2 rounded-xl bg-[#27ae60] text-white text-sm font-bold disabled:opacity-50"
            >
              {saving ? '儲存中...' : '確認新增'}
            </button>
          </div>
        </motion.div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="w-full border-2 border-dashed border-gray-200 p-4 rounded-xl text-gray-400 flex items-center justify-center gap-2 hover:border-[#27ae60]/40 hover:text-[#27ae60] transition-colors"
        >
          <Plus className="w-5 h-5" />
          新增店家
        </button>
      )}
    </div>
  );
};

/* ─── User Management ────────────────────────────────────────── */
const UserManagement: React.FC = () => {
  const [search, setSearch] = useState('');
  const [foundUser, setFoundUser] = useState<UserProfile | null>(null);
  const [allStores, setAllStores] = useState<Store[]>([]);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDocs(query(collection(db, 'stores'), orderBy('name'))).then(snap => {
      setAllStores(snap.docs.map(d => ({ ...d.data(), id: d.id } as Store)));
    });
  }, []);

  const handleSearch = async () => {
    if (!search.trim()) return;
    setError(null);
    setFoundUser(null);
    try {
      // Try UID first
      const byUID = await getDoc(doc(db, 'users', search.trim()));
      if (byUID.exists()) { setFoundUser(byUID.data() as UserProfile); return; }
      // Try display name
      const byName = query(collection(db, 'users'), where('displayName', '==', search.trim()), limit(1));
      const byNameSnap = await getDocs(byName);
      if (!byNameSnap.empty) { setFoundUser(byNameSnap.docs[0].data() as UserProfile); return; }
      // Try phone
      const byPhone = query(collection(db, 'users'), where('phoneNumber', '==', search.trim()), limit(1));
      const byPhoneSnap = await getDocs(byPhone);
      if (!byPhoneSnap.empty) { setFoundUser(byPhoneSnap.docs[0].data() as UserProfile); return; }
      setError('找不到該用戶');
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'users');
    }
  };

  const updateRole = async (newRole: UserRole) => {
    if (!foundUser) return;
    setUpdating(true);
    try {
      await updateDoc(doc(db, 'users', foundUser.uid), { role: newRole });
      setFoundUser({ ...foundUser, role: newRole });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${foundUser.uid}`);
    } finally {
      setUpdating(false);
    }
  };

  const toggleStoreAssignment = async (storeId: string) => {
    if (!foundUser) return;
    const current = foundUser.assignedStores ?? [];
    const updated = current.includes(storeId)
      ? current.filter(id => id !== storeId)
      : [...current, storeId];
    setUpdating(true);
    try {
      await updateDoc(doc(db, 'users', foundUser.uid), { assignedStores: updated });
      setFoundUser({ ...foundUser, assignedStores: updated });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${foundUser.uid}`);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Search bar */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="LINE 名稱 / 手機 / UID"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          className="flex-1 p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#27ae60] outline-none text-sm"
        />
        <button onClick={handleSearch} className="bg-[#27ae60] text-white p-3 rounded-xl">
          <Search className="w-5 h-5" />
        </button>
      </div>

      {error && (
        <p className="text-red-500 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />{error}
        </p>
      )}

      {foundUser && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-5">
          {/* User info */}
          <div className="flex items-center gap-4">
            <img src={foundUser.photoURL || '/placeholder.png'} alt="" className="w-14 h-14 rounded-full border-2 border-gray-50" />
            <div>
              <p className="font-bold text-gray-900">{foundUser.displayName}</p>
              <p className="text-xs text-gray-400">{foundUser.phoneNumber || '未綁定手機'}</p>
              <p className="text-[10px] text-gray-300 mt-0.5">UID: {foundUser.uid.slice(0, 20)}...</p>
            </div>
          </div>

          {/* Role selector */}
          <div>
            <p className="text-xs font-bold text-gray-500 mb-2">帳號權限</p>
            <div className="grid grid-cols-3 gap-2">
              {ROLES.map(role => (
                <button
                  key={role.value}
                  onClick={() => updateRole(role.value as UserRole)}
                  disabled={updating}
                  className={`py-2 rounded-xl text-xs font-bold transition-all ${
                    foundUser.role === role.value
                      ? 'bg-[#27ae60] text-white shadow-sm'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {role.label}
                </button>
              ))}
            </div>
          </div>

          {/* Store assignment (only relevant for store role) */}
          {(foundUser.role === 'store' || foundUser.role === 'admin') && (
            <div>
              <p className="text-xs font-bold text-gray-500 mb-2 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />指派管理店家
              </p>
              <div className="space-y-2">
                {allStores.map(store => {
                  const assigned = (foundUser.assignedStores ?? []).includes(store.id);
                  return (
                    <button
                      key={store.id}
                      onClick={() => toggleStoreAssignment(store.id)}
                      disabled={updating}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border-2 text-sm transition-all ${
                        assigned ? 'border-[#27ae60] bg-[#f0fff4]' : 'border-gray-100 hover:border-gray-200'
                      }`}
                    >
                      <span className={`font-bold ${assigned ? 'text-[#27ae60]' : 'text-gray-600'}`}>{store.name}</span>
                      {assigned && <CheckCircle2 className="w-4 h-4 text-[#27ae60]" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
};

/* ─── Cross-store Stats ──────────────────────────────────────── */
const CrossStoreStats: React.FC = () => {
  const [stats, setStats] = useState<{
    store: Store;
    total: number;
    thisWeek: number;
    available: number;
    used: number;
  }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const storesSnap = await getDocs(query(collection(db, 'stores'), orderBy('name')));
        const stores = storesSnap.docs.map(d => ({ ...d.data(), id: d.id } as Store));

        const currentWeek = new Date();
        const weekStart = new Date(currentWeek);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        weekStart.setHours(0, 0, 0, 0);

        const results = await Promise.all(stores.map(async store => {
          const [recordsSnap, couponsSnap] = await Promise.all([
            getDocs(query(collection(db, 'drawRecords'), where('storeId', '==', store.id))),
            getDocs(query(collection(db, 'coupons'), where('storeId', '==', store.id))),
          ]);
          const records = recordsSnap.docs.map(d => d.data() as DrawRecord);
          const coupons = couponsSnap.docs.map(d => d.data() as Coupon);
          return {
            store,
            total: records.length,
            thisWeek: records.filter(r => r.timestamp > weekStart.getTime()).length,
            available: coupons.filter(c => c.status === 'available').length,
            used: coupons.filter(c => c.status === 'used').length,
          };
        }));

        setStats(results);
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'stats');
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  if (loading) return <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-300" /></div>;

  const totalDraws = stats.reduce((s, r) => s + r.total, 0);
  const totalWeek = stats.reduce((s, r) => s + r.thisWeek, 0);

  return (
    <div className="p-6 space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#f0fff4] border border-green-100 rounded-2xl p-4 text-center">
          <p className="text-3xl font-black text-[#27ae60]">{totalWeek}</p>
          <p className="text-xs font-bold text-green-700 mt-1">本週全店抽獎</p>
        </div>
        <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 text-center">
          <p className="text-3xl font-black text-gray-700">{totalDraws}</p>
          <p className="text-xs font-bold text-gray-500 mt-1">歷史總抽獎次數</p>
        </div>
      </div>

      {/* Per-store breakdown */}
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">各店家明細</p>
        <div className="space-y-3">
          {stats.map(({ store, total, thisWeek, available, used }) => (
            <div key={store.id} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
              <div className="flex justify-between items-start mb-3">
                <p className="font-bold text-gray-900">{store.name}</p>
                <div className="text-right">
                  <p className="text-lg font-black text-[#27ae60]">{thisWeek}</p>
                  <p className="text-[10px] text-gray-400">本週</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-gray-50 rounded-xl p-2">
                  <p className="text-sm font-bold text-gray-700">{total}</p>
                  <p className="text-[10px] text-gray-400">總抽獎</p>
                </div>
                <div className="bg-green-50 rounded-xl p-2">
                  <p className="text-sm font-bold text-green-600">{available}</p>
                  <p className="text-[10px] text-green-500">可用序號</p>
                </div>
                <div className="bg-orange-50 rounded-xl p-2">
                  <p className="text-sm font-bold text-orange-500">{used}</p>
                  <p className="text-[10px] text-orange-400">已使用</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ─── Admin Dashboard (top-level) ────────────────────────────── */
const AdminDashboard: React.FC<{ profile: UserProfile }> = ({ profile }) => {
  const [view, setView] = useState<AdminView>('menu');

  const menuItems = [
    { id: 'stores' as AdminView, label: '店家管理', sublabel: '新增 / 刪除店家', icon: StoreIcon, color: 'text-blue-500' },
    { id: 'users' as AdminView, label: '帳號管理', sublabel: '權限 & 店家指派', icon: Users, color: 'text-purple-500' },
    { id: 'stats' as AdminView, label: '跨店統計', sublabel: '全量數據查看', icon: BarChart2, color: 'text-orange-500' },
  ];

  const viewLabel = menuItems.find(m => m.id === view)?.label ?? '管理後台';

  return (
    <div className="pb-24">
      <div className="bg-white px-6 py-4 border-b border-gray-100 flex items-center gap-3 sticky top-0 z-10">
        {view !== 'menu' && (
          <button onClick={() => setView('menu')} className="text-[#27ae60]">
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <h1 className="text-xl font-bold text-gray-900">{view === 'menu' ? '管理後台' : viewLabel}</h1>
      </div>

      <AnimatePresence mode="wait">
        {view === 'menu' && (
          <motion.div key="menu" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="p-6 space-y-3">
            {menuItems.map(item => (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className="w-full bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4 hover:border-gray-200 transition-colors"
              >
                <div className="p-3 bg-gray-50 rounded-xl">
                  <item.icon className={`w-6 h-6 ${item.color}`} />
                </div>
                <div className="text-left">
                  <p className="font-bold text-gray-900">{item.label}</p>
                  <p className="text-xs text-gray-400">{item.sublabel}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-200 ml-auto" />
              </button>
            ))}
          </motion.div>
        )}
        {view === 'stores' && (
          <motion.div key="stores" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <StoreManagement />
          </motion.div>
        )}
        {view === 'users' && (
          <motion.div key="users" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <UserManagement />
          </motion.div>
        )}
        {view === 'stats' && (
          <motion.div key="stats" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <CrossStoreStats />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminDashboard;

import React, { useState, useEffect, useCallback } from 'react';
import {
  collection, query, getDocs, setDoc, doc, updateDoc, deleteDoc,
  orderBy, limit, where,
} from 'firebase/firestore';
import { StorePanel } from './StoreDashboard';
import {
  Store as StoreIcon, Users, BarChart2, ArrowLeft, Plus, Trash2,
  Search, CheckCircle2, Loader2, ChevronRight, ShieldCheck,
  ToggleLeft, ToggleRight, Download, Megaphone, Eye, EyeOff,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Store, UserProfile, DrawRecord, Coupon, UserRole, Announcement } from '../types';
import { ROLES } from '../constants';

type AdminView = 'menu' | 'stores' | 'userlist' | 'stats' | 'announce';

/* ─── Store Management ──────────────────────────────────────── */
const StoreManagement: React.FC<{ adminUid: string }> = ({ adminUid }) => {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [managingStore, setManagingStore] = useState<Store | null>(null);

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
      const store: Store = { id, name: newName.trim(), description: newDesc.trim(), isActive: true, createdAt: Date.now() };
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

  const handleToggleActive = async (store: Store) => {
    setTogglingId(store.id);
    try {
      const next = store.isActive === false ? true : false;
      await updateDoc(doc(db, 'stores', store.id), { isActive: next });
      setStores(prev => prev.map(s => s.id === store.id ? { ...s, isActive: next } : s));
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `stores/${store.id}`);
    } finally {
      setTogglingId(null);
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

  // Show per-store management panel when selected
  if (managingStore) {
    return <StorePanel store={managingStore} onBack={() => setManagingStore(null)} currentUserUid={adminUid} />;
  }

  return (
    <div className="p-6 space-y-4">
      {stores.map(store => {
        const active = store.isActive !== false;
        return (
          <div key={store.id} className={`bg-white p-4 rounded-xl border shadow-sm transition-opacity ${active ? 'border-gray-100' : 'border-gray-100 opacity-60'}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <p className="font-bold text-gray-900 truncate">{store.name}</p>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${active ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                  {active ? '進行中' : '已暫停'}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleToggleActive(store)}
                  disabled={togglingId === store.id}
                  title={active ? '點擊暫停' : '點擊啟用'}
                  className={`p-2 rounded-lg transition-colors disabled:opacity-50 ${active ? 'text-green-500 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-50'}`}
                >
                  {togglingId === store.id
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                </button>
                <button
                  onClick={() => handleDelete(store)}
                  disabled={deletingId === store.id}
                  className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                >
                  {deletingId === store.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {store.description && <p className="text-xs text-gray-400 mb-2">{store.description}</p>}
            <button
              onClick={() => setManagingStore(store)}
              className="w-full py-2 rounded-xl bg-[#f0fff4] border border-green-100 text-[#27ae60] text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-green-100 transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
              進入庫存 / 贈送 / 統計 / 匯入
            </button>
          </div>
        );
      })}

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

/* ─── User List (with inline permission editing) ─────────────── */
const ROLE_BADGE: Record<string, string> = {
  admin: 'bg-red-50 text-red-600 border-red-100',
  store: 'bg-purple-50 text-purple-600 border-purple-100',
  user: 'bg-green-50 text-green-600 border-green-100',
};

const UserList: React.FC = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [allStores, setAllStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRole, setFilterRole] = useState<'all' | UserRole>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedUid, setExpandedUid] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    Promise.all([
      getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(200))),
      getDocs(query(collection(db, 'stores'), orderBy('name'))),
    ])
      .then(([userSnap, storeSnap]) => {
        setUsers(userSnap.docs.map(d => d.data() as UserProfile));
        setAllStores(storeSnap.docs.map(d => ({ ...d.data(), id: d.id } as Store)));
      })
      .catch(err => handleFirestoreError(err, OperationType.LIST, 'users'))
      .finally(() => setLoading(false));
  }, []);

  const updateRole = async (user: UserProfile, newRole: UserRole) => {
    setUpdating(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), { role: newRole });
      setUsers(prev => prev.map(u => u.uid === user.uid ? { ...u, role: newRole } : u));
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    } finally {
      setUpdating(false);
    }
  };

  const toggleStoreAssignment = async (user: UserProfile, storeId: string) => {
    const current = user.assignedStores ?? [];
    const updated = current.includes(storeId)
      ? current.filter(id => id !== storeId)
      : [...current, storeId];
    setUpdating(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), { assignedStores: updated });
      setUsers(prev => prev.map(u => u.uid === user.uid ? { ...u, assignedStores: updated } : u));
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    } finally {
      setUpdating(false);
    }
  };

  const filtered = users.filter(u => {
    if (filterRole !== 'all' && u.role !== filterRole) return false;
    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      return (
        u.displayName.toLowerCase().includes(t) ||
        (u.phoneNumber ?? '').includes(t) ||
        u.uid.includes(t)
      );
    }
    return true;
  });

  const counts = {
    all: users.length,
    admin: users.filter(u => u.role === 'admin').length,
    store: users.filter(u => u.role === 'store').length,
    user: users.filter(u => u.role === 'user').length,
  };

  if (loading) return <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-300" /></div>;

  return (
    <div className="p-6 space-y-4">
      {/* Summary pills */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'admin', 'store', 'user'] as const).map(r => (
          <button
            key={r}
            onClick={() => setFilterRole(r)}
            className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
              filterRole === r ? 'bg-[#27ae60] text-white border-[#27ae60]' : 'bg-white text-gray-500 border-gray-200'
            }`}
          >
            {r === 'all' ? '全部' : ROLES.find(x => x.value === r)?.label}
            {' '}({counts[r]})
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
        <input
          type="text"
          placeholder="搜尋名稱 / 手機 / UID"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm focus:ring-2 focus:ring-[#27ae60]"
        />
      </div>

      {/* List */}
      <div className="space-y-2">
        {filtered.map(u => {
          const isExpanded = expandedUid === u.uid;
          return (
            <div key={u.uid} className={`bg-white rounded-xl border shadow-sm transition-all ${isExpanded ? 'border-[#27ae60]/40' : 'border-gray-100'}`}>
              {/* Row */}
              <button
                onClick={() => setExpandedUid(isExpanded ? null : u.uid)}
                className="w-full flex items-center gap-3 p-4"
              >
                <img
                  src={u.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.displayName)}&background=27ae60&color=fff&size=40`}
                  alt=""
                  className={`w-10 h-10 rounded-full shrink-0 border-2 transition-all ${isExpanded ? 'border-[#27ae60]' : 'border-gray-100'}`}
                />
                <div className="flex-1 min-w-0 text-left">
                  <p className="font-bold text-gray-900 text-sm truncate">{u.displayName}</p>
                  <p className="text-[10px] text-gray-400 truncate">
                    {u.phoneNumber || '—'} · {new Date(u.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${ROLE_BADGE[u.role] ?? ROLE_BADGE.user}`}>
                  {ROLES.find(r => r.value === u.role)?.label ?? u.role}
                </span>
              </button>

              {/* Inline edit panel */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 space-y-4 border-t border-gray-50 pt-3">
                      {/* Role selector */}
                      <div>
                        <p className="text-xs font-bold text-gray-500 mb-2">帳號權限</p>
                        <div className="grid grid-cols-3 gap-2">
                          {ROLES.map(role => (
                            <button
                              key={role.value}
                              onClick={() => updateRole(u, role.value as UserRole)}
                              disabled={updating}
                              className={`py-2 rounded-xl text-xs font-bold transition-all ${
                                u.role === role.value
                                  ? 'bg-[#27ae60] text-white shadow-sm'
                                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                              }`}
                            >
                              {role.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Store assignment */}
                      {(u.role === 'store' || u.role === 'admin') && (
                        <div>
                          <p className="text-xs font-bold text-gray-500 mb-2 flex items-center gap-1">
                            <ShieldCheck className="w-3.5 h-3.5" />指派管理店家
                          </p>
                          <div className="space-y-1.5">
                            {allStores.map(store => {
                              const assigned = (u.assignedStores ?? []).includes(store.id);
                              return (
                                <button
                                  key={store.id}
                                  onClick={() => toggleStoreAssignment(u, store.id)}
                                  disabled={updating}
                                  className={`w-full flex items-center justify-between p-3 rounded-xl border-2 text-sm transition-all ${
                                    assigned ? 'border-[#27ae60] bg-[#f0fff4]' : 'border-gray-100 hover:border-gray-200'
                                  }`}
                                >
                                  <span className={`font-bold text-sm ${assigned ? 'text-[#27ae60]' : 'text-gray-600'}`}>{store.name}</span>
                                  {assigned && <CheckCircle2 className="w-4 h-4 text-[#27ae60]" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-center text-gray-300 py-8 text-sm">找不到符合的用戶</p>
        )}
      </div>
    </div>
  );
};

/* ─── Announcement Management ────────────────────────────────── */
const AnnouncementManagement: React.FC = () => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [allStores, setAllStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [targetMode, setTargetMode] = useState<'all' | 'specific'>('all');
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [annSnap, storeSnap] = await Promise.all([
        getDocs(query(collection(db, 'announcements'), orderBy('createdAt', 'desc'))),
        getDocs(query(collection(db, 'stores'), orderBy('name'))),
      ]);
      setAnnouncements(annSnap.docs.map(d => ({ ...d.data(), id: d.id } as Announcement)));
      setAllStores(storeSnap.docs.map(d => ({ ...d.data(), id: d.id } as Store)));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'announcements');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!text.trim()) return;
    if (targetMode === 'specific' && selectedStoreIds.length === 0) return;
    setSaving(true);
    try {
      const id = crypto.randomUUID();
      const now = Date.now();
      const storeIds: string[] | 'all' = targetMode === 'all' ? 'all' : selectedStoreIds;
      const a: Announcement = { id, message: text.trim(), active: true, createdAt: now, updatedAt: now, storeIds };
      await setDoc(doc(db, 'announcements', id), a);
      setText('');
      setTargetMode('all');
      setSelectedStoreIds([]);
      setEditing(false);
      load();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'announcements');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (a: Announcement) => {
    try {
      await updateDoc(doc(db, 'announcements', a.id), { active: !a.active, updatedAt: Date.now() });
      setAnnouncements(prev => prev.map(x => x.id === a.id ? { ...x, active: !x.active } : x));
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `announcements/${a.id}`);
    }
  };

  const handleDelete = async (a: Announcement) => {
    if (!window.confirm('確定要刪除此公告？')) return;
    try {
      await deleteDoc(doc(db, 'announcements', a.id));
      setAnnouncements(prev => prev.filter(x => x.id !== a.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `announcements/${a.id}`);
    }
  };

  const storeLabel = (a: Announcement) => {
    if (!a.storeIds || a.storeIds === 'all') return '全部商家';
    const names = (a.storeIds as string[]).map(id => allStores.find(s => s.id === id)?.name ?? id);
    return names.join('、');
  };

  if (loading) return <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-300" /></div>;

  return (
    <div className="p-6 space-y-4">
      {announcements.map(a => (
        <div key={a.id} className={`bg-white p-4 rounded-xl border shadow-sm ${a.active ? 'border-[#27ae60]/30' : 'border-gray-100 opacity-60'}`}>
          <p className="text-sm text-gray-800 leading-relaxed mb-2">{a.message}</p>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-500 border border-blue-100">
              {storeLabel(a)}
            </span>
            <span className="text-[10px] text-gray-400">{new Date(a.createdAt).toLocaleDateString()}</span>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => handleToggle(a)}
              className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg transition-colors ${
                a.active ? 'text-green-600 bg-green-50' : 'text-gray-400 bg-gray-50'
              }`}
            >
              {a.active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              {a.active ? '顯示中' : '已隱藏'}
            </button>
            <button
              onClick={() => handleDelete(a)}
              className="text-red-400 hover:bg-red-50 p-1.5 rounded-lg transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}

      {editing ? (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white p-5 rounded-2xl border-2 border-[#27ae60]/30 space-y-4 shadow-sm">
          <textarea
            rows={3}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="輸入公告內容..."
            className="w-full p-3 rounded-xl border border-gray-200 outline-none text-sm focus:ring-2 focus:ring-[#27ae60] resize-none"
          />

          {/* Store targeting */}
          <div>
            <p className="text-xs font-bold text-gray-500 mb-2">公告對象</p>
            <div className="flex gap-2 mb-3">
              {(['all', 'specific'] as const).map(m => (
                <button key={m} onClick={() => { setTargetMode(m); setSelectedStoreIds([]); }}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition-all ${
                    targetMode === m ? 'border-[#27ae60] bg-[#f0fff4] text-[#27ae60]' : 'border-gray-100 text-gray-400'
                  }`}>
                  {m === 'all' ? '全部商家' : '指定商家'}
                </button>
              ))}
            </div>
            {targetMode === 'specific' && (
              <div className="space-y-1.5">
                {allStores.map(s => {
                  const sel = selectedStoreIds.includes(s.id);
                  return (
                    <button key={s.id}
                      onClick={() => setSelectedStoreIds(prev => sel ? prev.filter(id => id !== s.id) : [...prev, s.id])}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl border-2 text-sm transition-all ${
                        sel ? 'border-[#27ae60] bg-[#f0fff4]' : 'border-gray-100 hover:border-gray-200'
                      }`}>
                      <span className={`font-bold text-sm ${sel ? 'text-[#27ae60]' : 'text-gray-600'}`}>{s.name}</span>
                      {sel && <CheckCircle2 className="w-4 h-4 text-[#27ae60]" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button onClick={() => { setEditing(false); setText(''); setTargetMode('all'); setSelectedStoreIds([]); }}
              className="flex-1 py-2 rounded-xl border border-gray-200 text-gray-500 text-sm font-bold">取消</button>
            <button onClick={handleAdd}
              disabled={saving || !text.trim() || (targetMode === 'specific' && selectedStoreIds.length === 0)}
              className="flex-1 py-2 rounded-xl bg-[#27ae60] text-white text-sm font-bold disabled:opacity-50">
              {saving ? '儲存中...' : '發布公告'}
            </button>
          </div>
        </motion.div>
      ) : (
        <button onClick={() => setEditing(true)}
          className="w-full border-2 border-dashed border-gray-200 p-4 rounded-xl text-gray-400 flex items-center justify-center gap-2 hover:border-[#27ae60]/40 hover:text-[#27ae60] transition-colors">
          <Plus className="w-5 h-5" />新增公告
        </button>
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

  const handleExportCSV = () => {
    const header = ['店家', '狀態', '本週抽獎', '歷史總計', '可用序號', '已使用'];
    const rows = stats.map(({ store, total, thisWeek, available, used }) => [
      store.name,
      store.isActive !== false ? '進行中' : '已暫停',
      thisWeek,
      total,
      available,
      used,
    ]);
    const csv = [header, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `draw-stats-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const PIE_COLORS = ['#27ae60', '#3498db', '#e67e22', '#9b59b6', '#e74c3c', '#1abc9c'];

  const barData = stats.map(({ store, total, thisWeek }) => ({
    name: store.name.length > 6 ? store.name.slice(0, 6) + '…' : store.name,
    本週: thisWeek,
    歷史: total,
  }));

  const totalUsed = stats.reduce((s, r) => s + r.used, 0);
  const totalAvail = stats.reduce((s, r) => s + r.available, 0);
  const totalAssigned = stats.reduce((s, r) => {
    const assigned = r.total - r.available - r.used;
    return s + Math.max(0, assigned);
  }, 0);
  const pieData = [
    { name: '可用', value: totalAvail },
    { name: '已派發', value: totalAssigned },
    { name: '已使用', value: totalUsed },
  ].filter(d => d.value > 0);

  return (
    <div className="p-6 space-y-6">
      {/* Summary cards */}
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

      {/* Bar chart — draws per store */}
      {barData.length > 0 && (
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">各店家抽獎次數</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={barData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
              <Bar dataKey="本週" fill="#27ae60" radius={[4, 4, 0, 0]} />
              <Bar dataKey="歷史" fill="#a8e6c0" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Pie chart — coupon inventory breakdown */}
      {pieData.length > 0 && (
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">全站序號分佈</p>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={72}
                dataKey="value" paddingAngle={3}>
                {pieData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Per-store breakdown */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">各店家明細</p>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 text-xs font-bold text-[#27ae60] bg-[#f0fff4] border border-green-100 px-3 py-1.5 rounded-full hover:bg-green-100 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            匯出 CSV
          </button>
        </div>
        <div className="space-y-3">
          {stats.map(({ store, total, thisWeek, available, used }) => (
            <div key={store.id} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-bold text-gray-900">{store.name}</p>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${store.isActive !== false ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                    {store.isActive !== false ? '進行中' : '已暫停'}
                  </span>
                </div>
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
    { id: 'stores' as AdminView, label: '店家管理', sublabel: '新增 / 刪除 / 暫停店家', icon: StoreIcon, color: 'text-blue-500' },
    { id: 'userlist' as AdminView, label: '用戶列表', sublabel: '瀏覽用戶 & 點擊設定權限', icon: Users, color: 'text-purple-500' },
    { id: 'stats' as AdminView, label: '跨店統計', sublabel: '圖表 & 數據匯出', icon: BarChart2, color: 'text-orange-500' },
    { id: 'announce' as AdminView, label: '公告管理', sublabel: '設定抽獎頁公告', icon: Megaphone, color: 'text-pink-500' },
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
            <StoreManagement adminUid={profile.uid} />
          </motion.div>
        )}
        {view === 'userlist' && (
          <motion.div key="userlist" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <UserList />
          </motion.div>
        )}
        {view === 'stats' && (
          <motion.div key="stats" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <CrossStoreStats />
          </motion.div>
        )}
        {view === 'announce' && (
          <motion.div key="announce" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <AnnouncementManagement />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminDashboard;

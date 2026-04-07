import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { db, handleFirestoreError, OperationType } from './firebase';
import { collection, query, where, getDocs, addDoc, doc, updateDoc, getDoc, limit, orderBy } from 'firebase/firestore';
import { Gift, Ticket, History, User, LogOut, LayoutDashboard, Store as StoreIcon, Settings, Search, QrCode, Plus, Trash2, FileUp, ChevronRight, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Store, Coupon, DrawRecord, UserProfile, CouponType } from './types';
import { LIFF_ID, COUPON_TYPES, ROLES } from './constants';
import liff from '@line/liff';

// --- Components ---

const LoadingScreen = ({ message = "正在載入系統..." }) => (
  <div className="min-h-screen flex flex-col items-center justify-center bg-[#f8f9fa] p-4 text-center">
    <motion.div
      animate={{ rotate: 360 }}
      transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
      className="mb-4"
    >
      <Loader2 className="w-12 h-12 text-[#27ae60]" />
    </motion.div>
    <p className="text-gray-600 font-medium">{message}</p>
  </div>
);

const Navbar = ({ activeTab, setActiveTab, role }: { activeTab: string, setActiveTab: (t: string) => void, role: string }) => {
  const tabs = [
    { id: 'draw', label: '抽獎', icon: Gift, roles: ['user', 'store', 'admin'] },
    { id: 'my-coupons', label: '我的優惠券', icon: Ticket, roles: ['user', 'store', 'admin'] },
    { id: 'admin', label: '管理後台', icon: LayoutDashboard, roles: ['admin', 'store'] },
    { id: 'profile', label: '個人資料', icon: User, roles: ['user', 'store', 'admin'] },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-2 flex justify-around items-center z-50 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
      {tabs.filter(t => t.roles.includes(role)).map((tab) => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`flex flex-col items-center p-2 transition-colors ${activeTab === tab.id ? 'text-[#27ae60]' : 'text-gray-400'}`}
        >
          <tab.icon className={`w-6 h-6 ${activeTab === tab.id ? 'fill-[#27ae60]/10' : ''}`} />
          <span className="text-[10px] mt-1 font-medium">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
};

// --- Pages ---

const DrawPage = ({ profile }: { profile: UserProfile }) => {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [result, setResult] = useState<Coupon | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canDraw, setCanDraw] = useState(true);

  useEffect(() => {
    const fetchStores = async () => {
      try {
        const q = query(collection(db, 'stores'), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        setStores(snapshot.docs.map(doc => doc.data() as Store));
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'stores');
      }
    };
    fetchStores();
  }, []);

  const checkWeeklyLimit = async (storeId: string) => {
    try {
      const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const q = query(
        collection(db, 'drawRecords'),
        where('userId', '==', profile.uid),
        where('storeId', '==', storeId),
        where('timestamp', '>', oneWeekAgo)
      );
      const snapshot = await getDocs(q);
      return snapshot.empty;
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'drawRecords');
      return false;
    }
  };

  const handleDraw = async () => {
    if (!selectedStore) return;
    setDrawing(true);
    setError(null);

    const isAllowed = await checkWeeklyLimit(selectedStore.id);
    if (!isAllowed) {
      setError("您本週已在該店家抽過獎了，請下週再來！");
      setDrawing(false);
      return;
    }

    try {
      // Find available coupon for this store
      const q = query(
        collection(db, 'coupons'),
        where('storeId', '==', selectedStore.id),
        where('status', '==', 'available'),
        limit(1)
      );
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        setError("很抱歉，該店家的優惠券已抽完。");
        setDrawing(false);
        return;
      }

      const couponDoc = snapshot.docs[0];
      const couponData = couponDoc.data() as Coupon;

      // Update coupon status
      await updateDoc(doc(db, 'coupons', couponDoc.id), {
        status: 'used',
        userId: profile.uid,
        drawnAt: Date.now()
      });

      // Create draw record
      const record: DrawRecord = {
        id: crypto.randomUUID(),
        userId: profile.uid,
        storeId: selectedStore.id,
        couponId: couponDoc.id,
        timestamp: Date.now()
      };
      await addDoc(collection(db, 'drawRecords'), record);

      setResult({ ...couponData, status: 'used', userId: profile.uid, drawnAt: record.timestamp });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'draw');
      setError("抽獎失敗，請稍後再試。");
    } finally {
      setDrawing(false);
    }
  };

  return (
    <div className="p-6 pb-24">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">你好，{profile.displayName}</h1>
        <p className="text-gray-500">歡迎參加抽獎活動</p>
      </header>

      {!result ? (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <StoreIcon className="w-5 h-5 text-[#27ae60]" />
              選擇店家
            </h2>
            <div className="grid grid-cols-1 gap-3">
              {stores.map(store => (
                <button
                  key={store.id}
                  onClick={() => setSelectedStore(store)}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${selectedStore?.id === store.id ? 'border-[#27ae60] bg-[#f0fff4]' : 'border-gray-100 hover:border-gray-200'}`}
                >
                  <p className="font-bold text-gray-900">{store.name}</p>
                  <p className="text-xs text-gray-500 mt-1">{store.description}</p>
                </button>
              ))}
              {stores.length === 0 && <p className="text-center text-gray-400 py-4">目前沒有店家活動</p>}
            </div>
          </div>

          <button
            disabled={!selectedStore || drawing}
            onClick={handleDraw}
            className={`w-full py-4 rounded-2xl font-bold text-lg shadow-lg transition-all flex items-center justify-center gap-2 ${!selectedStore || drawing ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-[#27ae60] text-white hover:bg-[#219150] active:scale-95'}`}
          >
            {drawing ? <Loader2 className="w-6 h-6 animate-spin" /> : <Gift className="w-6 h-6" />}
            {drawing ? '抽取中...' : '點我抽獎'}
          </button>

          {error && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-4 bg-red-50 text-red-600 rounded-xl flex items-start gap-3 border border-red-100">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="text-sm font-medium">{error}</p>
            </motion.div>
          )}
        </div>
      ) : (
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white p-8 rounded-3xl shadow-xl border-2 border-[#27ae60] text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-[#27ae60]" />
          <CheckCircle2 className="w-16 h-16 text-[#27ae60] mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">恭喜中獎！</h2>
          <p className="text-gray-500 mb-6">您獲得了 {selectedStore?.name} 的優惠券</p>
          
          <div className="bg-[#f0fff4] border-2 border-dashed border-[#27ae60] p-6 rounded-2xl mb-6">
            <p className="text-xs text-[#27ae60] font-bold uppercase tracking-widest mb-2">專屬序號</p>
            <p className="text-4xl font-black text-[#e67e22] tracking-widest">{result.code}</p>
          </div>
          
          <p className="text-xs text-gray-400">請截圖保存，使用時出示給店員</p>
          <button onClick={() => setResult(null)} className="mt-8 text-[#27ae60] font-bold text-sm">返回抽獎首頁</button>
        </motion.div>
      )}
    </div>
  );
};

const MyCouponsPage = ({ profile }: { profile: UserProfile }) => {
  const [coupons, setCoupons] = useState<(Coupon & { storeName?: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMyCoupons = async () => {
      try {
        const q = query(collection(db, 'coupons'), where('userId', '==', profile.uid), orderBy('drawnAt', 'desc'));
        const snapshot = await getDocs(q);
        const couponData = snapshot.docs.map(doc => doc.data() as Coupon);
        
        // Fetch store names
        const storesSnapshot = await getDocs(collection(db, 'stores'));
        const storesMap = new Map(storesSnapshot.docs.map(d => [d.id, (d.data() as Store).name]));
        
        setCoupons(couponData.map(c => ({ ...c, storeName: storesMap.get(c.storeId) || '未知店家' })));
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'my-coupons');
      } finally {
        setLoading(false);
      }
    };
    fetchMyCoupons();
  }, [profile.uid]);

  if (loading) return <div className="p-8 text-center text-gray-400">載入中...</div>;

  return (
    <div className="p-6 pb-24">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">我的優惠券</h1>
      <div className="space-y-4">
        {coupons.map(coupon => (
          <div key={coupon.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center">
            <div>
              <p className="text-xs font-bold text-[#27ae60] uppercase mb-1">{coupon.storeName}</p>
              <p className="text-lg font-black text-gray-900">{coupon.code}</p>
              <p className="text-[10px] text-gray-400 mt-1">領取時間: {new Date(coupon.drawnAt!).toLocaleString()}</p>
            </div>
            <div className="bg-[#f0fff4] px-3 py-1 rounded-full border border-[#27ae60]/20">
              <span className="text-xs font-bold text-[#27ae60]">{COUPON_TYPES.find(t => t.value === coupon.type)?.label}</span>
            </div>
          </div>
        ))}
        {coupons.length === 0 && (
          <div className="text-center py-20">
            <Ticket className="w-12 h-12 text-gray-200 mx-auto mb-4" />
            <p className="text-gray-400">目前還沒有任何優惠券</p>
          </div>
        )}
      </div>
    </div>
  );
};

const AdminDashboard = ({ profile }: { profile: UserProfile }) => {
  const [view, setView] = useState<'menu' | 'stores' | 'coupons' | 'users' | 'stats'>('menu');
  const [stores, setStores] = useState<Store[]>([]);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    const fetchStores = async () => {
      const q = query(collection(db, 'stores'));
      const snapshot = await getDocs(q);
      setStores(snapshot.docs.map(doc => doc.data() as Store));
    };
    fetchStores();
  }, []);

  const AdminMenu = () => (
    <div className="grid grid-cols-2 gap-4 p-6">
      <button onClick={() => setView('stores')} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center gap-3">
        <StoreIcon className="w-8 h-8 text-blue-500" />
        <span className="font-bold text-gray-700">店家管理</span>
      </button>
      <button onClick={() => setView('coupons')} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center gap-3">
        <FileUp className="w-8 h-8 text-green-500" />
        <span className="font-bold text-gray-700">序號匯入</span>
      </button>
      <button onClick={() => setView('users')} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center gap-3">
        <User className="w-8 h-8 text-purple-500" />
        <span className="font-bold text-gray-700">權限管理</span>
      </button>
      <button onClick={() => setView('stats')} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center gap-3">
        <History className="w-8 h-8 text-orange-500" />
        <span className="font-bold text-gray-700">抽獎狀況</span>
      </button>
    </div>
  );

  const UserManagement = () => {
    const [search, setSearch] = useState('');
    const [foundUser, setFoundUser] = useState<UserProfile | null>(null);
    const [updating, setUpdating] = useState(false);

    const handleSearch = async () => {
      if (!search) return;
      try {
        // Search by UID first, then by phone (if we had index)
        // For simplicity, we search by UID or display name
        const q = query(collection(db, 'users'), where('displayName', '==', search));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          setFoundUser(snapshot.docs[0].data() as UserProfile);
        } else {
          const docSnap = await getDoc(doc(db, 'users', search));
          if (docSnap.exists()) {
            setFoundUser(docSnap.data() as UserProfile);
          } else {
            alert("找不到該用戶");
          }
        }
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
        alert("權限更新成功");
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${foundUser.uid}`);
      } finally {
        setUpdating(false);
      }
    };

    return (
      <div className="p-6 space-y-6">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="搜尋 LINE 名稱或 ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-[#27ae60] outline-none"
          />
          <button onClick={handleSearch} className="bg-[#27ae60] text-white p-3 rounded-xl">
            <Search className="w-5 h-5" />
          </button>
        </div>

        {foundUser && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 text-center">
            <img src={foundUser.photoURL} alt="" className="w-20 h-20 rounded-full mx-auto mb-4 border-4 border-gray-50" />
            <h3 className="text-xl font-bold text-gray-900">{foundUser.displayName}</h3>
            <p className="text-xs text-gray-400 mb-6">ID: {foundUser.uid}</p>
            
            <div className="grid grid-cols-3 gap-2">
              {ROLES.map(role => (
                <button
                  key={role.value}
                  onClick={() => updateRole(role.value as UserRole)}
                  disabled={updating}
                  className={`py-2 px-1 rounded-lg text-xs font-bold transition-all ${foundUser.role === role.value ? 'bg-[#27ae60] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                >
                  {role.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    );
  };

  const CouponImport = () => {
    const [selectedStoreId, setSelectedStoreId] = useState('');
    const [couponType, setCouponType] = useState<CouponType>('100pt');
    const [codesText, setCodesText] = useState('');
    const [importing, setImporting] = useState(false);

    const handleImport = async () => {
      if (!selectedStoreId || !codesText) return;
      setImporting(true);
      const codes = codesText.split('\n').map(c => c.trim()).filter(c => c);
      
      try {
        for (const code of codes) {
          const coupon: Coupon = {
            id: crypto.randomUUID(),
            storeId: selectedStoreId,
            type: couponType,
            code: code,
            status: 'available'
          };
          await addDoc(collection(db, 'coupons'), coupon);
        }
        alert(`成功匯入 ${codes.length} 組序號`);
        setCodesText('');
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'coupons');
      } finally {
        setImporting(false);
      }
    };

    return (
      <div className="p-6 space-y-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">選擇店家</label>
            <select
              value={selectedStoreId}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              className="w-full p-3 rounded-xl border border-gray-200 outline-none"
            >
              <option value="">請選擇店家</option>
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">序號類型</label>
            <div className="flex gap-2">
              {COUPON_TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => setCouponType(t.value)}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold border-2 transition-all ${couponType === t.value ? 'border-[#27ae60] bg-[#f0fff4] text-[#27ae60]' : 'border-gray-100 text-gray-400'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">輸入序號 (每行一組)</label>
            <textarea
              rows={8}
              value={codesText}
              onChange={(e) => setCodesText(e.target.value)}
              placeholder="貼上序號清單..."
              className="w-full p-3 rounded-xl border border-gray-200 outline-none font-mono text-sm"
            />
          </div>
          <button
            onClick={handleImport}
            disabled={importing || !selectedStoreId || !codesText}
            className="w-full bg-[#27ae60] text-white py-4 rounded-2xl font-bold shadow-lg disabled:opacity-50"
          >
            {importing ? '匯入中...' : '確認匯入'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="pb-24">
      <div className="bg-white p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 z-10">
        <h1 className="text-xl font-bold text-gray-900">
          {view === 'menu' ? '管理後台' : 
           view === 'stores' ? '店家管理' :
           view === 'coupons' ? '序號匯入' :
           view === 'users' ? '權限管理' : '抽獎狀況'}
        </h1>
        {view !== 'menu' && (
          <button onClick={() => setView('menu')} className="text-sm font-bold text-[#27ae60]">返回</button>
        )}
      </div>

      {view === 'menu' && <AdminMenu />}
      {view === 'users' && <UserManagement />}
      {view === 'coupons' && <CouponImport />}
      {view === 'stores' && (
        <div className="p-6 space-y-4">
          {stores.map(s => (
            <div key={s.id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex justify-between items-center">
              <div>
                <p className="font-bold text-gray-900">{s.name}</p>
                <p className="text-xs text-gray-500">{s.description}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-300" />
            </div>
          ))}
          <button className="w-full border-2 border-dashed border-gray-200 p-4 rounded-xl text-gray-400 flex items-center justify-center gap-2">
            <Plus className="w-5 h-5" />
            新增店家
          </button>
        </div>
      )}
      {view === 'stats' && (
        <div className="p-6 text-center text-gray-400">
          <History className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p>統計數據功能開發中...</p>
        </div>
      )}
    </div>
  );
};

const ProfilePage = ({ profile }: { profile: UserProfile }) => {
  return (
    <div className="p-6 pb-24">
      <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 text-center mb-6">
        <div className="relative w-24 h-24 mx-auto mb-4">
          <img src={profile.photoURL} alt="" className="w-full h-full rounded-full border-4 border-gray-50" />
          <div className="absolute bottom-0 right-0 bg-[#27ae60] p-1.5 rounded-full border-2 border-white">
            <CheckCircle2 className="w-4 h-4 text-white" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-gray-900">{profile.displayName}</h2>
        <p className="text-sm text-gray-500 mb-4">{ROLES.find(r => r.value === profile.role)?.label}</p>
        <div className="flex justify-center gap-2">
          <span className="bg-gray-100 px-3 py-1 rounded-full text-[10px] font-bold text-gray-500">ID: {profile.uid.slice(0, 8)}...</span>
        </div>
      </div>

      <div className="space-y-3">
        <button className="w-full bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between group">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-colors">
              <Settings className="w-5 h-5" />
            </div>
            <span className="font-bold text-gray-700">帳號設定</span>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-300" />
        </button>
        <button onClick={() => auth.signOut()} className="w-full bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between group">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-50 rounded-lg text-red-500 group-hover:bg-red-500 group-hover:text-white transition-colors">
              <LogOut className="w-5 h-5" />
            </div>
            <span className="font-bold text-gray-700">登出系統</span>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-300" />
        </button>
      </div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const { profile, loading, isAuthReady } = useAuth();
  const [activeTab, setActiveTab] = useState('draw');

  useEffect(() => {
    // Initialize LIFF
    liff.init({ liffId: LIFF_ID }).catch(err => console.error("LIFF Init Error:", err));
  }, []);

  if (!isAuthReady || loading) return <LoadingScreen />;

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8f9fa] p-6">
        <div className="bg-white p-10 rounded-[40px] shadow-2xl max-w-sm w-full text-center border border-white">
          <div className="w-20 h-20 bg-[#f0fff4] rounded-3xl flex items-center justify-center mx-auto mb-8">
            <Gift className="w-10 h-10 text-[#27ae60]" />
          </div>
          <h1 className="text-3xl font-black text-gray-900 mb-4 tracking-tight">白日衣衫淨</h1>
          <p className="text-gray-500 mb-10 leading-relaxed">歡迎來到抽獎系統，請登入以開始您的幸運之旅。</p>
          <button
            onClick={() => {
              // In real app, use liff.login()
              // For demo/dev, we use a mock login or Google Auth
              import('./firebase').then(({ googleProvider, signInWithPopup, auth }) => {
                signInWithPopup(auth, googleProvider);
              });
            }}
            className="w-full bg-[#27ae60] text-white py-4 rounded-2xl font-bold text-lg shadow-[0_8px_20px_rgba(39,174,96,0.3)] hover:translate-y-[-2px] active:scale-95 transition-all"
          >
            登入系統
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] font-sans text-gray-900 max-w-md mx-auto relative shadow-2xl">
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -10 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'draw' && <DrawPage profile={profile} />}
          {activeTab === 'my-coupons' && <MyCouponsPage profile={profile} />}
          {activeTab === 'admin' && <AdminDashboard profile={profile} />}
          {activeTab === 'profile' && <ProfilePage profile={profile} />}
        </motion.div>
      </AnimatePresence>

      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} role={profile.role} />
    </div>
  );
}

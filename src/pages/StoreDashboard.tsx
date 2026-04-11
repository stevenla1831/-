import React, { useState, useEffect, useCallback } from 'react';
import {
  collection, query, where, getDocs, addDoc, doc, updateDoc, orderBy, limit, getDoc,
} from 'firebase/firestore';
import {
  Package, Gift, BarChart2, FileUp, ChevronRight, Search, CheckCircle2,
  AlertCircle, Loader2, ArrowLeft, Users, QrCode,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Store, Coupon, UserProfile, DrawRecord } from '../types';
import { COUPON_TYPES, getISOWeekKey, LIFF_URL } from '../constants';

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

/* ─── CSV helper ─────────────────────────────────────────────── */
function parseCSV(rawText: string): string[][] {
  // Strip UTF-8 BOM if present
  const text = rawText.replace(/^\ufeff/, '');
  // Auto-detect delimiter: count tabs vs commas vs semicolons in first non-empty line
  const firstLine = text.split(/\r?\n/).find(l => l.trim()) ?? '';
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  const semis = (firstLine.match(/;/g) ?? []).length;
  const delim = tabs >= commas && tabs >= semis ? '\t' : semis > commas ? ';' : ',';

  return text.split(/\r?\n/).map(line => {
    const cols: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === delim && !inQ) { cols.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    cols.push(cur.trim());
    return cols;
  }).filter(r => r.some(c => c));
}

function guessType(val: string): string {
  if (val.includes('100')) return '100pt';
  if (val.includes('50')) return '50pt';
  if (val.includes('20')) return '20pt';
  return '100pt';
}

function parseDate(val: string): number | undefined {
  if (!val) return undefined;
  const d = new Date(val.replace(/\//g, '-'));
  return isNaN(d.getTime()) ? undefined : d.getTime();
}

/* ─── Import ─────────────────────────────────────────────────── */
const ImportPanel: React.FC<{ store: Store }> = ({ store }) => {
  const [mode, setMode] = useState<'manual' | 'csv'>('manual');
  const [couponType, setCouponType] = useState<string>('100pt');
  const [codesText, setCodesText] = useState('');
  const [csvPreview, setCsvPreview] = useState<{ code: string; type: string; eventName?: string; validFrom?: number; validTo?: number; minAmount?: number }[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: number; dupes: number } | null>(null);

  // CSV column header index mapping
  // Note: '序列號' removed from code keys — in many CSVs it's a row counter, not the coupon code
  const COL = {
    code: ['優惠碼', 'code', 'coupon'],
    type: ['優惠方式', 'type'],
    event: ['活動名稱', 'event'],
    from: ['活動開始時間', 'start'],
    to: ['活動結束時間', 'end'],
    min: ['低銷金額', '最低消費', 'min'],
  };

  const findIdx = (headers: string[], keys: string[]) =>
    headers.findIndex(h => keys.some(k => h.includes(k)));

  const processCSVText = (text: string) => {
    const rows = parseCSV(text);
    if (rows.length < 2) { alert('CSV 檔案內容不足，請確認格式。'); return; }
    const headers = rows[0].map(h => h.trim());
    const ci = {
      code: findIdx(headers, COL.code),
      type: findIdx(headers, COL.type),
      event: findIdx(headers, COL.event),
      from: findIdx(headers, COL.from),
      to: findIdx(headers, COL.to),
      min: findIdx(headers, COL.min),
    };
    if (ci.code < 0) {
      alert(`找不到「優惠碼」欄位。\n偵測到的欄位：${headers.join('、')}\n請確認第一列含「優惠碼」或「code」欄位名稱。`);
      return;
    }
    const items = rows.slice(1).map(r => ({
      code: r[ci.code] ?? '',
      type: ci.type >= 0 && r[ci.type] ? guessType(r[ci.type]) : couponType,
      eventName: ci.event >= 0 ? r[ci.event] : undefined,
      validFrom: ci.from >= 0 ? parseDate(r[ci.from] ?? '') : undefined,
      validTo: ci.to >= 0 ? parseDate(r[ci.to] ?? '') : undefined,
      minAmount: ci.min >= 0 && r[ci.min] ? Number(r[ci.min].replace(/[^0-9.]/g, '')) || undefined : undefined,
    })).filter(x => x.code);
    setCsvPreview(items);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    let text: string;
    // Check for UTF-8 BOM (EF BB BF)
    if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      text = new TextDecoder('UTF-8').decode(buffer);
    } else {
      // Decode as UTF-8 and check if the first line contains valid Chinese or known keywords
      const utf8 = new TextDecoder('UTF-8').decode(buffer).replace(/^\ufeff/, '');
      const firstLine = utf8.split(/\r?\n/)[0] ?? '';
      // Valid CJK characters are U+4E00–U+9FFF; garbled Big5 shows non-CJK junk
      const hasChinese = /[\u4e00-\u9fff]/.test(firstLine);
      const hasEnglishKeyword = /code|coupon|start|end|type/i.test(firstLine);
      if (hasChinese || hasEnglishKeyword) {
        // Looks like valid UTF-8
        text = utf8;
      } else {
        // Fallback: try Big5 (Windows Traditional Chinese Excel export without BOM)
        try {
          text = new TextDecoder('big5').decode(buffer);
        } catch {
          text = utf8; // give up and use UTF-8
        }
      }
    }

    processCSVText(text);
  };

  const runImport = async (items: { code: string; type: string; eventName?: string; validFrom?: number; validTo?: number; minAmount?: number }[]) => {
    setImporting(true);
    setResult(null);
    try {
      const existingSnap = await getDocs(query(collection(db, 'coupons'), where('storeId', '==', store.id)));
      const existingCodes = new Set(existingSnap.docs.map(d => d.data().code));
      let success = 0, dupes = 0;
      for (const item of items) {
        if (existingCodes.has(item.code)) { dupes++; continue; }
        const data: Record<string, unknown> = {
          id: crypto.randomUUID(), storeId: store.id,
          type: item.type, code: item.code, status: 'available',
        };
        if (item.eventName) data.eventName = item.eventName;
        if (item.validFrom) data.validFrom = item.validFrom;
        if (item.validTo) data.validTo = item.validTo;
        if (item.minAmount) data.minAmount = item.minAmount;
        await addDoc(collection(db, 'coupons'), data);
        success++;
      }
      setResult({ success, dupes });
      setCodesText('');
      setCsvPreview([]);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'coupons');
    } finally {
      setImporting(false);
    }
  };

  const handleManualImport = () => {
    const codes = codesText.split('\n').map(c => c.trim()).filter(Boolean);
    runImport(codes.map(code => ({ code, type: couponType })));
  };

  return (
    <div className="p-6 space-y-5">
      {result && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-green-50 border border-green-100 rounded-2xl p-4">
          <p className="text-sm font-bold text-green-700">
            成功匯入 {result.success} 組{result.dupes > 0 ? `，略過 ${result.dupes} 組重複` : ''}
          </p>
        </motion.div>
      )}

      {/* Mode toggle */}
      <div className="flex gap-2 bg-gray-100 p-1 rounded-xl">
        {(['manual', 'csv'] as const).map(m => (
          <button key={m} onClick={() => setMode(m)}
            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
              mode === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'
            }`}>
            {m === 'manual' ? '手動輸入' : 'CSV 檔案匯入'}
          </button>
        ))}
      </div>

      {mode === 'manual' ? (
        <>
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
              placeholder={'ABC123\nDEF456\nGHI789'}
              className="w-full p-3 rounded-xl border border-gray-200 outline-none font-mono text-sm focus:ring-2 focus:ring-[#27ae60]"
            />
            <p className="text-xs text-gray-400 mt-1">
              共 {codesText.split('\n').filter(c => c.trim()).length} 組
            </p>
          </div>
          <button onClick={handleManualImport} disabled={importing || !codesText.trim()}
            className="w-full bg-[#27ae60] text-white py-4 rounded-2xl font-bold shadow-md disabled:opacity-50 flex items-center justify-center gap-2">
            {importing ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileUp className="w-5 h-5" />}
            {importing ? '匯入中...' : '確認匯入'}
          </button>
        </>
      ) : (
        <>
          <div className="border-2 border-dashed border-gray-200 rounded-2xl p-6 text-center">
            <FileUp className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-gray-600 mb-1">上傳 CSV 檔案</p>
            <p className="text-xs text-gray-400 mb-3">需含「優惠碼」欄位，可選填：活動名稱、優惠方式、活動開始/結束時間、低銷金額</p>
            <label className="cursor-pointer bg-[#27ae60] text-white text-sm font-bold px-4 py-2 rounded-xl inline-block">
              選擇檔案
              <input type="file" accept=".csv,.txt" className="hidden" onChange={handleFileUpload} />
            </label>
          </div>

          {csvPreview.length > 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
              <p className="text-sm font-bold text-gray-700">預覽（共 {csvPreview.length} 組）</p>
              <div className="max-h-48 overflow-y-auto space-y-1.5 rounded-xl border border-gray-100 p-3">
                {csvPreview.slice(0, 20).map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-1.5">
                    <span className="font-mono font-bold text-gray-800">{item.code}</span>
                    <div className="flex items-center gap-2 text-gray-400">
                      {item.eventName && <span>{item.eventName}</span>}
                      <span className="text-[#27ae60] font-bold">{COUPON_TYPES.find(t => t.value === item.type)?.label}</span>
                    </div>
                  </div>
                ))}
                {csvPreview.length > 20 && <p className="text-center text-xs text-gray-400 py-1">...還有 {csvPreview.length - 20} 組</p>}
              </div>
              <button onClick={() => runImport(csvPreview)} disabled={importing}
                className="w-full bg-[#27ae60] text-white py-4 rounded-2xl font-bold shadow-md disabled:opacity-50 flex items-center justify-center gap-2">
                {importing ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileUp className="w-5 h-5" />}
                {importing ? '匯入中...' : `確認匯入 ${csvPreview.length} 組`}
              </button>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
};

/* ─── Store Panel (wrapper with sub-nav) ────────────────────── */
export const StorePanel: React.FC<StorePanelProps> = ({ store, onBack, currentUserUid }) => {
  const [view, setView] = useState<StoreView>('menu');
  const [showQR, setShowQR] = useState(false);

  const menuItems = [
    { id: 'inventory' as StoreView, label: '庫存管理', icon: Package, color: 'text-blue-500' },
    { id: 'gift' as StoreView, label: '贈送優惠碼', icon: Gift, color: 'text-purple-500' },
    { id: 'stats' as StoreView, label: '抽獎統計', icon: BarChart2, color: 'text-orange-500' },
    { id: 'import' as StoreView, label: '批量匯入', icon: FileUp, color: 'text-teal-500' },
  ];

  const joinUrl = store.joinCode ? `${LIFF_URL}?join=${store.joinCode}` : null;
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
        {view === 'menu' && joinUrl && (
          <button onClick={() => setShowQR(true)}
            className="p-2 rounded-xl bg-[#f0fff4] text-[#27ae60] border border-green-100">
            <QrCode className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* QR Code Modal */}
      <AnimatePresence>
        {showQR && joinUrl && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6"
            onClick={() => setShowQR(false)}>
            <motion.div initial={{ scale: 0.85 }} animate={{ scale: 1 }}
              className="bg-white rounded-3xl p-8 shadow-2xl text-center max-w-xs w-full"
              onClick={e => e.stopPropagation()}>
              <p className="font-bold text-gray-900 mb-1">{store.name}</p>
              <p className="text-xs text-gray-400 mb-5">讓顧客掃描此 QR 碼加入抽獎資格</p>
              <div className="flex justify-center mb-4 p-3 bg-gray-50 rounded-2xl border border-gray-100">
                <QRCodeSVG value={joinUrl} size={200} fgColor="#1a1a1a" />
              </div>
              <p className="text-xs font-mono font-bold text-[#27ae60] bg-[#f0fff4] px-3 py-1.5 rounded-lg mb-4">
                驗證碼：{store.joinCode}
              </p>
              <button onClick={() => setShowQR(false)}
                className="w-full py-2.5 rounded-xl bg-gray-100 text-gray-600 text-sm font-bold">關閉</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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

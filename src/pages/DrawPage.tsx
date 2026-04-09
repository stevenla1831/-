import React, { useState, useEffect, useRef } from 'react';
import {
  collection, query, where, getDocs, addDoc, doc,
  orderBy, limit, runTransaction,
} from 'firebase/firestore';
import { Gift, Store as StoreIcon, AlertCircle, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Store, Coupon, DrawRecord, UserProfile } from '../types';
import { COUPON_TYPES, getISOWeekKey, weeklyDrawDocId } from '../constants';

/* ─── Slot Machine Animation ─────────────────────────────────── */
const SLOT_LABELS = ['100點', '50點', '20點', '100點', '50點', '20點'];

const SlotMachine: React.FC<{ running: boolean }> = ({ running }) => {
  const [index, setIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) {
      let i = 0;
      intervalRef.current = setInterval(() => {
        i = (i + 1) % SLOT_LABELS.length;
        setIndex(i);
      }, 120);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running]);

  return (
    <div className="flex items-center justify-center gap-3 py-6">
      {[0, 1, 2].map((col) => (
        <motion.div
          key={col}
          animate={running ? { y: [-4, 4, -4] } : { y: 0 }}
          transition={running ? { duration: 0.3 + col * 0.05, repeat: Infinity, ease: 'easeInOut' } : {}}
          className="w-20 h-20 bg-white border-2 border-[#27ae60]/30 rounded-2xl flex items-center justify-center shadow-md overflow-hidden"
        >
          <AnimatePresence mode="popLayout">
            <motion.span
              key={`${col}-${index}`}
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -30, opacity: 0 }}
              transition={{ duration: 0.1 }}
              className="text-sm font-black text-[#27ae60]"
            >
              {SLOT_LABELS[(index + col) % SLOT_LABELS.length]}
            </motion.span>
          </AnimatePresence>
        </motion.div>
      ))}
    </div>
  );
};

/* ─── Result Card ─────────────────────────────────────────────── */
const ResultCard: React.FC<{ coupon: Coupon; storeName: string; onBack: () => void }> = ({
  coupon, storeName, onBack,
}) => {
  const [showQR, setShowQR] = useState(false);
  const typeLabel = COUPON_TYPES.find(t => t.value === coupon.type)?.label ?? '';

  return (
    <motion.div
      initial={{ scale: 0.85, opacity: 0, y: 20 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      className="bg-white p-8 rounded-3xl shadow-2xl border-2 border-[#27ae60] text-center relative overflow-hidden"
    >
      {/* Confetti strip */}
      <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-[#27ae60] via-[#f39c12] to-[#2ecc71]" />

      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.2, type: 'spring', stiffness: 300 }}
      >
        <Sparkles className="w-16 h-16 text-[#f39c12] mx-auto mb-4" />
      </motion.div>

      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-2xl font-bold text-gray-900 mb-1"
      >
        恭喜中獎！
      </motion.h2>
      <p className="text-gray-400 text-sm mb-6">您獲得了「{storeName}」的 {typeLabel} 優惠券</p>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.4 }}
        className="bg-[#f0fff4] border-2 border-dashed border-[#27ae60] p-6 rounded-2xl mb-4"
      >
        <p className="text-xs text-[#27ae60] font-bold uppercase tracking-widest mb-2">專屬序號</p>
        <p className="text-4xl font-black text-[#e67e22] tracking-widest font-mono">{coupon.code}</p>
        <p className="text-xs text-gray-400 mt-2">{typeLabel}</p>
      </motion.div>

      {/* QR Code toggle */}
      <button
        onClick={() => setShowQR(v => !v)}
        className="text-xs text-[#27ae60] font-bold underline underline-offset-2 mb-4 block mx-auto"
      >
        {showQR ? '隱藏 QR Code' : '顯示 QR Code（到店掃描兌換）'}
      </button>

      <AnimatePresence>
        {showQR && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex justify-center mb-4"
          >
            <div className="p-3 bg-white border border-gray-100 rounded-2xl shadow-sm">
              <QRCodeSVG value={coupon.code} size={160} fgColor="#1a1a1a" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="text-xs text-gray-300 mb-6">請截圖保存，到店出示序號或 QR Code 即可兌換</p>

      <button
        onClick={onBack}
        className="text-[#27ae60] font-bold text-sm hover:underline"
      >
        返回抽獎首頁
      </button>
    </motion.div>
  );
};

/* ─── Main DrawPage ───────────────────────────────────────────── */
const DrawPage: React.FC<{ profile: UserProfile }> = ({ profile }) => {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [result, setResult] = useState<Coupon | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStores = async () => {
      try {
        const q = query(collection(db, 'stores'), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        setStores(snap.docs.map(d => ({ ...d.data(), id: d.id } as Store)));
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'stores');
      }
    };
    fetchStores();
  }, []);

  const handleDraw = async () => {
    if (!selectedStore) return;
    setDrawing(true);
    setAnimating(true);
    setError(null);

    const week = getISOWeekKey();
    const weekDocId = weeklyDrawDocId(profile.uid, selectedStore.id, week);

    try {
      const weeklyRef = doc(db, 'weeklyDraws', weekDocId);
      const availableQ = query(
        collection(db, 'coupons'),
        where('storeId', '==', selectedStore.id),
        where('status', '==', 'available'),
        limit(1)
      );
      const availableSnap = await getDocs(availableQ);

      if (availableSnap.empty) {
        setAnimating(false);
        setDrawing(false);
        setError('很抱歉，該店家的優惠券已全數抽完。');
        return;
      }

      const couponDocRef = availableSnap.docs[0].ref;
      let drawnCoupon: Coupon | null = null;

      await runTransaction(db, async (tx) => {
        const weeklySnap = await tx.get(weeklyRef);
        if (weeklySnap.exists()) throw new Error('WEEKLY_LIMIT');

        const couponSnap = await tx.get(couponDocRef);
        if (!couponSnap.exists() || couponSnap.data()?.status !== 'available') {
          throw new Error('COUPON_TAKEN');
        }

        const now = Date.now();
        drawnCoupon = {
          ...couponSnap.data(),
          id: couponSnap.id,
          status: 'assigned',
          userId: profile.uid,
          assignedAt: now,
        } as Coupon;

        tx.update(couponDocRef, { status: 'assigned', userId: profile.uid, assignedAt: now });
        tx.set(weeklyRef, {
          userId: profile.uid,
          storeId: selectedStore.id,
          week,
          couponId: couponSnap.id,
          drawnAt: now,
        });
      });

      const now = Date.now();
      const record: DrawRecord = {
        id: crypto.randomUUID(),
        userId: profile.uid,
        storeId: selectedStore.id,
        couponId: drawnCoupon!.id,
        week,
        timestamp: now,
        source: 'draw',
      };
      await addDoc(collection(db, 'drawRecords'), record);

      // Let slot machine spin for at least 1.5s for UX
      await new Promise(r => setTimeout(r, 1500));
      setAnimating(false);
      setResult(drawnCoupon);
    } catch (err: any) {
      setAnimating(false);
      if (err?.message === 'WEEKLY_LIMIT') {
        setError(`您本週（${week}）已在「${selectedStore.name}」抽過獎了，請下週再來！`);
      } else if (err?.message === 'COUPON_TAKEN') {
        setError('很遺憾，該序號剛被搶走了，請重試！');
      } else {
        handleFirestoreError(err, OperationType.WRITE, 'draw');
        setError('抽獎失敗，請稍後再試。');
      }
    } finally {
      setDrawing(false);
    }
  };

  if (animating) {
    return (
      <div className="p-6 pb-24 min-h-screen flex flex-col items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full bg-white rounded-3xl shadow-xl p-8 text-center border border-gray-100"
        >
          <h2 className="text-xl font-bold text-gray-900 mb-1">抽獎中...</h2>
          <p className="text-gray-400 text-sm mb-2">「{selectedStore?.name}」</p>
          <SlotMachine running={true} />
          <motion.div
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1, repeat: Infinity }}
            className="text-sm text-[#27ae60] font-bold mt-2"
          >
            命運的輪盤轉動中...
          </motion.div>
        </motion.div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="p-6 pb-24">
        <ResultCard
          coupon={result}
          storeName={selectedStore?.name ?? ''}
          onBack={() => { setResult(null); setError(null); }}
        />
      </div>
    );
  }

  return (
    <div className="p-6 pb-24">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">你好，{profile.displayName} 👋</h1>
        <p className="text-gray-500 text-sm">每週限抽一次，選擇店家後點擊抽獎</p>
      </header>

      <div className="space-y-5">
        {/* Store selection */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
            <StoreIcon className="w-4 h-4 text-[#27ae60]" />
            選擇店家
          </h2>
          <div className="space-y-2">
            {stores.map(store => {
              const inactive = store.isActive === false;
              return (
                <button
                  key={store.id}
                  onClick={() => { if (!inactive) { setSelectedStore(store); setError(null); } }}
                  disabled={inactive}
                  className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                    inactive
                      ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                      : selectedStore?.id === store.id
                      ? 'border-[#27ae60] bg-[#f0fff4]'
                      : 'border-gray-100 hover:border-gray-200'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-bold text-gray-900">{store.name}</p>
                      {store.description && <p className="text-xs text-gray-500 mt-0.5">{store.description}</p>}
                    </div>
                    {inactive && <span className="text-[10px] text-gray-400 font-bold shrink-0 ml-2">暫停中</span>}
                  </div>
                </button>
              );
            })}
            {stores.length === 0 && (
              <p className="text-center text-gray-300 py-6 text-sm">目前沒有活動中的店家</p>
            )}
          </div>
        </div>

        {/* Draw button */}
        <motion.button
          whileTap={selectedStore && !drawing ? { scale: 0.97 } : {}}
          disabled={!selectedStore || drawing}
          onClick={handleDraw}
          className={`w-full py-5 rounded-2xl font-bold text-lg shadow-lg transition-all flex items-center justify-center gap-3 ${
            !selectedStore || drawing
              ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
              : 'bg-[#27ae60] text-white hover:bg-[#219150] shadow-[0_8px_20px_rgba(39,174,96,0.3)]'
          }`}
        >
          {drawing ? (
            <><Loader2 className="w-6 h-6 animate-spin" /> 抽取中...</>
          ) : (
            <><Gift className="w-6 h-6" /> 點我抽獎</>
          )}
        </motion.button>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 bg-red-50 text-red-600 rounded-xl flex items-start gap-3 border border-red-100"
          >
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm font-medium">{error}</p>
          </motion.div>
        )}

        <p className="text-center text-xs text-gray-300">本週週期：{getISOWeekKey()}</p>
      </div>
    </div>
  );
};

export default DrawPage;

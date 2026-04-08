import React, { useState, useEffect } from 'react';
import {
  collection, query, where, getDocs, addDoc, doc, updateDoc,
  orderBy, limit, runTransaction,
} from 'firebase/firestore';
import { Gift, Store as StoreIcon, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Store, Coupon, DrawRecord, UserProfile } from '../types';
import { COUPON_TYPES, getISOWeekKey, weeklyDrawDocId } from '../constants';

const DrawPage: React.FC<{ profile: UserProfile }> = ({ profile }) => {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [drawing, setDrawing] = useState(false);
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
    setError(null);

    const week = getISOWeekKey();
    const weekDocId = weeklyDrawDocId(profile.uid, selectedStore.id, week);

    try {
      // Step 1: check if weekly draw already exists
      const weeklyRef = doc(db, 'weeklyDraws', weekDocId);

      // Step 2: find an available coupon (outside transaction for query capability)
      const availableQ = query(
        collection(db, 'coupons'),
        where('storeId', '==', selectedStore.id),
        where('status', '==', 'available'),
        limit(1)
      );
      const availableSnap = await getDocs(availableQ);

      if (availableSnap.empty) {
        setError('很抱歉，該店家的優惠券已全數抽完。');
        setDrawing(false);
        return;
      }

      const couponDocRef = availableSnap.docs[0].ref;
      let drawnCoupon: Coupon | null = null;

      // Step 3: transaction — check weekly limit + update coupon atomically
      await runTransaction(db, async (tx) => {
        const weeklySnap = await tx.get(weeklyRef);
        if (weeklySnap.exists()) {
          throw new Error('WEEKLY_LIMIT');
        }

        const couponSnap = await tx.get(couponDocRef);
        if (!couponSnap.exists() || couponSnap.data()?.status !== 'available') {
          throw new Error('COUPON_TAKEN');
        }

        const now = Date.now();
        drawnCoupon = { ...couponSnap.data(), id: couponSnap.id, status: 'assigned', userId: profile.uid, assignedAt: now } as Coupon;

        // Mark coupon as assigned
        tx.update(couponDocRef, { status: 'assigned', userId: profile.uid, assignedAt: now });

        // Record weekly draw
        tx.set(weeklyRef, {
          userId: profile.uid,
          storeId: selectedStore.id,
          week,
          couponId: couponSnap.id,
          drawnAt: now,
        });
      });

      // Step 4: write draw record (outside transaction, non-critical)
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

      setResult(drawnCoupon);
    } catch (err: any) {
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

  if (result) {
    return (
      <div className="p-6 pb-24">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white p-8 rounded-3xl shadow-xl border-2 border-[#27ae60] text-center relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-[#27ae60] to-[#2ecc71]" />
          <CheckCircle2 className="w-16 h-16 text-[#27ae60] mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">恭喜中獎！</h2>
          <p className="text-gray-500 mb-6">
            您獲得了「{selectedStore?.name}」的優惠券
          </p>

          <div className="bg-[#f0fff4] border-2 border-dashed border-[#27ae60] p-6 rounded-2xl mb-4">
            <p className="text-xs text-[#27ae60] font-bold uppercase tracking-widest mb-2">專屬序號</p>
            <p className="text-4xl font-black text-[#e67e22] tracking-widest">{result.code}</p>
            <p className="text-xs text-gray-400 mt-3">
              {COUPON_TYPES.find(t => t.value === result.type)?.label}
            </p>
          </div>

          <p className="text-xs text-gray-400 mb-8">請截圖保存，到店出示序號即可兌換</p>
          <button
            onClick={() => { setResult(null); setError(null); }}
            className="text-[#27ae60] font-bold text-sm hover:underline"
          >
            返回抽獎首頁
          </button>
        </motion.div>
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
            {stores.map(store => (
              <button
                key={store.id}
                onClick={() => { setSelectedStore(store); setError(null); }}
                className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                  selectedStore?.id === store.id
                    ? 'border-[#27ae60] bg-[#f0fff4]'
                    : 'border-gray-100 hover:border-gray-200'
                }`}
              >
                <p className="font-bold text-gray-900">{store.name}</p>
                {store.description && <p className="text-xs text-gray-500 mt-0.5">{store.description}</p>}
              </button>
            ))}
            {stores.length === 0 && (
              <p className="text-center text-gray-300 py-6 text-sm">目前沒有活動中的店家</p>
            )}
          </div>
        </div>

        {/* Draw button */}
        <button
          disabled={!selectedStore || drawing}
          onClick={handleDraw}
          className={`w-full py-5 rounded-2xl font-bold text-lg shadow-lg transition-all flex items-center justify-center gap-3 ${
            !selectedStore || drawing
              ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
              : 'bg-[#27ae60] text-white hover:bg-[#219150] active:scale-95 shadow-[0_8px_20px_rgba(39,174,96,0.3)]'
          }`}
        >
          {drawing ? (
            <><Loader2 className="w-6 h-6 animate-spin" /> 抽取中...</>
          ) : (
            <><Gift className="w-6 h-6" /> 點我抽獎</>
          )}
        </button>

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

        {/* Week info */}
        <p className="text-center text-xs text-gray-300">本週週期：{getISOWeekKey()}</p>
      </div>
    </div>
  );
};

export default DrawPage;

import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { Ticket, Loader2, QrCode, X, History, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Coupon, Store, UserProfile, DrawRecord } from '../types';
import { COUPON_TYPES } from '../constants';

const statusConfig = {
  assigned: { label: '待使用', bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-100' },
  used: { label: '已使用', bg: 'bg-gray-50', text: 'text-gray-400', border: 'border-gray-100' },
  available: { label: '可用', bg: 'bg-green-50', text: 'text-green-600', border: 'border-green-100' },
};

/* ─── QR Modal ────────────────────────────────────────────────── */
const QRModal: React.FC<{
  coupon: Coupon & { storeName?: string };
  onClose: () => void;
}> = ({ coupon, onClose }) => {
  const typeLabel = COUPON_TYPES.find(t => t.value === coupon.type)?.label ?? '';
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center px-4 pb-8"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        className="bg-white rounded-3xl p-8 w-full max-w-sm text-center shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-5">
          <div className="text-left">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{coupon.storeName}</p>
            <p className="font-bold text-gray-900">{typeLabel} 優惠券</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        <div className="flex justify-center mb-5">
          <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
            <QRCodeSVG value={coupon.code} size={180} fgColor="#1a1a1a" />
          </div>
        </div>
        <div className="bg-[#f0fff4] border border-green-100 rounded-2xl p-4 mb-4">
          <p className="text-xs text-[#27ae60] font-bold uppercase tracking-widest mb-1">序號</p>
          <p className="text-2xl font-black font-mono text-gray-900 tracking-widest">{coupon.code}</p>
        </div>
        <p className="text-xs text-gray-400">出示此 QR Code 或序號給店員掃描 / 輸入，即可兌換優惠</p>
      </motion.div>
    </motion.div>
  );
};

/* ─── Draw History ────────────────────────────────────────────── */
const DrawHistory: React.FC<{ profile: UserProfile }> = ({ profile }) => {
  const [records, setRecords] = useState<(DrawRecord & { storeName?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      try {
        const q = query(
          collection(db, 'drawRecords'),
          where('userId', '==', profile.uid),
          orderBy('timestamp', 'desc'),
          limit(50)
        );
        const snap = await getDocs(q);
        const raw = snap.docs.map(d => d.data() as DrawRecord);

        const storesSnap = await getDocs(collection(db, 'stores'));
        const storesMap = new Map(storesSnap.docs.map(d => [d.id, (d.data() as Store).name]));

        setRecords(raw.map(r => ({ ...r, storeName: storesMap.get(r.storeId) ?? '未知店家' })));
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'drawRecords');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [profile.uid]);

  if (loading) {
    return <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-300" /></div>;
  }

  if (records.length === 0) {
    return (
      <div className="text-center py-20">
        <History className="w-12 h-12 text-gray-200 mx-auto mb-4" />
        <p className="text-gray-400 text-sm">還沒有任何抽獎紀錄</p>
        <p className="text-gray-300 text-xs mt-1">快去抽獎吧！</p>
      </div>
    );
  }

  const displayed = showAll ? records : records.slice(0, 10);

  return (
    <div className="space-y-2">
      {displayed.map((r, i) => (
        <motion.div
          key={`${r.userId}-${r.timestamp}-${i}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.03 }}
          className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex justify-between items-center"
        >
          <div>
            <p className="font-bold text-gray-900 text-sm">{r.storeName}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {new Date(r.timestamp).toLocaleString('zh-TW', {
                month: 'numeric', day: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
              {' · '}週期 {r.week}
            </p>
          </div>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            r.source === 'gift'
              ? 'bg-purple-50 text-purple-500 border border-purple-100'
              : 'bg-green-50 text-green-600 border border-green-100'
          }`}>
            {r.source === 'gift' ? '贈送' : '抽獎'}
          </span>
        </motion.div>
      ))}

      {!showAll && records.length > 10 && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full py-3 text-xs font-bold text-gray-400 flex items-center justify-center gap-1 hover:text-gray-600"
        >
          <ChevronDown className="w-4 h-4" />
          顯示全部 {records.length} 筆紀錄
        </button>
      )}
    </div>
  );
};

/* ─── Main Page ───────────────────────────────────────────────── */
const MyCouponsPage: React.FC<{ profile: UserProfile }> = ({ profile }) => {
  const [coupons, setCoupons] = useState<(Coupon & { storeName?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [couponFilter, setCouponFilter] = useState<'all' | 'assigned' | 'used'>('all');
  const [pageTab, setPageTab] = useState<'coupons' | 'history'>('coupons');
  const [qrCoupon, setQrCoupon] = useState<(Coupon & { storeName?: string }) | null>(null);

  useEffect(() => {
    const fetchMyCoupons = async () => {
      try {
        const q = query(
          collection(db, 'coupons'),
          where('userId', '==', profile.uid),
          orderBy('assignedAt', 'desc')
        );
        const snap = await getDocs(q);
        const couponData = snap.docs.map(d => ({ ...d.data(), id: d.id } as Coupon));

        const storesSnap = await getDocs(collection(db, 'stores'));
        const storesMap = new Map(storesSnap.docs.map(d => [d.id, (d.data() as Store).name]));

        setCoupons(couponData.map(c => ({ ...c, storeName: storesMap.get(c.storeId) ?? '未知店家' })));
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'my-coupons');
      } finally {
        setLoading(false);
      }
    };
    fetchMyCoupons();
  }, [profile.uid]);

  const filtered = coupons.filter(c => couponFilter === 'all' || c.status === couponFilter);

  return (
    <>
      <div className="pb-24">
        {/* Header */}
        <div className="bg-white px-6 pt-5 pb-0 border-b border-gray-100 sticky top-0 z-10">
          <h1 className="text-xl font-bold text-gray-900 mb-3">我的優惠券</h1>

          {/* Page tabs */}
          <div className="flex border-b border-gray-100">
            {[
              { key: 'coupons', label: `優惠券 (${coupons.length})` },
              { key: 'history', label: '抽獎紀錄' },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setPageTab(tab.key as typeof pageTab)}
                className={`flex-1 py-2.5 text-sm font-bold transition-all border-b-2 ${
                  pageTab === tab.key
                    ? 'border-[#27ae60] text-[#27ae60]'
                    : 'border-transparent text-gray-400'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Coupon sub-filter (only when on coupons tab) */}
          {pageTab === 'coupons' && (
            <div className="flex gap-2 py-3">
              {[
                { key: 'all', label: `全部 (${coupons.length})` },
                { key: 'assigned', label: `待使用 (${coupons.filter(c => c.status === 'assigned').length})` },
                { key: 'used', label: `已使用 (${coupons.filter(c => c.status === 'used').length})` },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setCouponFilter(tab.key as typeof couponFilter)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                    couponFilter === tab.key
                      ? 'bg-[#27ae60] text-white'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-5">
          <AnimatePresence mode="wait">
            {pageTab === 'coupons' ? (
              <motion.div
                key="coupons"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                transition={{ duration: 0.15 }}
                className="space-y-3"
              >
                {loading && (
                  <div className="py-12 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-300" />
                  </div>
                )}

                {!loading && filtered.map(coupon => {
                  const cfg = statusConfig[coupon.status] ?? statusConfig.assigned;
                  const isUsed = coupon.status === 'used';
                  const canShowQR = coupon.status === 'assigned';
                  return (
                    <motion.div
                      key={coupon.id}
                      layout
                      className={`bg-white p-5 rounded-2xl border ${cfg.border} shadow-sm ${isUsed ? 'opacity-60' : ''}`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${cfg.text}`}>
                            {coupon.storeName}
                          </p>
                          <p className={`text-2xl font-black font-mono tracking-widest truncate ${isUsed ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                            {coupon.code}
                          </p>
                          <p className="text-xs text-gray-400 mt-1.5">
                            {COUPON_TYPES.find(t => t.value === coupon.type)?.label}
                            {coupon.assignedAt ? ` · 領取於 ${new Date(coupon.assignedAt).toLocaleDateString()}` : ''}
                            {coupon.usedAt ? ` · 使用於 ${new Date(coupon.usedAt).toLocaleDateString()}` : ''}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-2 ml-3 shrink-0">
                          <span className={`${cfg.bg} ${cfg.text} text-[10px] font-bold px-2.5 py-1 rounded-full border ${cfg.border}`}>
                            {cfg.label}
                          </span>
                          {canShowQR && (
                            <button
                              onClick={() => setQrCoupon(coupon)}
                              className="flex items-center gap-1 text-[10px] font-bold text-[#27ae60] bg-[#f0fff4] border border-green-100 px-2 py-1 rounded-full"
                            >
                              <QrCode className="w-3 h-3" />
                              出示 QR
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}

                {!loading && filtered.length === 0 && (
                  <div className="text-center py-20">
                    <Ticket className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                    <p className="text-gray-400 text-sm">
                      {couponFilter === 'all' ? '還沒有任何優惠券' : `沒有${statusConfig[couponFilter]?.label}的優惠券`}
                    </p>
                    <p className="text-gray-300 text-xs mt-1">快去抽獎吧！</p>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="history"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.15 }}
              >
                <DrawHistory profile={profile} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {qrCoupon && <QRModal coupon={qrCoupon} onClose={() => setQrCoupon(null)} />}
      </AnimatePresence>
    </>
  );
};

export default MyCouponsPage;

import React, { useState, useRef } from 'react';
import { Gift, Ticket, User, LayoutDashboard, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from './AuthContext';

import DrawPage from './pages/DrawPage';
import MyCouponsPage from './pages/MyCouponsPage';
import AdminDashboard from './pages/AdminDashboard';
import ProfilePage from './pages/ProfilePage';

/* ─── Loading Screen ─────────────────────────────────────────── */
const LoadingScreen = ({ message = '正在載入系統...' }) => (
  <div className="min-h-screen flex flex-col items-center justify-center bg-[#f8f9fa] p-4 text-center">
    <motion.div
      animate={{ rotate: 360 }}
      transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
      className="mb-4"
    >
      <Loader2 className="w-12 h-12 text-[#27ae60]" />
    </motion.div>
    <p className="text-gray-500 font-medium">{message}</p>
  </div>
);

/* ─── Login Screen ───────────────────────────────────────────── */
const LoginScreen = () => (
  <div className="min-h-screen flex items-center justify-center bg-[#f8f9fa] p-6">
    <div className="bg-white p-10 rounded-[40px] shadow-2xl max-w-sm w-full text-center border border-white">
      <div className="w-20 h-20 bg-[#f0fff4] rounded-3xl flex items-center justify-center mx-auto mb-8">
        <Gift className="w-10 h-10 text-[#27ae60]" />
      </div>
      <h1 className="text-3xl font-black text-gray-900 mb-3 tracking-tight">白日衣衫淨</h1>
      <p className="text-gray-400 leading-relaxed text-sm">正在透過 LINE 驗證身份，請稍候…</p>
    </div>
  </div>
);

/* ─── Bottom Navbar ──────────────────────────────────────────── */
const Navbar = ({
  activeTab,
  setActiveTab,
  role,
}: {
  activeTab: string;
  setActiveTab: (t: string) => void;
  role: string;
}) => {
  const tabs = [
    { id: 'draw', label: '抽獎', icon: Gift, roles: ['user', 'store', 'admin'] },
    { id: 'my-coupons', label: '我的優惠券', icon: Ticket, roles: ['user', 'store', 'admin'] },
    { id: 'admin', label: role === 'admin' ? '後台管理' : '店家管理', icon: LayoutDashboard, roles: ['admin', 'store'] },
    { id: 'profile', label: '個人資料', icon: User, roles: ['user', 'store', 'admin'] },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-2 flex justify-around items-center z-50 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] max-w-md mx-auto">
      {tabs
        .filter(t => t.roles.includes(role))
        .map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex flex-col items-center p-2 transition-colors ${
              activeTab === tab.id ? 'text-[#27ae60]' : 'text-gray-400'
            }`}
          >
            <tab.icon className={`w-6 h-6 ${activeTab === tab.id ? 'fill-[#27ae60]/10' : ''}`} />
            <span className="text-[10px] mt-1 font-medium">{tab.label}</span>
          </button>
        ))}
    </nav>
  );
};

/* ─── Main App ───────────────────────────────────────────────── */
export default function App() {
  const { profile, loading, isAuthReady } = useAuth();
  const [activeTab, setActiveTab] = useState('draw');
  // Track which tabs have been visited so we only mount them once
  const visitedTabs = useRef<Set<string>>(new Set(['draw']));

  const handleTabChange = (tab: string) => {
    visitedTabs.current.add(tab);
    setActiveTab(tab);
  };

  if (!isAuthReady || loading) return <LoadingScreen />;
  if (!profile) return <LoginScreen />;

  const adminPage = <AdminDashboard profile={profile} />;

  // Tabs are kept mounted after first visit; hidden via CSS to avoid remounting/refetch
  const tabs = [
    { id: 'draw', el: <DrawPage profile={profile} /> },
    { id: 'my-coupons', el: <MyCouponsPage profile={profile} /> },
    { id: 'admin', el: adminPage },
    { id: 'profile', el: <ProfilePage profile={profile} /> },
  ];

  return (
    <div className="min-h-screen bg-[#f8f9fa] font-sans text-gray-900 max-w-md mx-auto relative shadow-2xl">
      {tabs.map(({ id, el }) => {
        if (!visitedTabs.current.has(id)) return null;
        return (
          <div key={id} style={{ display: activeTab === id ? 'block' : 'none' }}>
            {el}
          </div>
        );
      })}
      <Navbar activeTab={activeTab} setActiveTab={handleTabChange} role={profile.role} />
    </div>
  );
}

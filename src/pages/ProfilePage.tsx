import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { Settings, LogOut, CheckCircle2, Phone, ChevronRight, Loader2, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';
import liff from '@line/liff';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { UserProfile } from '../types';
import { ROLES } from '../constants';

const ProfilePage: React.FC<{ profile: UserProfile }> = ({ profile }) => {
  const [editingPhone, setEditingPhone] = useState(false);
  const [phone, setPhone] = useState(profile.phoneNumber ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSavePhone = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', profile.uid), { phoneNumber: phone.trim() });
      setSaved(true);
      setEditingPhone(false);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${profile.uid}`);
    } finally {
      setSaving(false);
    }
  };

  const roleInfo = ROLES.find(r => r.value === profile.role);

  const roleColors: Record<string, string> = {
    admin: 'bg-red-50 text-red-600 border-red-100',
    store: 'bg-purple-50 text-purple-600 border-purple-100',
    user: 'bg-green-50 text-green-600 border-green-100',
  };

  return (
    <div className="p-6 pb-24 space-y-5">
      {/* Profile card */}
      <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 text-center">
        <div className="relative w-24 h-24 mx-auto mb-4">
          <img
            src={profile.photoURL || `https://ui-avatars.com/api/?name=${profile.displayName}&background=27ae60&color=fff`}
            alt=""
            className="w-full h-full rounded-full border-4 border-gray-50 object-cover"
          />
          <div className="absolute bottom-0 right-0 bg-[#27ae60] p-1.5 rounded-full border-2 border-white">
            <CheckCircle2 className="w-4 h-4 text-white" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-gray-900">{profile.displayName}</h2>
        <div className="flex justify-center mt-2 mb-1">
          <span className={`border text-xs font-bold px-3 py-1 rounded-full ${roleColors[profile.role]}`}>
            {roleInfo?.label ?? profile.role}
          </span>
        </div>
        <p className="text-[10px] text-gray-300 mt-2">UID: {profile.uid.slice(0, 20)}...</p>
      </div>

      {/* Phone binding */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded-lg">
              <Phone className="w-5 h-5 text-[#27ae60]" />
            </div>
            <div>
              <p className="font-bold text-gray-800 text-sm">手機號碼綁定</p>
              <p className="text-xs text-gray-400">
                {profile.phoneNumber ? profile.phoneNumber : '尚未綁定'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setEditingPhone(!editingPhone)}
            className="text-xs font-bold text-[#27ae60]"
          >
            {editingPhone ? '取消' : profile.phoneNumber ? '修改' : '綁定'}
          </button>
        </div>

        {editingPhone && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            className="px-5 pb-4 space-y-3 border-t border-gray-50"
          >
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="09XX-XXX-XXX"
              className="w-full mt-3 p-3 rounded-xl border border-gray-200 outline-none text-sm focus:ring-2 focus:ring-[#27ae60]"
            />
            <button
              onClick={handleSavePhone}
              disabled={saving || !phone.trim()}
              className="w-full bg-[#27ae60] text-white py-2.5 rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {saving ? '儲存中...' : '儲存'}
            </button>
          </motion.div>
        )}
      </div>

      {saved && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-green-50 border border-green-100 rounded-2xl p-4 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-500" />
          <p className="text-sm font-bold text-green-700">手機號碼已更新！</p>
        </motion.div>
      )}

      {/* Role info */}
      {profile.role !== 'user' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-3 mb-3">
            <ShieldCheck className="w-5 h-5 text-purple-500" />
            <p className="font-bold text-gray-800 text-sm">管理權限</p>
          </div>
          <p className="text-xs text-gray-500">
            {profile.role === 'admin'
              ? '您擁有系統管理員權限，可管理所有店家與帳號。'
              : `您擁有店家管理權限，負責管理 ${(profile.assignedStores ?? []).length} 間店家。`}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="space-y-2">
        <button
          onClick={() => liff.logout()}
          className="w-full bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between group hover:border-red-100 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-50 rounded-lg group-hover:bg-red-500 transition-colors">
              <LogOut className="w-5 h-5 text-red-500 group-hover:text-white transition-colors" />
            </div>
            <span className="font-bold text-gray-700 text-sm">登出系統</span>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-200" />
        </button>
      </div>

      <p className="text-center text-[10px] text-gray-200 pt-2">
        建立於 {new Date(profile.createdAt).toLocaleDateString()}
      </p>
    </div>
  );
};

export default ProfilePage;

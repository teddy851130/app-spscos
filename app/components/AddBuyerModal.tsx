'use client';

import { useState } from 'react';

interface AddBuyerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (buyer: any) => void;
}

export default function AddBuyerModal({ isOpen, onClose, onAdd }: AddBuyerModalProps) {
  const [form, setForm] = useState({
    company: '',
    website: '',
    region: 'GCC',
    tier: 'Tier 2',
    contact: '',
    title: '',
    email: '',
  });
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleChange = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    if (!form.company.trim()) return;
    setSaving(true);
    try {
      await onAdd(form);
      setForm({ company: '', website: '', region: 'GCC', tier: 'Tier 2', contact: '', title: '', email: '' });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-[#1e293b] border border-[#334155] rounded-xl p-6 w-[440px] max-w-[90vw] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-base font-bold text-[#f1f5f9] mb-4">바이어 수동 추가</div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-[#64748b] block mb-1">회사명 *</label>
            <input
              type="text"
              value={form.company}
              onChange={(e) => handleChange('company', e.target.value)}
              className="w-full bg-[#0f172a] border border-[#334155] text-[#e2e8f0] px-3 py-2 rounded text-xs"
              placeholder="예: Boutiqaat"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#64748b] block mb-1">리전</label>
              <select
                value={form.region}
                onChange={(e) => handleChange('region', e.target.value)}
                className="w-full bg-[#0f172a] border border-[#334155] text-[#e2e8f0] px-3 py-2 rounded text-xs"
              >
                <option value="GCC">GCC</option>
                <option value="USA">USA</option>
                <option value="Europe">Europe</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-[#64748b] block mb-1">Tier</label>
              <select
                value={form.tier}
                onChange={(e) => handleChange('tier', e.target.value)}
                className="w-full bg-[#0f172a] border border-[#334155] text-[#e2e8f0] px-3 py-2 rounded text-xs"
              >
                <option value="Tier 1">Tier 1</option>
                <option value="Tier 2">Tier 2</option>
                <option value="Tier 3">Tier 3</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-[#64748b] block mb-1">웹사이트</label>
            <input
              type="text"
              value={form.website}
              onChange={(e) => handleChange('website', e.target.value)}
              className="w-full bg-[#0f172a] border border-[#334155] text-[#e2e8f0] px-3 py-2 rounded text-xs"
              placeholder="https://"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#64748b] block mb-1">담당자명</label>
              <input
                type="text"
                value={form.contact}
                onChange={(e) => handleChange('contact', e.target.value)}
                className="w-full bg-[#0f172a] border border-[#334155] text-[#e2e8f0] px-3 py-2 rounded text-xs"
              />
            </div>
            <div>
              <label className="text-xs text-[#64748b] block mb-1">직책</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => handleChange('title', e.target.value)}
                className="w-full bg-[#0f172a] border border-[#334155] text-[#e2e8f0] px-3 py-2 rounded text-xs"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-[#64748b] block mb-1">이메일</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => handleChange('email', e.target.value)}
              className="w-full bg-[#0f172a] border border-[#334155] text-[#e2e8f0] px-3 py-2 rounded text-xs"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-5">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-transparent border border-[#334155] text-[#94a3b8] rounded-lg text-xs hover:bg-[#334155] transition"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={!form.company.trim() || saving}
            className="px-4 py-2 bg-[#3b82f6] text-white rounded-lg text-xs font-semibold hover:bg-[#2563eb] transition disabled:opacity-50"
          >
            {saving ? '저장 중...' : '추가'}
          </button>
        </div>
      </div>
    </div>
  );
}

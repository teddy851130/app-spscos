'use client';

import { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';

interface CSVUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (buyers: any[]) => void;
}

export default function CSVUploadModal({ isOpen, onClose, onImport }: CSVUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const parseCSV = (text: string) => {
    const lines = text.split('\n').filter((l) => l.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map((h) => h.trim().replace(/"/g, '').toLowerCase());
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((v) => v.trim().replace(/"/g, ''));
      const row: any = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] || '';
      });
      rows.push(row);
    }
    return rows;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setError('');

    try {
      const text = await f.text();
      const rows = parseCSV(text);
      setPreview(rows.slice(0, 5));
    } catch {
      setError('CSV 파일 파싱 실패');
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setError('');

    try {
      const text = await file.text();
      const rows = parseCSV(text);

      // tier 정규화: 공백 제거 후 DB enum과 일치시킴 (사용자 CSV에 "Tier 2" 같은 공백 포함 값 허용)
      const normalizeTier = (t: string) => {
        const cleaned = (t || '').replace(/\s+/g, '');
        return ['Tier1', 'Tier2', 'Tier3'].includes(cleaned) ? cleaned : 'Tier3';
      };
      const insertData = rows.map((row) => ({
        company_name: row.company || row.company_name || row['회사'] || '',
        website: row.website || row['웹사이트'] || '',
        region: row.region || row['리전'] || 'GCC',
        tier: normalizeTier(row.tier || row['티어'] || ''),
        contact_name: row.contact || row.contact_name || row['담당자'] || '',
        contact_title: row.title || row.contact_title || row['직책'] || '',
        contact_email: row.email || row.contact_email || row['이메일'] || '',
        // DB는 영어 enum만 허용 (schema.sql CHECK 제약)
        status: 'Cold',
      })).filter((d) => d.company_name);

      if (insertData.length === 0) {
        setError('유효한 바이어 데이터가 없습니다.');
        setImporting(false);
        return;
      }

      const { data, error: dbError } = await supabase
        .from('buyers')
        .insert(insertData)
        .select();

      if (dbError) {
        setError('DB 저장 실패: ' + dbError.message);
      } else {
        onImport(data || []);
        onClose();
      }
    } catch (err: any) {
      setError('임포트 실패: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-[#ffffff] border border-[#e3e8ee] rounded-xl p-6 w-[520px] max-w-[90vw] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-base font-bold text-[#1a1f36] mb-2">CSV 바이어 임포트</div>
        <p className="text-xs text-[#8792a2] mb-4">
          CSV 파일을 업로드하여 바이어를 일괄 추가합니다.
          필수 열: company (회사명). 선택: region, tier, contact, email
        </p>

        {/* File Upload */}
        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-[#e3e8ee] rounded-lg p-8 text-center cursor-pointer hover:border-[#635BFF] transition mb-4"
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            className="hidden"
          />
          {file ? (
            <div className="text-sm text-[#1a1f36]">{file.name} ({preview.length}+ 행)</div>
          ) : (
            <div className="text-xs text-[#8792a2]">CSV 파일을 클릭하여 선택하세요</div>
          )}
        </div>

        {/* Preview */}
        {preview.length > 0 && (
          <div className="bg-[#f6f8fa] border border-[#e3e8ee] rounded-lg p-3 mb-4 max-h-[200px] overflow-auto">
            <div className="text-xs font-semibold text-[#697386] mb-2">미리보기 (최대 5행)</div>
            {preview.map((row, i) => (
              <div key={i} className="text-xs text-[#8792a2] py-1 border-b border-[#e3e8ee] last:border-0">
                {Object.values(row).join(' | ')}
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="text-xs text-[#ef4444] mb-4 p-2 bg-[#ef4444]/10 rounded">{error}</div>
        )}

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-transparent border border-[#e3e8ee] text-[#697386] rounded-lg text-xs hover:bg-[#e3e8ee] transition"
          >
            취소
          </button>
          <button
            onClick={handleImport}
            disabled={!file || importing}
            className="px-4 py-2 bg-[#635BFF] text-white rounded-lg text-xs font-semibold hover:bg-[#5851DB] transition disabled:opacity-50"
          >
            {importing ? '임포트 중...' : '임포트 시작'}
          </button>
        </div>
      </div>
    </div>
  );
}

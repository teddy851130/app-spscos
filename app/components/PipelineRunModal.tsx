'use client';

interface PipelineRunModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PipelineRunModal({ isOpen, onClose }: PipelineRunModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-[#1e293b] border border-[#334155] rounded-xl p-6 w-[440px] max-w-[90vw] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-base font-bold text-[#f1f5f9] mb-2">파이프라인 실행</div>
        <p className="text-xs text-[#64748b] mb-5">
          GCC, USA, Europe 팀에 대해 직원 B~F 파이프라인을 순차 실행합니다.
          바이어 발굴은 CSV 업로드로 대체됐으며, 업로드된 buyers 데이터로 B부터 시작합니다.
        </p>

        <div className="space-y-2 mb-5">
          {[
            { step: 'B', label: '이메일 검증', desc: '이메일 주소 유효성 확인' },
            { step: 'C', label: '바이어 분석', desc: '바이어 적합성 분석' },
            { step: 'D', label: '이메일 초안', desc: '개인화 초안 생성' },
            { step: 'E', label: '스팸 테스트', desc: '스팸 점수 검사' },
            { step: 'F', label: '도메인·보고', desc: '도메인 상태 및 리포트' },
          ].map(({ step, label, desc }) => (
            <div key={step} className="flex items-center gap-3 p-2 bg-[#0f172a] rounded border border-[#334155]">
              <div className="w-6 h-6 rounded-full bg-[#334155] flex items-center justify-center text-white font-bold text-xs">
                {step}
              </div>
              <div className="flex-1">
                <div className="text-xs font-semibold text-[#e2e8f0]">{label}</div>
                <div className="text-xs text-[#64748b]">{desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-transparent border border-[#334155] text-[#94a3b8] rounded-lg text-xs hover:bg-[#334155] transition"
          >
            취소
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#3b82f6] text-white rounded-lg text-xs font-semibold hover:bg-[#2563eb] transition"
          >
            파이프라인 페이지로 이동
          </button>
        </div>
      </div>
    </div>
  );
}

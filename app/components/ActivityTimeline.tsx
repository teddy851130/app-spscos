'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  Mail,
  MessageSquare,
  ArrowRightLeft,
  StickyNote,
  Users,
  Package,
  Clock,
  Search as SearchIcon,
} from 'lucide-react';

// 활동 유형별 아이콘과 색상 매핑
const ACTIVITY_CONFIG: Record<string, { icon: typeof Mail; color: string; bg: string; label: string }> = {
  discovered:         { icon: SearchIcon,     color: 'text-blue-600',   bg: 'bg-blue-100',   label: '발굴' },
  email_sent:         { icon: Mail,           color: 'text-green-600',  bg: 'bg-green-100',  label: '메일 발송' },
  email_replied:      { icon: MessageSquare,  color: 'text-purple-600', bg: 'bg-purple-100', label: '회신' },
  status_change:      { icon: ArrowRightLeft, color: 'text-orange-600', bg: 'bg-orange-100', label: '상태 변경' },
  note:               { icon: StickyNote,     color: 'text-yellow-600', bg: 'bg-yellow-100', label: '메모' },
  meeting:            { icon: Users,          color: 'text-indigo-600', bg: 'bg-indigo-100', label: '미팅' },
  sample:             { icon: Package,        color: 'text-pink-600',   bg: 'bg-pink-100',   label: '샘플' },
  followup_scheduled: { icon: Clock,          color: 'text-gray-600',   bg: 'bg-gray-100',   label: '팔로업 예약' },
};

interface Activity {
  id: string;
  buyer_id: string;
  contact_id: string | null;
  activity_type: string;
  description: string | null;
  metadata: Record<string, unknown>;
  created_by: string;
  created_at: string;
}

interface ActivityTimelineProps {
  buyerId: string;
  // 선택: 컴포넌트 외부에서 새 활동이 추가되었을 때 리프레시 트리거
  refreshKey?: number;
}

/**
 * 바이어별 활동 타임라인 컴포넌트
 * - buyer_activities + email_logs를 합쳐서 시간순으로 표시
 * - 바이어 상세 패널이나 드로어에서 사용
 */
export default function ActivityTimeline({ buyerId, refreshKey }: ActivityTimelineProps) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!buyerId) return;

    async function fetchActivities() {
      setLoading(true);
      const { data, error } = await supabase
        .from('buyer_activities')
        .select('*')
        .eq('buyer_id', buyerId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('활동 이력 조회 실패:', error.message);
        setActivities([]);
      } else {
        setActivities(data ?? []);
      }
      setLoading(false);
    }

    fetchActivities();
  }, [buyerId, refreshKey]);

  // 날짜를 한국어 형식으로 변환 (4/13 월 14:30)
  function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    const weekday = weekdays[d.getDay()];
    return `${month}/${day} ${weekday} ${hours}:${minutes}`;
  }

  // 날짜 그룹핑 키 (2026-04-13 형식)
  function dateGroupKey(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  // 활동을 날짜별로 그룹핑
  function groupByDate(items: Activity[]): Map<string, Activity[]> {
    const groups = new Map<string, Activity[]>();
    for (const item of items) {
      const key = dateGroupKey(item.created_at);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }
    return groups;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-400">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-400 mr-2" />
        활동 이력 로딩 중...
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">아직 활동 이력이 없습니다</p>
      </div>
    );
  }

  const grouped = groupByDate(activities);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
        활동 이력 ({activities.length}건)
      </h3>

      {Array.from(grouped.entries()).map(([dateLabel, items]) => (
        <div key={dateLabel}>
          {/* 날짜 구분선 */}
          <div className="flex items-center gap-2 mb-2">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs text-gray-400 whitespace-nowrap">{dateLabel}</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          {/* 타임라인 아이템 */}
          <div className="space-y-1">
            {items.map((activity) => {
              const config = ACTIVITY_CONFIG[activity.activity_type] ?? ACTIVITY_CONFIG.note;
              const Icon = config.icon;

              return (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 py-2 px-2 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {/* 아이콘 */}
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full ${config.bg} flex items-center justify-center`}>
                    <Icon className={`w-4 h-4 ${config.color}`} />
                  </div>

                  {/* 내용 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium ${config.color} ${config.bg} px-1.5 py-0.5 rounded`}>
                        {config.label}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatDate(activity.created_at)}
                      </span>
                    </div>
                    {activity.description && (
                      <p className="text-sm text-gray-700 mt-0.5 line-clamp-2">
                        {activity.description}
                      </p>
                    )}
                    {/* 메타데이터 미리보기 (이메일 제목 등) */}
                    {(() => {
                      const subj = (activity.metadata as { subject?: string })?.subject;
                      return subj ? (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">
                          제목: {subj}
                        </p>
                      ) : null;
                    })()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

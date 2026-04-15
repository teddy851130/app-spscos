// SPS 공통 enum 매핑 헬퍼
// DB는 영어 enum만 허용(CHECK 제약), UI는 한국어로 표시.
// 여기서 모든 매핑을 중앙화하여 컴포넌트별 중복 정의를 제거한다.

// ============================================
// Status (buyers.status)
// ============================================
// DB enum: 'Cold' | 'Contacted' | 'Replied' | 'Bounced' | 'Interested' | 'Sample' | 'Deal' | 'Lost'
// 주의: 'Bounced'는 마이그레이션 004에서 추가되었고, 'Interested'/'Sample'/'Deal'/'Lost'는
//   현재 UI에서 한국어 라벨을 쓰지 않고 영어 그대로 표시한다.

export type BuyerStatus =
  | 'Cold' | 'Contacted' | 'Replied' | 'Bounced'
  | 'Interested' | 'Sample' | 'Deal' | 'Lost'
  | 'intel_failed';  // PR4: 직원 C가 인텔 품질 게이트 통과하지 못한 바이어

const STATUS_EN_TO_KO: Record<string, string> = {
  Cold: '미발송',
  Contacted: '발송완료',
  Replied: '회신받음',
  Bounced: '반송됨',
  intel_failed: '인텔 미달',
};

const STATUS_KO_TO_EN: Record<string, BuyerStatus> = {
  '미발송': 'Cold',
  '발송완료': 'Contacted',
  '회신받음': 'Replied',
  '반송됨': 'Bounced',
  '인텔 미달': 'intel_failed',
};

/**
 * DB 영어 status → 화면 표시용 한국어.
 * 매핑 없는 값(Interested/Sample/Deal/Lost 등)은 그대로 반환.
 * null/undefined/빈 문자열은 '미발송'으로 기본 처리.
 */
export function mapStatus(s: string | null | undefined): string {
  if (!s) return '미발송';
  // 이미 한국어가 들어온 경우 그대로
  if (STATUS_KO_TO_EN[s]) return s;
  return STATUS_EN_TO_KO[s] ?? s;
}

/**
 * 화면 한국어 status → DB INSERT/UPDATE용 영어 enum.
 * 매핑 없는 값은 그대로 반환 (Interested/Sample/Deal/Lost).
 */
export function reverseMapStatus(displayStatus: string): BuyerStatus | string {
  return STATUS_KO_TO_EN[displayStatus] ?? displayStatus;
}

// ============================================
// Tier (buyers.tier)
// ============================================
// DB enum: 'Tier1' | 'Tier2' | 'Tier3' (CHECK 제약 — 공백 없음)
// UI 표시: 'Tier 1' | 'Tier 2' | 'Tier 3' (공백 있음)

export type BuyerTier = 'Tier1' | 'Tier2' | 'Tier3';

/** DB tier → 화면 표시 (공백 추가) */
export function displayTier(t: string | null | undefined): string {
  if (!t) return '';
  if (t === 'Tier1') return 'Tier 1';
  if (t === 'Tier2') return 'Tier 2';
  if (t === 'Tier3') return 'Tier 3';
  return t;
}

/**
 * CSV/사용자 입력 tier 정규화.
 * '1', 'tier1', 'Tier 1', 1 모두 'Tier1'로. 모르면 'Tier2'(기본).
 */
export function normalizeTier(raw: string | number | null | undefined): BuyerTier {
  const t = (raw ?? '').toString().replace(/\s+/g, '').toLowerCase();
  if (t === 'tier1' || t === '1') return 'Tier1';
  if (t === 'tier2' || t === '2') return 'Tier2';
  if (t === 'tier3' || t === '3') return 'Tier3';
  return 'Tier2';
}

// ============================================
// Region / Team (buyers.region, buyers.team)
// ============================================
// DB enum: 'GCC' | 'USA' | 'Europe' (CHECK 제약)

export type BuyerRegion = 'GCC' | 'USA' | 'Europe';

/** CSV/사용자 입력 region/team 정규화. 모르면 'GCC'(기본). */
export function normalizeRegion(raw: string | null | undefined): BuyerRegion {
  const t = (raw ?? '').toString().trim().toLowerCase();
  if (t === 'gcc') return 'GCC';
  if (raw === '미국' || t === 'usa' || t === 'us' || t === 'america' || t === 'united states') return 'USA';
  if (raw === '유럽' || t === 'europe' || t === 'eu' || t === 'eur') return 'Europe';
  return 'GCC';
}

// ============================================
// Spam score (email_drafts.spam_score)
// ============================================
// DB 스케일: 1~10 (10=안전, 1=위험). 직원 E가 이 스케일로 저장.
// UI 표시 시 "낮을수록 위험"을 반영한 색상 레벨 필요.

export type SpamLevel = 'safe' | 'warning' | 'danger';

/**
 * spam_score → UI 레벨.
 *   >= 8 : safe   (초록/통과)
 *   5~7  : warning (주황/주의)
 *   <= 4 : danger  (빨강/위험)
 * null/undefined는 warning(불명 = 주의)로 기본 처리.
 */
export function spamLevel(score: number | null | undefined): SpamLevel {
  if (score == null) return 'warning';
  if (score >= 8) return 'safe';
  if (score >= 5) return 'warning';
  return 'danger';
}

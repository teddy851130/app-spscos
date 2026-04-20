---
name: 바이어 발굴 사전 중복 점검 의무
description: Apollo/Clay MCP로 새 바이어 CSV 생성 전, 반드시 Supabase buyers 테이블의 기존 도메인을 조회해서 중복을 사전에 제거할 것
type: feedback
originSessionId: aa970480-04ca-4a6a-a73a-b686db6dc218
---
새 바이어 CSV 생성 시 **회사 후보 선정 직후**, 반드시 Supabase `buyers` 테이블에서 기존 도메인 목록을 조회하여 중복을 검증한다. 후보 도메인이 기존과 겹치면 즉시 다른 후보로 교체 후 CSV 생성한다.

**Why:** 2026-04-20 첫 자동 발굴 시 Huda Beauty / Tarte / Beauty Pie 3곳이 이미 DB에 있던 회사와 중복됐고, Teddy가 "이런 일이 없어야 한다"고 명시. 파이프라인이 도메인 중복을 자동 스킵하긴 하지만 → 신규 발굴 슬롯이 낭비되고, 결국 약속한 "지역당 5곳"을 달성 못 함.

**How to apply:**
1. Apollo로 회사 후보군 확정 직후, 모든 후보 도메인을 모아 `mcp__supabase__execute_sql`로 `SELECT domain FROM buyers WHERE domain = ANY(ARRAY[...])` 실행
2. 매치되는 도메인은 후보에서 제외하고 추가 검색으로 슬롯 채움
3. People Enrich(크레딧 소모) 단계로 넘어가기 **전**에 중복 제거 완료
4. 도메인이 회사 사이트와 일치하지 않을 수 있으므로(예: tarte.com vs tartecosmetics.com), 회사명 기반 조회도 병행 권장

**관련 코드:** `app/components/Pipeline.tsx`의 CSV 업로드 핸들러는 도메인 기반으로 신규/기존 분기. 사전 점검은 Claude 측 책임.

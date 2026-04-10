-- ============================================
-- Migration 004: buyers.annual_revenue NUMERIC → TEXT
-- ============================================
-- CSV 원본의 범위 표기('$500M-1B', '$1B+' 등)를 그대로 저장하기 위해
-- NUMERIC 타입에서 TEXT로 변경한다.

ALTER TABLE buyers
  ALTER COLUMN annual_revenue TYPE TEXT
  USING annual_revenue::TEXT;

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

## 직원(에이전트) 스펙 — 상세 문서

현재 파이프라인: **B → C → F** (PR18/ADR-046 이후). 직원 D/E는 **배치 경로 삭제**, Buyers DB 수동 경로로 재정의됨.

- [직원 A — CSV 업로드 (발굴)](docs/agents/agent_a.md)
- [직원 B — ZeroBounce 이메일 유효성 검증](docs/agents/agent_b.md)
- [직원 C — Claude + Perplexity 기업 분석 (intel_score)](docs/agents/agent_c.md)
- [직원 D — 수동 초안 생성 (generate-draft)](docs/agents/agent_d.md)
- [직원 E — 수동 스팸 검증 (validate-draft)](docs/agents/agent_e.md)
- [직원 F — 시스템 모니터링 + 경고](docs/agents/agent_f.md)

전체 ADR 목록은 [docs/DECISIONS.md](docs/DECISIONS.md) 참조.

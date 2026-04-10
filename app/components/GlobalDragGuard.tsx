'use client';

import { useEffect } from 'react';

// 드롭존 외부에 파일을 떨어뜨렸을 때 브라우저가 파일을 새 탭에서 열어 SPA를 벗어나는 기본 동작 차단
export default function GlobalDragGuard() {
  useEffect(() => {
    const prevent = (e: DragEvent) => {
      e.preventDefault();
    };
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', prevent);
    return () => {
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', prevent);
    };
  }, []);

  return null;
}

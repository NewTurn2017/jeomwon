# 사이트 (jeomwon.codewithgenie.com)

jeomwon 마케팅 랜딩페이지. 순수 정적 — 빌드 스텝 없음.

- `DESIGN.md` — 디자인 브리프(Craft Read, 토큰, 확정 카피, 수용 기준). 변경 전 먼저 읽을 것.
- `index.html` / `style.css` / `main.js` / `assets/`

로컬 확인:

```bash
cd site && python3 -m http.server 8899
```

배포: Vercel(정적, root=`site/`). `main` 푸시 시 자동 배포.

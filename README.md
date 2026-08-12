# Le Truc — 1:1 블러핑 카드게임

`rule.md`에 정의된 규칙을 웹에서 실시간 1:1로 플레이하는 온라인 카드게임.

## 구조 (모노레포)

```
packages/
  shared/   rule.md 를 코드로 구현한 게임 엔진 + 타입 + redact / availableActions (규칙 진실 소스는 rule.md)
  server/   Node + ws WebSocket 서버 — 방 코드 매칭, 서버 권위 상태, 액션 적용, 시점별 브로드캐스트
  client/   React + Vite — UI 렌더링 전용(규칙 재구현 없음), 서버가 준 availableActions 로만 조작
```

### 설계 원칙
1. **규칙 기준은 `rule.md`뿐** — `shared` 엔진은 그 구현물.
2. **서버 권위** — 모든 판정은 서버에서. 상대 손패·공개 전 카드는 클라이언트로 전송하지 않음.
3. **프런트는 규칙을 재구현하지 않음** — 서버가 내려준 "지금 가능한 행동"만 보고 UI 구성.

## 설치

```bash
npm install
```

## 실행 (개발)

두 개의 터미널에서:

```bash
# 1) WebSocket 게임 서버 (포트 8080)
npm run dev:server

# 2) 웹 클라이언트 (포트 5173)
npm run dev:client
```

브라우저 두 개(또는 다른 기기)에서 `http://localhost:5173` 접속 →
한쪽이 **새 게임 만들기**로 방 코드를 만들고, 다른 쪽이 그 코드로 **입장**하면 게임이 시작된다.

> 클라이언트가 다른 호스트의 서버에 붙어야 하면 `VITE_WS_URL` 환경변수로 지정한다.
> (기본값: `ws://<현재 호스트>:8080`)

## 테스트

```bash
npm test            # shared 엔진 단위 테스트 (rule.md 예시 기반, vitest)
```

## 배포 (Vercel + Railway)

WebSocket 서버는 상시 실행·인메모리 상태·서버측 타이머가 필요해 **서버리스(Vercel 함수)에 올릴 수 없다.**
따라서 **클라이언트는 Vercel(정적), 서버는 Fly.io(상시 실행 Node)** 로 나눠서 배포한다.
(Railway 설정 [`railway.json`](railway.json) 도 남겨두어 그쪽으로도 배포 가능.)

### 1) 서버 → Fly.io
루트에 [`Dockerfile`](Dockerfile) · [`fly.toml`](fly.toml) · [`.dockerignore`](.dockerignore) 가 있다. Fly는 원격 빌더로 빌드하므로 로컬 Docker 불필요.

```bash
# flyctl 설치 (PowerShell)
iwr https://fly.io/install.ps1 -useb | iex
# 새 터미널에서
fly auth login
fly launch --copy-config --no-deploy --name <전역-유일-이름> --region nrt
fly deploy --ha=false      # ⚠️ 반드시 머신 1개 (인메모리 상태)
fly scale count 1          # 혹시 여러 개면 1개로 고정
```

- 배포 후 주소: `https://<이름>.fly.dev` → 서버 접속용 `wss://<이름>.fly.dev`
- 확인: 브라우저로 `https://<이름>.fly.dev/health` → "Le Truc WebSocket 서버 실행 중" 표시
- `fly.toml` 은 유휴 시 머신 정지 → 접속 시 자동 기동(수 초). 항상 켜두려면 `auto_stop_machines = "off"`, `min_machines_running = 1` 로 변경.
- ⚠️ **머신은 반드시 1개.** 2개 이상이면 두 플레이어가 서로 다른 머신에 붙어 방을 공유하지 못한다.

### 2) 클라이언트 → Vercel
1. Vercel에서 **New Project → Import** 로 같은 저장소 선택.
2. 루트 [`vercel.json`](vercel.json) 이 빌드(`npm run build --workspace @le-truc/client`)·출력(`packages/client/dist`)을 지정한다.
3. **Environment Variables** 에 다음 추가 후 배포:
   - `VITE_WS_URL = wss://<railway-domain>`
4. 배포 완료 후 Vercel URL 접속 → **새 게임 만들기** → 상대가 코드로 입장.

### 주의
- `VITE_WS_URL` 를 안 넣으면 로컬 기본값(`ws://host:8080`)으로 붙으려다 실패한다. **반드시 설정.**
- 서버는 인메모리 상태라 **인스턴스 1개**만 (오토스케일 금지, `railway.json` 의 `numReplicas: 1`).
- 서버 코드/환경변수를 바꾸면 각각 재배포해야 반영된다.

## 게임 규칙 요약

- 32장 덱(2~6·조커 제외). 서열: **7 > 8 > A > K > Q > J > 10 > 9** (문양 무시, 같은 숫자는 무승부).
- 각 라운드 3장씩, 최대 3승부. 먼저 2승부 승리 시 라운드 승리.
- 승점은 라운드 시작 1점, 인상으로 최대 12점까지. 인상 응답은 수락/재인상/포기.
- 누적 **12점** 이상을 먼저 달성하면 최종 승리.

자세한 규칙은 [`rule.md`](./rule.md) 참고.

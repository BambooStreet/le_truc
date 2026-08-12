# Le Truc WebSocket 서버 (Fly.io 배포용).
# tsx 로 TypeScript 를 그대로 실행하므로 별도 빌드 단계가 없다.
FROM node:20-slim

WORKDIR /app

# 워크스페이스 매니페스트만 먼저 복사 → 의존성 레이어 캐시 최적화
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
COPY packages/client/package.json ./packages/client/

# 프로덕션 의존성만 설치 (server 런타임: tsx, ws, @le-truc/shared)
RUN npm ci --omit=dev

# 서버 실행에 필요한 소스만 복사 (client 소스는 불필요)
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/server ./packages/server

ENV PORT=8080
EXPOSE 8080

CMD ["npm", "run", "start", "--workspace", "@le-truc/server"]

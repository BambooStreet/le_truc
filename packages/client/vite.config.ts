import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // 배포(Vercel)가 저장소 루트의 dist 에서 산출물을 찾으므로 그리로 출력한다.
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },
  server: {
    host: true,
    port: 5173,
    strictPort: false,
  },
});

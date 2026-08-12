import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // 빌드 산출물은 packages/client/dist (기본값). Vercel Output Directory 도 이 경로로 설정.
  server: {
    host: true,
    port: 5173,
    strictPort: false,
  },
});

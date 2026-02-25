import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.DASHBOARD_PORT || 6000),
    host: true,
    proxy: {
      '/auth': {
        target: 'http://localhost:4001',
        changeOrigin: true,
      },
      '/api/me': {
        target: 'http://localhost:4001',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/webhooks': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:4000',
        ws: true,
      },
      ...(process.env.MOCK_JIRA === 'true'
        ? {
            '/mock-jira': {
              target: `http://localhost:${process.env.MOCK_JIRA_PORT || '3001'}`,
              changeOrigin: true,
              rewrite: (path: string) => path.replace(/^\/mock-jira/, ''),
            },
          }
        : {}),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});

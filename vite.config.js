import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/api/anthropic': {
        target: 'https://api.anthropic.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/anthropic/, ''),
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            proxyReq.removeHeader('origin');
            proxyReq.removeHeader('referer');
          });
        }
      }
    }
  }
});

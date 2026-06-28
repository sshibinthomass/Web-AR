import { defineConfig } from 'vitest/config';

const isGitHubPages = process.env.GITHUB_PAGES === 'true';

export default defineConfig({
  base: isGitHubPages ? '/Web-AR/' : '/',
  server: {
    host: '127.0.0.1',
    port: 5173,
    allowedHosts: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    allowedHosts: true,
  },
  test: {
    environment: 'jsdom',
  },
});

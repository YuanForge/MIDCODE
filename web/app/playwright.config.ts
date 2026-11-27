import { defineConfig, devices } from '@playwright/test'

const previewPort = process.env.PLAYWRIGHT_PREVIEW_PORT ?? '4303'
const baseURL = `http://127.0.0.1:${previewPort}`

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port ${previewPort}`,
    url: baseURL,
    reuseExistingServer: false,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})

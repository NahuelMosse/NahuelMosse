// Runs every spec of the ported components (au, ac, kk, mp, mu, arc) against their demo pages, served by ../serve.mjs
// on one port: MOTION_PORT (8871 by default). Run it from this folder: npx playwright test -c playwright.config.mjs
// Narrow it with the file or a title: `npx playwright test -c playwright.config.mjs kk.spec.mjs -g card-stack`.
// MOTION_CHROMIUM points at a browser binary when Playwright's own download is not the one installed.
import { defineConfig } from '@playwright/test';

const port = Number(process.env.MOTION_PORT ?? 8871);
// Three specs read their address from the environment instead of the config's baseURL.
process.env.MU_PORT = String(port);
process.env.AC_PORT = String(port);
process.env.AU_PORT = String(port);

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.mjs',
  retries: 0,
  workers: 4,
  timeout: 40_000,
  use: {
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    baseURL: `http://127.0.0.1:${port}`,
    launchOptions: process.env.MOTION_CHROMIUM ? { executablePath: process.env.MOTION_CHROMIUM } : {},
  },
  webServer: { command: `node ../serve.mjs ${port}`, url: `http://127.0.0.1:${port}/motion/tabs.html`, reuseExistingServer: true, cwd: import.meta.dirname },
});

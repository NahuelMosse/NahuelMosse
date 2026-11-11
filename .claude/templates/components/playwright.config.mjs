// Runs the component set's tests against its gallery and its standalone pages, served by serve.mjs on its own port.
import { defineConfig } from '@playwright/test';

const port = Number(process.env.GALLERY_PORT ?? 8702);
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.mjs',
  retries: 0,
  fullyParallel: true,
  // Many of these tests watch frames and springs: more browsers than the machine can feed starve each other's renderers.
  workers: 4,
  use: { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 },
  webServer: { command: `node serve.mjs ${port}`, url: `http://127.0.0.1:${port}/gallery.html`, reuseExistingServer: true, cwd: import.meta.dirname },
  expect: { toHaveScreenshot: { animations: 'disabled' } },
});

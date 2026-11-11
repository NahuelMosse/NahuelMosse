// Playwright is a peer dependency. Resolution order: PLAYWRIGHT_ROOT, the working directory, this package.
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MIN_PLAYWRIGHT } from './constants.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const PACKAGES = ['playwright', '@playwright/test', 'playwright-core'];

export const versionAtLeast = (version, min = MIN_PLAYWRIGHT) => {
  const [maj, mnr] = String(version).split('.').map((x) => parseInt(x, 10));
  return maj > min[0] || (maj === min[0] && mnr >= min[1]);
};

const isMissing = (e, name) => e?.code === 'MODULE_NOT_FOUND' && String(e.message).includes(`'${name}'`);

// Returns { chromium, version, from } or throws with the real reason.
export const loadPlaywright = (env = process.env, cwd = process.cwd()) => {
  const roots = [env.PLAYWRIGHT_ROOT, cwd, join(here, '..', '..', '..', '..')].filter(Boolean);
  for (const root of roots) {
    const req = createRequire(join(root, 'package.json'));
    for (const name of PACKAGES) {
      let mod;
      try { mod = req(name); } catch (e) {
        if (isMissing(e, name)) continue;
        throw new Error(`found ${name} under ${root} but it failed to load: ${e.message}`);
      }
      if (!mod?.chromium) continue;
      let version = null;
      try { version = req(`${name}/package.json`).version; } catch (e) { if (e?.code !== 'MODULE_NOT_FOUND' && e?.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw e; }
      if (version && !versionAtLeast(version)) throw new Error(`${name} ${version} under ${root} is too old: motion-audit needs Playwright >= ${MIN_PLAYWRIGHT.join('.')} (page.addInitScript returns the Disposable that removes the tracer from a page passed to audit())`);
      return { chromium: mod.chromium, version, from: root };
    }
  }
  throw new Error(`Playwright not found (looked in ${roots.join(', ')}): \`npm i -D playwright && npx playwright install chromium\`, or set PLAYWRIGHT_ROOT to a project that has it`);
};

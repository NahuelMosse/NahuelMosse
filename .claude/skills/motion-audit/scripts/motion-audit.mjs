#!/usr/bin/env node
// motion-audit <url|file> [options]   (see --help)
// Thin entry point: everything lives in ./lib. It always runs when executed, so it also works
// through a symlink or junction (no main-module guard to defeat).
import { main } from './lib/cli.mjs';

process.exitCode = await main(process.argv.slice(2));

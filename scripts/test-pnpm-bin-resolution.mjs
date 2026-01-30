#!/usr/bin/env node
/**
 * Enterprise-grade pnpm bin resolution test
 *
 * This script verifies that the ai-review binary is correctly configured and
 * would resolve properly when the package is installed. Since workspace packages
 * don't link their own bins to the workspace root, we test:
 *
 * 1. Static configuration validation (package.json bin field, shebang)
 * 2. Direct Node.js invocation of the entry point
 * 3. Packaged installation test (pnpm pack + install in temp dir)
 *
 * This approach is deterministic across Windows, macOS, and Linux.
 *
 * Exit codes:
 * - 0: All tests passed
 * - 1: Test failure
 * - 2: Environment/setup error
 *
 * @module test-pnpm-bin-resolution
 */

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  mkdtempSync,
  rmSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { platform, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '..');
const ROUTER_DIR = join(ROOT_DIR, 'router');

// ANSI colors for output (disabled on Windows cmd without ANSI support)
const supportsColor = process.stdout.isTTY && process.env.TERM !== 'dumb';
const colors = {
  reset: supportsColor ? '\x1b[0m' : '',
  green: supportsColor ? '\x1b[32m' : '',
  red: supportsColor ? '\x1b[31m' : '',
  yellow: supportsColor ? '\x1b[33m' : '',
  cyan: supportsColor ? '\x1b[36m' : '',
  dim: supportsColor ? '\x1b[2m' : '',
};

/**
 * Test result structure
 */
class TestResult {
  constructor() {
    /** @type {Array<{name: string, passed: boolean, message: string}>} */
    this.tests = [];
    this.startTime = Date.now();
  }

  pass(name, message = '') {
    this.tests.push({ name, passed: true, message });
    console.log(
      `  ${colors.green}✓${colors.reset} ${name}${message ? ` ${colors.dim}(${message})${colors.reset}` : ''}`
    );
  }

  fail(name, message) {
    this.tests.push({ name, passed: false, message });
    console.log(`  ${colors.red}✗${colors.reset} ${name}: ${message}`);
  }

  get passed() {
    return this.tests.filter((t) => t.passed).length;
  }

  get failed() {
    return this.tests.filter((t) => !t.passed).length;
  }

  get total() {
    return this.tests.length;
  }

  summary() {
    const elapsed = Date.now() - this.startTime;
    console.log('');
    if (this.failed === 0) {
      console.log(
        `${colors.green}All ${this.total} tests passed${colors.reset} ${colors.dim}(${elapsed}ms)${colors.reset}`
      );
    } else {
      console.log(
        `${colors.red}${this.failed}/${this.total} tests failed${colors.reset} ${colors.dim}(${elapsed}ms)${colors.reset}`
      );
    }
    return this.failed === 0;
  }
}

/**
 * Execute a command safely without shell injection risks.
 *
 * On Windows, .cmd/.bat files require explicit cmd.exe invocation.
 * We handle this by detecting the platform and invoking cmd.exe /c
 * with the command as a single string argument (no shell expansion).
 *
 * Security: Always uses shell: false to prevent shell injection.
 *
 * @param {string} command
 * @param {string[]} args
 * @param {object} options
 * @returns {{stdout: string, stderr: string, exitCode: number}}
 */
function execCommand(command, args = [], options = {}) {
  const isWindows = platform() === 'win32';
  let finalCommand = command;
  let finalArgs = args;

  // On Windows, commands like 'pnpm' are actually .cmd files that need
  // to be invoked via cmd.exe. We do this explicitly rather than using
  // shell: true, which would enable shell expansion and injection risks.
  if (isWindows && (command === 'pnpm' || command === 'node')) {
    // cmd.exe /c expects the command and args as a single parameter
    // We quote each argument to handle spaces safely
    const quotedArgs = args.map((arg) => (arg.includes(' ') ? `"${arg}"` : arg));
    finalCommand = process.env.ComSpec || 'cmd.exe';
    finalArgs = ['/c', command, ...quotedArgs];
  }

  const result = spawnSync(finalCommand, finalArgs, {
    cwd: options.cwd || ROOT_DIR,
    encoding: 'utf8',
    shell: false, // Security: Never use shell to prevent injection
    timeout: 60000, // 60 second timeout for pack/install operations
    env: { ...process.env, ...options.env },
    // On Windows, hide the cmd.exe window
    windowsHide: true,
  });

  return {
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
    exitCode: result.status ?? -1,
  };
}

/**
 * Get expected binary name based on platform
 * @returns {{binary: string, extension: string}}
 */
function getBinaryInfo() {
  const isWindows = platform() === 'win32';
  return {
    binary: isWindows ? 'ai-review.cmd' : 'ai-review',
    extension: isWindows ? '.cmd' : '',
  };
}

/**
 * Verify router package.json bin configuration
 * @param {TestResult} results
 * @returns {boolean}
 */
function verifyPackageJsonBin(results) {
  const pkgPath = join(ROUTER_DIR, 'package.json');

  if (!existsSync(pkgPath)) {
    results.fail('package-json-exists', `Router package.json not found at ${pkgPath}`);
    return false;
  }

  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

  // Verify bin field exists and is correctly configured
  if (!pkg.bin) {
    results.fail('bin-field', 'Missing "bin" field in router/package.json');
    return false;
  }

  if (!pkg.bin['ai-review']) {
    results.fail('bin-ai-review', 'Missing "ai-review" entry in bin field');
    return false;
  }

  if (pkg.bin['ai-review'] !== 'dist/main.js') {
    results.fail('bin-target', `Expected bin target "dist/main.js", got "${pkg.bin['ai-review']}"`);
    return false;
  }

  results.pass('package-json-bin', 'bin.ai-review = dist/main.js');

  // Verify the target file exists (requires build)
  const targetPath = join(ROUTER_DIR, 'dist', 'main.js');
  if (!existsSync(targetPath)) {
    results.fail('bin-target-exists', `Bin target does not exist: ${targetPath}`);
    return false;
  }

  results.pass('bin-target-exists', targetPath);

  // Verify the target has shebang
  const targetContent = readFileSync(targetPath, 'utf8');
  if (!targetContent.startsWith('#!/usr/bin/env node')) {
    results.fail('bin-shebang', 'Bin target missing #!/usr/bin/env node shebang');
    return false;
  }

  results.pass('bin-shebang', '#!/usr/bin/env node');

  return true;
}

/**
 * Verify pnpm workspace configuration
 * @param {TestResult} results
 * @returns {boolean}
 */
function verifyWorkspaceConfig(results) {
  const workspacePath = join(ROOT_DIR, 'pnpm-workspace.yaml');

  if (!existsSync(workspacePath)) {
    results.fail('workspace-exists', 'pnpm-workspace.yaml not found');
    return false;
  }

  const content = readFileSync(workspacePath, 'utf8');
  if (!content.includes('router')) {
    results.fail('workspace-router', 'Workspace does not include router package');
    return false;
  }

  results.pass('workspace-config', 'router included in workspace');
  return true;
}

/**
 * Verify direct Node.js execution of the entry point
 * @param {TestResult} results
 * @returns {boolean}
 */
function verifyDirectNodeExecution(results) {
  const entryPoint = join(ROUTER_DIR, 'dist', 'main.js');

  // Test: node router/dist/main.js --version
  const versionResult = execCommand('node', [entryPoint, '--version']);

  if (versionResult.exitCode !== 0) {
    results.fail(
      'node-exec-version',
      `Exit code ${versionResult.exitCode}: ${versionResult.stderr}`
    );
    return false;
  }

  // Verify version output matches expected format (X.Y.Z)
  const versionMatch = versionResult.stdout.match(/^\d+\.\d+\.\d+$/);
  if (!versionMatch) {
    results.fail('version-format', `Unexpected version format: "${versionResult.stdout}"`);
    return false;
  }
  results.pass('node-exec-version', versionResult.stdout);

  // Test: node router/dist/main.js --help
  const helpResult = execCommand('node', [entryPoint, '--help']);

  if (helpResult.exitCode !== 0) {
    results.fail('node-exec-help', `Exit code ${helpResult.exitCode}: ${helpResult.stderr}`);
    return false;
  }

  // Verify help contains expected commands
  const helpOutput = helpResult.stdout;
  const expectedCommands = ['review', 'validate'];
  const missingCommands = expectedCommands.filter((cmd) => !helpOutput.includes(cmd));

  if (missingCommands.length > 0) {
    results.fail('help-commands', `Missing commands in help: ${missingCommands.join(', ')}`);
    return false;
  }
  results.pass('node-exec-help', 'Contains review and validate commands');

  return true;
}

/**
 * Verify binary linking via pack + install in isolated temp directory
 * This tests the actual bin resolution that users would experience
 * @param {TestResult} results
 * @returns {boolean}
 */
function verifyPackagedBinResolution(results) {
  let tempDir = null;

  try {
    // Create temp directory with prefix for easy identification
    tempDir = mkdtempSync(join(tmpdir(), 'ai-review-bin-test-'));
    results.pass('temp-dir-created', tempDir);

    // Pack the router package
    const packResult = execCommand('pnpm', ['pack', '--pack-destination', tempDir], {
      cwd: ROUTER_DIR,
    });

    if (packResult.exitCode !== 0) {
      results.fail('pnpm-pack', `Exit code ${packResult.exitCode}: ${packResult.stderr}`);
      return false;
    }

    // Find the tarball (filename varies based on package name/version)
    const files = readdirSync(tempDir);
    const tarball = files.find((f) => f.endsWith('.tgz'));

    if (!tarball) {
      results.fail('tarball-created', `No .tgz file found in ${tempDir}`);
      return false;
    }
    results.pass('pnpm-pack', tarball);

    // Initialize a minimal package.json in temp dir for pnpm install
    const minimalPkg = JSON.stringify(
      {
        name: 'bin-resolution-test',
        version: '1.0.0',
        private: true,
        dependencies: {
          '@odd-ai-reviewers/router': `file:./${tarball}`,
        },
      },
      null,
      2
    );

    writeFileSync(join(tempDir, 'package.json'), minimalPkg);

    // Install the package in the temp directory
    const installResult = execCommand('pnpm', ['install', '--ignore-scripts'], {
      cwd: tempDir,
    });

    if (installResult.exitCode !== 0) {
      results.fail('pnpm-install', `Exit code ${installResult.exitCode}: ${installResult.stderr}`);
      return false;
    }
    results.pass('pnpm-install', 'Package installed successfully');

    // Verify binary exists in node_modules/.bin
    const { binary } = getBinaryInfo();
    const binPath = join(tempDir, 'node_modules', '.bin', binary);

    if (!existsSync(binPath)) {
      results.fail('installed-binary-exists', `Binary not found at ${binPath}`);
      return false;
    }
    results.pass('installed-binary-exists', binPath);

    // Verify binary type (symlink on Unix, .cmd on Windows)
    const isWindows = platform() === 'win32';
    const stats = lstatSync(binPath);

    if (isWindows) {
      if (!stats.isFile()) {
        results.fail('installed-binary-type', 'Expected .cmd file on Windows');
        return false;
      }
      results.pass('installed-binary-type', 'Windows .cmd shim');
    } else {
      if (stats.isSymbolicLink()) {
        // Verify symlink points to correct target
        const realPath = realpathSync(binPath);
        if (!realPath.includes('dist/main.js')) {
          results.fail(
            'installed-binary-target',
            `Symlink resolves to ${realPath}, expected to contain dist/main.js`
          );
          return false;
        }
        results.pass('installed-binary-type', 'Unix symlink');
        results.pass('installed-binary-target', realPath);
      } else if (stats.isFile()) {
        // pnpm may create wrapper scripts instead of symlinks in some cases
        results.pass('installed-binary-type', 'Unix wrapper script');
      } else {
        results.fail('installed-binary-type', 'Expected symlink or file on Unix');
        return false;
      }
    }

    // Test execution via pnpm exec in temp directory
    const execResult = execCommand('pnpm', ['exec', 'ai-review', '--version'], {
      cwd: tempDir,
    });

    if (execResult.exitCode !== 0) {
      results.fail('installed-pnpm-exec', `Exit code ${execResult.exitCode}: ${execResult.stderr}`);
      return false;
    }

    const versionMatch = execResult.stdout.match(/^\d+\.\d+\.\d+$/);
    if (!versionMatch) {
      results.fail('installed-version-format', `Unexpected version: "${execResult.stdout}"`);
      return false;
    }
    results.pass('installed-pnpm-exec', `ai-review --version returned ${execResult.stdout}`);

    return true;
  } catch (err) {
    results.fail('packaged-bin-test', `Unexpected error: ${err.message}`);
    return false;
  } finally {
    // Cleanup temp directory
    if (tempDir && existsSync(tempDir)) {
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors (Windows may have file locks)
        console.log(`${colors.dim}Note: Could not clean up ${tempDir}${colors.reset}`);
      }
    }
  }
}

/**
 * Main test runner
 */
async function main() {
  console.log(`${colors.cyan}pnpm Bin Resolution Test${colors.reset}`);
  console.log(`${colors.dim}Platform: ${platform()}${colors.reset}`);
  console.log(`${colors.dim}Node: ${process.version}${colors.reset}`);
  console.log('');

  const results = new TestResult();

  // Pre-flight: Check pnpm is available
  console.log(`${colors.yellow}Pre-flight checks${colors.reset}`);
  const pnpmVersion = execCommand('pnpm', ['--version']);
  if (pnpmVersion.exitCode !== 0) {
    console.error(`${colors.red}ERROR: pnpm not available${colors.reset}`);
    process.exit(2);
  }
  results.pass('pnpm-available', `v${pnpmVersion.stdout}`);

  // Phase 1: Static configuration checks
  console.log('');
  console.log(`${colors.yellow}Configuration validation${colors.reset}`);
  verifyWorkspaceConfig(results);
  const configValid = verifyPackageJsonBin(results);

  if (!configValid) {
    console.log('');
    console.log(
      `${colors.red}Configuration validation failed - skipping execution tests${colors.reset}`
    );
    results.summary();
    process.exit(1);
  }

  // Phase 2: Direct Node.js execution
  console.log('');
  console.log(`${colors.yellow}Direct execution verification${colors.reset}`);
  verifyDirectNodeExecution(results);

  // Phase 3: Packaged installation test (the real bin resolution test)
  console.log('');
  console.log(`${colors.yellow}Packaged binary resolution (isolated install)${colors.reset}`);
  await verifyPackagedBinResolution(results);

  // Summary
  const success = results.summary();
  process.exit(success ? 0 : 1);
}

// Run tests
main().catch((err) => {
  console.error(`${colors.red}Fatal error: ${err.message}${colors.reset}`);
  process.exit(2);
});

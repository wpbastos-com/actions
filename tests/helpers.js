const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const script = rel => require(path.join(ROOT, rel));

// Stand-in for the `core` object actions/github-script injects
const fakeCore = () => {
  const out = { outputs: {}, env: {}, failed: null, warnings: [], errors: [], info: [], summary: '' };
  const core = {
    info: m => out.info.push(String(m)),
    warning: m => out.warnings.push(String(m)),
    error: m => out.errors.push(String(m)),
    startGroup() {}, endGroup() {},
    setFailed: m => { out.failed = String(m); },
    setOutput: (k, v) => { out.outputs[k] = v; },
    exportVariable: (k, v) => { out.env[k] = v; },
    summary: { addRaw(s) { out.summary += s; return this; }, async write() {} }
  };
  return { core, out };
};

// Minimal @actions/exec stand-in on top of child_process.spawn, so the
// scripts can be driven against a real terraform binary outside Actions.
const run = (cmd, args, opts = {}) => new Promise((resolve, reject) => {
  const child = spawn(cmd, args, { cwd: opts.cwd, env: { ...process.env, ...opts.env } });
  let stdout = '', stderr = '';
  child.stdout.on('data', c => { stdout += c; opts.listeners?.stdout?.(c); if (!opts.silent) process.stdout.write(c); });
  child.stderr.on('data', c => { stderr += c; opts.listeners?.stderr?.(c); if (!opts.silent) process.stderr.write(c); });
  child.on('error', reject);
  child.on('close', exitCode => {
    if (exitCode !== 0 && !opts.ignoreReturnCode) {
      return reject(new Error(`${cmd} ${args.join(' ')} exited with ${exitCode}`));
    }
    resolve({ exitCode, stdout, stderr });
  });
});
const localExec = {
  getExecOutput: run,
  exec: async (cmd, args, opts) => (await run(cmd, args, opts)).exitCode
};

const withEnv = async (vars, fn) => {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) { saved[k] = process.env[k]; process.env[k] = v; }
  try { return await fn(); } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
};

module.exports = { ROOT, script, fakeCore, localExec, withEnv };

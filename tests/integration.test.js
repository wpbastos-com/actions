// Drives the terraform-run / terraform-plan-extract / terraform-command
// scripts against a real terraform binary. Skipped when terraform is absent.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { script, fakeCore, localExec, withEnv } = require('./helpers');

const hasTerraform = spawnSync('terraform', ['version']).status === 0;

test('terraform-run → plan-extract → apply → command end to end', { skip: !hasTerraform && 'terraform not installed' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tfrun-'));
  fs.cpSync(path.join(__dirname, 'fixtures', 'terraform'), dir, { recursive: true });
  const env = { WORKING_DIR: dir, TF_IN_AUTOMATION: '1' };
  const run = (rel, extra, exec = localExec) => {
    const r = fakeCore();
    return withEnv({ ...env, ...extra }, () => script(rel)({ core: r.core, exec })).then(() => r.out);
  };

  let out = await run('terraform-run/scripts/fmt.js', { FAIL_ON_FMT_ERROR: 'true' });
  assert.equal(out.outputs.outcome, 'success', out.failed);

  out = await run('terraform-run/scripts/init.js', { BACKEND_CONFIG: '', INIT_UPGRADE: 'false', INIT_RECONFIGURE: 'false' });
  assert.equal(out.outputs.outcome, 'success', out.failed);

  out = await run('terraform-run/scripts/validate.js', {});
  assert.equal(out.outputs.outcome, 'success', out.failed);

  out = await run('terraform-run/scripts/plan.js', { PLAN_FILE: 'tfplan', DESTROY: 'false', GENERATE_JSON: 'true', TARGET: '' });
  assert.equal(out.outputs.outcome, 'success', out.failed);
  assert.equal(out.outputs.exitcode, '2');
  assert.equal(out.outputs.has_changes, 'true');
  assert.match(fs.readFileSync(path.join(dir, 'plan-output.txt'), 'utf8'), /1 to add/);
  const json = JSON.parse(fs.readFileSync(path.join(dir, 'tfplan.json'), 'utf8'));
  assert.ok(Array.isArray(json.resource_changes));

  out = await run('terraform-plan-extract/scripts/extract.js', { ENVIRONMENT: 'test', PLAN_FILE: 'tfplan.json', PLAN_TYPE: 'apply', WRITE_SUMMARY: 'true' });
  assert.equal(out.outputs.add, '1');
  assert.equal(out.outputs.resources_to_add, 'terraform_data.example');

  out = await run('terraform-run/scripts/apply.js', { PLAN_FILE: 'tfplan', USE_PLAN_FILE: '', OUTPUT_FILE: 'apply-output.txt', PARALLELISM: '2' });
  assert.equal(out.outputs.outcome, 'success', out.failed);
  assert.match(fs.readFileSync(path.join(dir, 'apply-output.txt'), 'utf8'), /Apply complete/);

  out = await run('terraform-command/scripts/run-command.js', { COMMAND: 'output', OUTPUT_NAME: 'greeting' });
  assert.equal(out.outputs.outcome, 'success', out.failed);
  assert.match(fs.readFileSync(path.join(dir, 'command-output.txt'), 'utf8'), /hello/);

  // a failing command surfaces the exit code instead of crashing
  out = await run('terraform-command/scripts/run-command.js', { COMMAND: 'state-show', RESOURCE_ADDRESS: 'does.not_exist' });
  assert.equal(out.outputs.outcome, 'failure');
  assert.notEqual(out.outputs.exit_code, '0');

  // destroy plan: the resource counts as a destroy
  out = await run('terraform-run/scripts/plan.js', { PLAN_FILE: 'tfplan', DESTROY: 'true', GENERATE_JSON: 'true', TARGET: '' });
  assert.equal(out.outputs.exitcode, '2');
  out = await run('terraform-plan-extract/scripts/extract.js', { ENVIRONMENT: 'test', PLAN_FILE: 'tfplan.json', PLAN_TYPE: 'destroy', WRITE_SUMMARY: 'false' });
  assert.equal(out.outputs.summary, '1 resource(s) to destroy');
});

test('terraform-run plan handles >1 MB of output (no ENOBUFS)', async () => {
  // Fake terraform that prints 2 MB; the old spawnSync path crashed here.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tfbig-'));
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'terraform'), '#!/bin/sh\nhead -c 2097152 /dev/zero | tr "\\0" "x"\nexit 2\n', { mode: 0o755 });
  const { core, out } = fakeCore();
  const exec = {
    getExecOutput: (cmd, args, opts) => localExec.getExecOutput(cmd, args, { ...opts, silent: true, env: { PATH: `${bin}:${process.env.PATH}` } })
  };
  await withEnv({ WORKING_DIR: dir, PLAN_FILE: 'tfplan', DESTROY: 'false', GENERATE_JSON: 'false', TARGET: '' },
    () => script('terraform-run/scripts/plan.js')({ core, exec }));
  assert.equal(out.outputs.outcome, 'success');
  assert.equal(out.outputs.has_changes, 'true');
  assert.equal(fs.statSync(path.join(dir, 'plan-output.txt')).size, 2 * 1024 * 1024);
});

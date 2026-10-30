const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { script, fakeCore, withEnv } = require('./helpers');

test('terraform-plan-extract counts create/update/delete and lists addresses', async () => {
  const { core, out } = fakeCore();
  await withEnv({
    ENVIRONMENT: 'dev', WORKING_DIR: path.join(__dirname, 'fixtures'), PLAN_FILE: 'tfplan.json',
    PLAN_TYPE: 'apply', WRITE_SUMMARY: 'true', ACTOR: 'me', RUN_NUMBER: '7', RUN_URL: 'http://x'
  }, () => script('terraform-plan-extract/scripts/extract.js')({ core }));
  // replace (delete+create) counts once as add and once as destroy, like terraform's own summary
  assert.equal(out.outputs.add, '2');
  assert.equal(out.outputs.change, '1');
  assert.equal(out.outputs.destroy, '2');
  assert.equal(out.outputs.summary, '+2 to add, ~1 to change, -2 to destroy');
  assert.equal(out.outputs.has_changes, 'true');
  assert.equal(out.outputs.resources_to_add, 'a.new\nc.replaced');
  assert.equal(out.outputs.resources_to_destroy, 'c.replaced\nd.gone');
  assert.match(out.summary, /\| \+2 \| ~1 \| -2 \|/);
  assert.match(out.summary, /Triggered by: @me/);
});

test('terraform-plan-extract with a missing plan file reports no changes', async () => {
  const { core, out } = fakeCore();
  await withEnv({ ENVIRONMENT: 'dev', WORKING_DIR: os.tmpdir(), PLAN_FILE: 'nope.json', PLAN_TYPE: 'destroy', WRITE_SUMMARY: 'false' },
    () => script('terraform-plan-extract/scripts/extract.js')({ core }));
  assert.equal(out.outputs.summary, '0 resource(s) to destroy');
  assert.equal(out.outputs.has_changes, 'false');
  assert.equal(out.warnings.length, 1);
  assert.equal(out.summary, '');
});

test('terraform-summary fails when any step failed and honours plan-output-file', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tfsum-'));
  const planOut = path.join(dir, 'custom-plan.txt');
  fs.writeFileSync(planOut, 'Plan: 1 to add');
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    const { core, out } = fakeCore();
    const result = await withEnv({
      ENVIRONMENT: 'prod', WORKING_DIR: '/elsewhere', PLAN_OUTPUT_FILE: planOut,
      FMT_OUTCOME: 'success', INIT_OUTCOME: 'success', VALIDATE_OUTCOME: 'failure', PLAN_OUTCOME: 'success', PLAN_HAS_CHANGES: 'true'
    }, () => script('terraform-summary/scripts/summary.js')({ core }));
    assert.equal(result, 'failure');
    assert.equal(out.outputs['summary-file'], 'summary-prod.md');
    assert.match(out.summary, /\| Validate \| ❌ \|/);
    assert.match(out.summary, /Changes detected/);
    assert.match(out.summary, /Plan: 1 to add/);
    assert.ok(fs.existsSync(path.join(dir, 'summary-prod.md')));
  } finally {
    process.chdir(cwd);
  }
});

test('terraform-command validate-inputs rejects unknown command and missing args', async () => {
  const validate = script('terraform-command/scripts/validate-inputs.js');
  let r = fakeCore();
  await withEnv({ COMMAND: 'bogus', RESOURCE_ADDRESS: '', LOCK_ID: '', IMPORT_ID: '' }, () => validate({ core: r.core }));
  assert.equal(r.out.failed, 'Input validation failed');

  r = fakeCore();
  await withEnv({ COMMAND: 'import', RESOURCE_ADDRESS: 'a.b', LOCK_ID: '', IMPORT_ID: '' }, () => validate({ core: r.core }));
  assert.equal(r.out.errors.length, 1);

  r = fakeCore();
  await withEnv({ COMMAND: 'version', RESOURCE_ADDRESS: '', LOCK_ID: '', IMPORT_ID: '' }, () => validate({ core: r.core }));
  assert.equal(r.out.failed, null);
});

test('terraform-command builds argv arrays — inputs are never shell-interpreted', () => {
  const { buildArgs } = script('terraform-command/scripts/run-command.js');
  const evil = 'x"; echo pwned; "';
  assert.deepEqual(buildArgs('state-show', { RESOURCE_ADDRESS: evil }), ['state', 'show', '-no-color', evil]);
  assert.deepEqual(buildArgs('import', { RESOURCE_ADDRESS: 'a.b', IMPORT_ID: '/subs/1' }), ['import', '-no-color', 'a.b', '/subs/1']);
  assert.deepEqual(buildArgs('output', { OUTPUT_NAME: '' }), ['output', '-no-color']);
  assert.deepEqual(buildArgs('output', { OUTPUT_NAME: 'greeting' }), ['output', '-no-color', 'greeting']);
  assert.deepEqual(buildArgs('force-unlock', { LOCK_ID: 'abc' }), ['force-unlock', '-force', 'abc']);
  assert.throws(() => buildArgs('rm', {}));
});

test('terraform-run init passes backend-config as separate args', async () => {
  const calls = [];
  const exec = { getExecOutput: async (cmd, args) => { calls.push([cmd, args]); return { exitCode: 0, stdout: '', stderr: '' }; } };
  const { core, out } = fakeCore();
  await withEnv({ WORKING_DIR: '.', BACKEND_CONFIG: '-backend-config=key=a.tfstate\n  -backend-config=backend.hcl ', INIT_UPGRADE: 'true', INIT_RECONFIGURE: 'false' },
    () => script('terraform-run/scripts/init.js')({ core, exec }));
  assert.deepEqual(calls[0], ['terraform', ['init', '-input=false', '-no-color', '-upgrade', '-backend-config=key=a.tfstate', '-backend-config=backend.hcl']]);
  assert.equal(out.outputs.outcome, 'success');
});

test('terraform-run plan: exit code 2 is changes, 1 is failure, no null-status crash', async () => {
  const plan = script('terraform-run/scripts/plan.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tfplan-'));
  const mk = exitCode => ({ getExecOutput: async () => ({ exitCode, stdout: 'plan out', stderr: '' }) });

  let r = fakeCore();
  await withEnv({ WORKING_DIR: dir, PLAN_FILE: 'tfplan', DESTROY: 'false', GENERATE_JSON: 'false', TARGET: 'a.b, c.d' },
    () => plan({ core: r.core, exec: mk(2) }));
  assert.equal(r.out.outputs.has_changes, 'true');
  assert.equal(r.out.outputs.outcome, 'success');
  assert.equal(fs.readFileSync(path.join(dir, 'plan-output.txt'), 'utf8'), 'plan out');

  r = fakeCore();
  await withEnv({ WORKING_DIR: dir, PLAN_FILE: 'tfplan', DESTROY: 'false', GENERATE_JSON: 'true', TARGET: '' },
    () => plan({ core: r.core, exec: mk(1) }));
  assert.equal(r.out.outputs.outcome, 'failure');
  assert.match(r.out.failed, /exit code 1/);
  assert.ok(!fs.existsSync(path.join(dir, 'tfplan.json')), 'no JSON on failed plan');
});

test('terraform-run skip steps', async () => {
  let r = fakeCore();
  await script('terraform-run/scripts/skip.js')({ core: r.core });
  assert.deepEqual(r.out.outputs, { outcome: 'skipped' });
  r = fakeCore();
  await script('terraform-run/scripts/plan-skip.js')({ core: r.core });
  assert.deepEqual(r.out.outputs, { outcome: 'skipped', has_changes: 'false' });
});

test('setup-azure-terraform exports ARM_* via core.exportVariable', async () => {
  const { core, out } = fakeCore();
  await withEnv({ USE_OIDC: 'true', USE_AZUREAD: 'true', CLIENT_ID: 'c', TENANT_ID: 't', SUBSCRIPTION_ID: 's' },
    () => script('setup-azure-terraform/scripts/set-azure-env.js')({ core }));
  assert.deepEqual(out.env, { ARM_USE_OIDC: 'true', ARM_USE_AZUREAD: 'true', ARM_CLIENT_ID: 'c', ARM_TENANT_ID: 't', ARM_SUBSCRIPTION_ID: 's' });
});

test('cleanup-workflow-runs filters via API, deletes, and classifies 403 vs errors', async () => {
  const day = 24 * 60 * 60 * 1000;
  const old = d => new Date(Date.now() - d * day).toISOString();
  const runs = [
    { id: 1, run_number: 1, name: 'CI', created_at: old(40) },
    { id: 2, run_number: 2, name: 'CI', created_at: old(35) },
    { id: 3, run_number: 3, name: 'Deploy', created_at: old(31) },
    { id: 4, run_number: 4, name: 'Deploy', created_at: old(1) } // API shouldn't return this, but guard anyway
  ];
  let paginateArgs;
  const deleted = [];
  const github = {
    paginate: async (fn, args) => { paginateArgs = args; assert.equal(fn, github.rest.actions.listWorkflowRunsForRepo); return runs; },
    rest: { actions: {
      listWorkflowRunsForRepo: () => {},
      deleteWorkflowRun: async ({ run_id }) => {
        if (run_id === 2) { const e = new Error('in progress'); e.status = 403; throw e; }
        if (run_id === 3) throw new Error('boom');
        deleted.push(run_id);
      }
    } }
  };
  const { core, out } = fakeCore();
  await withEnv({ RETENTION_DAYS: '30' }, () =>
    script('cleanup-workflow-runs/scripts/cleanup.js')({ github, context: { repo: { owner: 'o', repo: 'r' } }, core }));
  assert.match(paginateArgs.created, /^<\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.equal(paginateArgs.per_page, 100);
  assert.deepEqual(deleted, [1]);
  assert.equal(out.outputs['total-deleted'], 1);
  assert.equal(out.outputs['total-skipped'], 1);
  assert.equal(out.outputs['total-errors'], 1);
  assert.match(out.summary, /\| Runs Deleted \| 1 \|/);
});

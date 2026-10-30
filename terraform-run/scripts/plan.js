const fs = require('fs');
const path = require('path');

module.exports = async ({ core, exec }) => {
  const workingDir = process.env.WORKING_DIR;
  const planFile = process.env.PLAN_FILE;
  const isDestroy = process.env.DESTROY === 'true';
  const generateJson = process.env.GENERATE_JSON === 'true';
  const targetInput = process.env.TARGET || '';

  // Parse targets (comma or newline separated)
  const targets = targetInput
    .split(/[,\n]/)
    .map(t => t.trim())
    .filter(t => t.length > 0);

  core.startGroup(`Terraform Plan in ${workingDir}`);

  if (isDestroy) {
    core.info('Running destroy plan');
  }

  if (targets.length > 0) {
    core.info(`Targeting: ${targets.join(', ')}`);
  }

  // Run plan (detailed-exitcode: 0=no changes, 1=error, 2=changes).
  // exec streams output to the log and has no buffer limit, so a large plan
  // can't ENOBUFS the step (spawnSync/execSync cap at 1 MB by default).
  const { exitCode, stdout, stderr } = await exec.getExecOutput('terraform', [
    'plan',
    '-detailed-exitcode',
    '-input=false',
    '-no-color',
    ...(isDestroy ? ['-destroy'] : []),
    ...targets.map(t => `-target=${t}`),
    `-out=${planFile}`
  ], {
    cwd: workingDir,
    ignoreReturnCode: true
  });

  // Write output to file
  fs.writeFileSync(path.join(workingDir, 'plan-output.txt'), stdout + stderr);

  // Set outputs
  core.setOutput('exitcode', exitCode.toString());

  const hasChanges = exitCode === 2;
  core.setOutput('has_changes', hasChanges.toString());

  if (exitCode !== 0 && exitCode !== 2) {
    core.setOutput('outcome', 'failure');
    core.setFailed(`Terraform plan failed with exit code ${exitCode}`);
    core.endGroup();
    return;
  }

  core.setOutput('outcome', 'success');
  core.info(`Plan completed: exitcode=${exitCode}, has_changes=${hasChanges}`);

  // Generate JSON if requested for all successful plan runs
  if (generateJson) {
    core.info('Generating plan JSON...');
    // Stream `terraform show -json` straight to disk — never capture it into
    // a JS string. A large prod plan's JSON is several MB; silent so it
    // doesn't flood the step log either.
    const jsonFile = path.join(workingDir, `${planFile}.json`);
    const fd = fs.openSync(jsonFile, 'w');
    try {
      const showExit = await exec.exec('terraform', ['show', '-no-color', '-json', planFile], {
        cwd: workingDir,
        ignoreReturnCode: true,
        silent: true,
        listeners: {
          stdout: chunk => fs.writeSync(fd, chunk),
          stderr: chunk => core.error(chunk.toString())
        }
      });
      if (showExit === 0) {
        core.info(`Plan JSON generated successfully: ${jsonFile}`);
      } else {
        core.error(`Failed to generate JSON: terraform show exited with ${showExit}`);
      }
    } finally {
      fs.closeSync(fd);
    }
  }

  core.endGroup();
};

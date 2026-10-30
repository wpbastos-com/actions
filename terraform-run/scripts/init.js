module.exports = async ({ core, exec }) => {
  const workingDir = process.env.WORKING_DIR;
  const backendConfig = process.env.BACKEND_CONFIG || '';
  const initUpgrade = process.env.INIT_UPGRADE === 'true';
  const initReconfigure = process.env.INIT_RECONFIGURE === 'true';

  // Backend config: whitespace/newline separated flags, passed as separate
  // args (no shell) — e.g. "-backend-config=key=a.tfstate -backend-config=backend.hcl"
  const backendArgs = backendConfig.split(/\s+/).filter(a => a.length > 0);

  core.startGroup(`Terraform Init in ${workingDir}`);

  const args = ['init', '-input=false', '-no-color'];

  if (initUpgrade) {
    args.push('-upgrade');
    core.info('Using -upgrade flag');
  }

  if (initReconfigure) {
    args.push('-reconfigure');
    core.info('Using -reconfigure flag');
  }

  if (backendArgs.length > 0) {
    args.push(...backendArgs);
    core.info(`Using backend config: ${backendArgs.join(' ')}`);
  }

  core.info(`Running: terraform ${args.join(' ')}`);
  const { exitCode } = await exec.getExecOutput('terraform', args, {
    cwd: workingDir,
    ignoreReturnCode: true
  });

  if (exitCode === 0) {
    core.setOutput('outcome', 'success');
    core.info('Terraform init completed successfully');
  } else {
    core.setOutput('outcome', 'failure');
    core.setFailed(`Terraform init failed with exit code ${exitCode}`);
  }

  core.endGroup();
};

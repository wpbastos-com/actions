module.exports = async ({ core, exec }) => {
  const workingDir = process.env.WORKING_DIR;

  core.startGroup(`Terraform Validate in ${workingDir}`);

  const { exitCode } = await exec.getExecOutput('terraform', ['validate', '-no-color'], {
    cwd: workingDir,
    ignoreReturnCode: true
  });

  if (exitCode === 0) {
    core.setOutput('outcome', 'success');
    core.info('Terraform validate passed');
  } else {
    core.setOutput('outcome', 'failure');
    core.setFailed(`Terraform validate failed with exit code ${exitCode}`);
  }

  core.endGroup();
};

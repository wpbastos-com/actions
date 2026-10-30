module.exports = async ({ core, exec }) => {
  const workingDir = process.env.WORKING_DIR;
  const failOnFmtError = process.env.FAIL_ON_FMT_ERROR === 'true';

  core.startGroup(`Terraform Format Check in ${workingDir}`);

  const { exitCode } = await exec.getExecOutput('terraform', ['fmt', '-check', '-recursive'], {
    cwd: workingDir,
    ignoreReturnCode: true
  });

  if (exitCode === 0) {
    core.setOutput('outcome', 'success');
    core.info('Terraform format check passed');
  } else {
    core.setOutput('outcome', 'failure');
    const message = 'Terraform files need formatting. Run: terraform fmt -recursive';
    if (failOnFmtError) {
      core.setFailed(message);
    } else {
      core.warning(message);
    }
  }

  core.endGroup();
};

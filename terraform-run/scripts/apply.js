const fs = require('fs');
const path = require('path');

module.exports = async ({ core, exec }) => {
  const workingDir = process.env.WORKING_DIR;
  const defaultPlanFile = process.env.PLAN_FILE;
  const usePlanFile = process.env.USE_PLAN_FILE;
  const outputFile = process.env.OUTPUT_FILE;
  const parallelism = process.env.PARALLELISM;

  // Use provided plan file or default
  const planFile = usePlanFile || defaultPlanFile;

  core.startGroup(`Terraform Apply in ${workingDir}`);

  core.info(`Applying plan: ${planFile}`);

  const args = [
    'apply',
    '-input=false',
    '-auto-approve',
    '-no-color',
    ...(parallelism ? [`-parallelism=${parallelism}`] : []),
    planFile
  ];

  const { exitCode, stdout, stderr } = await exec.getExecOutput('terraform', args, {
    cwd: workingDir,
    ignoreReturnCode: true
  });

  // Write output to file
  fs.writeFileSync(path.join(workingDir, outputFile), stdout + stderr);

  if (exitCode !== 0) {
    core.setOutput('outcome', 'failure');
    core.setFailed(`Terraform apply failed with exit code ${exitCode}`);
  } else {
    core.setOutput('outcome', 'success');
    core.info('Terraform apply completed successfully');
  }

  core.endGroup();
};

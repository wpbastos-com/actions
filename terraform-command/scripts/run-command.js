const fs = require('fs');
const path = require('path');

// Every command is an argv array — inputs are never interpolated into a
// shell string, so a crafted resource-address/import-id can't run commands.
const buildArgs = (command, env) => {
  switch (command) {
    case 'output':
      return ['output', '-no-color', ...(env.OUTPUT_NAME ? [env.OUTPUT_NAME] : [])];
    case 'state-list':
      return ['state', 'list'];
    case 'state-show':
      return ['state', 'show', '-no-color', env.RESOURCE_ADDRESS];
    case 'refresh':
      return ['refresh', '-no-color'];
    case 'force-unlock':
      return ['force-unlock', '-force', env.LOCK_ID];
    case 'import':
      return ['import', '-no-color', env.RESOURCE_ADDRESS, env.IMPORT_ID];
    case 'providers':
      return ['providers'];
    case 'version':
      return ['version'];
    default:
      throw new Error(`Unknown command: ${command}`);
  }
};

module.exports = async ({ core, exec }) => {
  const workingDir = process.env.WORKING_DIR;
  const command = process.env.COMMAND;
  const outputFile = path.join(workingDir, 'command-output.txt');

  core.startGroup(`Terraform ${command}`);

  const args = buildArgs(command, process.env);
  core.info(`Running: terraform ${args.join(' ')}`);

  const { exitCode, stdout, stderr } = await exec.getExecOutput('terraform', args, {
    cwd: workingDir,
    ignoreReturnCode: true
  });

  fs.writeFileSync(outputFile, stdout + stderr);
  core.setOutput('exit_code', exitCode.toString());

  if (exitCode === 0) {
    core.setOutput('outcome', 'success');
  } else {
    core.setOutput('outcome', 'failure');
    core.setFailed(`Terraform ${command} failed with exit code ${exitCode}`);
  }

  core.endGroup();
};

module.exports.buildArgs = buildArgs;

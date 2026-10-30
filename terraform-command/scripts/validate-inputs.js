module.exports = async ({ github, context, core }) => {
  const command = process.env.COMMAND;
  const resource = process.env.RESOURCE_ADDRESS;
  const lockId = process.env.LOCK_ID;
  const importId = process.env.IMPORT_ID;

  const validCommands = ['output', 'state-list', 'state-show', 'refresh', 'force-unlock', 'import', 'providers', 'version'];

  core.startGroup('Validating Inputs');

  const errors = [];

  if (!validCommands.includes(command)) {
    errors.push(`Invalid command: ${command}. Valid commands: ${validCommands.join(', ')}`);
  }

  if (command === 'state-show' && !resource) {
    errors.push('Resource address is required for state-show command');
  }

  if (command === 'force-unlock' && !lockId) {
    errors.push('Lock ID is required for force-unlock command');
  }

  if (command === 'import') {
    if (!resource) {
      errors.push('Resource address is required for import command');
    }
    if (!importId) {
      errors.push('Azure resource ID is required for import command');
    }
  }

  if (errors.length > 0) {
    for (const error of errors) {
      core.error(error);
    }
    core.setFailed('Input validation failed');
  } else {
    core.info('Input validation passed');
  }

  core.endGroup();
};

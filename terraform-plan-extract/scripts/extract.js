module.exports = async ({ github, context, core }) => {
  const fs = require('fs');
  const env = process.env.ENVIRONMENT;
  const workingDir = process.env.WORKING_DIR;
  const planFileName = process.env.PLAN_FILE;
  const planType = process.env.PLAN_TYPE;

  const planFile = `${workingDir}/${planFileName}`;

  core.startGroup(`Extracting Plan Summary for ${env}`);
  core.info(`Plan file: ${planFile}`);
  core.info(`Plan type: ${planType}`);

  let add = 0, change = 0, destroy = 0;
  let hasChanges = false;
  let hasResources = false;
  const resourcesToAdd = [];
  const resourcesToChange = [];
  const resourcesToDestroy = [];

  if (fs.existsSync(planFile)) {
    try {
      const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
      const changes = plan.resource_changes || [];

      for (const resource of changes) {
        const actions = resource.change?.actions || [];
        const addr = resource.address;
        if (actions.includes('create')) {
          add++;
          resourcesToAdd.push(addr);
        }
        if (actions.includes('update')) {
          change++;
          resourcesToChange.push(addr);
        }
        if (actions.includes('delete')) {
          destroy++;
          resourcesToDestroy.push(addr);
        }
      }

      hasChanges = (add + change + destroy) > 0;
      hasResources = destroy > 0 || add > 0 || change > 0;

      core.info(`Resources to add: ${add}`);
      resourcesToAdd.forEach(r => core.info(`  + ${r}`));
      core.info(`Resources to change: ${change}`);
      resourcesToChange.forEach(r => core.info(`  ~ ${r}`));
      core.info(`Resources to destroy: ${destroy}`);
      resourcesToDestroy.forEach(r => core.info(`  - ${r}`));
    } catch (e) {
      core.warning(`Error parsing plan: ${e.message}`);
    }
  } else {
    core.warning('Plan file not found');
  }

  core.endGroup();

  // Build summary string
  let summary = '';
  if (planType === 'destroy') {
    summary = `${destroy} resource(s) to destroy`;
  } else {
    const parts = [];
    if (add > 0) parts.push(`+${add} to add`);
    if (change > 0) parts.push(`~${change} to change`);
    if (destroy > 0) parts.push(`-${destroy} to destroy`);
    summary = parts.length > 0 ? parts.join(', ') : 'No changes';
  }

  // Set outputs
  core.setOutput('summary', summary);
  core.setOutput('has_changes', hasChanges.toString());
  core.setOutput('has_resources', hasResources.toString());
  core.setOutput('add', add.toString());
  core.setOutput('change', change.toString());
  core.setOutput('destroy', destroy.toString());
  core.setOutput('resources_to_add', resourcesToAdd.join('\n'));
  core.setOutput('resources_to_change', resourcesToChange.join('\n'));
  core.setOutput('resources_to_destroy', resourcesToDestroy.join('\n'));

  // ----- Job summary (this action renders the entire plan summary) -----
  if ((process.env.WRITE_SUMMARY || 'true') === 'true') {
    const outcome = process.env.OUTCOME || 'success';
    const icon = outcome === 'success' ? '✅' : '❌';
    const heading = planType === 'destroy' ? 'Terraform Plan (Destroy)' : 'Terraform Plan';
    const lines = [
      `## ${icon} ${heading}`,
      '',
      `**Environment:** ${env}`,
      `**Outcome:** ${outcome}`,
      '',
      '### Changes Summary',
      '',
      '| Add | Change | Destroy |',
      '|-----|--------|---------|',
      `| +${add} | ~${change} | -${destroy} |`,
      '',
      `**Details:** ${summary}`,
      ''
    ];

    // "Terraform plan output" — mirrors the "Extracting Plan Summary for
    // <env>" step log: plan file, plan type, and the per-resource
    // add/change/destroy breakdown (with addresses). Always shown.
    const planOutputLines = [
      `  Plan file: ${planFile}`,
      `  Plan type: ${planType}`,
      `  Resources to add: ${add}`,
      ...resourcesToAdd.map(a => `    + ${a}`),
      `  Resources to change: ${change}`,
      ...resourcesToChange.map(a => `    ~ ${a}`),
      `  Resources to destroy: ${destroy}`,
      ...resourcesToDestroy.map(a => `    - ${a}`)
    ];
    lines.push(
      '<details>',
      '<summary>📋 Terraform plan output</summary>',
      '',
      '```',
      ...planOutputLines,
      '```',
      '',
      '</details>',
      ''
    );

    if (process.env.ACTOR) {
      lines.push(`*Triggered by: @${process.env.ACTOR}*`);
    }
    if (process.env.RUN_URL) {
      lines.push(`*Run: [#${process.env.RUN_NUMBER || ''}](${process.env.RUN_URL})*`);
    }

    await core.summary.addRaw(lines.join('\n')).write();
  }
};

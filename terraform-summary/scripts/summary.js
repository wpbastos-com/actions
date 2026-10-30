module.exports = async ({ github, context, core }) => {
  const fs = require('fs');
  const env = process.env.ENVIRONMENT;
  const workingDir = process.env.WORKING_DIR;
  const planFile = process.env.PLAN_OUTPUT_FILE || `${workingDir}/plan-output.txt`;
  const fmtOutcome = process.env.FMT_OUTCOME;
  const initOutcome = process.env.INIT_OUTCOME;
  const validateOutcome = process.env.VALIDATE_OUTCOME;
  const planOutcome = process.env.PLAN_OUTCOME;
  const planHasChanges = process.env.PLAN_HAS_CHANGES === 'true';

  core.startGroup(`Creating validation summary for ${env}`);

  const icon = (outcome) => outcome === 'success' ? '✅' : '❌';

  let planStatus = '✅ No changes';
  if (planOutcome === 'skipped') planStatus = '⏭️ Skipped';
  else if (planOutcome === 'failure') planStatus = '❌ Error';
  else if (planHasChanges) planStatus = '⚠️ Changes detected';

  let summary = `## Environment: \`${env}\`\n\n`;
  summary += `| Step | Status |\n|------|--------|\n`;
  summary += `| Format | ${icon(fmtOutcome)} |\n`;
  summary += `| Init | ${icon(initOutcome)} |\n`;
  summary += `| Validate | ${icon(validateOutcome)} |\n`;
  summary += `| Plan | ${planStatus} |\n\n`;

  // Add plan output if available
  if (fs.existsSync(planFile)) {
    const planOutput = fs.readFileSync(planFile, 'utf8');
    const lines = planOutput.split('\n').slice(-100).join('\n');
    summary += `<details>\n<summary>Plan Output</summary>\n\n\`\`\`hcl\n${lines}\n\`\`\`\n</details>\n`;
  }

  // Write to job summary
  await core.summary.addRaw(summary).write();

  // Write to file for artifact
  const summaryFile = `summary-${env}.md`;
  fs.writeFileSync(summaryFile, summary);
  core.info(`Summary written to ${summaryFile}`);

  core.endGroup();

  // Determine overall result
  const failed = fmtOutcome === 'failure' || initOutcome === 'failure' ||
                validateOutcome === 'failure' || planOutcome === 'failure';
  const result = failed ? 'failure' : 'success';

  core.setOutput('summary-file', summaryFile);

  // Returned, not setOutput: github-script overwrites `result` with the
  // script's return value (see action.yml).
  return result;
};

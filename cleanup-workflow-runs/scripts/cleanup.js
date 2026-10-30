module.exports = async ({ github, context, core }) => {
  const retentionDays = parseInt(process.env.RETENTION_DAYS, 10);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  // API `created` filter takes search-style dates without milliseconds
  const cutoffQuery = cutoffDate.toISOString().replace(/\.\d{3}Z$/, 'Z');

  core.startGroup('Cleanup Configuration');
  core.info(`Retention days: ${retentionDays}`);
  core.info(`Cutoff date: ${cutoffDate.toISOString()}`);
  core.info(`Runs created before this date will be deleted`);
  core.endGroup();

  // Let the API do the date filtering and collect every page before deleting
  // (deleting while paginating shifts the remaining pages and skips runs).
  // A `created` search returns at most 1,000 runs, so re-query after each
  // batch until nothing new comes back.
  const listOldRuns = async () => {
    const runs = await github.paginate(github.rest.actions.listWorkflowRunsForRepo, {
      owner: context.repo.owner,
      repo: context.repo.repo,
      created: `<${cutoffQuery}`,
      per_page: 100
    });
    return runs.filter(run => new Date(run.created_at) < cutoffDate);
  };

  let totalDeleted = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  const attempted = new Set();

  for (let batch = 1; ; batch++) {
    core.startGroup(`Fetching workflow runs (batch ${batch})`);
    const oldRuns = (await listOldRuns()).filter(run => !attempted.has(run.id));
    core.info(`Found ${oldRuns.length} runs older than ${retentionDays} days not yet processed`);
    core.endGroup();

    if (oldRuns.length === 0) break;

    // Group by workflow for readable logs
    const byWorkflow = new Map();
    for (const run of oldRuns) {
      if (!byWorkflow.has(run.name)) byWorkflow.set(run.name, []);
      byWorkflow.get(run.name).push(run);
    }

    for (const [workflowName, workflowRuns] of byWorkflow) {
      core.startGroup(`Processing: ${workflowName}`);
      let workflowDeleted = 0;

      for (const run of workflowRuns) {
        attempted.add(run.id);
        try {
          await github.rest.actions.deleteWorkflowRun({
            owner: context.repo.owner,
            repo: context.repo.repo,
            run_id: run.id
          });
          workflowDeleted++;
          totalDeleted++;
        } catch (error) {
          if (error.status === 403) {
            core.info(`Skipped run #${run.run_number} (in progress or protected)`);
            totalSkipped++;
          } else {
            core.error(`Error deleting run #${run.run_number}: ${error.message}`);
            totalErrors++;
          }
        }
      }

      core.info(`Deleted ${workflowDeleted} runs from ${workflowName}`);
      core.endGroup();
    }
  }

  // Set outputs
  core.setOutput('total-deleted', totalDeleted);
  core.setOutput('total-skipped', totalSkipped);
  core.setOutput('total-errors', totalErrors);

  // Summary
  core.startGroup('Cleanup Summary');
  core.info(`Total runs deleted: ${totalDeleted}`);
  core.info(`Total runs skipped: ${totalSkipped}`);
  core.info(`Total errors: ${totalErrors}`);
  core.endGroup();

  // Write job summary
  let summary = `# Workflow Runs Cleanup\n\n`;
  summary += `**Retention Policy:** ${retentionDays} days\n`;
  summary += `**Cutoff Date:** ${cutoffDate.toISOString().split('T')[0]}\n\n`;
  summary += `## Results\n\n`;
  summary += `| Metric | Count |\n|--------|-------|\n`;
  summary += `| Runs Deleted | ${totalDeleted} |\n`;
  summary += `| Runs Skipped | ${totalSkipped} |\n`;
  summary += `| Errors | ${totalErrors} |\n`;

  await core.summary.addRaw(summary).write();

  if (totalErrors > 0) {
    core.warning(`${totalErrors} errors occurred during cleanup`);
  }

  core.info('Cleanup completed successfully');
};

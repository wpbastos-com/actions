module.exports = async ({ github, context, core }) => {
  core.setOutput('outcome', 'skipped');
  core.setOutput('has_changes', 'false');
};

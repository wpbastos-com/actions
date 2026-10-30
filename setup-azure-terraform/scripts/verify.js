module.exports = async ({ core, exec }) => {
  core.startGroup('Terraform Version');
  await exec.exec('terraform', ['version']);
  core.endGroup();

  core.startGroup('Azure CLI Version');
  const { stdout: azVersion } = await exec.getExecOutput('az', ['version', '--query', '"azure-cli"', '-o', 'tsv']);
  core.setOutput('azure-cli-version', azVersion.trim());
  core.endGroup();

  core.startGroup('Azure Account');
  await exec.exec('az', ['account', 'show', '--query', '{subscription:name, tenant:tenantId}', '-o', 'table']);
  core.endGroup();
};

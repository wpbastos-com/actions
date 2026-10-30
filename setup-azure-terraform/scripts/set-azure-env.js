module.exports = async ({ core }) => {
  core.startGroup('Setting Terraform Azure Environment Variables');

  const vars = {
    ARM_USE_OIDC: process.env.USE_OIDC,
    ARM_USE_AZUREAD: process.env.USE_AZUREAD,
    ARM_CLIENT_ID: process.env.CLIENT_ID,
    ARM_TENANT_ID: process.env.TENANT_ID,
    ARM_SUBSCRIPTION_ID: process.env.SUBSCRIPTION_ID
  };

  for (const [key, value] of Object.entries(vars)) {
    core.exportVariable(key, value);
    core.info(`Set ${key}`);
  }

  core.endGroup();
};

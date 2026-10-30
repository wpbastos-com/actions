# WPBastos GitHub Actions

A collection of reusable GitHub Actions for Terraform and Azure workflows.

## Versioning

Reference actions by the major tag (`@v0`), which is moved on every release, or pin an exact tag (`@v0.0.8`). `@main` is the development branch — don't depend on it.

## Actions

| Action | Description |
|--------|-------------|
| [setup-azure-terraform](#setup-azure-terraform) | Setup Azure CLI, Terraform, and login with OIDC |
| [terraform-run](#terraform-run) | Run terraform fmt, init, validate, plan, and apply |
| [terraform-command](#terraform-command) | Run ad-hoc Terraform commands (output, state, import, etc.) |
| [terraform-summary](#terraform-summary) | Create a validation summary for PRs |
| [terraform-plan-extract](#terraform-plan-extract) | Extract and parse plan changes from JSON |
| [cleanup-workflow-runs](#cleanup-workflow-runs) | Delete old workflow runs to keep the repository clean |

---

## setup-azure-terraform

Install Terraform, export the `ARM_*` variables for the AzureRM provider, and login to Azure with OIDC. Azure CLI is expected on the runner (present on GitHub-hosted images) — it is not installed by this action.

### Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `terraform-version` | Terraform version to install | No | `latest` |
| `terraform-wrapper` | Enable the [setup-terraform wrapper](https://github.com/hashicorp/setup-terraform#inputs). Not needed by these actions (they capture output themselves) and it adds a `[command]` line to `plan-output.txt` | No | `false` |
| `azure-client-id` | Azure Client ID for OIDC | **Yes** | - |
| `azure-tenant-id` | Azure Tenant ID | **Yes** | - |
| `azure-subscription-id` | Azure Subscription ID | **Yes** | - |

### Outputs

| Output | Description |
|--------|-------------|
| `terraform-version` | The installed Terraform version |
| `azure-cli-version` | The Azure CLI version found on the runner |

### Example

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v7

      - name: Setup Azure and Terraform
        uses: wpbastos-com/actions/setup-azure-terraform@v0
        with:
          azure-client-id: ${{ secrets.AZURE_CLIENT_ID }}
          azure-tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          azure-subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}
          terraform-version: '1.7.0'
```

---

## terraform-run

Run terraform format check, init, validate, and optionally plan/apply.

### Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| **Working directory** |
| `working-directory` | Working directory for Terraform | No | `.` |
| **Format check options** |
| `run-fmt` | Run `terraform fmt -check -recursive` | No | `false` |
| `fail-on-fmt-error` | Fail the workflow if terraform fmt check fails | No | `false` |
| **Validate options** |
| `run-validate` | Run `terraform validate` after init | No | `false` |
| **Init options** |
| `backend-config` | Backend flags for `terraform init`, whitespace/newline separated (e.g. `-backend-config=key=x.tfstate -backend-config=backend.hcl`). Passed as separate args, never through a shell — values containing spaces aren't supported; put them in a backend file | No | `''` |
| `init-upgrade` | Run terraform init with -upgrade flag | No | `false` |
| `init-reconfigure` | Run terraform init with -reconfigure flag | No | `false` |
| **Plan options** |
| `run-plan` | Run terraform plan after init (also runs when `run-apply` is `true` and no `use-plan-file`) | No | `false` |
| `plan-file` | Output plan file name | No | `tfplan` |
| `plan-destroy` | Run destroy plan instead of apply plan | No | `false` |
| `plan-generate-json` | Generate JSON output of the plan (`<plan-file>.json`, needed by `terraform-plan-extract`) | No | `false` |
| `plan-target` | Resource address(es) to target (comma or newline separated) | No | `''` |
| **Apply options** |
| `run-apply` | Run terraform apply | No | `false` |
| `use-plan-file` | Path to existing plan file to apply (skips plan step) | No | `''` |
| `apply-output-file` | Output file name for apply output | No | `apply-output.txt` |
| `apply-parallelism` | Number of concurrent operations during apply | No | `10` (Terraform default) |

Init always runs; fmt, validate, plan and apply are opt-in. Steps never shell out — Terraform is invoked with an argv array via `@actions/exec`, output is streamed to the log and saved to the output files with no size limit.

### Outputs

| Output | Description |
|--------|-------------|
| `fmt-outcome` | Format check outcome (`success`, `failure`, `skipped`) |
| `init-outcome` | Init outcome (`success`, `failure`) |
| `validate-outcome` | Validate outcome (`success`, `failure`, `skipped`) |
| `plan-outcome` | Plan outcome (`success`, `failure`, `skipped`) |
| `apply-outcome` | Apply outcome (`success`, `failure`, `skipped`) |
| `plan-exitcode` | Terraform plan exit code (`0`=no changes, `1`=error, `2`=changes) |
| `plan-has-changes` | Whether the plan has changes (`true`/`false`) |
| `plan-output-file` | Path to the plan output text file |
| `plan-file` | Path to the plan binary file |
| `plan-json-file` | Path to the plan JSON file (if generated) |
| `apply-output-file` | Path to the apply output file |

### Example: Basic Plan

```yaml
jobs:
  plan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7

      - name: Setup Azure and Terraform
        uses: wpbastos-com/actions/setup-azure-terraform@v0
        with:
          azure-client-id: ${{ secrets.AZURE_CLIENT_ID }}
          azure-tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          azure-subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}

      - name: Terraform Plan
        id: terraform
        uses: wpbastos-com/actions/terraform-run@v0
        with:
          working-directory: ./infra
          run-plan: true
          backend-config: '-backend-config=key=${{ github.ref_name }}.tfstate'
```

### Example: Matrix Strategy (Multiple Environments)

```yaml
jobs:
  plan:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        environment: [dev, staging, prod]
    steps:
      - uses: actions/checkout@v7

      - name: Setup Azure and Terraform
        uses: wpbastos-com/actions/setup-azure-terraform@v0
        with:
          azure-client-id: ${{ secrets.AZURE_CLIENT_ID }}
          azure-tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          azure-subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}

      - name: Terraform Plan
        id: terraform
        uses: wpbastos-com/actions/terraform-run@v0
        with:
          working-directory: ./envs/${{ matrix.environment }}
          run-fmt: true
          fail-on-fmt-error: true
          run-validate: true
          run-plan: true
          plan-generate-json: true

      - name: Create Summary
        uses: wpbastos-com/actions/terraform-summary@v0
        with:
          environment: ${{ matrix.environment }}
          working-directory: ./envs/${{ matrix.environment }}
          plan-output-file: ${{ steps.terraform.outputs.plan-output-file }}
          fmt-outcome: ${{ steps.terraform.outputs.fmt-outcome }}
          init-outcome: ${{ steps.terraform.outputs.init-outcome }}
          validate-outcome: ${{ steps.terraform.outputs.validate-outcome }}
          plan-outcome: ${{ steps.terraform.outputs.plan-outcome }}
          plan-has-changes: ${{ steps.terraform.outputs.plan-has-changes }}
```

### Example: Plan and Apply

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v7

      - name: Setup Azure and Terraform
        uses: wpbastos-com/actions/setup-azure-terraform@v0
        with:
          azure-client-id: ${{ secrets.AZURE_CLIENT_ID }}
          azure-tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          azure-subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}

      - name: Terraform Apply
        uses: wpbastos-com/actions/terraform-run@v0
        with:
          working-directory: ./infra
          run-apply: true
```

---

## terraform-command

Run common Terraform commands for state inspection, management, and debugging.

### Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `working-directory` | Working directory for Terraform | No | `.` |
| `command` | Terraform command to run | **Yes** | - |
| `resource-address` | Resource address (required for `state-show`, `import`) | No | `''` |
| `lock-id` | Lock ID (required for `force-unlock`) | No | `''` |
| `import-id` | Azure resource ID (required for `import`) | No | `''` |
| `output-name` | Output name (for `output` command, leave empty for all) | No | `''` |

### Supported Commands

| Command | Description | Required Inputs |
|---------|-------------|-----------------|
| `output` | Show Terraform outputs | `output-name` (optional) |
| `state-list` | List resources in state | - |
| `state-show` | Show details of a resource | `resource-address` |
| `refresh` | Refresh state from infrastructure | - |
| `force-unlock` | Manually unlock state | `lock-id` |
| `import` | Import existing resource into state | `resource-address`, `import-id` |
| `providers` | Show required providers | - |
| `version` | Show Terraform version | - |

### Outputs

| Output | Description |
|--------|-------------|
| `exit-code` | Command exit code |
| `outcome` | Command outcome (`success`, `failure`) |
| `output-file` | Path to the command output file |

### Example: Show All Outputs

```yaml
- name: Show Outputs
  uses: wpbastos-com/actions/terraform-command@v0
  with:
    working-directory: ./envs/prod
    command: output
```

### Example: List State Resources

```yaml
- name: List State
  uses: wpbastos-com/actions/terraform-command@v0
  with:
    working-directory: ./envs/prod
    command: state-list
```

### Example: Show Resource Details

```yaml
- name: Show Resource
  uses: wpbastos-com/actions/terraform-command@v0
  with:
    working-directory: ./envs/prod
    command: state-show
    resource-address: 'azurerm_resource_group.main'
```

### Example: Import Existing Resource

```yaml
- name: Import Resource
  uses: wpbastos-com/actions/terraform-command@v0
  with:
    working-directory: ./envs/prod
    command: import
    resource-address: 'azurerm_resource_group.imported'
    import-id: '/subscriptions/xxx/resourceGroups/my-rg'
```

### Example: Force Unlock State

```yaml
- name: Force Unlock
  uses: wpbastos-com/actions/terraform-command@v0
  with:
    working-directory: ./envs/prod
    command: force-unlock
    lock-id: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
```

---

## terraform-summary

Create a validation summary of Terraform steps for PRs. Writes to GitHub Job Summary and outputs a markdown file.

### Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `environment` | Environment name | **Yes** | - |
| `working-directory` | Working directory (used to locate `plan-output.txt` when `plan-output-file` isn't set) | **Yes** | - |
| `plan-output-file` | Path to the plan output text file — pass `terraform-run`'s `plan-output-file` output | No | `<working-directory>/plan-output.txt` |
| `fmt-outcome` | Format check outcome (`success`, `failure`, `skipped`) | **Yes** | - |
| `init-outcome` | Init outcome (`success`, `failure`) | **Yes** | - |
| `validate-outcome` | Validate outcome (`success`, `failure`) | **Yes** | - |
| `plan-outcome` | Plan outcome (`success`, `failure`, `skipped`) | **Yes** | - |
| `plan-has-changes` | Whether the plan has changes (`true`/`false`) | No | `false` |

### Outputs

| Output | Description |
|--------|-------------|
| `result` | Overall result (`success`, `failure`) |
| `summary-file` | Path to the summary markdown file |

### Example

```yaml
- name: Create Summary
  uses: wpbastos-com/actions/terraform-summary@v0
  with:
    environment: production
    working-directory: ./infra
    plan-output-file: ${{ steps.terraform.outputs.plan-output-file }}
    fmt-outcome: ${{ steps.terraform.outputs.fmt-outcome }}
    init-outcome: ${{ steps.terraform.outputs.init-outcome }}
    validate-outcome: ${{ steps.terraform.outputs.validate-outcome }}
    plan-outcome: ${{ steps.terraform.outputs.plan-outcome }}
    plan-has-changes: ${{ steps.terraform.outputs.plan-has-changes }}
```

### Summary Output

The action generates a summary table like this:

| Step | Status |
|------|--------|
| Format | :white_check_mark: |
| Init | :white_check_mark: |
| Validate | :white_check_mark: |
| Plan | :warning: Changes detected |

---

## terraform-plan-extract

Extract and parse Terraform plan changes from JSON output. Useful for PR comments and notifications.

### Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `environment` | Environment name | **Yes** | - |
| `working-directory` | Working directory where plan JSON is located | **Yes** | - |
| `plan-file` | Plan JSON file name | No | `tfplan.json` |
| `plan-type` | Type of plan (`apply` or `destroy`) | No | `apply` |

### Outputs

| Output | Description |
|--------|-------------|
| **Summary** |
| `summary` | Human-readable summary (e.g., `+2 to add, ~1 to change`) |
| `has-changes` | Whether the plan has any changes (`true`/`false`) |
| `has-resources` | **Deprecated** — identical to `has-changes`; will be removed in the next major |
| **Resource counts** |
| `add` | Number of resources to add |
| `change` | Number of resources to change |
| `destroy` | Number of resources to destroy |
| **Resource lists** |
| `resources-to-add` | List of resources to add (newline-separated) |
| `resources-to-change` | List of resources to change (newline-separated) |
| `resources-to-destroy` | List of resources to destroy (newline-separated) |

### Example

```yaml
- name: Terraform Plan
  id: terraform
  uses: wpbastos-com/actions/terraform-run@v0
  with:
    working-directory: ./infra
    run-plan: true
    plan-generate-json: true

- name: Extract Plan Details
  id: extract
  uses: wpbastos-com/actions/terraform-plan-extract@v0
  with:
    environment: production
    working-directory: ./infra
    plan-file: tfplan.json

- name: Comment on PR
  if: github.event_name == 'pull_request' && steps.extract.outputs.has-changes == 'true'
  uses: actions/github-script@v9
  with:
    script: |
      const summary = `${{ steps.extract.outputs.summary }}`;
      const add = `${{ steps.extract.outputs.resources-to-add }}`;
      const change = `${{ steps.extract.outputs.resources-to-change }}`;
      const destroy = `${{ steps.extract.outputs.resources-to-destroy }}`;

      let body = `## Terraform Plan: ${summary}\n\n`;

      if (add) body += `### Resources to Add\n\`\`\`\n${add}\n\`\`\`\n\n`;
      if (change) body += `### Resources to Change\n\`\`\`\n${change}\n\`\`\`\n\n`;
      if (destroy) body += `### Resources to Destroy\n\`\`\`\n${destroy}\n\`\`\`\n\n`;

      github.rest.issues.createComment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: context.issue.number,
        body: body
      });
```

### Output Examples

**Scenario: Adding 3 resources, updating 1, deleting 2**
```
summary: "+3 to add, ~1 to change, -2 to destroy"
has-changes: "true"
add: "3"
change: "1"
destroy: "2"
resources-to-add: |
  azurerm_resource_group.main
  azurerm_storage_account.data
  azurerm_key_vault.secrets
resources-to-change: |
  azurerm_virtual_network.vnet
resources-to-destroy: |
  azurerm_storage_container.old
  azurerm_cosmosdb_account.legacy
```

**Scenario: No changes**
```
summary: "No changes"
has-changes: "false"
add: "0"
change: "0"
destroy: "0"
```

---

## cleanup-workflow-runs

Delete old workflow runs to keep the repository clean. Useful for scheduled maintenance.

### Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `retention-days` | Delete runs older than X days | No | `30` |
| `github-token` | GitHub token with actions:write permission | No | `${{ github.token }}` |

### Outputs

| Output | Description |
|--------|-------------|
| `total-deleted` | Total number of workflow runs deleted |
| `total-skipped` | Total number of workflow runs skipped (in progress or protected) |
| `total-errors` | Total number of errors encountered |

### Example: Scheduled Cleanup

```yaml
name: Cleanup Workflow Runs

on:
  workflow_dispatch:
    inputs:
      retention_days:
        description: 'Delete runs older than X days'
        required: true
        type: number
        default: 30
  schedule:
    - cron: '0 2 * * 1'  # Monday at 2:00 AM UTC

jobs:
  cleanup:
    runs-on: ubuntu-latest
    permissions:
      actions: write
    steps:
      - name: Delete old workflow runs
        uses: wpbastos-com/actions/cleanup-workflow-runs@v0
        with:
          retention-days: ${{ github.event.inputs.retention_days || 30 }}
```

### Example: With Custom Token

```yaml
- name: Delete old workflow runs
  uses: wpbastos-com/actions/cleanup-workflow-runs@v0
  with:
    retention-days: 14
    github-token: ${{ secrets.CUSTOM_PAT }}
```

### Summary Output

The action generates a job summary with the cleanup results:

| Metric | Count |
|--------|-------|
| Runs Deleted | 42 |
| Runs Skipped | 3 |
| Errors | 0 |

---

## Complete Workflow Examples

### PR Validation (Matrix Strategy)

Validate all environments on pull requests:

```yaml
name: Terraform PR Validation

on:
  pull_request:
    branches: [main, develop]

permissions:
  id-token: write
  contents: read
  pull-requests: write

jobs:
  validate:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        environment: [shared, dev, test, stage, prod]
    steps:
      - uses: actions/checkout@v7

      - name: Setup Azure and Terraform
        uses: wpbastos-com/actions/setup-azure-terraform@v0
        with:
          azure-client-id: ${{ secrets.AZURE_CLIENT_ID }}
          azure-tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          azure-subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}

      - name: Terraform Plan
        id: terraform
        uses: wpbastos-com/actions/terraform-run@v0
        with:
          working-directory: ./envs/${{ matrix.environment }}
          run-fmt: true
          fail-on-fmt-error: true
          run-validate: true
          run-plan: true
          plan-generate-json: true

      - name: Extract Plan
        id: extract
        if: steps.terraform.outputs.plan-has-changes == 'true'
        uses: wpbastos-com/actions/terraform-plan-extract@v0
        with:
          environment: ${{ matrix.environment }}
          working-directory: ./envs/${{ matrix.environment }}

      - name: Create Summary
        uses: wpbastos-com/actions/terraform-summary@v0
        with:
          environment: ${{ matrix.environment }}
          working-directory: ./envs/${{ matrix.environment }}
          plan-output-file: ${{ steps.terraform.outputs.plan-output-file }}
          fmt-outcome: ${{ steps.terraform.outputs.fmt-outcome }}
          init-outcome: ${{ steps.terraform.outputs.init-outcome }}
          validate-outcome: ${{ steps.terraform.outputs.validate-outcome }}
          plan-outcome: ${{ steps.terraform.outputs.plan-outcome }}
          plan-has-changes: ${{ steps.terraform.outputs.plan-has-changes }}
```

### Manual Deployment (workflow_dispatch)

Deploy infrastructure manually with environment and action selection. Uses a two-job approach: plan job runs first (for plan/destroy), then apply job uses the saved plan file.

```yaml
name: Terraform Deploy

on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Environment to manage'
        required: true
        type: choice
        options:
          - shared
          - sand
          - dev
          - test
          - stage
          - prod
      action:
        description: 'Action to perform'
        required: true
        type: choice
        options:
          - plan
          - apply
          - destroy

permissions:
  id-token: write
  contents: read

jobs:
  plan:
    if: inputs.action == 'plan' || inputs.action == 'destroy'
    runs-on: ubuntu-latest
    environment: ${{ inputs.environment }}
    steps:
      - uses: actions/checkout@v7

      - name: Setup Azure and Terraform
        uses: wpbastos-com/actions/setup-azure-terraform@v0
        with:
          azure-client-id: ${{ secrets.AZURE_CLIENT_ID }}
          azure-tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          azure-subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}

      - name: Terraform Plan
        id: terraform
        uses: wpbastos-com/actions/terraform-run@v0
        with:
          working-directory: ./envs/${{ inputs.environment }}
          run-plan: true
          plan-generate-json: true
          plan-destroy: ${{ inputs.action == 'destroy' }}

      - name: Extract Plan
        id: extract
        if: steps.terraform.outputs.plan-has-changes == 'true'
        uses: wpbastos-com/actions/terraform-plan-extract@v0
        with:
          environment: ${{ inputs.environment }}
          working-directory: ./envs/${{ inputs.environment }}

      - name: Create Summary
        uses: wpbastos-com/actions/terraform-summary@v0
        with:
          environment: ${{ inputs.environment }}
          working-directory: ./envs/${{ inputs.environment }}
          plan-output-file: ${{ steps.terraform.outputs.plan-output-file }}
          fmt-outcome: ${{ steps.terraform.outputs.fmt-outcome }}
          init-outcome: ${{ steps.terraform.outputs.init-outcome }}
          validate-outcome: ${{ steps.terraform.outputs.validate-outcome }}
          plan-outcome: ${{ steps.terraform.outputs.plan-outcome }}
          plan-has-changes: ${{ steps.terraform.outputs.plan-has-changes }}

      - name: Upload Plan
        uses: actions/upload-artifact@v7
        with:
          name: tfplan-${{ inputs.environment }}
          path: ./envs/${{ inputs.environment }}/tfplan

  apply:
    if: inputs.action == 'apply'
    runs-on: ubuntu-latest
    environment: ${{ inputs.environment }}
    steps:
      - uses: actions/checkout@v7

      - name: Setup Azure and Terraform
        uses: wpbastos-com/actions/setup-azure-terraform@v0
        with:
          azure-client-id: ${{ secrets.AZURE_CLIENT_ID }}
          azure-tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          azure-subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}

      - name: Download Plan
        uses: actions/download-artifact@v8
        with:
          name: tfplan-${{ inputs.environment }}
          path: ./envs/${{ inputs.environment }}

      - name: Terraform Apply
        uses: wpbastos-com/actions/terraform-run@v0
        with:
          working-directory: ./envs/${{ inputs.environment }}
          run-apply: true
          use-plan-file: tfplan
```

### CI/CD Pipeline (PR + Auto Deploy)

Full CI/CD with PR validation and automatic deployment on merge:

```yaml
name: Terraform CI/CD

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

permissions:
  id-token: write
  contents: read
  pull-requests: write

jobs:
  plan:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        environment: [dev, stage, prod]
    steps:
      - uses: actions/checkout@v7

      - name: Setup Azure and Terraform
        uses: wpbastos-com/actions/setup-azure-terraform@v0
        with:
          azure-client-id: ${{ secrets.AZURE_CLIENT_ID }}
          azure-tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          azure-subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}

      - name: Terraform Plan
        id: terraform
        uses: wpbastos-com/actions/terraform-run@v0
        with:
          working-directory: ./envs/${{ matrix.environment }}
          run-fmt: true
          fail-on-fmt-error: true
          run-validate: true
          run-plan: true
          plan-generate-json: true

      - name: Create Summary
        uses: wpbastos-com/actions/terraform-summary@v0
        with:
          environment: ${{ matrix.environment }}
          working-directory: ./envs/${{ matrix.environment }}
          plan-output-file: ${{ steps.terraform.outputs.plan-output-file }}
          fmt-outcome: ${{ steps.terraform.outputs.fmt-outcome }}
          init-outcome: ${{ steps.terraform.outputs.init-outcome }}
          validate-outcome: ${{ steps.terraform.outputs.validate-outcome }}
          plan-outcome: ${{ steps.terraform.outputs.plan-outcome }}
          plan-has-changes: ${{ steps.terraform.outputs.plan-has-changes }}

      - name: Upload Plan
        uses: actions/upload-artifact@v7
        with:
          name: plan-${{ matrix.environment }}
          path: |
            ./envs/${{ matrix.environment }}/tfplan
            ./envs/${{ matrix.environment }}/tfplan.json

  deploy:
    needs: plan
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v7

      - name: Setup Azure and Terraform
        uses: wpbastos-com/actions/setup-azure-terraform@v0
        with:
          azure-client-id: ${{ secrets.AZURE_CLIENT_ID }}
          azure-tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          azure-subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}

      - name: Download Plan
        uses: actions/download-artifact@v8
        with:
          name: plan-prod
          path: ./envs/prod

      - name: Terraform Apply
        uses: wpbastos-com/actions/terraform-run@v0
        with:
          working-directory: ./envs/prod
          run-apply: true
          use-plan-file: tfplan
```

## Development

Each action is a composite of `actions/github-script` steps; the JavaScript lives in `<action>/scripts/*.js` and is loaded at runtime from `$ACTION_PATH` (`github.action_path` passed through `env`, so Windows backslashes never hit a JS string literal). Scripts export `async ({ github, context, core, exec }) => { ... }` and read their inputs from `process.env`. Third-party actions are pinned to a commit SHA (with the version in a comment); Dependabot keeps them current.

```bash
node --test "tests/*.test.js"   # unit tests + an end-to-end run against a real terraform binary (skipped if absent)
```

CI (`.github/workflows/ci.yml`, all jobs on `[self-hosted, ephemeral]` runners) runs `actionlint`, the test suite, and a smoke test that exercises the actions themselves against `tests/fixtures/terraform`.

### Releasing

```bash
git tag v0.0.8 && git push origin v0.0.8                      # exact version
git tag -f v0 && git push --force-with-lease origin v0        # move the major tag
```

## License

MIT

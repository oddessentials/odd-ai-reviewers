# Troubleshooting Guide

Quick links to common issues by platform.

## Azure DevOps

### Permission Errors

| Error            | Description                           | Link                                                                                   |
| ---------------- | ------------------------------------- | -------------------------------------------------------------------------------------- |
| TF401027         | Permission required for PR commenting | [Resolution](platforms/azure-devops/setup.md#tf401027---permission-required)           |
| TF401444         | First login required for identity     | [Resolution](platforms/azure-devops/setup.md#tf401444---first-login-required)          |
| 403 Unauthorized | PullRequestThread API failure         | [Resolution](platforms/azure-devops/setup.md#403-unauthorized---pullrequestthread)     |
| 401 Unauthorized | General authentication failure        | [Resolution](platforms/azure-devops/setup.md#401-unauthorized---general-authorization) |

### Quick Fix Checklist

1. Verify both **"Contribute"** and **"Contribute to pull requests"** are set to **Allow**
2. Check identity type matches your pipeline configuration (see [Identity Decision Tree](platforms/azure-devops/setup.md#identify-your-pipeline-identity))
3. Verify no **Inherited Deny** blocks access at project level

### Full Troubleshooting Guide

See [Azure DevOps Setup - Troubleshooting](platforms/azure-devops/setup.md#troubleshooting) for detailed error resolution steps.

## GitHub

### Permission Errors

| Error                   | Description                    | Link                                                    |
| ----------------------- | ------------------------------ | ------------------------------------------------------- |
| 403 Forbidden           | GITHUB_TOKEN lacks permissions | [Resolution](platforms/github/setup.md#troubleshooting) |
| Resource not accessible | Workflow permissions issue     | [Resolution](platforms/github/setup.md#troubleshooting) |

### Quick Fix Checklist

1. Verify workflow has `pull-requests: write` permission
2. Check repository Settings → Actions → General → Workflow permissions
3. For fork PRs, verify `pull_request_target` trigger is used appropriately

### Full Troubleshooting Guide

See [GitHub Setup - Troubleshooting](platforms/github/setup.md#troubleshooting) for detailed error resolution steps.

## Search Terms

For quick navigation across this documentation, search for:

- Azure DevOps: `Contribute to pull requests`, `Build Service`, `Project Collection Build Service`, `TF401027`, `TF401444`
- GitHub: `GITHUB_TOKEN`, `pull-requests: write`, `workflow permissions`, `fork PR`

## Related Documentation

- [Azure DevOps Setup Guide](platforms/azure-devops/setup.md)
- [GitHub Setup Guide](platforms/github/setup.md)
- [Configuration Schema](configuration/config-schema.md)
- [Security Model](architecture/security.md)

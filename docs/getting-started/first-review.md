# Your First AI Code Review

This guide walks you through running your first AI-powered code review and understanding the results.

## Before You Begin

Ensure you've completed the [Quick Start](./quick-start.md) setup:

- ✅ Workflow file added to `.github/workflows/`
- ✅ Configuration file `.ai-review.yml` created
- ✅ API key secret configured

## Step 1: Create a Test Branch

```bash
git checkout -b test-ai-review
```

## Step 2: Make a Simple Change

Create or modify a file. For example, add a new function:

```javascript
// src/example.js
function calculateTotal(items) {
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    total = total + items[i].price;
  }
  return total;
}
```

## Step 3: Push and Open a PR

```bash
git add .
git commit -m "Add calculateTotal function"
git push -u origin test-ai-review
```

Then open a pull request on GitHub.

## Step 4: Watch the Review

1. **Check Runs** — Look for "AI Review" in the PR checks section
2. **Status Updates** — The check will show progress (validating, analyzing, posting)
3. **Results** — Findings appear within a few minutes

## Understanding the Results

### Check Summary

The check summary shows:

- **Pass count** — How many review passes ran
- **Finding count** — Total issues found
- **Cost** — API usage cost for this PR

### Inline Comments

AI findings appear as review comments on specific lines:

```
🤖 OpenCode suggests:
Consider using reduce() for cleaner iteration:
  return items.reduce((sum, item) => sum + item.price, 0);
```

### Annotations

Critical findings also appear in the Files Changed tab with warning icons.

## Common First-Run Issues

### No Comments Appear

- **Check the workflow logs** — Look for errors in the Actions tab
- **Verify secrets** — Ensure `ANTHROPIC_API_KEY` is set correctly
- **Check model match** — Your model must match your API key provider

### 404 Errors

See [Model-Provider Matching](../../README.md#-model-provider-matching) — the most common cause is mismatched model and API key.

### Budget Exceeded

If you hit limits, the review will skip AI analysis. Adjust `limits` in `.ai-review.yml`:

```yaml
limits:
  max_usd_per_pr: 2.00 # Increase if needed
```

## Next Steps

- [Configuration Reference](../configuration/config-schema.md) — All available options
- [Add More Agents](../configuration/config-schema.md#agents) — Customize your review passes
- [Set Up Cost Controls](../configuration/cost-controls.md) — Budget management

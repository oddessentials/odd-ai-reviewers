# Quickstart: Fix npm Release Authentication

**Feature**: 408-fix-npm-publish
**Date**: 2026-02-04

## Prerequisites

Before implementing this fix:

1. **Verify NPM_TOKEN exists in "release" environment**
   - Go to: Repository Settings → Environments → release → Environment secrets
   - Confirm `NPM_TOKEN` is listed

2. **Delete NPM_TOKEN from repository secrets** (if present)
   - Go to: Repository Settings → Secrets and variables → Actions → Repository secrets
   - Delete `NPM_TOKEN` if it exists (should only be in environment)

## P1 Implementation Steps

### Step 1: Update release.yml

Edit `.github/workflows/release.yml`:

1. **Remove `id-token: write` permission** (line 29)

   ```yaml
   # Before
   permissions:
     contents: write
     issues: write
     pull-requests: write
     id-token: write # For npm provenance

   # After
   permissions:
     contents: write
     issues: write
     pull-requests: write
     # id-token: write removed for P1 (no provenance)
   ```

2. **Add empty token guard step** (after Build step)

   ```yaml
   - name: Verify NPM_TOKEN is set
     run: |
       if [ -z "${{ secrets.NPM_TOKEN }}" ]; then
         echo "ERROR: NPM_TOKEN is not set in the release environment"
         exit 1
       fi
       echo "✓ NPM_TOKEN is set"
   ```

3. **Add auth verification step** (after token guard)

   ```yaml
   - name: Verify npm authentication
     run: |
       echo "Verifying npm authentication..."
       npm whoami
       echo "✓ npm whoami succeeded"

       REGISTRY=$(npm config get registry)
       echo "Registry: $REGISTRY"
       if [ "$REGISTRY" != "https://registry.npmjs.org/" ]; then
         echo "ERROR: Unexpected registry URL"
         exit 1
       fi
       echo "✓ Registry URL verified"
     env:
       NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
       NPM_CONFIG_REGISTRY: https://registry.npmjs.org/
   ```

4. **Update semantic-release step env** (add NODE_AUTH_TOKEN and NPM_CONFIG_REGISTRY)
   ```yaml
   - name: Semantic Release
     id: semantic
     run: |
       if [[ "$DRY_RUN" == "true" ]]; then
         echo "Running in dry-run mode..."
         pnpm exec semantic-release --dry-run
       else
         pnpm exec semantic-release
       fi
     env:
       DRY_RUN: ${{ inputs.dry_run }}
       GITHUB_TOKEN: ${{ steps.app-token.outputs.token }}
       NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
       NPM_CONFIG_REGISTRY: https://registry.npmjs.org/
       HUSKY: '0'
       GIT_AUTHOR_NAME: odd-ai-reviewers-release-bot[bot]
       GIT_AUTHOR_EMAIL: odd-ai-reviewers-release-bot[bot]@users.noreply.github.com
       GIT_COMMITTER_NAME: odd-ai-reviewers-release-bot[bot]
       GIT_COMMITTER_EMAIL: odd-ai-reviewers-release-bot[bot]@users.noreply.github.com
   ```

### Step 2: Update .releaserc.json

Edit `.releaserc.json`:

1. **Remove `--provenance` from publishCmd** (line 53)

   ```json
   // Before
   "publishCmd": "cd router && pnpm publish --no-git-checks --access public --provenance"

   // After
   "publishCmd": "cd router && pnpm publish --no-git-checks --access public"
   ```

### Step 3: Test with Dry Run

1. Push changes to feature branch
2. Create PR to main
3. After merge, manually trigger release workflow with `dry_run: true`
4. Verify:
   - Empty token guard passes
   - `npm whoami` succeeds
   - `npm config get registry` returns correct URL
   - semantic-release dry-run completes without error

### Step 4: Real Publish

1. Trigger release workflow without dry_run (or push a `fix:` commit to main)
2. Verify:
   - All verification steps pass
   - Package publishes to npm without E404
   - Version appears on npmjs.com

## P2 Implementation (After P1 Succeeds)

In a separate PR after P1 is confirmed working:

1. **Re-add `id-token: write` permission** in release.yml
2. **Re-add `--provenance` to publishCmd** in .releaserc.json
3. Verify provenance attestation appears on npm package page

## Troubleshooting

### E404 still occurs

- Verify `NODE_AUTH_TOKEN` is set (check `npm whoami` output)
- Verify registry URL is correct (check `npm config get registry` output)
- Verify NPM_TOKEN has publish permission for `@oddessentials` scope

### npm whoami fails

- NPM_TOKEN may be invalid or expired
- Token may not have correct permissions
- Generate new token with automation type and publish access

### Wrong registry

- Check `NPM_CONFIG_REGISTRY` is set correctly
- Ensure no `.npmrc` file overrides the registry

## Verification Checklist

- [ ] NPM_TOKEN only in "release" environment
- [ ] NPM_TOKEN deleted from repository secrets
- [ ] `id-token: write` removed from permissions
- [ ] Empty token guard step added
- [ ] Auth verification step added
- [ ] `NODE_AUTH_TOKEN` added to semantic-release env
- [ ] `NPM_CONFIG_REGISTRY` added to semantic-release env
- [ ] `--provenance` removed from publishCmd
- [ ] Dry run succeeds
- [ ] Real publish succeeds

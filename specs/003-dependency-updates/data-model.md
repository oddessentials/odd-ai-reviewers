# Data Model: Update Third-Party Dependencies

## Entities

### RootPackageJson

- **Fields**: name, version, type, workspaces, scripts, devDependencies, lint-staged, engines, overrides
- **Relationships**: Owns `PackageLock` entries for root dependencies and workspace link to `RouterPackageJson`
- **Validation Rules**: engines.node must remain `>=22.0.0`; overrides must remain present if required for vulnerabilities

### RouterPackageJson

- **Fields**: name, version, type, scripts, dependencies, devDependencies, engines
- **Relationships**: Linked to root workspace; shares TypeScript version with root
- **Validation Rules**: engines.node must remain `>=22.0.0`; dependency versions compatible with router build/test

### PackageLock

- **Fields**: package tree, resolved versions, integrity hashes
- **Relationships**: Derived from RootPackageJson + RouterPackageJson dependencies
- **Validation Rules**: Must reflect all dependency changes; no stale versions

### RepoStandardsConfig

- **Files**: `eslint.config.mjs`, `.prettierrc`, `commitlint.config.mjs`, `.editorconfig`, `tsconfig.json`
- **Relationships**: Governed by `@oddessentials/repo-standards` requirements
- **Validation Rules**: Must satisfy repo-standards v7 checks

### NpmOverrides

- **Location**: Root `package.json` overrides
- **Relationships**: Patches transitive dependency vulnerabilities
- **Validation Rules**: Only remove if upstream fix verified; must not introduce new vulnerabilities

## State Transitions

- **Dependency Update**: Current versions → latest compatible versions → package-lock regeneration → config alignment → verification passes

# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0](https://github.com/oddessentials/odd-ai-reviewers/compare/v1.0.2...v1.1.0) (2026-02-04)

### Features

* **release:** enable npm provenance attestation ([#134](https://github.com/oddessentials/odd-ai-reviewers/issues/134)) ([b037f15](https://github.com/oddessentials/odd-ai-reviewers/commit/b037f153a4b1ba17eb43d99cb43e91f4e696832e)), closes [#133](https://github.com/oddessentials/odd-ai-reviewers/issues/133) [#408](https://github.com/oddessentials/odd-ai-reviewers/issues/408)

## [1.0.2](https://github.com/oddessentials/odd-ai-reviewers/compare/v1.0.1...v1.0.2) (2026-02-04)

### Bug Fixes

* **release:** wire NODE_AUTH_TOKEN for npm publish authentication ([#133](https://github.com/oddessentials/odd-ai-reviewers/issues/133)) ([bdf7c53](https://github.com/oddessentials/odd-ai-reviewers/commit/bdf7c53777115f292ffc26a409f35862c3e15b63)), closes [#408](https://github.com/oddessentials/odd-ai-reviewers/issues/408)

## [1.0.1](https://github.com/oddessentials/odd-ai-reviewers/compare/v1.0.0...v1.0.1) (2026-02-04)

### Bug Fixes

* **release:** remove NPM_TOKEN and add --provenance for OIDC ([#132](https://github.com/oddessentials/odd-ai-reviewers/issues/132)) ([59fdce0](https://github.com/oddessentials/odd-ai-reviewers/commit/59fdce08fc490766903bc171d3da9e5f90242787))

## 1.0.0 (2026-02-04)

### ⚠ BREAKING CHANGES

* **security:** None - adds defense-in-depth validation
* **local_llm:** None - all changes are additive defaults

### Features

* **001:** add warnings array to PreflightResult (Phase 1-2) ([4b76211](https://github.com/oddessentials/odd-ai-reviewers/commit/4b76211a74268f9e53444bbac24461b9ffa8b0ca))
* **001:** fix P1 bug - auto-applied model propagation (Phase 3) ([b7f65c2](https://github.com/oddessentials/odd-ai-reviewers/commit/b7f65c221817a8aac50bc695a4ee9f3146c4b25b))
* **001:** fix P2 bug - config init validation crash (Phase 5) ([32980da](https://github.com/oddessentials/odd-ai-reviewers/commit/32980da3fc5fdb81b9cca890dcfff07ce5f7f0c8))
* **001:** fix P2 bug - Ollama URL validation optional (Phase 4) ([e02811a](https://github.com/oddessentials/odd-ai-reviewers/commit/e02811a9a1211dc144a48032a9a4d46665b4c8a0))
* **001:** fix P3 bug - "both" platform dual reporting (Phase 6) ([b764868](https://github.com/oddessentials/odd-ai-reviewers/commit/b7648685d2006427afa9d3cc15baeb459bb3b2d6))
* **001:** implement CVE exception governance and monitoring ([d65b2d0](https://github.com/oddessentials/odd-ai-reviewers/commit/d65b2d06a7c76f86ff3998585af99a55686c47d3))
* **014:** implement Phase 1 & 2 config infrastructure ([b984378](https://github.com/oddessentials/odd-ai-reviewers/commit/b984378a4f7f23b731b1caaa1549c4106d1be46d))
* **014:** implement Phase 3 - User Story 1 auto-apply defaults ([1d50e9d](https://github.com/oddessentials/odd-ai-reviewers/commit/1d50e9d04d9e8566e12a7c16acf0acf3dc0a718f))
* **014:** implement Phase 4 - User Story 2 error messages ([6151af6](https://github.com/oddessentials/odd-ai-reviewers/commit/6151af6edffde96aa5a98f27f63d163ddcf89555))
* **014:** implement Phase 5 - User Story 3 config wizard ([01b90af](https://github.com/oddessentials/odd-ai-reviewers/commit/01b90af0502d7760fc4cbf63faf24cf0e3d3ae77))
* **014:** implement Phase 6 - User Story 4 explicit provider ([57d2fea](https://github.com/oddessentials/odd-ai-reviewers/commit/57d2fea87134bde196ccfbd85dbdb404eeda14ca))
* **015:** implement config wizard and validation command ([f55128d](https://github.com/oddessentials/odd-ai-reviewers/commit/f55128d803c9cc50eb65f4b036b4ed8275fde448))
* add Anthropic support in opencode agent ([3714480](https://github.com/oddessentials/odd-ai-reviewers/commit/37144800775dea578f6603021f797cc7d69d2006))
* add dynamic test count badge ([631e1d1](https://github.com/oddessentials/odd-ai-reviewers/commit/631e1d1cadc4ed320c347f36192a6ab52c1bd83d))
* add full Anthropic support to pr_agent and ai_semantic_review ([55ca2b5](https://github.com/oddessentials/odd-ai-reviewers/commit/55ca2b5a47d29115e85c4eedfdac9ddaf73ab09d))
* add OpenCode CLI integration and integration tests ([ee6a2df](https://github.com/oddessentials/odd-ai-reviewers/commit/ee6a2dfe1a4d42c54fd6b594947fc8d0b8515e20))
* add preflight validation for model configuration ([5487161](https://github.com/oddessentials/odd-ai-reviewers/commit/54871617644bcb1559e9ba74a233fb70ab455249))
* add provider switch to pr_agent and ai_semantic_review ([3d8e889](https://github.com/oddessentials/odd-ai-reviewers/commit/3d8e889769b83e7d379b2cf22d3deb0f4bd5ff20))
* add warning when .ai-review.yml missing, use semgrep-only default ([b4f4838](https://github.com/oddessentials/odd-ai-reviewers/commit/b4f483841e4b44c174cf45f0635b3a8bdf55d18c))
* **ado:** implement complete Azure DevOps integration (Phases 1-7) ([c149aee](https://github.com/oddessentials/odd-ai-reviewers/commit/c149aee1d11e423f8bdf858eaa958b00a7e05f64))
* **agents:** add ai_semantic_review agent with direct OpenAI SDK ([e96ba65](https://github.com/oddessentials/odd-ai-reviewers/commit/e96ba65fa61f7ecfa5c35ea5c225f25c5395d230))
* **agents:** implement 012-fix-agent-result-regressions ([97a05be](https://github.com/oddessentials/odd-ai-reviewers/commit/97a05be58593959f9c72c1449459919bf60bd225))
* **agents:** migrate error handling to typed errors (010, Phase 3 complete) ([499749c](https://github.com/oddessentials/odd-ai-reviewers/commit/499749cd7ceb020ad0c4b95d6827445b6a94f8a2))
* **build:** migrate from npm to pnpm as package manager ([41fdd20](https://github.com/oddessentials/odd-ai-reviewers/commit/41fdd20c78af9a45a8863bec7d7d45b776f1ac6f))
* **canonical:** enforce CanonicalDiffFile branded type as single entrypoint ([92ed539](https://github.com/oddessentials/odd-ai-reviewers/commit/92ed539eb9f2fe16fb1755b0ddc9cd1aa42196e7))
* **ci:** add coverage collection and badge generation ([e9cfd34](https://github.com/oddessentials/odd-ai-reviewers/commit/e9cfd344388b9e07940989b2e1d5c3dd01d479db))
* **ci:** enable zero-tolerance enforcement for lint warnings ([bbb3846](https://github.com/oddessentials/odd-ai-reviewers/commit/bbb384668aea735b1f49bfc9c78a2707b46d7734))
* **config:** centralize model default in config.models.default ([d3b7060](https://github.com/oddessentials/odd-ai-reviewers/commit/d3b7060a1b5908585f8b13c1a6fc6b8d3181991d))
* **control_flow:** add control flow analysis agent with mitigation recognition ([9c04fc5](https://github.com/oddessentials/odd-ai-reviewers/commit/9c04fc5b7301f1519f0c7192e41e1e202d9e9844))
* **control_flow:** add ReDoS prevention and pattern validation ([679cbbd](https://github.com/oddessentials/odd-ai-reviewers/commit/679cbbd074ab90d01a59d43ae5e3519df71ba07a))
* **control_flow:** add ReDoS-aware mitigation pattern validation ([c770d9f](https://github.com/oddessentials/odd-ai-reviewers/commit/c770d9f3948890d405e6e72fa6374f45b9284be1))
* **control_flow:** add vulnerability detection and complete end-to-end flow ([b359211](https://github.com/oddessentials/odd-ai-reviewers/commit/b35921129cbfd68f424135495bfa3b7b311b60f2))
* **control_flow:** implement control flow hardening with regex timeout and cross-file tracking ([9c31910](https://github.com/oddessentials/odd-ai-reviewers/commit/9c319107b7b026bee3e86cd22b975456ac1d0dfd))
* **control-flow:** add maxNodesVisited guardrail and spec traceability ([aeb6774](https://github.com/oddessentials/odd-ai-reviewers/commit/aeb6774d7f37723680b94fe5b518e362ee94f289))
* **coverage:** add Vitest V8 coverage infrastructure ([8248089](https://github.com/oddessentials/odd-ai-reviewers/commit/8248089e3e964a730c191eec90b2d3d6ee4fe0f0))
* **coverage:** implement CI/local coverage threshold split ([16be28b](https://github.com/oddessentials/odd-ai-reviewers/commit/16be28b26a1f8a48462b7aa01c4cbeeba3d48d57))
* **diff:** add canonicalizeDiffFiles utility for path normalization ([042afa7](https://github.com/oddessentials/odd-ai-reviewers/commit/042afa743ec1dbe29ae0c5d871e1aa8abee01c94))
* **diff:** robust NUL-delimited numstat parsing ([dfdbced](https://github.com/oddessentials/odd-ai-reviewers/commit/dfdbced5349a9a30e8d61f5e8fd88868e322bc71))
* **docs-viewer:** add live reload dev server and refactor viewer ([272f40e](https://github.com/oddessentials/odd-ai-reviewers/commit/272f40e4b40f2d327b20011c0734a3a04c962473))
* **docs:** add documentation link integrity checking ([075b2b2](https://github.com/oddessentials/odd-ai-reviewers/commit/075b2b24fb1d84a1d2a9722555a9c593af5e894a))
* **docs:** add interactive documentation viewer ([e148943](https://github.com/oddessentials/odd-ai-reviewers/commit/e148943beb811d41204d2f4731e41945d00fa201))
* **docs:** add Mermaid diagram rendering support ([1b6b02b](https://github.com/oddessentials/odd-ai-reviewers/commit/1b6b02bdd825b8ec620262516acf28c5f09031f3))
* **docs:** auto-detect markdown files in docs viewer ([ad264f7](https://github.com/oddessentials/odd-ai-reviewers/commit/ad264f77373a847e14d36c733db6a6807e3d9b37))
* **drift:** surface drift signal in provider check summaries (Phase 10) ([b4637f3](https://github.com/oddessentials/odd-ai-reviewers/commit/b4637f3148c824c14c52d608052e281db1ec22cf))
* enterprise API key hardening ([cbfddb8](https://github.com/oddessentials/odd-ai-reviewers/commit/cbfddb8a2cbaf9ea2a92c284a2ca34c01fbcde27))
* **errors:** migrate core modules to typed errors (010, Phase 3) ([068c20b](https://github.com/oddessentials/odd-ai-reviewers/commit/068c20b2b6705f27100fd45d947f07f78b2a0527))
* exempt local_llm from budget checks since it is free ([66b38b9](https://github.com/oddessentials/odd-ai-reviewers/commit/66b38b929675387aa79f8595b479d903151ef84b))
* **format:** enable auto-format on commit with fresh clone verification ([19631bd](https://github.com/oddessentials/odd-ai-reviewers/commit/19631bddca08aaf328d8c607466fde54268cbe53))
* implement agent optionality and policy hardening ([5f801af](https://github.com/oddessentials/odd-ai-reviewers/commit/5f801afc39d4bef7965170f26cd0f6fd79e2e5f8))
* implement fail-closed behavior for local_llm agent and correct OSCR integration ([b275d75](https://github.com/oddessentials/odd-ai-reviewers/commit/b275d7567f37c102b24908809363176a3380dacb))
* implement hybrid line mapping solution ([2b5494b](https://github.com/oddessentials/odd-ai-reviewers/commit/2b5494be13d6fa03b400964d3fe27068ecb1d59d)), closes [#22](https://github.com/oddessentials/odd-ai-reviewers/issues/22)
* implement P0 security and structured output requirements ([f456204](https://github.com/oddessentials/odd-ai-reviewers/commit/f45620466650218065128c1e920b10f22fca6e74))
* implement Phase 1 MVP of AI code review system ([169e3f3](https://github.com/oddessentials/odd-ai-reviewers/commit/169e3f35694afc3651b71b73f8e02ffe71e773fb))
* implement Phase 2 - PR-Agent, caching, throttling, and unit tests ([4e3fdb1](https://github.com/oddessentials/odd-ai-reviewers/commit/4e3fdb1c76801803571ce198d54804180a32ad85))
* implement Phase 3 Local LLM (Ollama) agent with comprehensive tests ([d75c9a2](https://github.com/oddessentials/odd-ai-reviewers/commit/d75c9a23905320b41237bbad6cc7ed9bb8e169cb))
* implement proper check run lifecycle (in_progress → completed) ([859f6da](https://github.com/oddessentials/odd-ai-reviewers/commit/859f6da5953c9207d570aad84ef15974aec29aef))
* integrate @oddessentials/repo-standards@6.0.0 ([7f6210f](https://github.com/oddessentials/odd-ai-reviewers/commit/7f6210fa623cf64920631d2840dee4c25d1065f3))
* **line-mapping:** add multi-line payload tests for github and ado ([e23cc48](https://github.com/oddessentials/odd-ai-reviewers/commit/e23cc48ad5e3c9daaddcc95b2b819bab3084a4a0))
* **line-resolver:** add drift signal computation with configurable thresholds ([d6957ec](https://github.com/oddessentials/odd-ai-reviewers/commit/d6957ece432ed1df8d8fc23f03fcb9d3dcc5accf))
* **line-resolver:** add rename path remapping with ambiguity detection ([f6c76cb](https://github.com/oddessentials/odd-ai-reviewers/commit/f6c76cb4ec29e3e68c0080b51011e630f32309b0))
* Local cli fixes and enhancements ([#125](https://github.com/oddessentials/odd-ai-reviewers/issues/125)) ([eb3e6df](https://github.com/oddessentials/odd-ai-reviewers/commit/eb3e6df8f885d668d1667a4175e22e66281d9486))
* **local_llm:** add configurable context window and timeout ([a3e0283](https://github.com/oddessentials/odd-ai-reviewers/commit/a3e02833750699848d432ba22ca95fbff7890441))
* **local_llm:** enterprise hardening for reliable local AI reviews ([1075adf](https://github.com/oddessentials/odd-ai-reviewers/commit/1075adf59d68c62b40929724788e339d60e72686))
* **local-review:** complete Phase 10 npm package configuration ([a266908](https://github.com/oddessentials/odd-ai-reviewers/commit/a266908260f6edfa17a4b5e9ca287f4d930a24f2))
* **local-review:** complete Phase 9 command registration ([d0407a4](https://github.com/oddessentials/odd-ai-reviewers/commit/d0407a48ca09ba360dba2acdc06f0ff2ba7a85bf))
* **local-review:** implement Phase 1 - type definitions and module scaffolding ([a4daa25](https://github.com/oddessentials/odd-ai-reviewers/commit/a4daa25eeb7e2041b3ee748b20411b1b643e5813))
* **local-review:** implement Phase 2 - CLI output utilities ([1a1c1c4](https://github.com/oddessentials/odd-ai-reviewers/commit/1a1c1c4adadd5fddcb4988383d3743b604e942de))
* **local-review:** implement Phase 3 - Git Context Module ([5ab0431](https://github.com/oddessentials/odd-ai-reviewers/commit/5ab0431071297f4d9f78978f70302c227921a7b4))
* **local-review:** implement Phase 4 - Local Diff Generation ([5408a66](https://github.com/oddessentials/odd-ai-reviewers/commit/5408a669172ee5a077f63deadcdeb9dbe998d755))
* **local-review:** implement Phase 5 - Terminal Reporter ([e9f591c](https://github.com/oddessentials/odd-ai-reviewers/commit/e9f591c37e66d5e86b165dcffbb1f1a37de03610))
* **local-review:** implement Phase 6 - CLI Options Module ([5a91138](https://github.com/oddessentials/odd-ai-reviewers/commit/5a91138d65a0ebe02d7932058ca9dd34b9c0cabe))
* **local-review:** implement Phase 7 - Zero-Config Defaults ([da150cb](https://github.com/oddessentials/odd-ai-reviewers/commit/da150cb711a968995d23b791e2f759258919912e))
* **local-review:** implement Phase 8 - Local Review Command ([7d351ca](https://github.com/oddessentials/odd-ai-reviewers/commit/7d351cab8834a26b24d26db66c6aa62eeeb19c1d))
* **main:** refactor entry point for testability (010, Phase 6) ([f3afbf5](https://github.com/oddessentials/odd-ai-reviewers/commit/f3afbf51d5d775d1846e04e39c8b9e398dd4d397))
* **pr_agent:** add retry logic with exponential backoff ([789fffd](https://github.com/oddessentials/odd-ai-reviewers/commit/789fffd21fdd0a9832dadd70b5f0debcbbb63c3c))
* **preflight:** add legacy key rejection and Azure validation ([d7623a5](https://github.com/oddessentials/odd-ai-reviewers/commit/d7623a5896a76e47e2113053155793956462c9d3))
* **reporters:** add belt-and-suspenders deleted file guard ([89bb5b0](https://github.com/oddessentials/odd-ai-reviewers/commit/89bb5b06c3f873b37c8dbc91764aab089f56f38f))
* **report:** replace agent names with unicode icons in comments ([1c9c241](https://github.com/oddessentials/odd-ai-reviewers/commit/1c9c2418eaf3518c4e6a349a506fe60674354c45))
* **reviewdog:** implement agent with safe spawn/pipe pattern ([12ce510](https://github.com/oddessentials/odd-ai-reviewers/commit/12ce5102b42e4442619e57156dc8543317fd0ce9))
* **reviewignore:** implement bare segment matching and improve docs ([e4f5ff5](https://github.com/oddessentials/odd-ai-reviewers/commit/e4f5ff57d92083e12aa967a959f2dfe14836417e))
* **router:** add .reviewignore support for excluding files from code review ([e68bd2c](https://github.com/oddessentials/odd-ai-reviewers/commit/e68bd2c314b1ac9f303ae9b83f6acbdccafb206f))
* **security:** add eslint-plugin-security for static security analysis ([db41dde](https://github.com/oddessentials/odd-ai-reviewers/commit/db41dde7ac46390313449a744933134e51bb5c57))
* **security:** add structured security logging module ([2dfc548](https://github.com/oddessentials/odd-ai-reviewers/commit/2dfc548f895744fcb4cf8d117966b4a2fc3badcc))
* **telemetry:** add timeout telemetry module with console and JSONL backends ([9f60175](https://github.com/oddessentials/odd-ai-reviewers/commit/9f601751f3a8965ae2ea03a92a59388baa498971))
* **tests:** add comprehensive test coverage for execute and semgrep modules ([efa921c](https://github.com/oddessentials/odd-ai-reviewers/commit/efa921c2cf960ff934a6df9f92f3b0ccb0456dd4))
* **types:** add const type parameters and inference tests (010, Phase 8) ([980b2b8](https://github.com/oddessentials/odd-ai-reviewers/commit/980b2b89cca17c65593e484ea0d07fc98a58dfb3))
* **types:** implement foundational type utilities (010, Phase 1-2) ([c4a78f7](https://github.com/oddessentials/odd-ai-reviewers/commit/c4a78f7a20c8fd92a0b1940a94c3e9afe066f134))
* **types:** integrate branded types into core modules (010, Phase 4) ([096f47b](https://github.com/oddessentials/odd-ai-reviewers/commit/096f47be86f9605016d1db99303b50b1e7e82ab5))

### Bug Fixes

* **001:** add dependabot.yml to CODEOWNERS ([ece736b](https://github.com/oddessentials/odd-ai-reviewers/commit/ece736b7ae4a46585d9190d0384883185190ae20))
* **001:** address review feedback - 4 additional bug fixes ([b24928e](https://github.com/oddessentials/odd-ai-reviewers/commit/b24928e816dd2c4a8072bec9d8b052d07f71a326))
* **001:** honor config.provider during agent execution (T010) ([e3dd6b2](https://github.com/oddessentials/odd-ai-reviewers/commit/e3dd6b20d0b68a932b44eb541b4da4d48adfb1fc))
* **001:** merge defaults before config init validation ([35f504c](https://github.com/oddessentials/odd-ai-reviewers/commit/35f504cc49cca47c88362c68d0e74c8cd898c93e))
* **001:** resolve pnpm workspace symlink issue in Docker build ([127d6a8](https://github.com/oddessentials/odd-ai-reviewers/commit/127d6a8f0026cc4930e519d8956e99b12fc33861))
* **001:** use --entrypoint to run reviewdog in CI smoke test ([b5f633a](https://github.com/oddessentials/odd-ai-reviewers/commit/b5f633a07fd20f2932e1da02e53f84db39ab3767))
* add AI API keys to router env allowlist ([cbee358](https://github.com/oddessentials/odd-ai-reviewers/commit/cbee3581b2473d91c7216393922c8816875ccddf))
* add ANTHROPIC_API_KEY to pr_agent and ai_semantic_review allowlists ([251a1de](https://github.com/oddessentials/odd-ai-reviewers/commit/251a1dedc96e8aa2c5708a0bc7bde33722018b0c))
* add critical Go x/crypto and http2 CVEs to trivyignore ([dd261f4](https://github.com/oddessentials/odd-ai-reviewers/commit/dd261f4262add1414d14b725e6c46d3c797e4d94))
* add documented trivyignore for OpenCode Go runtime CVEs ([6c8d9ea](https://github.com/oddessentials/odd-ai-reviewers/commit/6c8d9ea74dfef05764aae776370222a0a36705e8))
* add missing required field in check_run_lifecycle.test.ts ([a3b7d04](https://github.com/oddessentials/odd-ai-reviewers/commit/a3b7d04df287fb74b41b2e94f418970c8a70b08e))
* add remaining CVEs to trivyignore (glob, oauth2) ([9e3fc5f](https://github.com/oddessentials/odd-ai-reviewers/commit/9e3fc5fb44877f0d9ee05d1c70a28993bd7c4334))
* add reviewdog binary CVEs to complete trivyignore ([6c7f58b](https://github.com/oddessentials/odd-ai-reviewers/commit/6c7f58b64bc6166fedc65620f315f97bacf17310))
* address code review feedback for Anthropic support ([766ec88](https://github.com/oddessentials/odd-ai-reviewers/commit/766ec88993b5511cd3987534f5c38b4d72824ac6))
* address P2 code review findings ([594df73](https://github.com/oddessentials/odd-ai-reviewers/commit/594df7398f2c2f4d71fcecb3d6fc0ad42d5a17d2))
* **ado:** resolve git refs/heads/* refs to origin/* for ADO compatibility ([461b24d](https://github.com/oddessentials/odd-ai-reviewers/commit/461b24dc3f0ab6aa8f35eee866f7d5385f0007eb))
* **agents:** add assertNever exhaustiveness to consumers (FR-003, FR-004) ([be3aec5](https://github.com/oddessentials/odd-ai-reviewers/commit/be3aec5faffa2c4c797c1b562b765bc82d3404a7))
* **agents:** implement review improvements for 012-fix-agent-result-regressions ([fe6920c](https://github.com/oddessentials/odd-ai-reviewers/commit/fe6920ccf8bd020fd3951bd76f05a806f00fb6b9))
* **ambiguous-rename:** never guess path, downgrade to file-level ([4da0825](https://github.com/oddessentials/odd-ai-reviewers/commit/4da08251a6eaf7fdd42719eb15515163bbe2b475))
* auto-regenerate docs manifest on pre-commit ([0f7ff6f](https://github.com/oddessentials/odd-ai-reviewers/commit/0f7ff6f9ddeab39486989b3f0b97bc082b98d983))
* **cache:** add validation to findCachedForPR and standardize logging ([9518744](https://github.com/oddessentials/odd-ai-reviewers/commit/951874492dfb4eca4725d9da1d11275725599a88))
* **cache:** harden key validation and path traversal defense ([a701e5a](https://github.com/oddessentials/odd-ai-reviewers/commit/a701e5a357c32a87991695b0606c2f6dd0e2f39c))
* **cache:** resolve head ref to SHA to prevent stale cache hits on repeated reviews ([fa07313](https://github.com/oddessentials/odd-ai-reviewers/commit/fa0731315205bda074fddddcca3f42300ac7d48c))
* **cache:** update JSDoc comment to avoid literal-ban CI check ([02c7f27](https://github.com/oddessentials/odd-ai-reviewers/commit/02c7f27cda2e1ec970d841fbededf68dedb0ab68))
* **ci:** add executable bit to shell scripts and guard ([5fbd847](https://github.com/oddessentials/odd-ai-reviewers/commit/5fbd8470ca3977ed0192b2073a5b5d11568e32b5))
* **ci:** add fetch-depth: 0 for tests requiring git history ([7c144ba](https://github.com/oddessentials/odd-ai-reviewers/commit/7c144bad0c97b468928e1d90b3fd9d40a8665dfb))
* **ci:** disable lsof tests on self-hosted runner ([612859e](https://github.com/oddessentials/odd-ai-reviewers/commit/612859e5f4925babc58ddcf965bd3966cf1faa38))
* **ci:** make tests CI-safe for detached HEAD and shallow clones ([8fedfac](https://github.com/oddessentials/odd-ai-reviewers/commit/8fedfac7b63351ccf7aaa2131376836d3617c2a3))
* **ci:** remove volatile timestamp from docs manifest ([3041ccd](https://github.com/oddessentials/odd-ai-reviewers/commit/3041ccda331ced772be4322d5333f24ecc8a5614))
* **ci:** use directory-based pnpm filter for workspace commands ([c0258eb](https://github.com/oddessentials/odd-ai-reviewers/commit/c0258eb443fa32ae475bbcb1f5a517dcc95e2bd8))
* **ci:** use underscore-prefixed vars in fresh clone test ([5aa1f4f](https://github.com/oddessentials/odd-ai-reviewers/commit/5aa1f4f051f2a722b7eb64c2d5fe4ef7cb1b1fc2))
* **cli:** resolve --base option conflict between review and local commands ([713f68d](https://github.com/oddessentials/odd-ai-reviewers/commit/713f68d7c0dfa1ee792d3616c844c8b19466dd60))
* complete trivyignore with node-tar and encoding/gob CVEs ([ed35de9](https://github.com/oddessentials/odd-ai-reviewers/commit/ed35de97f8ac4c2e4db7f2c3b7b02c91962f6d3a))
* **control_flow:** move typescript to production dependencies ([6809297](https://github.com/oddessentials/odd-ai-reviewers/commit/68092978992e5cdb1543405832132c3c8fabdd16))
* **control_flow:** resolve TypeScript compilation errors ([9156dd0](https://github.com/oddessentials/odd-ai-reviewers/commit/9156dd0e29bc9c0b8b25f3be3a91b8b564dc8ca8))
* **control_flow:** resolve TypeScript strict mode errors in test files ([5c1a7f7](https://github.com/oddessentials/odd-ai-reviewers/commit/5c1a7f762cc8e060f67ba70e22417b517e6fee31))
* **control-flow,scripts:** fix three correctness bugs from feedback review ([aaf0bdf](https://github.com/oddessentials/odd-ai-reviewers/commit/aaf0bdfa012a67acf1bed6745518ed366b64490e))
* **corpus:** correct redos-005 pattern syntax and cleanup ([f6ea298](https://github.com/oddessentials/odd-ai-reviewers/commit/f6ea298b8c8f37dabccaaf1ab078486f9ea14495))
* correct 'Licence' to 'License' (American spelling) ([46ae992](https://github.com/oddessentials/odd-ai-reviewers/commit/46ae992433fe7403143c943c662564533af6b917))
* correct isFork detection for undefined GITHUB_HEAD_REPO ([a6bc776](https://github.com/oddessentials/odd-ai-reviewers/commit/a6bc7767c1d6dc42699d8ef05d259dece143b783))
* correct router path for workflow execution ([f042995](https://github.com/oddessentials/odd-ai-reviewers/commit/f0429956010973b1a39545b96aa10ffa08fe95b4))
* critical bugfixes for Local LLM agent invariants ([6802db8](https://github.com/oddessentials/odd-ai-reviewers/commit/6802db8046b813606f8afb295297ecd4701f891a))
* **depcruise:** allow test-utils to import dev dependencies ([09b12fc](https://github.com/oddessentials/odd-ai-reviewers/commit/09b12fc08c2b8c9120e571b99cd83cf3921fd8fe))
* **depcruise:** inline hermetic test setup instead of weakening rules ([392e1db](https://github.com/oddessentials/odd-ai-reviewers/commit/392e1db3b9ce1921a9bf92a0b38f04dc8373df28))
* **deps:** resolve undici security vulnerability and cross-platform test failures ([98a6999](https://github.com/oddessentials/odd-ai-reviewers/commit/98a6999499f8d3256bcadec64294ceaeded624ad))
* **dev-server:** support base paths ([7f84fa9](https://github.com/oddessentials/odd-ai-reviewers/commit/7f84fa9657bf6aa0b90a2236dc17328ec5927ecb))
* **docker:** update Dockerfile to use pnpm instead of npm ([7bb104d](https://github.com/oddessentials/odd-ai-reviewers/commit/7bb104d4af76df8072487582b99ff2661bdce61e))
* **docs-viewer:** resolve image paths relative to current document ([04d6e34](https://github.com/oddessentials/odd-ai-reviewers/commit/04d6e34ce872c07fa6867213238df444cd64993c))
* **docs-viewer:** resolve relative markdown links correctly ([bd24057](https://github.com/oddessentials/odd-ai-reviewers/commit/bd24057151de57874e18d08a83802a56ae3b3bee))
* **docs-viewer:** windows compatibility and documentation updates ([d90aac5](https://github.com/oddessentials/odd-ai-reviewers/commit/d90aac53f4424c647c6939474de7c842ce78788a))
* **docs:** add root redirect and case-insensitive link matching ([ec04cf2](https://github.com/oddessentials/odd-ai-reviewers/commit/ec04cf24fbfd5c06fc101e1650c16ccb95b8d284))
* **docs:** correct FR-009 to FR-008, strengthen test assertions ([58378b9](https://github.com/oddessentials/odd-ai-reviewers/commit/58378b91375e16cfd93a81bcfa25f1025830e882))
* ensure review exits cleanly ([f3326f8](https://github.com/oddessentials/odd-ai-reviewers/commit/f3326f8de0a35e9e4ab4a1dff38bcac75eca49c6))
* gate startCheckRun on reporting mode and move after early exits ([01d50b8](https://github.com/oddessentials/odd-ai-reviewers/commit/01d50b880b6db0ca3c9f71f3116b146078053e52))
* harden .reviewignore loading and parsing ([8561cfa](https://github.com/oddessentials/odd-ai-reviewers/commit/8561cfa743acf7510bda59b10e4c6a98ba47f984))
* **hooks:** replace all npm with pnpm ([a0cb5ac](https://github.com/oddessentials/odd-ai-reviewers/commit/a0cb5acc5681a230b20d35ea0d84a1d46b57e101))
* **hooks:** use directory-based filter in pre-push hook ([007284e](https://github.com/oddessentials/odd-ai-reviewers/commit/007284e1d7cbb3006e9fe6c15f607fcc5ea78715))
* **husky:** use pnpm exec for Windows PATH compatibility ([6732ceb](https://github.com/oddessentials/odd-ai-reviewers/commit/6732cebe066fd9bd0bf541c94ecb02e2ebba6032))
* improve local_llm error messages with attempted URL ([f6a1142](https://github.com/oddessentials/odd-ai-reviewers/commit/f6a1142ed4d926c34d079e8be088563ccdaa6365))
* llama model isolation ([a4cba4b](https://github.com/oddessentials/odd-ai-reviewers/commit/a4cba4bb83b0a2d2034125f5b07376cfa67ccc89))
* **local_llm:** reduce default context to 8192, increase timeout to 180s ([9b96cea](https://github.com/oddessentials/odd-ai-reviewers/commit/9b96cea4ff82bac35db553461f724caa871e3d90))
* **local_llm:** use streaming mode to prevent Ollama server timeout ([7779248](https://github.com/oddessentials/odd-ai-reviewers/commit/777924892d8fc2dcf5f6409339f00585a5937eb2))
* **local-review:** address code review findings ([b6b7459](https://github.com/oddessentials/odd-ai-reviewers/commit/b6b7459eedb50f093b41a43fbcdc0ff4518b0dad))
* **local-review:** correct GitContextErrorCode values to match contract ([6e0f4b8](https://github.com/oddessentials/odd-ai-reviewers/commit/6e0f4b802045c41b0a82920172b47396f6ea1f3b))
* **local-review:** restore SIGINT cancellation behavior ([e8a055a](https://github.com/oddessentials/odd-ai-reviewers/commit/e8a055adc4299b73f3ce56550903416680c816d5))
* opencode api key cleanup part 2 ([87d59d8](https://github.com/oddessentials/odd-ai-reviewers/commit/87d59d89bb92327f928c936b487afd815d825ede))
* pin semgrep version and add runtime smoke step ([a17870c](https://github.com/oddessentials/odd-ai-reviewers/commit/a17870c68b022e9f735b1662f0c04af9f16cf87f))
* **preflight:** prevent 404 errors from model-provider mismatch ([bfe17db](https://github.com/oddessentials/odd-ai-reviewers/commit/bfe17dbcee746372d214bd15113c9640d7e9d84a))
* **preflight:** reject Codex completions-only models for cloud agents ([08f92c3](https://github.com/oddessentials/odd-ai-reviewers/commit/08f92c3a32e11e9e2ac69aec5389b10c5990be3b))
* provider-model resolution with preflight validation ([4ae1b5c](https://github.com/oddessentials/odd-ai-reviewers/commit/4ae1b5cb2429876f504013174604c851b4882e6f))
* **release:** Add NPM_TOKEN for provenance bootstrap ([#126](https://github.com/oddessentials/odd-ai-reviewers/issues/126)) ([2c830fb](https://github.com/oddessentials/odd-ai-reviewers/commit/2c830fbb7a822cb3e3a8661481348b9cd8df997f))
* **release:** Bypass npm/pnpm version to fix arborist crash in monorepo ([#130](https://github.com/oddessentials/odd-ai-reviewers/issues/130)) ([324fb72](https://github.com/oddessentials/odd-ai-reviewers/commit/324fb72669401ae47a3e8280302be6ca077b1444))
* **release:** disable husky hooks and ignore cache directory ([#131](https://github.com/oddessentials/odd-ai-reviewers/issues/131)) ([f4a8592](https://github.com/oddessentials/odd-ai-reviewers/commit/f4a8592c4db1200a9fcb3b02d61d899b0b130adb))
* **release:** Disable package-lock for npm version command ([#127](https://github.com/oddessentials/odd-ai-reviewers/issues/127)) ([dd36fb7](https://github.com/oddessentials/odd-ai-reviewers/commit/dd36fb75d66b28f3ec9296a8a607cdbd65346241))
* **release:** Update release pipeline to not require npm lock since using pnpm ([#128](https://github.com/oddessentials/odd-ai-reviewers/issues/128)) ([526e3d8](https://github.com/oddessentials/odd-ai-reviewers/commit/526e3d84081a721b03e397998e36807a54a86517))
* **report:** implement all 6 bug fixes for deduplication and path normalization ([d848c18](https://github.com/oddessentials/odd-ai-reviewers/commit/d848c18da028019384b8c54472b1f773a5777ffd))
* **report:** implement grouped comment resolution for GitHub and ADO ([84246bf](https://github.com/oddessentials/odd-ai-reviewers/commit/84246bf3adee44ad12e5252aa672ae42d09c9fbd))
* **report:** partial findings flow to GitHub/ADO + correct dedup key (P2/P3) ([c37e907](https://github.com/oddessentials/odd-ai-reviewers/commit/c37e907f30db464dbe54c08f88b9d5d1db89071d))
* **report:** preserve user HTML comments in resolved comment bodies ([b7ed23f](https://github.com/oddessentials/odd-ai-reviewers/commit/b7ed23f7d69d09629272bb6b344caaa5e28b5fba))
* **report:** prevent duplicate PR comments with proximity-based deduplication ([dd9c35a](https://github.com/oddessentials/odd-ai-reviewers/commit/dd9c35ab6259574bb627c8d1a3b001659d756dbd))
* resolve CLI entry-point and SafeGitRef branding issues (010) ([1bc12bb](https://github.com/oddessentials/odd-ai-reviewers/commit/1bc12bb0d667dc6283ea9f2446f4b75fbc397650))
* resolve typecheck errors and add typecheck to pre-commit ([c321f96](https://github.com/oddessentials/odd-ai-reviewers/commit/c321f96a6c36ba741ecb3adc4041e762ced7e846))
* **review:** address code review feedback ([ac3faed](https://github.com/oddessentials/odd-ai-reviewers/commit/ac3faed7a1379dbf23510a7c38136cd61b32da0d))
* **router:** avoid shell git invocations ([438b074](https://github.com/oddessentials/odd-ai-reviewers/commit/438b0747e1bca9401ae076a768c16e7a78005461))
* **router:** resolve base ref for diff ([90f8cd9](https://github.com/oddessentials/odd-ai-reviewers/commit/90f8cd9efcaab41ca6edb89558fba0c6aecf8834))
* **router:** resolve merge commit heads for review ([b1ccfc7](https://github.com/oddessentials/odd-ai-reviewers/commit/b1ccfc733b460608d1b629c5abda8a23faa2e859))
* **router:** separate github check sha from review head ([b73e689](https://github.com/oddessentials/odd-ai-reviewers/commit/b73e689a8046889b7592cbd4b87f20b5b58870fe))
* **scripts:** exclude TypeScript union types from literal ban check ([b2eb73e](https://github.com/oddessentials/odd-ai-reviewers/commit/b2eb73eb767e684775e6d997caa43b0c3b8f27e1))
* **scripts:** improve linkcheck error reporting ([29c7170](https://github.com/oddessentials/odd-ai-reviewers/commit/29c7170b3ccf6514ff2a04ae169102e4189f7b09))
* **security:** add command injection protection to diff.ts ([5b81d70](https://github.com/oddessentials/odd-ai-reviewers/commit/5b81d70ae0a5c8a5318e789af25a19152983ee22))
* **security:** allow relative paths in assertSafeRepoPath ([3d33cf4](https://github.com/oddessentials/odd-ai-reviewers/commit/3d33cf407a04a24f9cb8e642228110027e983dd6))
* **security:** harden shell injection and path traversal defenses ([7a61ead](https://github.com/oddessentials/odd-ai-reviewers/commit/7a61eadee94ef8d537e59c03e6afcf54e2f762df))
* **security:** hardening improvements for path-filter, validators, sanitize ([b407b8b](https://github.com/oddessentials/odd-ai-reviewers/commit/b407b8bddcede6b37326d39e3e7e8c6965c10490))
* **security:** model validation + findings sanitization + docs ([c94399d](https://github.com/oddessentials/odd-ai-reviewers/commit/c94399dc4110f226403a81316846a136aab38267))
* **security:** remediate XSS vulnerabilities in docs viewer ([7d4295f](https://github.com/oddessentials/odd-ai-reviewers/commit/7d4295fd4ab5dcc0c73328564ef5dd0b9e8181f3))
* **security:** shell-free execution + date context for LLM agents ([2b793ff](https://github.com/oddessentials/odd-ai-reviewers/commit/2b793ffb9ae50cfa1757a5ce40ea42885ee97313))
* **security:** suppress CVE-2026-24842 and update dependencies ([2f4e359](https://github.com/oddessentials/odd-ai-reviewers/commit/2f4e35903787f1c3d0ffd96e3c57b0574e08cf16))
* **security:** update dependencies to remediate CVE-2026-24842 ([cf0c878](https://github.com/oddessentials/odd-ai-reviewers/commit/cf0c87845e28d63dd55ed727a1cbb10559800769))
* **security:** use shell:false in pnpm bin resolution test ([0de200f](https://github.com/oddessentials/odd-ai-reviewers/commit/0de200f96069b4d06e2638e6f1ef306877b58983))
* **signals:** ensure cleanup is synchronous for SIGINT handling ([eb3ccda](https://github.com/oddessentials/odd-ai-reviewers/commit/eb3ccda7142f5d031d06536f3702b9bcb2882592))
* **spec:** resolve inconsistencies and add missing clarifications ([5047c4e](https://github.com/oddessentials/odd-ai-reviewers/commit/5047c4e0a5d0dd95bc87b0eb2fca5a5790d6e508))
* strip markdown code fences from Claude JSON responses ([aeb941d](https://github.com/oddessentials/odd-ai-reviewers/commit/aeb941d0fc67f91fa9117e022362f677b5728dab))
* **telemetry:** resolve async race condition in configure() method ([9b4c4f7](https://github.com/oddessentials/odd-ai-reviewers/commit/9b4c4f795472e0703879a0438cca05df1e2a06ba))
* **tests:** detect lsof availability dynamically ([4753e74](https://github.com/oddessentials/odd-ai-reviewers/commit/4753e748035cfafe639c62fdcd66cadfa2ddc184))
* **tests:** detect lsof availability dynamically ([836b027](https://github.com/oddessentials/odd-ai-reviewers/commit/836b027d28c626cf77325c7bcb56a3dae9e65568))
* **tests:** make git-context and reviewdog tests more robust ([34adbed](https://github.com/oddessentials/odd-ai-reviewers/commit/34adbedba18fe5ed22748781fef5727bdeef2cc7))
* timeout issue ([3fcbfe9](https://github.com/oddessentials/odd-ai-reviewers/commit/3fcbfe9855cdd38c25f9b03ea5b97979f2b4ef11))
* update Dockerfile for OpenCode v1.1.26 and npm workspace support ([8d30af7](https://github.com/oddessentials/odd-ai-reviewers/commit/8d30af712d9c42129228810d818cdb14c82de97a))
* update lockfile to include Linux platform dependencies ([b3f8d91](https://github.com/oddessentials/odd-ai-reviewers/commit/b3f8d91081b89f76dfd01dba3c7f5432b7c3aeb0))
* use proper type narrowing to fix TypeScript errors ([be4f775](https://github.com/oddessentials/odd-ai-reviewers/commit/be4f775155f53478dad80a8acd75d39ca55cd1e4))
* **viewer:** handle anchor-only hashes ([2849532](https://github.com/oddessentials/odd-ai-reviewers/commit/28495325453d47e443620dbf965277f057cb9b77))
* **viewer:** normalize tree file paths ([2b970f4](https://github.com/oddessentials/odd-ai-reviewers/commit/2b970f4f0e54d92df344d1bf2e30bf127d283a8c))
* **zero-config:** use pr_agent for Azure OpenAI provider ([e9cb87c](https://github.com/oddessentials/odd-ai-reviewers/commit/e9cb87c16292a5ada36679994ba398dda553aa88))

### Performance Improvements

* **local_llm:** add num_predict=2048 to limit output tokens ([9cfe2e3](https://github.com/oddessentials/odd-ai-reviewers/commit/9cfe2e3ac54fd4eb045305c6bb9d320d56db0630))
* **reviewignore:** add compiled pattern caching and debug telemetry ([04bef20](https://github.com/oddessentials/odd-ai-reviewers/commit/04bef20f84fc9c8f714d83b4fb1eaa7cf2a37b57))

### Reverts

* temp self-hosting ([28f27ce](https://github.com/oddessentials/odd-ai-reviewers/commit/28f27ce40260159aa0acb1ad803f66af01468cc6))

### Documentation

* **001:** update tasks.md with gap analysis completion ([6d6f36b](https://github.com/oddessentials/odd-ai-reviewers/commit/6d6f36be8bf87d79a3d34622ca0ae376689a0a96))
* **009:** complete Phase 1 setup review ([1cdd3b3](https://github.com/oddessentials/odd-ai-reviewers/commit/1cdd3b3bb1f7a9648084e75e75e0aa15be596063))
* **009:** complete Phase 6 validation and polish ([dd027a2](https://github.com/oddessentials/odd-ai-reviewers/commit/dd027a23fb407e6e79d1299aa46e5651304d0eb7))
* **009:** verify admin-friendly navigation (US3) ([4d88c53](https://github.com/oddessentials/odd-ai-reviewers/commit/4d88c536f40e8a8825a60084b8f6a0811dddac8d))
* 011 agent results unions plan ([6be83bb](https://github.com/oddessentials/odd-ai-reviewers/commit/6be83bbdc28edc7bc359f62871251dc2ea7fc322))
* **012:** add spec, plan, and tasks for agent result regressions ([20bcbe7](https://github.com/oddessentials/odd-ai-reviewers/commit/20bcbe70943cb09c9007705e832c2c3efdbf777d))
* **012:** regenerate tasks.md with sequential task IDs ([4a72e97](https://github.com/oddessentials/odd-ai-reviewers/commit/4a72e970387cc27a160a5ecbda643723f60a2dbf))
* **014:** add user-friendly config spec and planning artifacts ([f55e76d](https://github.com/oddessentials/odd-ai-reviewers/commit/f55e76dfb340f433f89c414a209d613141ee64b9))
* **014:** clarify spec contradictions and ambiguities ([46e1a56](https://github.com/oddessentials/odd-ai-reviewers/commit/46e1a56a5cde87a90efb972b752f43987125f8c2))
* **014:** complete Phase 8 - polish and cross-cutting concerns ([1ef993f](https://github.com/oddessentials/odd-ai-reviewers/commit/1ef993fce32fa0d62aea18f7d6a12fb51458a68c))
* **014:** implement Phase 7 - User Story 5 documentation ([90177ce](https://github.com/oddessentials/odd-ai-reviewers/commit/90177ce5ec9e82a0748e1db243f5a045543bfe6a))
* **014:** update spec files with accurate implementation status ([41e7130](https://github.com/oddessentials/odd-ai-reviewers/commit/41e7130df78ea1b9ad629ac0ec913388a24d604d))
* add ai review badge ([6dd943d](https://github.com/oddessentials/odd-ai-reviewers/commit/6dd943d38c78df4105e1d1525887994dace4b848))
* add bugs2.md ([6adc940](https://github.com/oddessentials/odd-ai-reviewers/commit/6adc940e5128a1299e3581c44a23e64bd71d03a8))
* add cleanup plan and update title ([9e4930d](https://github.com/oddessentials/odd-ai-reviewers/commit/9e4930d9f10a39f65fc73ca5cc2ca760da2e80af))
* add code review feedback for reviewignore ([aab6f5b](https://github.com/oddessentials/odd-ai-reviewers/commit/aab6f5b9c389908d65179ae110fe486bb15e47d0))
* add comprehensive Azure DevOps implementation plan ([70fdb55](https://github.com/oddessentials/odd-ai-reviewers/commit/70fdb55a711c0fb573f484dfccdb86abeda5343e))
* add CONSOLIDATED.md integration guide for OSCR + AI reviews ([2fb9886](https://github.com/oddessentials/odd-ai-reviewers/commit/2fb988618922b3be2f08d8baf40b1d7e989b24a6))
* add gif trailer ([25fa6fe](https://github.com/oddessentials/odd-ai-reviewers/commit/25fa6fecbdb3a5a9b086dd047371dfff3dbe1392))
* add GITHUB-FREE.md and GITHUB-MAX.md setup guides ([f87a035](https://github.com/oddessentials/odd-ai-reviewers/commit/f87a0351b009f733fa966765212e3febeda35a69))
* add implementation plan analyzing line mapping bug fixes ([c8929a3](https://github.com/oddessentials/odd-ai-reviewers/commit/c8929a37fcd964c938d4fa2a718f9260ba576e6c))
* add Meet the Team section to README ([61ffe9e](https://github.com/oddessentials/odd-ai-reviewers/commit/61ffe9e0f25a9b7bd9f7cfc69c800508d43dcad5))
* add mermaids ([a0026a7](https://github.com/oddessentials/odd-ai-reviewers/commit/a0026a727769373e20c7916eb22b9fab9196e6bd))
* add NEXT_STEPS.md harden ([e30feea](https://github.com/oddessentials/odd-ai-reviewers/commit/e30feea28e9f6cbc1ae548e6c4c051fcc499a1a0))
* add NEXT_STEPS.md to harden after code review ([6c648ba](https://github.com/oddessentials/odd-ai-reviewers/commit/6c648ba096a9b80afb079a08acc12121c79bd822))
* add plan for type and test optimization ([1719912](https://github.com/oddessentials/odd-ai-reviewers/commit/17199122c51a19fcf322278b1ed0eed184d76ad6))
* add production deployment plan for Local LLM ([bf7658f](https://github.com/oddessentials/odd-ai-reviewers/commit/bf7658f3bb6dd91c9058220b90e1eccd04aea2e3))
* add prominent Build Service permission requirements for ADO ([3507a5f](https://github.com/oddessentials/odd-ai-reviewers/commit/3507a5f0243e47326fc348612f445d874d860b47))
* add REVIEW_TEAM.md with AI reviewer profiles ([4b6c242](https://github.com/oddessentials/odd-ai-reviewers/commit/4b6c24203f33bb16ac45901939cd55d3c0245d7c))
* add security issues ([1a99b72](https://github.com/oddessentials/odd-ai-reviewers/commit/1a99b72d1fcd521e59b918750acfc80af41e8fda))
* add superhero images ([4278646](https://github.com/oddessentials/odd-ai-reviewers/commit/427864696d47b74a962cc2b32f73f6991a01a1ac))
* add TO-DO.md for Phase 3 remaining features ([46bb8d5](https://github.com/oddessentials/odd-ai-reviewers/commit/46bb8d5ddf4f01a37afef5bde2872447c754017c))
* add type utilities documentation and quickstart validation (010, Phase 10) ([0c5b72c](https://github.com/oddessentials/odd-ai-reviewers/commit/0c5b72c647a42b4290ba4ff60858e3afd159b41a))
* adds invariants ([5a0db5a](https://github.com/oddessentials/odd-ai-reviewers/commit/5a0db5a65f36f52f9eee868dd8403e83f3cf9f01))
* adjust plan ([3f2fd73](https://github.com/oddessentials/odd-ai-reviewers/commit/3f2fd7350f87637a541f89ae38437b7d9bc0e2a6))
* **architecture:** add worker thread timeout design document ([0d7be14](https://github.com/oddessentials/odd-ai-reviewers/commit/0d7be14bae856938658096a50c821c192d749b5c))
* audit and improve documentation, add nested folder viewer support ([8be0b56](https://github.com/oddessentials/odd-ai-reviewers/commit/8be0b5694ff409086c7abee4c477a9848381714e))
* **azure-devops:** expand Section 4 with complete permissions guide (US1) ([1151172](https://github.com/oddessentials/odd-ai-reviewers/commit/1151172b7a8cec06b72905fa65dba3fb961cff5d))
* **azure-devops:** expand troubleshooting with error code reference (US2) ([546bd96](https://github.com/oddessentials/odd-ai-reviewers/commit/546bd96f99f682fc1dfe91d31e243875258e1efe))
* better ado permission doc plan ([a18cb58](https://github.com/oddessentials/odd-ai-reviewers/commit/a18cb585f3a1cba02aedc1766a1c61b81d33d3e7))
* bug resolved ([bf07553](https://github.com/oddessentials/odd-ai-reviewers/commit/bf07553b6e465f1c1628c832ec64fe3bdd9a54e9))
* bugs on review dedup ([9e76a45](https://github.com/oddessentials/odd-ai-reviewers/commit/9e76a459c50fef41b332a6924f26782d137daad4))
* claude update ([2f05c44](https://github.com/oddessentials/odd-ai-reviewers/commit/2f05c44324f686dd03231a7159194c2a56aed321))
* **cli-spec:** add exit codes and signal handling documentation ([1104c45](https://github.com/oddessentials/odd-ai-reviewers/commit/1104c45da0a41efe57192880296ecd9af46a87e6))
* **cli-spec:** clarify exit code 1 includes execution errors ([bdc42ff](https://github.com/oddessentials/odd-ai-reviewers/commit/bdc42ff903b34c34ed413807397a91c673593c13))
* create cross-platform troubleshooting hub (FR-010) ([2d11e65](https://github.com/oddessentials/odd-ai-reviewers/commit/2d11e6531b55e913af2412497e890e3138dcd076))
* fix broken internal links after reorganization ([7b912cc](https://github.com/oddessentials/odd-ai-reviewers/commit/7b912cc60eafb5ad50e9a672c5b8a016bd6042d4))
* harden control flow ([19dd03c](https://github.com/oddessentials/odd-ai-reviewers/commit/19dd03c41eb37a7d86c1dd35ec34d4d95980a20c))
* harden plan for security ([d790531](https://github.com/oddessentials/odd-ai-reviewers/commit/d790531c9c600889888f52beb42f3f1321f871e5))
* harden plan for security ([3120119](https://github.com/oddessentials/odd-ai-reviewers/commit/31201197bd96eaced780e57b8f2b6d1469a487c2))
* implementation for anthropic ([2fac16a](https://github.com/oddessentials/odd-ai-reviewers/commit/2fac16a1cd8487ad72ae183f18f337d3a4dc96d8))
* improve .reviewignore documentation with pattern normalization and examples ([04ab9be](https://github.com/oddessentials/odd-ai-reviewers/commit/04ab9befe8397bdf7c17a3236e8af8a6125cbaed))
* init ([b960471](https://github.com/oddessentials/odd-ai-reviewers/commit/b9604710ce5000a6f9a1b1e715d4d1788bcf137f))
* monthly budget stubbed only ([0b6c9ce](https://github.com/oddessentials/odd-ai-reviewers/commit/0b6c9ceb972301aa6670b53d0ddd3b9079b7593b))
* organize and validate content ([73aeead](https://github.com/oddessentials/odd-ai-reviewers/commit/73aeeadc295117b9f0dc771d1b0d024577bfa9b7))
* plan ([c1242b9](https://github.com/oddessentials/odd-ai-reviewers/commit/c1242b93d8a28029c4b7177196e7963e94d58fbe))
* **readme:** add coverage badge and enhance documentation ([e85825e](https://github.com/oddessentials/odd-ai-reviewers/commit/e85825ef2a4f0040dcc634a901f50251f224e5bd))
* **readme:** add documentation viewer link ([0b9c6bd](https://github.com/oddessentials/odd-ai-reviewers/commit/0b9c6bd716a69e78743292a31fa5f7c674735638))
* **readme:** add enterprise-grade quality badges ([1ab87a4](https://github.com/oddessentials/odd-ai-reviewers/commit/1ab87a4b43f8733256de5feea7703cd6dba7fb3c))
* remove old specs ([e243b7d](https://github.com/oddessentials/odd-ai-reviewers/commit/e243b7d66e976704cd69b3a5549f39a2bc8364fe))
* reorganize documentation structure ([758d24c](https://github.com/oddessentials/odd-ai-reviewers/commit/758d24cc2640ed9d6dc5d41a28b3d2c395bd7e46))
* reorganize documentation with nested folder structure ([25964b7](https://github.com/oddessentials/odd-ai-reviewers/commit/25964b722c2f1da014a0eb29b84d61fc185b3f6a))
* review feedback ([98c9df0](https://github.com/oddessentials/odd-ai-reviewers/commit/98c9df0bfd7ff0ee174aef856994e90aedd368e8))
* **security:** add ReDoS threat model and trust annotations ([86a7849](https://github.com/oddessentials/odd-ai-reviewers/commit/86a7849f0fadedfc7d9027705b5be39aa68bf377))
* seed plan ([0a17f68](https://github.com/oddessentials/odd-ai-reviewers/commit/0a17f687cf9a0f10c4e939354a4418375a9edbcd))
* setup ado implementation plan ([b4d2519](https://github.com/oddessentials/odd-ai-reviewers/commit/b4d2519bf1e171431fdc88a23da0d17b20e606d7))
* setup plan ([5b33109](https://github.com/oddessentials/odd-ai-reviewers/commit/5b33109641488d21784f08a541c742defba68076))
* setup plan for dep updates ([e77f40d](https://github.com/oddessentials/odd-ai-reviewers/commit/e77f40d60caf276400a4991d308c8c3aee1f4d9d))
* stage 006 ([edbd072](https://github.com/oddessentials/odd-ai-reviewers/commit/edbd072c8f953bf6101f4e8e22373772216efbdc))
* **tasks:** document P1/P2 post-implementation fixes (010) ([81d196f](https://github.com/oddessentials/odd-ai-reviewers/commit/81d196f2e169b9c8cf0946491f8986f66a83dfa9))
* **tasks:** mark Phase 12 tasks complete ([abea152](https://github.com/oddessentials/odd-ai-reviewers/commit/abea152c6e781fb47002d474e703b9050e10a1a1))
* **tasks:** mark Phase 5 (Result pattern) complete (010) ([8b66aaa](https://github.com/oddessentials/odd-ai-reviewers/commit/8b66aaa91162cfd38a0525e9ee9b3da24a5719b6))
* **TO-DO:** add missing gaps - webhook, Azure API version, E2E pilot ([d6cb1ff](https://github.com/oddessentials/odd-ai-reviewers/commit/d6cb1ff6c3ff554bdb0f3727bf12378307107d23))
* upate 007 plan ([9ef44cb](https://github.com/oddessentials/odd-ai-reviewers/commit/9ef44cb52639f4dec6a963eb770c5a2bb28c9c8b))
* update ADO example and README to reflect completed ADO support ([037853a](https://github.com/oddessentials/odd-ai-reviewers/commit/037853a8311b6fadd40492e2bd4765adb849fc6d))
* update badge guidance ([5843b30](https://github.com/oddessentials/odd-ai-reviewers/commit/5843b3038939e2358bba08313aaf2063d9c15c77))
* update badge id ([71d6279](https://github.com/oddessentials/odd-ai-reviewers/commit/71d6279e503fca8414c33aaa14d414d82163a23c))
* update badge with gist id ([fadbbc7](https://github.com/oddessentials/odd-ai-reviewers/commit/fadbbc781265896c11f8e611ebba00ad4c7e8ff7))
* update bug fix plans ([2a1feea](https://github.com/oddessentials/odd-ai-reviewers/commit/2a1feea4d27bf361baa227d53959eab0c8fdcb7b))
* update bug plan ([7548edc](https://github.com/oddessentials/odd-ai-reviewers/commit/7548edc67e4b04891a9f014af544aa6b7b3180ce))
* update bug squash plan ([40be73f](https://github.com/oddessentials/odd-ai-reviewers/commit/40be73f62c5fe335d0a7c81110bd0cfc1259dd73))
* update documentation for P2 changes ([7ef65e8](https://github.com/oddessentials/odd-ai-reviewers/commit/7ef65e82b6d11193defffcad7fc6a111cf3cb0f9))
* update for modularity ([947e310](https://github.com/oddessentials/odd-ai-reviewers/commit/947e310d87c92af39f56fc6d1c26b51f8c3df50c))
* update formatting ([25bbbeb](https://github.com/oddessentials/odd-ai-reviewers/commit/25bbbebe6921930e257d020c949b612dd03be568))
* update MERMAID.md and README.md with model-provider validation ([88a1ecf](https://github.com/oddessentials/odd-ai-reviewers/commit/88a1ecfb748d4aef0c0ca9e88d0116ac37ca3813))
* update plan ([02c9ec6](https://github.com/oddessentials/odd-ai-reviewers/commit/02c9ec6ac2f6568cd921d9c0968cb73c87452ce2))
* update plan ([a8b4f7e](https://github.com/oddessentials/odd-ai-reviewers/commit/a8b4f7ec592bf61dc0ab010bb272fa3f6e72e23a))
* update plan ([6634d10](https://github.com/oddessentials/odd-ai-reviewers/commit/6634d10d5579b294a6719762500bc18734cce8b0))
* update plan tasks ([b742fe6](https://github.com/oddessentials/odd-ai-reviewers/commit/b742fe6f05e9ca483123ef259ee53f137a3f04b7))
* update plan.md with implementation status for Phases 1-6 ([6cd3e6e](https://github.com/oddessentials/odd-ai-reviewers/commit/6cd3e6e6121548834cfa0390339eff2eee1ce3b6))
* update readme ([582c31a](https://github.com/oddessentials/odd-ai-reviewers/commit/582c31aef52f0b2489aef6dfca8c501215aec158))
* update README and task tracking for pnpm migration ([d04675b](https://github.com/oddessentials/odd-ai-reviewers/commit/d04675b539684593878d9bcbd18169f75f31cfc6))
* update tasks ([b1d8db6](https://github.com/oddessentials/odd-ai-reviewers/commit/b1d8db6a65d230745bd23fefca961f065eb01a77))
* update tasks with more tests ([80b661d](https://github.com/oddessentials/odd-ai-reviewers/commit/80b661d1c9826ba69c5832718e1c940786ae9234))
* update tasks with more tests ([a5775c6](https://github.com/oddessentials/odd-ai-reviewers/commit/a5775c607000184011178e4c7bba7d7ba5cd90b1))
* **upgrades:** add Flight 4 major version upgrade tracking ([6aa7c5d](https://github.com/oddessentials/odd-ai-reviewers/commit/6aa7c5d753f1c91058155738dbb9f23d683c3b9d))

## 1.0.0 (2026-02-04)

### ⚠ BREAKING CHANGES

- **security:** None - adds defense-in-depth validation
- **local_llm:** None - all changes are additive defaults

### Features

- **001:** add warnings array to PreflightResult (Phase 1-2) ([4b76211](https://github.com/oddessentials/odd-ai-reviewers/commit/4b76211a74268f9e53444bbac24461b9ffa8b0ca))
- **001:** fix P1 bug - auto-applied model propagation (Phase 3) ([b7f65c2](https://github.com/oddessentials/odd-ai-reviewers/commit/b7f65c221817a8aac50bc695a4ee9f3146c4b25b))
- **001:** fix P2 bug - config init validation crash (Phase 5) ([32980da](https://github.com/oddessentials/odd-ai-reviewers/commit/32980da3fc5fdb81b9cca890dcfff07ce5f7f0c8))
- **001:** fix P2 bug - Ollama URL validation optional (Phase 4) ([e02811a](https://github.com/oddessentials/odd-ai-reviewers/commit/e02811a9a1211dc144a48032a9a4d46665b4c8a0))
- **001:** fix P3 bug - "both" platform dual reporting (Phase 6) ([b764868](https://github.com/oddessentials/odd-ai-reviewers/commit/b7648685d2006427afa9d3cc15baeb459bb3b2d6))
- **001:** implement CVE exception governance and monitoring ([d65b2d0](https://github.com/oddessentials/odd-ai-reviewers/commit/d65b2d06a7c76f86ff3998585af99a55686c47d3))
- **014:** implement Phase 1 & 2 config infrastructure ([b984378](https://github.com/oddessentials/odd-ai-reviewers/commit/b984378a4f7f23b731b1caaa1549c4106d1be46d))
- **014:** implement Phase 3 - User Story 1 auto-apply defaults ([1d50e9d](https://github.com/oddessentials/odd-ai-reviewers/commit/1d50e9d04d9e8566e12a7c16acf0acf3dc0a718f))
- **014:** implement Phase 4 - User Story 2 error messages ([6151af6](https://github.com/oddessentials/odd-ai-reviewers/commit/6151af6edffde96aa5a98f27f63d163ddcf89555))
- **014:** implement Phase 5 - User Story 3 config wizard ([01b90af](https://github.com/oddessentials/odd-ai-reviewers/commit/01b90af0502d7760fc4cbf63faf24cf0e3d3ae77))
- **014:** implement Phase 6 - User Story 4 explicit provider ([57d2fea](https://github.com/oddessentials/odd-ai-reviewers/commit/57d2fea87134bde196ccfbd85dbdb404eeda14ca))
- **015:** implement config wizard and validation command ([f55128d](https://github.com/oddessentials/odd-ai-reviewers/commit/f55128d803c9cc50eb65f4b036b4ed8275fde448))
- add Anthropic support in opencode agent ([3714480](https://github.com/oddessentials/odd-ai-reviewers/commit/37144800775dea578f6603021f797cc7d69d2006))
- add dynamic test count badge ([631e1d1](https://github.com/oddessentials/odd-ai-reviewers/commit/631e1d1cadc4ed320c347f36192a6ab52c1bd83d))
- add full Anthropic support to pr_agent and ai_semantic_review ([55ca2b5](https://github.com/oddessentials/odd-ai-reviewers/commit/55ca2b5a47d29115e85c4eedfdac9ddaf73ab09d))
- add OpenCode CLI integration and integration tests ([ee6a2df](https://github.com/oddessentials/odd-ai-reviewers/commit/ee6a2dfe1a4d42c54fd6b594947fc8d0b8515e20))
- add preflight validation for model configuration ([5487161](https://github.com/oddessentials/odd-ai-reviewers/commit/54871617644bcb1559e9ba74a233fb70ab455249))
- add provider switch to pr_agent and ai_semantic_review ([3d8e889](https://github.com/oddessentials/odd-ai-reviewers/commit/3d8e889769b83e7d379b2cf22d3deb0f4bd5ff20))
- add warning when .ai-review.yml missing, use semgrep-only default ([b4f4838](https://github.com/oddessentials/odd-ai-reviewers/commit/b4f483841e4b44c174cf45f0635b3a8bdf55d18c))
- **ado:** implement complete Azure DevOps integration (Phases 1-7) ([c149aee](https://github.com/oddessentials/odd-ai-reviewers/commit/c149aee1d11e423f8bdf858eaa958b00a7e05f64))
- **agents:** add ai_semantic_review agent with direct OpenAI SDK ([e96ba65](https://github.com/oddessentials/odd-ai-reviewers/commit/e96ba65fa61f7ecfa5c35ea5c225f25c5395d230))
- **agents:** implement 012-fix-agent-result-regressions ([97a05be](https://github.com/oddessentials/odd-ai-reviewers/commit/97a05be58593959f9c72c1449459919bf60bd225))
- **agents:** migrate error handling to typed errors (010, Phase 3 complete) ([499749c](https://github.com/oddessentials/odd-ai-reviewers/commit/499749cd7ceb020ad0c4b95d6827445b6a94f8a2))
- **build:** migrate from npm to pnpm as package manager ([41fdd20](https://github.com/oddessentials/odd-ai-reviewers/commit/41fdd20c78af9a45a8863bec7d7d45b776f1ac6f))
- **canonical:** enforce CanonicalDiffFile branded type as single entrypoint ([92ed539](https://github.com/oddessentials/odd-ai-reviewers/commit/92ed539eb9f2fe16fb1755b0ddc9cd1aa42196e7))
- **ci:** add coverage collection and badge generation ([e9cfd34](https://github.com/oddessentials/odd-ai-reviewers/commit/e9cfd344388b9e07940989b2e1d5c3dd01d479db))
- **ci:** enable zero-tolerance enforcement for lint warnings ([bbb3846](https://github.com/oddessentials/odd-ai-reviewers/commit/bbb384668aea735b1f49bfc9c78a2707b46d7734))
- **config:** centralize model default in config.models.default ([d3b7060](https://github.com/oddessentials/odd-ai-reviewers/commit/d3b7060a1b5908585f8b13c1a6fc6b8d3181991d))
- **control_flow:** add control flow analysis agent with mitigation recognition ([9c04fc5](https://github.com/oddessentials/odd-ai-reviewers/commit/9c04fc5b7301f1519f0c7192e41e1e202d9e9844))
- **control_flow:** add ReDoS prevention and pattern validation ([679cbbd](https://github.com/oddessentials/odd-ai-reviewers/commit/679cbbd074ab90d01a59d43ae5e3519df71ba07a))
- **control_flow:** add ReDoS-aware mitigation pattern validation ([c770d9f](https://github.com/oddessentials/odd-ai-reviewers/commit/c770d9f3948890d405e6e72fa6374f45b9284be1))
- **control_flow:** add vulnerability detection and complete end-to-end flow ([b359211](https://github.com/oddessentials/odd-ai-reviewers/commit/b35921129cbfd68f424135495bfa3b7b311b60f2))
- **control_flow:** implement control flow hardening with regex timeout and cross-file tracking ([9c31910](https://github.com/oddessentials/odd-ai-reviewers/commit/9c319107b7b026bee3e86cd22b975456ac1d0dfd))
- **control-flow:** add maxNodesVisited guardrail and spec traceability ([aeb6774](https://github.com/oddessentials/odd-ai-reviewers/commit/aeb6774d7f37723680b94fe5b518e362ee94f289))
- **coverage:** add Vitest V8 coverage infrastructure ([8248089](https://github.com/oddessentials/odd-ai-reviewers/commit/8248089e3e964a730c191eec90b2d3d6ee4fe0f0))
- **coverage:** implement CI/local coverage threshold split ([16be28b](https://github.com/oddessentials/odd-ai-reviewers/commit/16be28b26a1f8a48462b7aa01c4cbeeba3d48d57))
- **diff:** add canonicalizeDiffFiles utility for path normalization ([042afa7](https://github.com/oddessentials/odd-ai-reviewers/commit/042afa743ec1dbe29ae0c5d871e1aa8abee01c94))
- **diff:** robust NUL-delimited numstat parsing ([dfdbced](https://github.com/oddessentials/odd-ai-reviewers/commit/dfdbced5349a9a30e8d61f5e8fd88868e322bc71))
- **docs-viewer:** add live reload dev server and refactor viewer ([272f40e](https://github.com/oddessentials/odd-ai-reviewers/commit/272f40e4b40f2d327b20011c0734a3a04c962473))
- **docs:** add documentation link integrity checking ([075b2b2](https://github.com/oddessentials/odd-ai-reviewers/commit/075b2b24fb1d84a1d2a9722555a9c593af5e894a))
- **docs:** add interactive documentation viewer ([e148943](https://github.com/oddessentials/odd-ai-reviewers/commit/e148943beb811d41204d2f4731e41945d00fa201))
- **docs:** add Mermaid diagram rendering support ([1b6b02b](https://github.com/oddessentials/odd-ai-reviewers/commit/1b6b02bdd825b8ec620262516acf28c5f09031f3))
- **docs:** auto-detect markdown files in docs viewer ([ad264f7](https://github.com/oddessentials/odd-ai-reviewers/commit/ad264f77373a847e14d36c733db6a6807e3d9b37))
- **drift:** surface drift signal in provider check summaries (Phase 10) ([b4637f3](https://github.com/oddessentials/odd-ai-reviewers/commit/b4637f3148c824c14c52d608052e281db1ec22cf))
- enterprise API key hardening ([cbfddb8](https://github.com/oddessentials/odd-ai-reviewers/commit/cbfddb8a2cbaf9ea2a92c284a2ca34c01fbcde27))
- **errors:** migrate core modules to typed errors (010, Phase 3) ([068c20b](https://github.com/oddessentials/odd-ai-reviewers/commit/068c20b2b6705f27100fd45d947f07f78b2a0527))
- exempt local_llm from budget checks since it is free ([66b38b9](https://github.com/oddessentials/odd-ai-reviewers/commit/66b38b929675387aa79f8595b479d903151ef84b))
- **format:** enable auto-format on commit with fresh clone verification ([19631bd](https://github.com/oddessentials/odd-ai-reviewers/commit/19631bddca08aaf328d8c607466fde54268cbe53))
- implement agent optionality and policy hardening ([5f801af](https://github.com/oddessentials/odd-ai-reviewers/commit/5f801afc39d4bef7965170f26cd0f6fd79e2e5f8))
- implement fail-closed behavior for local_llm agent and correct OSCR integration ([b275d75](https://github.com/oddessentials/odd-ai-reviewers/commit/b275d7567f37c102b24908809363176a3380dacb))
- implement hybrid line mapping solution ([2b5494b](https://github.com/oddessentials/odd-ai-reviewers/commit/2b5494be13d6fa03b400964d3fe27068ecb1d59d)), closes [#22](https://github.com/oddessentials/odd-ai-reviewers/issues/22)
- implement P0 security and structured output requirements ([f456204](https://github.com/oddessentials/odd-ai-reviewers/commit/f45620466650218065128c1e920b10f22fca6e74))
- implement Phase 1 MVP of AI code review system ([169e3f3](https://github.com/oddessentials/odd-ai-reviewers/commit/169e3f35694afc3651b71b73f8e02ffe71e773fb))
- implement Phase 2 - PR-Agent, caching, throttling, and unit tests ([4e3fdb1](https://github.com/oddessentials/odd-ai-reviewers/commit/4e3fdb1c76801803571ce198d54804180a32ad85))
- implement Phase 3 Local LLM (Ollama) agent with comprehensive tests ([d75c9a2](https://github.com/oddessentials/odd-ai-reviewers/commit/d75c9a23905320b41237bbad6cc7ed9bb8e169cb))
- implement proper check run lifecycle (in_progress → completed) ([859f6da](https://github.com/oddessentials/odd-ai-reviewers/commit/859f6da5953c9207d570aad84ef15974aec29aef))
- integrate @oddessentials/repo-standards@6.0.0 ([7f6210f](https://github.com/oddessentials/odd-ai-reviewers/commit/7f6210fa623cf64920631d2840dee4c25d1065f3))
- **line-mapping:** add multi-line payload tests for github and ado ([e23cc48](https://github.com/oddessentials/odd-ai-reviewers/commit/e23cc48ad5e3c9daaddcc95b2b819bab3084a4a0))
- **line-resolver:** add drift signal computation with configurable thresholds ([d6957ec](https://github.com/oddessentials/odd-ai-reviewers/commit/d6957ece432ed1df8d8fc23f03fcb9d3dcc5accf))
- **line-resolver:** add rename path remapping with ambiguity detection ([f6c76cb](https://github.com/oddessentials/odd-ai-reviewers/commit/f6c76cb4ec29e3e68c0080b51011e630f32309b0))
- Local cli fixes and enhancements ([#125](https://github.com/oddessentials/odd-ai-reviewers/issues/125)) ([eb3e6df](https://github.com/oddessentials/odd-ai-reviewers/commit/eb3e6df8f885d668d1667a4175e22e66281d9486))
- **local_llm:** add configurable context window and timeout ([a3e0283](https://github.com/oddessentials/odd-ai-reviewers/commit/a3e02833750699848d432ba22ca95fbff7890441))
- **local_llm:** enterprise hardening for reliable local AI reviews ([1075adf](https://github.com/oddessentials/odd-ai-reviewers/commit/1075adf59d68c62b40929724788e339d60e72686))
- **local-review:** complete Phase 10 npm package configuration ([a266908](https://github.com/oddessentials/odd-ai-reviewers/commit/a266908260f6edfa17a4b5e9ca287f4d930a24f2))
- **local-review:** complete Phase 9 command registration ([d0407a4](https://github.com/oddessentials/odd-ai-reviewers/commit/d0407a48ca09ba360dba2acdc06f0ff2ba7a85bf))
- **local-review:** implement Phase 1 - type definitions and module scaffolding ([a4daa25](https://github.com/oddessentials/odd-ai-reviewers/commit/a4daa25eeb7e2041b3ee748b20411b1b643e5813))
- **local-review:** implement Phase 2 - CLI output utilities ([1a1c1c4](https://github.com/oddessentials/odd-ai-reviewers/commit/1a1c1c4adadd5fddcb4988383d3743b604e942de))
- **local-review:** implement Phase 3 - Git Context Module ([5ab0431](https://github.com/oddessentials/odd-ai-reviewers/commit/5ab0431071297f4d9f78978f70302c227921a7b4))
- **local-review:** implement Phase 4 - Local Diff Generation ([5408a66](https://github.com/oddessentials/odd-ai-reviewers/commit/5408a669172ee5a077f63deadcdeb9dbe998d755))
- **local-review:** implement Phase 5 - Terminal Reporter ([e9f591c](https://github.com/oddessentials/odd-ai-reviewers/commit/e9f591c37e66d5e86b165dcffbb1f1a37de03610))
- **local-review:** implement Phase 6 - CLI Options Module ([5a91138](https://github.com/oddessentials/odd-ai-reviewers/commit/5a91138d65a0ebe02d7932058ca9dd34b9c0cabe))
- **local-review:** implement Phase 7 - Zero-Config Defaults ([da150cb](https://github.com/oddessentials/odd-ai-reviewers/commit/da150cb711a968995d23b791e2f759258919912e))
- **local-review:** implement Phase 8 - Local Review Command ([7d351ca](https://github.com/oddessentials/odd-ai-reviewers/commit/7d351cab8834a26b24d26db66c6aa62eeeb19c1d))
- **main:** refactor entry point for testability (010, Phase 6) ([f3afbf5](https://github.com/oddessentials/odd-ai-reviewers/commit/f3afbf51d5d775d1846e04e39c8b9e398dd4d397))
- **pr_agent:** add retry logic with exponential backoff ([789fffd](https://github.com/oddessentials/odd-ai-reviewers/commit/789fffd21fdd0a9832dadd70b5f0debcbbb63c3c))
- **preflight:** add legacy key rejection and Azure validation ([d7623a5](https://github.com/oddessentials/odd-ai-reviewers/commit/d7623a5896a76e47e2113053155793956462c9d3))
- **reporters:** add belt-and-suspenders deleted file guard ([89bb5b0](https://github.com/oddessentials/odd-ai-reviewers/commit/89bb5b06c3f873b37c8dbc91764aab089f56f38f))
- **report:** replace agent names with unicode icons in comments ([1c9c241](https://github.com/oddessentials/odd-ai-reviewers/commit/1c9c2418eaf3518c4e6a349a506fe60674354c45))
- **reviewdog:** implement agent with safe spawn/pipe pattern ([12ce510](https://github.com/oddessentials/odd-ai-reviewers/commit/12ce5102b42e4442619e57156dc8543317fd0ce9))
- **reviewignore:** implement bare segment matching and improve docs ([e4f5ff5](https://github.com/oddessentials/odd-ai-reviewers/commit/e4f5ff57d92083e12aa967a959f2dfe14836417e))
- **router:** add .reviewignore support for excluding files from code review ([e68bd2c](https://github.com/oddessentials/odd-ai-reviewers/commit/e68bd2c314b1ac9f303ae9b83f6acbdccafb206f))
- **security:** add eslint-plugin-security for static security analysis ([db41dde](https://github.com/oddessentials/odd-ai-reviewers/commit/db41dde7ac46390313449a744933134e51bb5c57))
- **security:** add structured security logging module ([2dfc548](https://github.com/oddessentials/odd-ai-reviewers/commit/2dfc548f895744fcb4cf8d117966b4a2fc3badcc))
- **telemetry:** add timeout telemetry module with console and JSONL backends ([9f60175](https://github.com/oddessentials/odd-ai-reviewers/commit/9f601751f3a8965ae2ea03a92a59388baa498971))
- **tests:** add comprehensive test coverage for execute and semgrep modules ([efa921c](https://github.com/oddessentials/odd-ai-reviewers/commit/efa921c2cf960ff934a6df9f92f3b0ccb0456dd4))
- **types:** add const type parameters and inference tests (010, Phase 8) ([980b2b8](https://github.com/oddessentials/odd-ai-reviewers/commit/980b2b89cca17c65593e484ea0d07fc98a58dfb3))
- **types:** implement foundational type utilities (010, Phase 1-2) ([c4a78f7](https://github.com/oddessentials/odd-ai-reviewers/commit/c4a78f7a20c8fd92a0b1940a94c3e9afe066f134))
- **types:** integrate branded types into core modules (010, Phase 4) ([096f47b](https://github.com/oddessentials/odd-ai-reviewers/commit/096f47be86f9605016d1db99303b50b1e7e82ab5))

### Bug Fixes

- **001:** add dependabot.yml to CODEOWNERS ([ece736b](https://github.com/oddessentials/odd-ai-reviewers/commit/ece736b7ae4a46585d9190d0384883185190ae20))
- **001:** address review feedback - 4 additional bug fixes ([b24928e](https://github.com/oddessentials/odd-ai-reviewers/commit/b24928e816dd2c4a8072bec9d8b052d07f71a326))
- **001:** honor config.provider during agent execution (T010) ([e3dd6b2](https://github.com/oddessentials/odd-ai-reviewers/commit/e3dd6b20d0b68a932b44eb541b4da4d48adfb1fc))
- **001:** merge defaults before config init validation ([35f504c](https://github.com/oddessentials/odd-ai-reviewers/commit/35f504cc49cca47c88362c68d0e74c8cd898c93e))
- **001:** resolve pnpm workspace symlink issue in Docker build ([127d6a8](https://github.com/oddessentials/odd-ai-reviewers/commit/127d6a8f0026cc4930e519d8956e99b12fc33861))
- **001:** use --entrypoint to run reviewdog in CI smoke test ([b5f633a](https://github.com/oddessentials/odd-ai-reviewers/commit/b5f633a07fd20f2932e1da02e53f84db39ab3767))
- add AI API keys to router env allowlist ([cbee358](https://github.com/oddessentials/odd-ai-reviewers/commit/cbee3581b2473d91c7216393922c8816875ccddf))
- add ANTHROPIC_API_KEY to pr_agent and ai_semantic_review allowlists ([251a1de](https://github.com/oddessentials/odd-ai-reviewers/commit/251a1dedc96e8aa2c5708a0bc7bde33722018b0c))
- add critical Go x/crypto and http2 CVEs to trivyignore ([dd261f4](https://github.com/oddessentials/odd-ai-reviewers/commit/dd261f4262add1414d14b725e6c46d3c797e4d94))
- add documented trivyignore for OpenCode Go runtime CVEs ([6c8d9ea](https://github.com/oddessentials/odd-ai-reviewers/commit/6c8d9ea74dfef05764aae776370222a0a36705e8))
- add missing required field in check_run_lifecycle.test.ts ([a3b7d04](https://github.com/oddessentials/odd-ai-reviewers/commit/a3b7d04df287fb74b41b2e94f418970c8a70b08e))
- add remaining CVEs to trivyignore (glob, oauth2) ([9e3fc5f](https://github.com/oddessentials/odd-ai-reviewers/commit/9e3fc5fb44877f0d9ee05d1c70a28993bd7c4334))
- add reviewdog binary CVEs to complete trivyignore ([6c7f58b](https://github.com/oddessentials/odd-ai-reviewers/commit/6c7f58b64bc6166fedc65620f315f97bacf17310))
- address code review feedback for Anthropic support ([766ec88](https://github.com/oddessentials/odd-ai-reviewers/commit/766ec88993b5511cd3987534f5c38b4d72824ac6))
- address P2 code review findings ([594df73](https://github.com/oddessentials/odd-ai-reviewers/commit/594df7398f2c2f4d71fcecb3d6fc0ad42d5a17d2))
- **ado:** resolve git refs/heads/_ refs to origin/_ for ADO compatibility ([461b24d](https://github.com/oddessentials/odd-ai-reviewers/commit/461b24dc3f0ab6aa8f35eee866f7d5385f0007eb))
- **agents:** add assertNever exhaustiveness to consumers (FR-003, FR-004) ([be3aec5](https://github.com/oddessentials/odd-ai-reviewers/commit/be3aec5faffa2c4c797c1b562b765bc82d3404a7))
- **agents:** implement review improvements for 012-fix-agent-result-regressions ([fe6920c](https://github.com/oddessentials/odd-ai-reviewers/commit/fe6920ccf8bd020fd3951bd76f05a806f00fb6b9))
- **ambiguous-rename:** never guess path, downgrade to file-level ([4da0825](https://github.com/oddessentials/odd-ai-reviewers/commit/4da08251a6eaf7fdd42719eb15515163bbe2b475))
- auto-regenerate docs manifest on pre-commit ([0f7ff6f](https://github.com/oddessentials/odd-ai-reviewers/commit/0f7ff6f9ddeab39486989b3f0b97bc082b98d983))
- **cache:** add validation to findCachedForPR and standardize logging ([9518744](https://github.com/oddessentials/odd-ai-reviewers/commit/951874492dfb4eca4725d9da1d11275725599a88))
- **cache:** harden key validation and path traversal defense ([a701e5a](https://github.com/oddessentials/odd-ai-reviewers/commit/a701e5a357c32a87991695b0606c2f6dd0e2f39c))
- **cache:** resolve head ref to SHA to prevent stale cache hits on repeated reviews ([fa07313](https://github.com/oddessentials/odd-ai-reviewers/commit/fa0731315205bda074fddddcca3f42300ac7d48c))
- **cache:** update JSDoc comment to avoid literal-ban CI check ([02c7f27](https://github.com/oddessentials/odd-ai-reviewers/commit/02c7f27cda2e1ec970d841fbededf68dedb0ab68))
- **ci:** add executable bit to shell scripts and guard ([5fbd847](https://github.com/oddessentials/odd-ai-reviewers/commit/5fbd8470ca3977ed0192b2073a5b5d11568e32b5))
- **ci:** add fetch-depth: 0 for tests requiring git history ([7c144ba](https://github.com/oddessentials/odd-ai-reviewers/commit/7c144bad0c97b468928e1d90b3fd9d40a8665dfb))
- **ci:** disable lsof tests on self-hosted runner ([612859e](https://github.com/oddessentials/odd-ai-reviewers/commit/612859e5f4925babc58ddcf965bd3966cf1faa38))
- **ci:** make tests CI-safe for detached HEAD and shallow clones ([8fedfac](https://github.com/oddessentials/odd-ai-reviewers/commit/8fedfac7b63351ccf7aaa2131376836d3617c2a3))
- **ci:** remove volatile timestamp from docs manifest ([3041ccd](https://github.com/oddessentials/odd-ai-reviewers/commit/3041ccda331ced772be4322d5333f24ecc8a5614))
- **ci:** use directory-based pnpm filter for workspace commands ([c0258eb](https://github.com/oddessentials/odd-ai-reviewers/commit/c0258eb443fa32ae475bbcb1f5a517dcc95e2bd8))
- **ci:** use underscore-prefixed vars in fresh clone test ([5aa1f4f](https://github.com/oddessentials/odd-ai-reviewers/commit/5aa1f4f051f2a722b7eb64c2d5fe4ef7cb1b1fc2))
- **cli:** resolve --base option conflict between review and local commands ([713f68d](https://github.com/oddessentials/odd-ai-reviewers/commit/713f68d7c0dfa1ee792d3616c844c8b19466dd60))
- complete trivyignore with node-tar and encoding/gob CVEs ([ed35de9](https://github.com/oddessentials/odd-ai-reviewers/commit/ed35de97f8ac4c2e4db7f2c3b7b02c91962f6d3a))
- **control_flow:** move typescript to production dependencies ([6809297](https://github.com/oddessentials/odd-ai-reviewers/commit/68092978992e5cdb1543405832132c3c8fabdd16))
- **control_flow:** resolve TypeScript compilation errors ([9156dd0](https://github.com/oddessentials/odd-ai-reviewers/commit/9156dd0e29bc9c0b8b25f3be3a91b8b564dc8ca8))
- **control_flow:** resolve TypeScript strict mode errors in test files ([5c1a7f7](https://github.com/oddessentials/odd-ai-reviewers/commit/5c1a7f762cc8e060f67ba70e22417b517e6fee31))
- **control-flow,scripts:** fix three correctness bugs from feedback review ([aaf0bdf](https://github.com/oddessentials/odd-ai-reviewers/commit/aaf0bdfa012a67acf1bed6745518ed366b64490e))
- **corpus:** correct redos-005 pattern syntax and cleanup ([f6ea298](https://github.com/oddessentials/odd-ai-reviewers/commit/f6ea298b8c8f37dabccaaf1ab078486f9ea14495))
- correct 'Licence' to 'License' (American spelling) ([46ae992](https://github.com/oddessentials/odd-ai-reviewers/commit/46ae992433fe7403143c943c662564533af6b917))
- correct isFork detection for undefined GITHUB_HEAD_REPO ([a6bc776](https://github.com/oddessentials/odd-ai-reviewers/commit/a6bc7767c1d6dc42699d8ef05d259dece143b783))
- correct router path for workflow execution ([f042995](https://github.com/oddessentials/odd-ai-reviewers/commit/f0429956010973b1a39545b96aa10ffa08fe95b4))
- critical bugfixes for Local LLM agent invariants ([6802db8](https://github.com/oddessentials/odd-ai-reviewers/commit/6802db8046b813606f8afb295297ecd4701f891a))
- **depcruise:** allow test-utils to import dev dependencies ([09b12fc](https://github.com/oddessentials/odd-ai-reviewers/commit/09b12fc08c2b8c9120e571b99cd83cf3921fd8fe))
- **depcruise:** inline hermetic test setup instead of weakening rules ([392e1db](https://github.com/oddessentials/odd-ai-reviewers/commit/392e1db3b9ce1921a9bf92a0b38f04dc8373df28))
- **deps:** resolve undici security vulnerability and cross-platform test failures ([98a6999](https://github.com/oddessentials/odd-ai-reviewers/commit/98a6999499f8d3256bcadec64294ceaeded624ad))
- **dev-server:** support base paths ([7f84fa9](https://github.com/oddessentials/odd-ai-reviewers/commit/7f84fa9657bf6aa0b90a2236dc17328ec5927ecb))
- **docker:** update Dockerfile to use pnpm instead of npm ([7bb104d](https://github.com/oddessentials/odd-ai-reviewers/commit/7bb104d4af76df8072487582b99ff2661bdce61e))
- **docs-viewer:** resolve image paths relative to current document ([04d6e34](https://github.com/oddessentials/odd-ai-reviewers/commit/04d6e34ce872c07fa6867213238df444cd64993c))
- **docs-viewer:** resolve relative markdown links correctly ([bd24057](https://github.com/oddessentials/odd-ai-reviewers/commit/bd24057151de57874e18d08a83802a56ae3b3bee))
- **docs-viewer:** windows compatibility and documentation updates ([d90aac5](https://github.com/oddessentials/odd-ai-reviewers/commit/d90aac53f4424c647c6939474de7c842ce78788a))
- **docs:** add root redirect and case-insensitive link matching ([ec04cf2](https://github.com/oddessentials/odd-ai-reviewers/commit/ec04cf24fbfd5c06fc101e1650c16ccb95b8d284))
- **docs:** correct FR-009 to FR-008, strengthen test assertions ([58378b9](https://github.com/oddessentials/odd-ai-reviewers/commit/58378b91375e16cfd93a81bcfa25f1025830e882))
- ensure review exits cleanly ([f3326f8](https://github.com/oddessentials/odd-ai-reviewers/commit/f3326f8de0a35e9e4ab4a1dff38bcac75eca49c6))
- gate startCheckRun on reporting mode and move after early exits ([01d50b8](https://github.com/oddessentials/odd-ai-reviewers/commit/01d50b880b6db0ca3c9f71f3116b146078053e52))
- harden .reviewignore loading and parsing ([8561cfa](https://github.com/oddessentials/odd-ai-reviewers/commit/8561cfa743acf7510bda59b10e4c6a98ba47f984))
- **hooks:** replace all npm with pnpm ([a0cb5ac](https://github.com/oddessentials/odd-ai-reviewers/commit/a0cb5acc5681a230b20d35ea0d84a1d46b57e101))
- **hooks:** use directory-based filter in pre-push hook ([007284e](https://github.com/oddessentials/odd-ai-reviewers/commit/007284e1d7cbb3006e9fe6c15f607fcc5ea78715))
- **husky:** use pnpm exec for Windows PATH compatibility ([6732ceb](https://github.com/oddessentials/odd-ai-reviewers/commit/6732cebe066fd9bd0bf541c94ecb02e2ebba6032))
- improve local_llm error messages with attempted URL ([f6a1142](https://github.com/oddessentials/odd-ai-reviewers/commit/f6a1142ed4d926c34d079e8be088563ccdaa6365))
- llama model isolation ([a4cba4b](https://github.com/oddessentials/odd-ai-reviewers/commit/a4cba4bb83b0a2d2034125f5b07376cfa67ccc89))
- **local_llm:** reduce default context to 8192, increase timeout to 180s ([9b96cea](https://github.com/oddessentials/odd-ai-reviewers/commit/9b96cea4ff82bac35db553461f724caa871e3d90))
- **local_llm:** use streaming mode to prevent Ollama server timeout ([7779248](https://github.com/oddessentials/odd-ai-reviewers/commit/777924892d8fc2dcf5f6409339f00585a5937eb2))
- **local-review:** address code review findings ([b6b7459](https://github.com/oddessentials/odd-ai-reviewers/commit/b6b7459eedb50f093b41a43fbcdc0ff4518b0dad))
- **local-review:** correct GitContextErrorCode values to match contract ([6e0f4b8](https://github.com/oddessentials/odd-ai-reviewers/commit/6e0f4b802045c41b0a82920172b47396f6ea1f3b))
- **local-review:** restore SIGINT cancellation behavior ([e8a055a](https://github.com/oddessentials/odd-ai-reviewers/commit/e8a055adc4299b73f3ce56550903416680c816d5))
- opencode api key cleanup part 2 ([87d59d8](https://github.com/oddessentials/odd-ai-reviewers/commit/87d59d89bb92327f928c936b487afd815d825ede))
- pin semgrep version and add runtime smoke step ([a17870c](https://github.com/oddessentials/odd-ai-reviewers/commit/a17870c68b022e9f735b1662f0c04af9f16cf87f))
- **preflight:** prevent 404 errors from model-provider mismatch ([bfe17db](https://github.com/oddessentials/odd-ai-reviewers/commit/bfe17dbcee746372d214bd15113c9640d7e9d84a))
- **preflight:** reject Codex completions-only models for cloud agents ([08f92c3](https://github.com/oddessentials/odd-ai-reviewers/commit/08f92c3a32e11e9e2ac69aec5389b10c5990be3b))
- provider-model resolution with preflight validation ([4ae1b5c](https://github.com/oddessentials/odd-ai-reviewers/commit/4ae1b5cb2429876f504013174604c851b4882e6f))
- **release:** Add NPM_TOKEN for provenance bootstrap ([#126](https://github.com/oddessentials/odd-ai-reviewers/issues/126)) ([2c830fb](https://github.com/oddessentials/odd-ai-reviewers/commit/2c830fbb7a822cb3e3a8661481348b9cd8df997f))
- **release:** Bypass npm/pnpm version to fix arborist crash in monorepo ([#130](https://github.com/oddessentials/odd-ai-reviewers/issues/130)) ([324fb72](https://github.com/oddessentials/odd-ai-reviewers/commit/324fb72669401ae47a3e8280302be6ca077b1444))
- **release:** Disable package-lock for npm version command ([#127](https://github.com/oddessentials/odd-ai-reviewers/issues/127)) ([dd36fb7](https://github.com/oddessentials/odd-ai-reviewers/commit/dd36fb75d66b28f3ec9296a8a607cdbd65346241))
- **release:** Update release pipeline to not require npm lock since using pnpm ([#128](https://github.com/oddessentials/odd-ai-reviewers/issues/128)) ([526e3d8](https://github.com/oddessentials/odd-ai-reviewers/commit/526e3d84081a721b03e397998e36807a54a86517))
- **report:** implement all 6 bug fixes for deduplication and path normalization ([d848c18](https://github.com/oddessentials/odd-ai-reviewers/commit/d848c18da028019384b8c54472b1f773a5777ffd))
- **report:** implement grouped comment resolution for GitHub and ADO ([84246bf](https://github.com/oddessentials/odd-ai-reviewers/commit/84246bf3adee44ad12e5252aa672ae42d09c9fbd))
- **report:** partial findings flow to GitHub/ADO + correct dedup key (P2/P3) ([c37e907](https://github.com/oddessentials/odd-ai-reviewers/commit/c37e907f30db464dbe54c08f88b9d5d1db89071d))
- **report:** preserve user HTML comments in resolved comment bodies ([b7ed23f](https://github.com/oddessentials/odd-ai-reviewers/commit/b7ed23f7d69d09629272bb6b344caaa5e28b5fba))
- **report:** prevent duplicate PR comments with proximity-based deduplication ([dd9c35a](https://github.com/oddessentials/odd-ai-reviewers/commit/dd9c35ab6259574bb627c8d1a3b001659d756dbd))
- resolve CLI entry-point and SafeGitRef branding issues (010) ([1bc12bb](https://github.com/oddessentials/odd-ai-reviewers/commit/1bc12bb0d667dc6283ea9f2446f4b75fbc397650))
- resolve typecheck errors and add typecheck to pre-commit ([c321f96](https://github.com/oddessentials/odd-ai-reviewers/commit/c321f96a6c36ba741ecb3adc4041e762ced7e846))
- **review:** address code review feedback ([ac3faed](https://github.com/oddessentials/odd-ai-reviewers/commit/ac3faed7a1379dbf23510a7c38136cd61b32da0d))
- **router:** avoid shell git invocations ([438b074](https://github.com/oddessentials/odd-ai-reviewers/commit/438b0747e1bca9401ae076a768c16e7a78005461))
- **router:** resolve base ref for diff ([90f8cd9](https://github.com/oddessentials/odd-ai-reviewers/commit/90f8cd9efcaab41ca6edb89558fba0c6aecf8834))
- **router:** resolve merge commit heads for review ([b1ccfc7](https://github.com/oddessentials/odd-ai-reviewers/commit/b1ccfc733b460608d1b629c5abda8a23faa2e859))
- **router:** separate github check sha from review head ([b73e689](https://github.com/oddessentials/odd-ai-reviewers/commit/b73e689a8046889b7592cbd4b87f20b5b58870fe))
- **scripts:** exclude TypeScript union types from literal ban check ([b2eb73e](https://github.com/oddessentials/odd-ai-reviewers/commit/b2eb73eb767e684775e6d997caa43b0c3b8f27e1))
- **scripts:** improve linkcheck error reporting ([29c7170](https://github.com/oddessentials/odd-ai-reviewers/commit/29c7170b3ccf6514ff2a04ae169102e4189f7b09))
- **security:** add command injection protection to diff.ts ([5b81d70](https://github.com/oddessentials/odd-ai-reviewers/commit/5b81d70ae0a5c8a5318e789af25a19152983ee22))
- **security:** allow relative paths in assertSafeRepoPath ([3d33cf4](https://github.com/oddessentials/odd-ai-reviewers/commit/3d33cf407a04a24f9cb8e642228110027e983dd6))
- **security:** harden shell injection and path traversal defenses ([7a61ead](https://github.com/oddessentials/odd-ai-reviewers/commit/7a61eadee94ef8d537e59c03e6afcf54e2f762df))
- **security:** hardening improvements for path-filter, validators, sanitize ([b407b8b](https://github.com/oddessentials/odd-ai-reviewers/commit/b407b8bddcede6b37326d39e3e7e8c6965c10490))
- **security:** model validation + findings sanitization + docs ([c94399d](https://github.com/oddessentials/odd-ai-reviewers/commit/c94399dc4110f226403a81316846a136aab38267))
- **security:** remediate XSS vulnerabilities in docs viewer ([7d4295f](https://github.com/oddessentials/odd-ai-reviewers/commit/7d4295fd4ab5dcc0c73328564ef5dd0b9e8181f3))
- **security:** shell-free execution + date context for LLM agents ([2b793ff](https://github.com/oddessentials/odd-ai-reviewers/commit/2b793ffb9ae50cfa1757a5ce40ea42885ee97313))
- **security:** suppress CVE-2026-24842 and update dependencies ([2f4e359](https://github.com/oddessentials/odd-ai-reviewers/commit/2f4e35903787f1c3d0ffd96e3c57b0574e08cf16))
- **security:** update dependencies to remediate CVE-2026-24842 ([cf0c878](https://github.com/oddessentials/odd-ai-reviewers/commit/cf0c87845e28d63dd55ed727a1cbb10559800769))
- **security:** use shell:false in pnpm bin resolution test ([0de200f](https://github.com/oddessentials/odd-ai-reviewers/commit/0de200f96069b4d06e2638e6f1ef306877b58983))
- **signals:** ensure cleanup is synchronous for SIGINT handling ([eb3ccda](https://github.com/oddessentials/odd-ai-reviewers/commit/eb3ccda7142f5d031d06536f3702b9bcb2882592))
- **spec:** resolve inconsistencies and add missing clarifications ([5047c4e](https://github.com/oddessentials/odd-ai-reviewers/commit/5047c4e0a5d0dd95bc87b0eb2fca5a5790d6e508))
- strip markdown code fences from Claude JSON responses ([aeb941d](https://github.com/oddessentials/odd-ai-reviewers/commit/aeb941d0fc67f91fa9117e022362f677b5728dab))
- **telemetry:** resolve async race condition in configure() method ([9b4c4f7](https://github.com/oddessentials/odd-ai-reviewers/commit/9b4c4f795472e0703879a0438cca05df1e2a06ba))
- **tests:** detect lsof availability dynamically ([4753e74](https://github.com/oddessentials/odd-ai-reviewers/commit/4753e748035cfafe639c62fdcd66cadfa2ddc184))
- **tests:** detect lsof availability dynamically ([836b027](https://github.com/oddessentials/odd-ai-reviewers/commit/836b027d28c626cf77325c7bcb56a3dae9e65568))
- **tests:** make git-context and reviewdog tests more robust ([34adbed](https://github.com/oddessentials/odd-ai-reviewers/commit/34adbedba18fe5ed22748781fef5727bdeef2cc7))
- timeout issue ([3fcbfe9](https://github.com/oddessentials/odd-ai-reviewers/commit/3fcbfe9855cdd38c25f9b03ea5b97979f2b4ef11))
- update Dockerfile for OpenCode v1.1.26 and npm workspace support ([8d30af7](https://github.com/oddessentials/odd-ai-reviewers/commit/8d30af712d9c42129228810d818cdb14c82de97a))
- update lockfile to include Linux platform dependencies ([b3f8d91](https://github.com/oddessentials/odd-ai-reviewers/commit/b3f8d91081b89f76dfd01dba3c7f5432b7c3aeb0))
- use proper type narrowing to fix TypeScript errors ([be4f775](https://github.com/oddessentials/odd-ai-reviewers/commit/be4f775155f53478dad80a8acd75d39ca55cd1e4))
- **viewer:** handle anchor-only hashes ([2849532](https://github.com/oddessentials/odd-ai-reviewers/commit/28495325453d47e443620dbf965277f057cb9b77))
- **viewer:** normalize tree file paths ([2b970f4](https://github.com/oddessentials/odd-ai-reviewers/commit/2b970f4f0e54d92df344d1bf2e30bf127d283a8c))
- **zero-config:** use pr_agent for Azure OpenAI provider ([e9cb87c](https://github.com/oddessentials/odd-ai-reviewers/commit/e9cb87c16292a5ada36679994ba398dda553aa88))

### Performance Improvements

- **local_llm:** add num_predict=2048 to limit output tokens ([9cfe2e3](https://github.com/oddessentials/odd-ai-reviewers/commit/9cfe2e3ac54fd4eb045305c6bb9d320d56db0630))
- **reviewignore:** add compiled pattern caching and debug telemetry ([04bef20](https://github.com/oddessentials/odd-ai-reviewers/commit/04bef20f84fc9c8f714d83b4fb1eaa7cf2a37b57))

### Reverts

- temp self-hosting ([28f27ce](https://github.com/oddessentials/odd-ai-reviewers/commit/28f27ce40260159aa0acb1ad803f66af01468cc6))

### Documentation

- **001:** update tasks.md with gap analysis completion ([6d6f36b](https://github.com/oddessentials/odd-ai-reviewers/commit/6d6f36be8bf87d79a3d34622ca0ae376689a0a96))
- **009:** complete Phase 1 setup review ([1cdd3b3](https://github.com/oddessentials/odd-ai-reviewers/commit/1cdd3b3bb1f7a9648084e75e75e0aa15be596063))
- **009:** complete Phase 6 validation and polish ([dd027a2](https://github.com/oddessentials/odd-ai-reviewers/commit/dd027a23fb407e6e79d1299aa46e5651304d0eb7))
- **009:** verify admin-friendly navigation (US3) ([4d88c53](https://github.com/oddessentials/odd-ai-reviewers/commit/4d88c536f40e8a8825a60084b8f6a0811dddac8d))
- 011 agent results unions plan ([6be83bb](https://github.com/oddessentials/odd-ai-reviewers/commit/6be83bbdc28edc7bc359f62871251dc2ea7fc322))
- **012:** add spec, plan, and tasks for agent result regressions ([20bcbe7](https://github.com/oddessentials/odd-ai-reviewers/commit/20bcbe70943cb09c9007705e832c2c3efdbf777d))
- **012:** regenerate tasks.md with sequential task IDs ([4a72e97](https://github.com/oddessentials/odd-ai-reviewers/commit/4a72e970387cc27a160a5ecbda643723f60a2dbf))
- **014:** add user-friendly config spec and planning artifacts ([f55e76d](https://github.com/oddessentials/odd-ai-reviewers/commit/f55e76dfb340f433f89c414a209d613141ee64b9))
- **014:** clarify spec contradictions and ambiguities ([46e1a56](https://github.com/oddessentials/odd-ai-reviewers/commit/46e1a56a5cde87a90efb972b752f43987125f8c2))
- **014:** complete Phase 8 - polish and cross-cutting concerns ([1ef993f](https://github.com/oddessentials/odd-ai-reviewers/commit/1ef993fce32fa0d62aea18f7d6a12fb51458a68c))
- **014:** implement Phase 7 - User Story 5 documentation ([90177ce](https://github.com/oddessentials/odd-ai-reviewers/commit/90177ce5ec9e82a0748e1db243f5a045543bfe6a))
- **014:** update spec files with accurate implementation status ([41e7130](https://github.com/oddessentials/odd-ai-reviewers/commit/41e7130df78ea1b9ad629ac0ec913388a24d604d))
- add ai review badge ([6dd943d](https://github.com/oddessentials/odd-ai-reviewers/commit/6dd943d38c78df4105e1d1525887994dace4b848))
- add bugs2.md ([6adc940](https://github.com/oddessentials/odd-ai-reviewers/commit/6adc940e5128a1299e3581c44a23e64bd71d03a8))
- add cleanup plan and update title ([9e4930d](https://github.com/oddessentials/odd-ai-reviewers/commit/9e4930d9f10a39f65fc73ca5cc2ca760da2e80af))
- add code review feedback for reviewignore ([aab6f5b](https://github.com/oddessentials/odd-ai-reviewers/commit/aab6f5b9c389908d65179ae110fe486bb15e47d0))
- add comprehensive Azure DevOps implementation plan ([70fdb55](https://github.com/oddessentials/odd-ai-reviewers/commit/70fdb55a711c0fb573f484dfccdb86abeda5343e))
- add CONSOLIDATED.md integration guide for OSCR + AI reviews ([2fb9886](https://github.com/oddessentials/odd-ai-reviewers/commit/2fb988618922b3be2f08d8baf40b1d7e989b24a6))
- add gif trailer ([25fa6fe](https://github.com/oddessentials/odd-ai-reviewers/commit/25fa6fecbdb3a5a9b086dd047371dfff3dbe1392))
- add GITHUB-FREE.md and GITHUB-MAX.md setup guides ([f87a035](https://github.com/oddessentials/odd-ai-reviewers/commit/f87a0351b009f733fa966765212e3febeda35a69))
- add implementation plan analyzing line mapping bug fixes ([c8929a3](https://github.com/oddessentials/odd-ai-reviewers/commit/c8929a37fcd964c938d4fa2a718f9260ba576e6c))
- add Meet the Team section to README ([61ffe9e](https://github.com/oddessentials/odd-ai-reviewers/commit/61ffe9e0f25a9b7bd9f7cfc69c800508d43dcad5))
- add mermaids ([a0026a7](https://github.com/oddessentials/odd-ai-reviewers/commit/a0026a727769373e20c7916eb22b9fab9196e6bd))
- add NEXT_STEPS.md harden ([e30feea](https://github.com/oddessentials/odd-ai-reviewers/commit/e30feea28e9f6cbc1ae548e6c4c051fcc499a1a0))
- add NEXT_STEPS.md to harden after code review ([6c648ba](https://github.com/oddessentials/odd-ai-reviewers/commit/6c648ba096a9b80afb079a08acc12121c79bd822))
- add plan for type and test optimization ([1719912](https://github.com/oddessentials/odd-ai-reviewers/commit/17199122c51a19fcf322278b1ed0eed184d76ad6))
- add production deployment plan for Local LLM ([bf7658f](https://github.com/oddessentials/odd-ai-reviewers/commit/bf7658f3bb6dd91c9058220b90e1eccd04aea2e3))
- add prominent Build Service permission requirements for ADO ([3507a5f](https://github.com/oddessentials/odd-ai-reviewers/commit/3507a5f0243e47326fc348612f445d874d860b47))
- add REVIEW_TEAM.md with AI reviewer profiles ([4b6c242](https://github.com/oddessentials/odd-ai-reviewers/commit/4b6c24203f33bb16ac45901939cd55d3c0245d7c))
- add security issues ([1a99b72](https://github.com/oddessentials/odd-ai-reviewers/commit/1a99b72d1fcd521e59b918750acfc80af41e8fda))
- add superhero images ([4278646](https://github.com/oddessentials/odd-ai-reviewers/commit/427864696d47b74a962cc2b32f73f6991a01a1ac))
- add TO-DO.md for Phase 3 remaining features ([46bb8d5](https://github.com/oddessentials/odd-ai-reviewers/commit/46bb8d5ddf4f01a37afef5bde2872447c754017c))
- add type utilities documentation and quickstart validation (010, Phase 10) ([0c5b72c](https://github.com/oddessentials/odd-ai-reviewers/commit/0c5b72c647a42b4290ba4ff60858e3afd159b41a))
- adds invariants ([5a0db5a](https://github.com/oddessentials/odd-ai-reviewers/commit/5a0db5a65f36f52f9eee868dd8403e83f3cf9f01))
- adjust plan ([3f2fd73](https://github.com/oddessentials/odd-ai-reviewers/commit/3f2fd7350f87637a541f89ae38437b7d9bc0e2a6))
- **architecture:** add worker thread timeout design document ([0d7be14](https://github.com/oddessentials/odd-ai-reviewers/commit/0d7be14bae856938658096a50c821c192d749b5c))
- audit and improve documentation, add nested folder viewer support ([8be0b56](https://github.com/oddessentials/odd-ai-reviewers/commit/8be0b5694ff409086c7abee4c477a9848381714e))
- **azure-devops:** expand Section 4 with complete permissions guide (US1) ([1151172](https://github.com/oddessentials/odd-ai-reviewers/commit/1151172b7a8cec06b72905fa65dba3fb961cff5d))
- **azure-devops:** expand troubleshooting with error code reference (US2) ([546bd96](https://github.com/oddessentials/odd-ai-reviewers/commit/546bd96f99f682fc1dfe91d31e243875258e1efe))
- better ado permission doc plan ([a18cb58](https://github.com/oddessentials/odd-ai-reviewers/commit/a18cb585f3a1cba02aedc1766a1c61b81d33d3e7))
- bug resolved ([bf07553](https://github.com/oddessentials/odd-ai-reviewers/commit/bf07553b6e465f1c1628c832ec64fe3bdd9a54e9))
- bugs on review dedup ([9e76a45](https://github.com/oddessentials/odd-ai-reviewers/commit/9e76a459c50fef41b332a6924f26782d137daad4))
- claude update ([2f05c44](https://github.com/oddessentials/odd-ai-reviewers/commit/2f05c44324f686dd03231a7159194c2a56aed321))
- **cli-spec:** add exit codes and signal handling documentation ([1104c45](https://github.com/oddessentials/odd-ai-reviewers/commit/1104c45da0a41efe57192880296ecd9af46a87e6))
- **cli-spec:** clarify exit code 1 includes execution errors ([bdc42ff](https://github.com/oddessentials/odd-ai-reviewers/commit/bdc42ff903b34c34ed413807397a91c673593c13))
- create cross-platform troubleshooting hub (FR-010) ([2d11e65](https://github.com/oddessentials/odd-ai-reviewers/commit/2d11e6531b55e913af2412497e890e3138dcd076))
- fix broken internal links after reorganization ([7b912cc](https://github.com/oddessentials/odd-ai-reviewers/commit/7b912cc60eafb5ad50e9a672c5b8a016bd6042d4))
- harden control flow ([19dd03c](https://github.com/oddessentials/odd-ai-reviewers/commit/19dd03c41eb37a7d86c1dd35ec34d4d95980a20c))
- harden plan for security ([d790531](https://github.com/oddessentials/odd-ai-reviewers/commit/d790531c9c600889888f52beb42f3f1321f871e5))
- harden plan for security ([3120119](https://github.com/oddessentials/odd-ai-reviewers/commit/31201197bd96eaced780e57b8f2b6d1469a487c2))
- implementation for anthropic ([2fac16a](https://github.com/oddessentials/odd-ai-reviewers/commit/2fac16a1cd8487ad72ae183f18f337d3a4dc96d8))
- improve .reviewignore documentation with pattern normalization and examples ([04ab9be](https://github.com/oddessentials/odd-ai-reviewers/commit/04ab9befe8397bdf7c17a3236e8af8a6125cbaed))
- init ([b960471](https://github.com/oddessentials/odd-ai-reviewers/commit/b9604710ce5000a6f9a1b1e715d4d1788bcf137f))
- monthly budget stubbed only ([0b6c9ce](https://github.com/oddessentials/odd-ai-reviewers/commit/0b6c9ceb972301aa6670b53d0ddd3b9079b7593b))
- organize and validate content ([73aeead](https://github.com/oddessentials/odd-ai-reviewers/commit/73aeeadc295117b9f0dc771d1b0d024577bfa9b7))
- plan ([c1242b9](https://github.com/oddessentials/odd-ai-reviewers/commit/c1242b93d8a28029c4b7177196e7963e94d58fbe))
- **readme:** add coverage badge and enhance documentation ([e85825e](https://github.com/oddessentials/odd-ai-reviewers/commit/e85825ef2a4f0040dcc634a901f50251f224e5bd))
- **readme:** add documentation viewer link ([0b9c6bd](https://github.com/oddessentials/odd-ai-reviewers/commit/0b9c6bd716a69e78743292a31fa5f7c674735638))
- **readme:** add enterprise-grade quality badges ([1ab87a4](https://github.com/oddessentials/odd-ai-reviewers/commit/1ab87a4b43f8733256de5feea7703cd6dba7fb3c))
- remove old specs ([e243b7d](https://github.com/oddessentials/odd-ai-reviewers/commit/e243b7d66e976704cd69b3a5549f39a2bc8364fe))
- reorganize documentation structure ([758d24c](https://github.com/oddessentials/odd-ai-reviewers/commit/758d24cc2640ed9d6dc5d41a28b3d2c395bd7e46))
- reorganize documentation with nested folder structure ([25964b7](https://github.com/oddessentials/odd-ai-reviewers/commit/25964b722c2f1da014a0eb29b84d61fc185b3f6a))
- review feedback ([98c9df0](https://github.com/oddessentials/odd-ai-reviewers/commit/98c9df0bfd7ff0ee174aef856994e90aedd368e8))
- **security:** add ReDoS threat model and trust annotations ([86a7849](https://github.com/oddessentials/odd-ai-reviewers/commit/86a7849f0fadedfc7d9027705b5be39aa68bf377))
- seed plan ([0a17f68](https://github.com/oddessentials/odd-ai-reviewers/commit/0a17f687cf9a0f10c4e939354a4418375a9edbcd))
- setup ado implementation plan ([b4d2519](https://github.com/oddessentials/odd-ai-reviewers/commit/b4d2519bf1e171431fdc88a23da0d17b20e606d7))
- setup plan ([5b33109](https://github.com/oddessentials/odd-ai-reviewers/commit/5b33109641488d21784f08a541c742defba68076))
- setup plan for dep updates ([e77f40d](https://github.com/oddessentials/odd-ai-reviewers/commit/e77f40d60caf276400a4991d308c8c3aee1f4d9d))
- stage 006 ([edbd072](https://github.com/oddessentials/odd-ai-reviewers/commit/edbd072c8f953bf6101f4e8e22373772216efbdc))
- **tasks:** document P1/P2 post-implementation fixes (010) ([81d196f](https://github.com/oddessentials/odd-ai-reviewers/commit/81d196f2e169b9c8cf0946491f8986f66a83dfa9))
- **tasks:** mark Phase 12 tasks complete ([abea152](https://github.com/oddessentials/odd-ai-reviewers/commit/abea152c6e781fb47002d474e703b9050e10a1a1))
- **tasks:** mark Phase 5 (Result pattern) complete (010) ([8b66aaa](https://github.com/oddessentials/odd-ai-reviewers/commit/8b66aaa91162cfd38a0525e9ee9b3da24a5719b6))
- **TO-DO:** add missing gaps - webhook, Azure API version, E2E pilot ([d6cb1ff](https://github.com/oddessentials/odd-ai-reviewers/commit/d6cb1ff6c3ff554bdb0f3727bf12378307107d23))
- upate 007 plan ([9ef44cb](https://github.com/oddessentials/odd-ai-reviewers/commit/9ef44cb52639f4dec6a963eb770c5a2bb28c9c8b))
- update ADO example and README to reflect completed ADO support ([037853a](https://github.com/oddessentials/odd-ai-reviewers/commit/037853a8311b6fadd40492e2bd4765adb849fc6d))
- update badge guidance ([5843b30](https://github.com/oddessentials/odd-ai-reviewers/commit/5843b3038939e2358bba08313aaf2063d9c15c77))
- update badge id ([71d6279](https://github.com/oddessentials/odd-ai-reviewers/commit/71d6279e503fca8414c33aaa14d414d82163a23c))
- update badge with gist id ([fadbbc7](https://github.com/oddessentials/odd-ai-reviewers/commit/fadbbc781265896c11f8e611ebba00ad4c7e8ff7))
- update bug fix plans ([2a1feea](https://github.com/oddessentials/odd-ai-reviewers/commit/2a1feea4d27bf361baa227d53959eab0c8fdcb7b))
- update bug plan ([7548edc](https://github.com/oddessentials/odd-ai-reviewers/commit/7548edc67e4b04891a9f014af544aa6b7b3180ce))
- update bug squash plan ([40be73f](https://github.com/oddessentials/odd-ai-reviewers/commit/40be73f62c5fe335d0a7c81110bd0cfc1259dd73))
- update documentation for P2 changes ([7ef65e8](https://github.com/oddessentials/odd-ai-reviewers/commit/7ef65e82b6d11193defffcad7fc6a111cf3cb0f9))
- update for modularity ([947e310](https://github.com/oddessentials/odd-ai-reviewers/commit/947e310d87c92af39f56fc6d1c26b51f8c3df50c))
- update formatting ([25bbbeb](https://github.com/oddessentials/odd-ai-reviewers/commit/25bbbebe6921930e257d020c949b612dd03be568))
- update MERMAID.md and README.md with model-provider validation ([88a1ecf](https://github.com/oddessentials/odd-ai-reviewers/commit/88a1ecfb748d4aef0c0ca9e88d0116ac37ca3813))
- update plan ([02c9ec6](https://github.com/oddessentials/odd-ai-reviewers/commit/02c9ec6ac2f6568cd921d9c0968cb73c87452ce2))
- update plan ([a8b4f7e](https://github.com/oddessentials/odd-ai-reviewers/commit/a8b4f7ec592bf61dc0ab010bb272fa3f6e72e23a))
- update plan ([6634d10](https://github.com/oddessentials/odd-ai-reviewers/commit/6634d10d5579b294a6719762500bc18734cce8b0))
- update plan tasks ([b742fe6](https://github.com/oddessentials/odd-ai-reviewers/commit/b742fe6f05e9ca483123ef259ee53f137a3f04b7))
- update plan.md with implementation status for Phases 1-6 ([6cd3e6e](https://github.com/oddessentials/odd-ai-reviewers/commit/6cd3e6e6121548834cfa0390339eff2eee1ce3b6))
- update readme ([582c31a](https://github.com/oddessentials/odd-ai-reviewers/commit/582c31aef52f0b2489aef6dfca8c501215aec158))
- update README and task tracking for pnpm migration ([d04675b](https://github.com/oddessentials/odd-ai-reviewers/commit/d04675b539684593878d9bcbd18169f75f31cfc6))
- update tasks ([b1d8db6](https://github.com/oddessentials/odd-ai-reviewers/commit/b1d8db6a65d230745bd23fefca961f065eb01a77))
- update tasks with more tests ([80b661d](https://github.com/oddessentials/odd-ai-reviewers/commit/80b661d1c9826ba69c5832718e1c940786ae9234))
- update tasks with more tests ([a5775c6](https://github.com/oddessentials/odd-ai-reviewers/commit/a5775c607000184011178e4c7bba7d7ba5cd90b1))
- **upgrades:** add Flight 4 major version upgrade tracking ([6aa7c5d](https://github.com/oddessentials/odd-ai-reviewers/commit/6aa7c5d753f1c91058155738dbb9f23d683c3b9d))

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

#### User-Friendly Configuration (014-user-friendly-config)

- **Auto-apply default models**: Single-key setups now auto-apply sensible default models:
  - OpenAI: `gpt-4o`
  - Anthropic: `claude-sonnet-4-20250514`
  - Ollama: `codellama:7b`
  - Azure OpenAI: No default (deployment names are user-specific)
- **Explicit provider field**: Added `provider` field to `.ai-review.yml` schema for explicit provider selection when multiple API keys are configured.
- **Resolved config tuple**: Preflight now logs the fully resolved configuration tuple (provider, model, keySource, configSource) for debugging and reproducibility.
- **Config wizard**: Added `ai-review config init` command for guided configuration generation with TTY-safe `--defaults` flag.
- **Provider selection documentation**: Added comprehensive provider selection guide with migration examples.
- **Improved error messages**: All common misconfigurations now produce actionable error messages with specific fix instructions.

### Changed

#### Breaking Changes (014-user-friendly-config)

- **Multi-key + MODEL requires explicit provider**: When multiple API keys are present AND `MODEL` is set, you must now specify `provider:` in your `.ai-review.yml`. This prevents ambiguous configuration where the intended provider is unclear.

  **Migration example:**

  ```yaml
  # Before (ambiguous - will fail)
  models:
    default: gpt-4o

  # After (explicit - works)
  provider: openai
  models:
    default: gpt-4o
  ```

- **Legacy key rejection with migration guidance**: Legacy environment variables (`OPENAI_MODEL`, `OPENCODE_MODEL`, `PR_AGENT_API_KEY`, `AI_SEMANTIC_REVIEW_API_KEY`) now fail with specific migration instructions.

#### Type System & Safety (010-type-test-optimization, 011-agent-result-unions)

- **Custom error types**: Added `ConfigError`, `AgentError`, `NetworkError`, and `ValidationError` with canonical wire format for consistent error handling and serialization across all modules.
- **Result type pattern**: Implemented `Result<T, E>` discriminated union for explicit error handling with `Ok()` and `Err()` constructors.
- **Branded types**: Added compile-time validation guarantees with `SafeGitRef`, `ValidatedConfig<T>`, and `CanonicalPath` types, including `parse`/`brand`/`unbrand` helpers.
- **assertNever utility**: Added exhaustive switch enforcement utility to catch missing cases at compile time.
- **AgentResult discriminated unions**: Refactored agent results to use `status: 'success' | 'failure' | 'skipped'` discriminated union with `AgentSuccess`, `AgentFailure`, and `AgentSkipped` constructor functions.
- **Typed metadata helpers**: Added type-safe accessors for `Finding.metadata` and `AgentContext.env` fields.

#### Cache & Reliability (012-fix-agent-result-regressions)

- **Cache schema versioning**: Added `CACHE_SCHEMA_VERSION` constant for cache key generation, ensuring legacy entries are automatically invalidated on schema changes.
- **Partial findings support**: `AgentResultFailure` now carries `partialFindings` array with `provenance: 'partial'` field, preserving findings from agents that fail mid-execution.
- **Cache validation**: Cache retrieval validates entries via `AgentResultSchema.safeParse()`, treating invalid entries as cache misses rather than runtime failures.
- **BrandHelpers.is() consistency**: Implemented `.is()` as `isOk(parse(x))` to ensure perfect consistency between type guards and parse functions.

#### Control Flow Analysis (001-fix-feedback-bugs)

- **maxNodesVisited guardrail**: Added configurable limit on CFG nodes visited per traversal (default: 10,000). Analysis returns `classification: 'unknown'` when limit is exceeded, preventing runaway analysis on complex code.
- **Spec-to-test traceability**: Added `pnpm spec:linkcheck` command and CI integration to validate that test file references in spec.md files exist.

#### Reporting & Deduplication (405-fix-grouped-comment-resolution, 406-fix-remaining-bugs)

- **Grouped comment resolution**: Fixed resolution logic to check all unique fingerprint markers within a grouped comment before marking it as resolved. A grouped comment is only resolved when ALL findings are stale.
- **Partial resolution visual indication**: Resolved findings within unresolved grouped comments are visually distinguished with Markdown strikethrough while preserving fingerprint markers.
- **Proximity-based deduplication**: Added proximity map updates after posting comments to prevent duplicate comments within the same run for findings with the same fingerprint within 20 lines.
- **Resolution logging**: Added structured `comment_resolution` log events with consistent fields across GitHub and Azure DevOps.

#### Build & Tooling (007-pnpm-timeout-telemetry)

- **pnpm migration**: Migrated from npm to pnpm as the sole supported package manager with Corepack integration.
- **Timeout telemetry**: Added timeout event emission with JSONL backend for diagnosing slow or stuck operations.
- **npm preinstall guard**: Added guard that blocks `npm install` and `npm ci` while allowing harmless commands like `npm --version`.
- **Worker-thread timeout design**: Added architecture documentation for future preemptive timeout implementation.

#### Documentation (008-docs-viewer-refactor, 009-azure-devops-permissions-docs)

- **Live reload dev server**: Added `pnpm dev` command for documentation viewer with SSE-based live reload on file changes.
- **Documentation landing page**: Changed viewer to render `docs/index.md` as default landing page instead of statistics display.
- **Azure DevOps permissions guide**: Expanded Azure DevOps documentation with complete permissions setup, error code reference, and troubleshooting guide.
- **Cross-platform troubleshooting hub**: Created unified troubleshooting documentation accessible from all platform-specific guides.

### Fixed

#### Critical Bug Fixes (001-fix-feedback-bugs)

- **Node visit limit off-by-one**: Fixed comparison operator from `>` to `>=` ensuring exactly N nodes are visited when limit is set to N (pre-increment check semantics).
- **Vulnerability mitigation mapping**: Fixed `pathMitigatesVulnerability()` to verify mitigations actually apply to the specific vulnerability type, preventing false negatives where real vulnerabilities were incorrectly suppressed.
- **Spec link checker path extraction**: Fixed regex to use global matching for all test coverage paths on a line, not just the first two capture groups.

#### Reporting Fixes (405-fix-grouped-comment-resolution, 406-fix-remaining-bugs)

- **Grouped comment resolution**: Fixed bug where entire grouped comments were marked resolved when only some findings were stale, causing active security findings to be hidden.
- **Duplicate comments within same run**: Fixed proximity map not being updated after posting comments, allowing near-duplicate comments to slip through.
- **Deleted file filtering**: Fixed path normalization mismatch between deleted files set and finding paths, ensuring findings on deleted files are properly filtered.
- **Empty marker rejection**: Added guard to reject empty strings during fingerprint marker extraction.
- **User content preservation**: Fixed visual distinction to preserve all non-marker user-authored content when applying strikethrough to resolved findings.

#### Cache Fixes (012-fix-agent-result-regressions)

- **Legacy cache entry handling**: Fixed runtime crashes when encountering pre-migration cache entries by treating schema validation failures as cache misses.
- **Path traversal defense**: Hardened cache key validation and path traversal defenses in cache operations.

#### Security Fixes

- **Shell injection hardening**: Hardened shell injection defenses across security-sensitive code paths.
- **pnpm bin resolution**: Added `shell:false` in pnpm bin resolution to prevent command injection.
- **CVE-2026-24842 remediation**: Updated dependencies to address security vulnerability.

#### Documentation Viewer Fixes (008-docs-viewer-refactor)

- **Relative markdown links**: Fixed link resolution to correctly handle relative paths like `./x.md` and `../x.md`.
- **Image path resolution**: Fixed image paths to resolve relative to current document.
- **Anchor-only hashes**: Fixed handling of anchor-only hash links within documents.
- **Windows compatibility**: Fixed file watcher path normalization for Windows systems.
- **Base path compatibility**: Fixed viewer to work correctly under GitHub Pages subpaths using relative path fetches.

### Changed

- **Logging field standardization**: Log entries now emit canonical field names alongside deprecated names during transition period.
- **Stale count calculation**: Simplified stale count calculation to use clear, single ternary expression for maintainability.
- **ADO path documentation**: Added documentation clarifying intentional difference between ADO API paths (leading slash) and deduplication paths (normalized).
- **Cache entry handling**: Changed to immutable updates (spread operator) when storing validated cache entries in memory.
- **Husky hooks**: Updated hooks to use `pnpm exec` for Windows PATH compatibility.
- **Docker configuration**: Updated Dockerfile to use pnpm instead of npm.

### Deprecated

The following log field names are deprecated and will be removed in the next release:

| Deprecated Field    | Canonical Field         | Context                    |
| ------------------- | ----------------------- | -------------------------- |
| `pattern`           | `patternId`             | Pattern evaluation logs    |
| `elapsedMs`         | `durationMs`            | Timing measurements        |
| `file`              | `filePath`              | File path references       |
| `mitigationFile`    | `filePath`              | Cross-file mitigation logs |
| `vulnerabilityFile` | `vulnerabilityFilePath` | Cross-file mitigation logs |

**Migration Guide**: Update any log consumers to use canonical field names. Both old and new field names are currently emitted for backward compatibility.

## [1.0.0] - Initial Release

### Added

- Control flow analysis agent with mitigation pattern recognition
- ReDoS prevention with pattern validation
- Cross-file mitigation tracking
- Structured logging with correlation IDs
- Budget management with graceful degradation
- GitHub and Azure DevOps PR comment integration
- Multi-agent review pipeline with caching
- Configurable review passes with agent orchestration

### Changelog

All notable changes to this project will be documented in this file. Dates are displayed in UTC.

#### [0.5.1](https://github.com/karmaniverous/jeeves/compare/0.5.0...0.5.1)

- feat: HEARTBEAT memory hygiene integration (Phase 9) [`#64`](https://github.com/karmaniverous/jeeves/pull/64)
- feat: integrate memory hygiene into HEARTBEAT cycle (Phase 9) [`5310da9`](https://github.com/karmaniverous/jeeves/commit/5310da9213e659e4069a7953b5f7c76fe95342cc)
- docs: update skill with HEARTBEAT memory integration [`79a0ffb`](https://github.com/karmaniverous/jeeves/commit/79a0ffb36a1f51f32c67c6bc60e436106e598030)
- lint:fix [`eac4771`](https://github.com/karmaniverous/jeeves/commit/eac47711e3b38ca9904fd27028c5a3c53460a32d)
- fix: add .js extension to test import (Gemini review) [`5cd00bf`](https://github.com/karmaniverous/jeeves/commit/5cd00bf90c776615c81f65186d774a59bc1fd7d6)

#### [0.5.0](https://github.com/karmaniverous/jeeves/compare/0.4.7...0.5.0)

> 2 April 2026

- feat: memory hygiene, skill seeding, SOLID/DRY pass, docs sync (Phases 7-8) [`#63`](https://github.com/karmaniverous/jeeves/pull/63)
- feat: shared workspace config loader (Phase 6) [`#62`](https://github.com/karmaniverous/jeeves/pull/62)
- feat: active cleanup escalation (Phase 5) [`#61`](https://github.com/karmaniverous/jeeves/pull/61)
- feat: managed content safety rewrite (Phase 4) [`#60`](https://github.com/karmaniverous/jeeves/pull/60)
- feat: Node 22 runtime floor (Phase 3) [`#59`](https://github.com/karmaniverous/jeeves/pull/59)
- feat: shared workspace config loader and jeeves config command [`07813e2`](https://github.com/karmaniverous/jeeves/commit/07813e279322a9baa3522cce9be9fdc01636f817)
- feat: memory hygiene + deployed jeeves skill (Phase 7) [`e70afb0`](https://github.com/karmaniverous/jeeves/commit/e70afb0006921990081d6526f3f1da573fe6517f)
- feat: escalate cleanup via gateway session spawn [`9411676`](https://github.com/karmaniverous/jeeves/commit/9411676102c8b906ed8bd9007dd236bb976659a5)
- refactor: extract heartbeat cycle and cleanup scan from ComponentWriter [`c58f13d`](https://github.com/karmaniverous/jeeves/commit/c58f13dbe1a8aa96a5af4649c4a8223e61e71b65)
- fix: address Gemini review — cross-contamination and orphaned markers [`e591c82`](https://github.com/karmaniverous/jeeves/commit/e591c823c32b4f667d06b5214977b18b74503bf5)
- chore: remove Phase 5 files accidentally included in Phase 4 PR [`613e388`](https://github.com/karmaniverous/jeeves/commit/613e3885dbe122260da8ffb6fa16fee5f4b1798b)
- feat: keep managed blocks stationary and move cleanup warning inside block [`7c30c57`](https://github.com/karmaniverous/jeeves/commit/7c30c5723e1090f13937acc35962476ac77dcaf3)
- docs: sync README and guides with v0.5.0 features [`f6c0b83`](https://github.com/karmaniverous/jeeves/commit/f6c0b830c4ab93e51652bbde6d3c740f784eff64)
- feat: Node 22 runtime floor [`fcd61fe`](https://github.com/karmaniverous/jeeves/commit/fcd61fec6b61b1cf1889d0493d7381b746cc8c34)
- fix: address Gemini review — env guard, absolute paths, warn on bad config, dynamic output [`a55a446`](https://github.com/karmaniverous/jeeves/commit/a55a446888960a2c785f8266ffc3cad2198fc7fc)
- chore: release v0.5.0 [`f47eeca`](https://github.com/karmaniverous/jeeves/commit/f47eeca046efbeeda837b4b1ff1e70ffcc131452)
- fix: address Gemini review — remove redundant check, deduplicate escalation [`b47a489`](https://github.com/karmaniverous/jeeves/commit/b47a4892ab34501ab0270ac7df73f065f4527307)
- refactor: use semver.major() for Node version check [`d86b3ae`](https://github.com/karmaniverous/jeeves/commit/d86b3aecaa07ec9b993c9ce8106c66bdae13eb6a)
- fix: address Gemini review — zero-budget guard, remove redundant replace [`c6595e2`](https://github.com/karmaniverous/jeeves/commit/c6595e214825a19aac258cefa2d501b681cf0425)

#### [0.4.7](https://github.com/karmaniverous/jeeves/compare/0.4.6...0.4.7)

> 2 April 2026

- feat: v0.5.0 Phase 1 — Plugin installer fix + utility hoist [`#58`](https://github.com/karmaniverous/jeeves/pull/58)
- feat: plugin installer fix + utility hoist + getPackageVersion [`#57`](https://github.com/karmaniverous/jeeves/pull/57)
- feat: plugin installer fix + utility hoist + getPackageVersion (#57) [`#57`](https://github.com/karmaniverous/jeeves/issues/57)
- test: fill test gaps for Phase 1 validation [`683d96c`](https://github.com/karmaniverous/jeeves/commit/683d96c3ec614b5dee214423a830e847771b3192)
- chore: release v0.4.7 [`9f837f9`](https://github.com/karmaniverous/jeeves/commit/9f837f91badc48a3f0726cccbc04a51d4fcb81d2)

#### [0.4.6](https://github.com/karmaniverous/jeeves/compare/0.4.5...0.4.6)

> 31 March 2026

- fix: call init() before descriptor.run() in start command [`#54`](https://github.com/karmaniverous/jeeves/pull/54)
- [53] fix: call init() before descriptor.run() in start command [`27a9aea`](https://github.com/karmaniverous/jeeves/commit/27a9aeac87a8dec4635723b28b9a4c0a470fc5db)
- chore: release v0.4.6 [`fb7e67d`](https://github.com/karmaniverous/jeeves/commit/fb7e67d27383e7dfcc35df53e226cefe95fb7669)

#### [0.4.5](https://github.com/karmaniverous/jeeves/compare/0.4.4...0.4.5)

> 30 March 2026

- fix: replace spawn recursion with descriptor.run in start command [`#52`](https://github.com/karmaniverous/jeeves/pull/52)
- [51] fix: replace spawn recursion with descriptor.run in start command [`6827943`](https://github.com/karmaniverous/jeeves/commit/68279432f0d36a825e9141c99568f21556df1ac5)
- chore: release v0.4.5 [`290f938`](https://github.com/karmaniverous/jeeves/commit/290f9387b219758e268985ded7b5a1ac5938f8e8)
- [51] chore: remove temp scripts [`95fe447`](https://github.com/karmaniverous/jeeves/commit/95fe44744fc4a341cac85381bb9c055d7989c6b0)
- [51] chore: remove remaining temp scripts [`7702b34`](https://github.com/karmaniverous/jeeves/commit/7702b3429f9621ec61e83a5ff1f8c684ed4b06b0)

#### [0.4.4](https://github.com/karmaniverous/jeeves/compare/0.4.3...0.4.4)

> 30 March 2026

- fix: atomicWrite temp file leak + semver guard for dev/test [`#49`](https://github.com/karmaniverous/jeeves/pull/49)
- chore: update dependencies [`#48`](https://github.com/karmaniverous/jeeves/pull/48)
- fix: clean up temp files on failed atomic write + guard invalid semver in tests [`6a3bdc5`](https://github.com/karmaniverous/jeeves/commit/6a3bdc54f7039a18efdd53bfd77c13be5ba97042)
- chore: release v0.4.4 [`6203283`](https://github.com/karmaniverous/jeeves/commit/6203283925ea290730fa98e2a1bd39a722c8114f)

#### [0.4.3](https://github.com/karmaniverous/jeeves/compare/0.4.2...0.4.3)

> 29 March 2026

- fix: config CLI tree and config apply wire format [`#47`](https://github.com/karmaniverous/jeeves/pull/47)
- chore: release v0.4.3 [`b8fde1b`](https://github.com/karmaniverous/jeeves/commit/b8fde1b6d46369a5e6c8e95e955f529ed56a28e8)

#### [0.4.2](https://github.com/karmaniverous/jeeves/compare/0.4.1...0.4.2)

> 29 March 2026

- feat: add customMerge hook to createConfigApplyHandler [`#46`](https://github.com/karmaniverous/jeeves/pull/46)
- chore: release v0.4.2 [`6988cd1`](https://github.com/karmaniverous/jeeves/commit/6988cd162d0f340a190d1cb8ba2ea2a1ef283fd3)
- fix: defensive nullish coalescing in customMerge test mock [`f31ae20`](https://github.com/karmaniverous/jeeves/commit/f31ae20a33d37d1dbd36c76817f70c6af5a063c3)

#### [0.4.1](https://github.com/karmaniverous/jeeves/compare/0.4.0...0.4.1)

> 29 March 2026

- feat: v0.5.0 — Component SDK (factory-driven CLI, plugin tools, HTTP handlers) [`#45`](https://github.com/karmaniverous/jeeves/pull/45)
- feat: phase 1 - descriptor schema, status handler, plugin CLI [`362236e`](https://github.com/karmaniverous/jeeves/commit/362236ef8d255768750ad39593054dcbb3fe1e54)
- feat: phase 2 - service manager, config apply handler, writer migration [`0cd10ed`](https://github.com/karmaniverous/jeeves/commit/0cd10ed86ae631f3a40194f2f76b07dcfdd5b68c)
- feat: phase 3 - service CLI factory, plugin toolset factory [`4f50567`](https://github.com/karmaniverous/jeeves/commit/4f50567755fb501c07a2cb7623feaf92a746de0e)
- refactor: remove dead JeevesComponent types and extract shared test helper [`24cc305`](https://github.com/karmaniverous/jeeves/commit/24cc305d1c8e10f035d6a4e220b7257a06898926)
- feat: phase 4 - unified CLI with dynamic subcommand discovery [`9e541b1`](https://github.com/karmaniverous/jeeves/commit/9e541b1daaf8ad9e57b10462af7c659112dab599)
- test: add CLI integration tests for createServiceCli [`56b6b8e`](https://github.com/karmaniverous/jeeves/commit/56b6b8e8ac873c6c1731def01013a18ce5243953)
- fix: address Gemini review comments [`686aff1`](https://github.com/karmaniverous/jeeves/commit/686aff1bb0fd16137599f0c931537a5408be9340)
- chore: release v0.4.1 [`42bbdd5`](https://github.com/karmaniverous/jeeves/commit/42bbdd55a0af1d36f85cda13d256757b052b93ea)
- chore: remove temp commit script [`7e8c484`](https://github.com/karmaniverous/jeeves/commit/7e8c484cc2cfb9877c51e4512cddfbe28e385b51)
- fix: increase timeout for discoverComponents tests [`7bda59c`](https://github.com/karmaniverous/jeeves/commit/7bda59ce7b5264364c9cdc46c9fa8f5c8265b977)

#### [0.4.0](https://github.com/karmaniverous/jeeves/compare/0.3.1...0.4.0)

> 29 March 2026

- feat: v0.4.0 — HEARTBEAT bootstrap, bind address, position, CLI fix [`#44`](https://github.com/karmaniverous/jeeves/pull/44)
- fix: resolve commander ESM import failure in published CLI build [`#41`](https://github.com/karmaniverous/jeeves/pull/41)
- feat: C9 heading-based HEARTBEAT section writer [`9acc940`](https://github.com/karmaniverous/jeeves/commit/9acc9400f6dd644060033b642301cbd2d7ac3e6f)
- feat: C10 HEARTBEAT health orchestration [`055469c`](https://github.com/karmaniverous/jeeves/commit/055469c97fe51fcf66b03f458c9e03c0a30031da)
- feat: C3 getBindAddress + C7 getServiceState [`e92c75c`](https://github.com/karmaniverous/jeeves/commit/e92c75c1ea68fad62a5d4d7cea1003b637aeb733)
- test: orchestrator unit tests (10 cases) [`ba5f07e`](https://github.com/karmaniverous/jeeves/commit/ba5f07eb722444ac55a86899a32a520f66eb1dcd)
- feat: v0.4.0 infrastructure (C2-C6, C8) [`22bd62d`](https://github.com/karmaniverous/jeeves/commit/22bd62d735e53d31ff0af4fb1eebcf75b4b711b0)
- chore: pass all quality gates (lint, knip, typecheck) [`134a1b9`](https://github.com/karmaniverous/jeeves/commit/134a1b91584126e46f2df1ae12620f2c8226f193)
- refactor: SOLID/DRY cleanup [`c50fefe`](https://github.com/karmaniverous/jeeves/commit/c50fefe3eb6c2c5ac266c88d6adc8f2c161a6189)
- test: fill coverage gaps [`c570ecc`](https://github.com/karmaniverous/jeeves/commit/c570ecca91b33e2e90865e4deb148d300094e60c)
- npm audit fix [`166d157`](https://github.com/karmaniverous/jeeves/commit/166d157ff13643064d0767f2afb92bdaa8abd739)
- feat: C11 CLI writes initial HEARTBEAT + C12 AGENTS content update [`bfb399c`](https://github.com/karmaniverous/jeeves/commit/bfb399cd4b906cc78cdcd78e9cac51ad498cccc9)
- fix: address Gemini review comments [`781446a`](https://github.com/karmaniverous/jeeves/commit/781446a960a035211113ffcb07afd1d698a122c9)
- feat: proactive update alerts in HEARTBEAT [`8cff4be`](https://github.com/karmaniverous/jeeves/commit/8cff4be03d80e4ec95ad2e24067866411158d6b0)
- chore: release v0.4.0 [`9ae5ac6`](https://github.com/karmaniverous/jeeves/commit/9ae5ac6d45b5bebc01a7a612c12a06df3184f720)
- fix: export all new v0.4.0 public API from src/index.ts [`a3bab50`](https://github.com/karmaniverous/jeeves/commit/a3bab5063dfbffec107af6d15b2d1d46694c4a72)
- feat: proactive session-start bootstrap via AGENTS directive [`627f067`](https://github.com/karmaniverous/jeeves/commit/627f067b69d04b8a84f18957698938f1b15b8bef)

#### [0.3.1](https://github.com/karmaniverous/jeeves/compare/0.3.0...0.3.1)

> 25 March 2026

- fix: double shebang, CORE_VERSION stamp, cross-contamination [`#39`](https://github.com/karmaniverous/jeeves/pull/39)
- fix: remove double shebang from CLI entry point [`#32`](https://github.com/karmaniverous/jeeves/issues/32)
- docs: add TSDoc to inline type properties in PluginApi and ToolResult [`03ac1e4`](https://github.com/karmaniverous/jeeves/commit/03ac1e45e812b609b7c6c485a74dd5c9a919729b)
- refactor: move ALL_MARKERS to constants/markers.ts as single source of truth [`13bbc6c`](https://github.com/karmaniverous/jeeves/commit/13bbc6c7a8f0a0979ec9fd152a12f4cd8de9bbf0)
- chore: release v0.3.1 [`e684b64`](https://github.com/karmaniverous/jeeves/commit/e684b646f4352eba49e7af2da5f34200f3015257)
- content: strengthen managed section content for 0.3.1 [`8560a03`](https://github.com/karmaniverous/jeeves/commit/8560a03c524e21a5e29fb01a585103d34c766f71)

#### [0.3.0](https://github.com/karmaniverous/jeeves/compare/0.2.0...0.3.0)

> 22 March 2026

- feat: v0.3.0 — remove cross-service probing, SDK cleanup, content updates [`#36`](https://github.com/karmaniverous/jeeves/pull/36)
- [V0-3] feat: implement v0.3.0 dev plan — remove probing, SDK cleanup, content updates [`e0766a7`](https://github.com/karmaniverous/jeeves/commit/e0766a7cb5620a7edd412a89c85c22a16ab7772d)
- [V0-3] test: close coverage gaps — fetchWithTimeout, statusCommand, template branches [`60a08b0`](https://github.com/karmaniverous/jeeves/commit/60a08b0664f9526974aca454ff6b3881f1399d99)
- [V0-3] refactor: SOLID/DRY cleanup — extract fetchWithTimeout, remove deprecated re-export [`92a5932`](https://github.com/karmaniverous/jeeves/commit/92a59322242c3fcbfd24650722e8f205cb2740b2)
- [V0-3] fix: remove dead code, replace Handlebars markers with HTML comments [`445be09`](https://github.com/karmaniverous/jeeves/commit/445be096bbb7585449f84d76c0a29ae99dad51ae)
- [V0-3] test: remove trivial tests — type-assignability checks, tautological assertions [`bbb244c`](https://github.com/karmaniverous/jeeves/commit/bbb244c1dab279ac2de0d477b260badbf74e7304)
- chore: release v0.3.0 [`dd07a46`](https://github.com/karmaniverous/jeeves/commit/dd07a46e1cdf3ebbe7b147e886ef04ff92b76025)
- [V0-3] chore: remove temp script [`188d5c1`](https://github.com/karmaniverous/jeeves/commit/188d5c17522ef9e12f9d74179d70baa46844eeca)

#### [0.2.0](https://github.com/karmaniverous/jeeves/compare/0.1.6...0.2.0)

> 20 March 2026

- feat: v0.2.0 Plugin SDK, managed content, config query [`#6`](https://github.com/karmaniverous/jeeves/pull/6)
- [V0-2] feat: Phase 1 — Plugin SDK types and utilities [`bd9b3c1`](https://github.com/karmaniverous/jeeves/commit/bd9b3c1742378a7f5825d99f01b397b29148a607)
- [V0-2] feat: Phase 2 — Managed content removal, semver fix, component versions [`80a1f40`](https://github.com/karmaniverous/jeeves/commit/80a1f409865e014f95161d93a1828e9b3863141b)
- [V0-2] docs: update README and guides for v0.2.0 Plugin SDK [`293ac2a`](https://github.com/karmaniverous/jeeves/commit/293ac2a9dc17e1a6a8ac2e9852944bc18414039f)
- [V0-2] fix: patch tools.alsoAllow, read component versions in platform refresh, consolidate resolveWorkspacePath [`b1466a0`](https://github.com/karmaniverous/jeeves/commit/b1466a0858d3f4477f7a71439bc0087ad9c9da95)
- [V0-2] refactor: extract shared fileOps (atomicWrite, withFileLock, constants) from managed section files [`f429df6`](https://github.com/karmaniverous/jeeves/commit/f429df6d3a11e02b8466b602148ce554d612797e)
- [V0-2] refactor: extract buildServiceRows from refreshPlatformContent [`d705be3`](https://github.com/karmaniverous/jeeves/commit/d705be30b3d24ee97b22d9005d0c90853b90cd53)
- [V0-2] feat: Phase 3 — Config query handler with JSONPath support [`c1e80a9`](https://github.com/karmaniverous/jeeves/commit/c1e80a9d1901cd142dca3296d9b643d2e3131737)
- npm audit fix [`0393220`](https://github.com/karmaniverous/jeeves/commit/0393220510cf9e91217ed8940aa5327951805502)
- [V0-2] refactor: extract ManagedMarkers interface from inline types [`502eba4`](https://github.com/karmaniverous/jeeves/commit/502eba478fcf3bc99b312e5af37fbeec4595d36b)
- chore: release v0.2.0 [`a270358`](https://github.com/karmaniverous/jeeves/commit/a2703585d2e115a25cb1287664d1b4d73881df1f)
- [V0-2] chore: remove stray _push.cjs helper script [`6c0c1d8`](https://github.com/karmaniverous/jeeves/commit/6c0c1d8f2d54a955bf522c2d7c9f72409f671852)
- [V0-2] test: add 400 error path test for invalid JSONPath in configQuery [`57c9b63`](https://github.com/karmaniverous/jeeves/commit/57c9b63a9f66e4afb545c7032e055b0d5c0fb4c0)

#### [0.1.6](https://github.com/karmaniverous/jeeves/compare/0.1.5...0.1.6)

> 18 March 2026

- fix: CORE_VERSION inlining, H1 titles, merge Service Health table [`#5`](https://github.com/karmaniverous/jeeves/pull/5)
- fix: inline CORE_VERSION at build time, add H1 titles to SOUL/AGENTS, merge Service Health into Platform table [`2211301`](https://github.com/karmaniverous/jeeves/commit/2211301022f6b67221942c462c2985b99f823d4b)
- chore: release v0.1.6 [`4600fa6`](https://github.com/karmaniverous/jeeves/commit/4600fa600058a8d42936c8fd3fecf1c0045ed037)

#### [0.1.5](https://github.com/karmaniverous/jeeves/compare/0.1.4...0.1.5)

> 18 March 2026

- fix: check config workspace before resolvePath (resolvePath returns cwd, not workspace) [`cbe441a`](https://github.com/karmaniverous/jeeves/commit/cbe441a4f7897f1ed981871cc063236afc488501)
- chore: release v0.1.5 [`69296ce`](https://github.com/karmaniverous/jeeves/commit/69296ce242a456ac3134fcad1963c7de2362ff79)

#### [0.1.4](https://github.com/karmaniverous/jeeves/compare/0.1.3...0.1.4)

> 18 March 2026

- fix: add resolveWorkspacePath to core [`#4`](https://github.com/karmaniverous/jeeves/pull/4)
- fix: add resolveWorkspacePath to core (fixes writer writing to system32 when gateway cwd is C:\Windows\system32) [`b1b82ab`](https://github.com/karmaniverous/jeeves/commit/b1b82abe64327d5c40205bc9234705a95a64b273)
- chore: release v0.1.4 [`98cf6d5`](https://github.com/karmaniverous/jeeves/commit/98cf6d5c13c8c58f79c42820556339659b216662)

#### [0.1.3](https://github.com/karmaniverous/jeeves/compare/0.1.2...0.1.3)

> 18 March 2026

- fix: inline content files at build time (fixes empty managed sections when bundled) [`#3`](https://github.com/karmaniverous/jeeves/pull/3)
- fix: inline content files at build time via rollup md plugin (fixes empty managed sections when bundled into consumers) [`4b49be7`](https://github.com/karmaniverous/jeeves/commit/4b49be768009b328aa424e3636c2b5f90911e8fc)
- chore: release v0.1.3 [`932ab91`](https://github.com/karmaniverous/jeeves/commit/932ab9117d917e604297661131ec549fc414b0d6)

#### [0.1.2](https://github.com/karmaniverous/jeeves/compare/0.1.1...0.1.2)

> 18 March 2026

- fix: use package-directory for content file resolution [`#2`](https://github.com/karmaniverous/jeeves/pull/2)
- fix: use package-directory for content file resolution (fixes empty managed sections) [`85f2f38`](https://github.com/karmaniverous/jeeves/commit/85f2f381ea7060af5dc6f6110857edeeb38148f3)
- chore: release v0.1.2 [`b4f7038`](https://github.com/karmaniverous/jeeves/commit/b4f70380f40de95fe33b673484b249e10930cf59)

#### [0.1.1](https://github.com/karmaniverous/jeeves/compare/0.1.0...0.1.1)

> 18 March 2026

- feat: add async content cache helper for sync generateToolsContent [`b0ea44e`](https://github.com/karmaniverous/jeeves/commit/b0ea44e7c26e257402e258e831d558b77edb61a2)
- fix: use package-directory instead of hand-rolled package.json resolution [`b9dc559`](https://github.com/karmaniverous/jeeves/commit/b9dc5596fddc8d76ccf072312b08df25a3f13eb1)
- fix: resolve package.json from dist/ via directory walk (fixes MODULE_NOT_FOUND when consumed as dependency) [`96518d5`](https://github.com/karmaniverous/jeeves/commit/96518d52f47ddc56c324d5befa05f1418bf444e1)
- chore: release v0.1.1 [`dd246b8`](https://github.com/karmaniverous/jeeves/commit/dd246b8e2a8d08c0c595184b866a1bd28eecc937)

#### 0.1.0

> 18 March 2026

- feat: jeeves-core v0.1.0 — library, content, CLI, integration tests [`#1`](https://github.com/karmaniverous/jeeves/pull/1)
- Initial commit [`126f0b9`](https://github.com/karmaniverous/jeeves/commit/126f0b9bf62f78c33901826e55c5e0efceb3d683)
- feat: core library foundation (Tasks 1-6a, 7-9) [`d273e1f`](https://github.com/karmaniverous/jeeves/commit/d273e1f3db6b2b535997d3f0c0b6c170b25d5e75)
- feat: Tasks 10, 16-22 — refreshPlatformContent, CLI commands, integration tests [`47b9c7e`](https://github.com/karmaniverous/jeeves/commit/47b9c7ee0ee83a9df8df89920f8768f879296a7b)
- feat: author content files for Tasks 11-15 [`a3c5399`](https://github.com/karmaniverous/jeeves/commit/a3c539991645ffd17c13d04fcac9e3f26dede137)
- docs: author README, TypeDoc guides, fix all TSDoc warnings [`126d6c0`](https://github.com/karmaniverous/jeeves/commit/126d6c0385b190fab425278f5b2d0a484d972bdc)
- chore: release v0.1.0 [`729a638`](https://github.com/karmaniverous/jeeves/commit/729a638e18f49d9e80c3989cbe3ec839a48f2748)
- docs: first-person SOUL, move operational gates to AGENTS, README storytelling + pronouns + links [`a0e38de`](https://github.com/karmaniverous/jeeves/commit/a0e38dec5637825efca132513b5397a5fcd2c35f)
- docs: rewrite README - Jeeves bootstraps an identity, not just plumbing [`3930433`](https://github.com/karmaniverous/jeeves/commit/39304337915965cb7244850b0d2cd41583f960a6)
- docs: add PlantUML diagrams, front matter titles, team narrative, remove template diagrams [`f27db2c`](https://github.com/karmaniverous/jeeves/commit/f27db2cf653972389e12421affe4471636590546)
- fix: add DO NOT EDIT to markers, H1 title in section mode, fix tests to use constants [`f02abc2`](https://github.com/karmaniverous/jeeves/commit/f02abc293f52de22ef9138310555a41a6fd56ae4)
- docs: README rewrite - tell the story, don't sell it [`a27aa7d`](https://github.com/karmaniverous/jeeves/commit/a27aa7d2b4956df0e119e93d5e93625f38fa1948)
- refactor: extract shared CLI defaults to cliDefaults.ts (DRY) [`cafcfd5`](https://github.com/karmaniverous/jeeves/commit/cafcfd555617a40e2a58ba94a262257418299a0e)
- docs: em-dash discipline - add AGENTS rule, fix misuse across all docs + content [`3e4f2d8`](https://github.com/karmaniverous/jeeves/commit/3e4f2d820442aef702764345b97dfb3b42f96c48)
- refactor: extract sortSectionsByOrder, use CLEANUP_FLAG constant (DRY) [`ec78b42`](https://github.com/karmaniverous/jeeves/commit/ec78b425910beea7d05f3e45cac9c2a6a5e431d3)
- test: remove trivial constant-assertion tests (ports, sections) [`f0947f4`](https://github.com/karmaniverous/jeeves/commit/f0947f4fe4d3a7ab4637584f2aecd68ff14b8ffe)
- fix: read CORE_VERSION from package.json instead of hardcoding [`db4bc24`](https://github.com/karmaniverous/jeeves/commit/db4bc242a2c77d42df46be3856065f69421cc3c7)
- docs: dynamic files, component onboarding narrative, restore haiku + footer [`ec75a16`](https://github.com/karmaniverous/jeeves/commit/ec75a16e786ac7bc2c0785381a5e17e3e6430518)
- Update README with clearer installation and identity info [`8bd2aeb`](https://github.com/karmaniverous/jeeves/commit/8bd2aebb9f19228429b677fda3976a3df4e71070)
- Revise Genesis section and attribution wording [`6955794`](https://github.com/karmaniverous/jeeves/commit/6955794795c07636a0e315f96b8b9d689e6a9fa9)
- Refactor poem layout in soul-section.md [`3385f52`](https://github.com/karmaniverous/jeeves/commit/3385f52d85fa9ddc8ebbc866429a1f4bed05e1e7)
- updated settings [`7194465`](https://github.com/karmaniverous/jeeves/commit/71944657bd3b2227e1adb4108039186c2c4e9571)
- diagrams: white background instead of transparent [`c62237b`](https://github.com/karmaniverous/jeeves/commit/c62237bddf5e89afcfe31ec5f54934aeb65fce37)
- Update documentation links in README.md [`a4f63c4`](https://github.com/karmaniverous/jeeves/commit/a4f63c40bb66eb1dba660e756f22b5529c5e02a1)
- ci: add top-level permissions to docs workflow (fix startup_failure) [`035eb2a`](https://github.com/karmaniverous/jeeves/commit/035eb2aa1f2223364ee3a5bdafb9cfae8c9062ac)
- Update README.md [`3cee9e3`](https://github.com/karmaniverous/jeeves/commit/3cee9e3af92014f11555794f5dc389fc0a78b59d)
- Remove historical context from README [`d215c34`](https://github.com/karmaniverous/jeeves/commit/d215c34e0aec335daa06208b9a6593138223c68f)
- Change header order in README.md [`9014e86`](https://github.com/karmaniverous/jeeves/commit/9014e869b62b9fd61b79af131de2b5b88fd48644)
- Update project title in README with emoji [`de4c2a5`](https://github.com/karmaniverous/jeeves/commit/de4c2a59debbebe05e3eabba2219e2273db692ce)
- Refactor OpenClaw description for clarity [`d67d89e`](https://github.com/karmaniverous/jeeves/commit/d67d89eee86d33e9a37944518b6552e0aca64d92)
- docs: clarify OpenClaw vs Jeeves responsibilities [`4a173a7`](https://github.com/karmaniverous/jeeves/commit/4a173a7884d8aa3cfb9d3a662046bc347895bb50)

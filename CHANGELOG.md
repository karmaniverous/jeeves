### Changelog

All notable changes to this project will be documented in this file. Dates are displayed in UTC.

#### [0.3.0](https://github.com/karmaniverous/jeeves/compare/0.2.0...0.3.0)

- feat: v0.3.0 — remove cross-service probing, SDK cleanup, content updates [`#36`](https://github.com/karmaniverous/jeeves/pull/36)
- [V0-3] feat: implement v0.3.0 dev plan — remove probing, SDK cleanup, content updates [`e0766a7`](https://github.com/karmaniverous/jeeves/commit/e0766a7cb5620a7edd412a89c85c22a16ab7772d)
- [V0-3] test: close coverage gaps — fetchWithTimeout, statusCommand, template branches [`60a08b0`](https://github.com/karmaniverous/jeeves/commit/60a08b0664f9526974aca454ff6b3881f1399d99)
- [V0-3] refactor: SOLID/DRY cleanup — extract fetchWithTimeout, remove deprecated re-export [`92a5932`](https://github.com/karmaniverous/jeeves/commit/92a59322242c3fcbfd24650722e8f205cb2740b2)
- [V0-3] fix: remove dead code, replace Handlebars markers with HTML comments [`445be09`](https://github.com/karmaniverous/jeeves/commit/445be096bbb7585449f84d76c0a29ae99dad51ae)
- [V0-3] test: remove trivial tests — type-assignability checks, tautological assertions [`bbb244c`](https://github.com/karmaniverous/jeeves/commit/bbb244c1dab279ac2de0d477b260badbf74e7304)
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

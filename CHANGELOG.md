# Changelog

## [0.3.0](https://github.com/nomed/yukh/compare/v0.2.2...v0.3.0) (2026-07-19)


### Features

* add idempotent Project bootstrap ([d2af05f](https://github.com/nomed/yukh/commit/d2af05ffc92244a26141ed04de4e149819b73988))
* add Project schema bootstrap planner and executor ([b3edeb2](https://github.com/nomed/yukh/commit/b3edeb2260d9327a8d663668eccdf74f623ed60c))
* expose Project bootstrap operation ([0c30633](https://github.com/nomed/yukh/commit/0c30633e458985109c5ff1a11eb7081d1a0b47bc))
* route bootstrap-project operation ([ba0ba62](https://github.com/nomed/yukh/commit/ba0ba625f032e0d6a98c44f836320a332a120bbf))


### Bug Fixes

* satisfy strict bootstrap typing ([f72fb0b](https://github.com/nomed/yukh/commit/f72fb0bc465eae20146147daf7855eca03e65256))

## [0.2.2](https://github.com/nomed/yukh/compare/v0.2.1...v0.2.2) (2026-07-19)


### Bug Fixes

* align Action workflows ([#50](https://github.com/nomed/yukh/issues/50)) ([a7f50d3](https://github.com/nomed/yukh/commit/a7f50d3ae18f2582ba6a8fe3f0510b8fab42644e))
* stop self policy from requiring missing Type/Area fields ([f5b638c](https://github.com/nomed/yukh/commit/f5b638c692cbbcbf5a49790883b4423039894c68))

## [0.2.1](https://github.com/nomed/yukh/compare/v0.2.0...v0.2.1) (2026-07-18)


### Bug Fixes

* use local action in self-apply workflow ([44536ea](https://github.com/nomed/yukh/commit/44536ea96a1ab08c0ab55b5a4b31305dbb9ef265))

## [0.2.0](https://github.com/nomed/yukh/compare/v0.1.0...v0.2.0) (2026-07-18)


### Features

* dogfood Yukh before UC Rust adoption ([ec400a4](https://github.com/nomed/yukh/commit/ec400a471345f56a93019890663383d90aa5a490))
* publish standard GitHub Action version tags ([e482c98](https://github.com/nomed/yukh/commit/e482c98b51fc91c24ee6783a7a82aed12cc12245))


### Bug Fixes

* actionable diagnostics and workflow input for missing project number ([1d3b17b](https://github.com/nomed/yukh/commit/1d3b17b4607283c6c4fd71b9e24119eaa0345cff))
* improve project number diagnostics and add workflow dispatch input ([46c3926](https://github.com/nomed/yukh/commit/46c392645509a41cb1192bb5b20dcb00c6375f11))
* make self workflows respect caller permissions ([#38](https://github.com/nomed/yukh/issues/38)) ([526a481](https://github.com/nomed/yukh/commit/526a48156f87f24f484b194217bf1067d192d9a1))
* remove 'release-as' field from configuration ([07270db](https://github.com/nomed/yukh/commit/07270db0556a089bc436af6bb89bc31250407864))
* remove floating release tag references ([ee97ba3](https://github.com/nomed/yukh/commit/ee97ba396d94d28e028aa7a696ac1df9d9cbd2d8))
* remove fromJSON() wrapper from YUKH_PROJECT_NUMBER in workflow ([91dbbcf](https://github.com/nomed/yukh/commit/91dbbcf48315d534b3db66687244a060fa63ae0e))
* use vars.YUKH_PROJECT_NUMBER directly instead of fromJSON() ([b8c7f68](https://github.com/nomed/yukh/commit/b8c7f688e137752ed01b2af249fa20480ed1963a))

## [0.1.0](https://github.com/nomed/yukh/compare/v0.1.0...v0.1.0) (2026-07-18)


### Features

* dogfood Yukh before UC Rust adoption ([ec400a4](https://github.com/nomed/yukh/commit/ec400a471345f56a93019890663383d90aa5a490))


### Bug Fixes

* actionable diagnostics and workflow input for missing project number ([1d3b17b](https://github.com/nomed/yukh/commit/1d3b17b4607283c6c4fd71b9e24119eaa0345cff))
* improve project number diagnostics and add workflow dispatch input ([46c3926](https://github.com/nomed/yukh/commit/46c392645509a41cb1192bb5b20dcb00c6375f11))
* make self workflows respect caller permissions ([#38](https://github.com/nomed/yukh/issues/38)) ([526a481](https://github.com/nomed/yukh/commit/526a48156f87f24f484b194217bf1067d192d9a1))
* remove fromJSON() wrapper from YUKH_PROJECT_NUMBER in workflow ([91dbbcf](https://github.com/nomed/yukh/commit/91dbbcf48315d534b3db66687244a060fa63ae0e))
* use vars.YUKH_PROJECT_NUMBER directly instead of fromJSON() ([b8c7f68](https://github.com/nomed/yukh/commit/b8c7f688e137752ed01b2af249fa20480ed1963a))

## 0.1.0 (2026-07-18)


### Features

* add safe dry-run GitHub Action runtime ([38f950e](https://github.com/nomed/yukh/commit/38f950e7951fcc3d06ed27350453ac2da4d5aca1))
* add versioned packaging and automated releases ([46c5930](https://github.com/nomed/yukh/commit/46c5930e79bd2eb10d17d41bca5df832538ac9ae))
* implement complete Project field reconciliation flow ([#24](https://github.com/nomed/yukh/issues/24)) ([6d3dcce](https://github.com/nomed/yukh/commit/6d3dcce476e71dd55067ad88e51eba91cd26dd8a))
* implement connected apply-mode GitHub Action runtime ([#28](https://github.com/nomed/yukh/issues/28)) ([3635a11](https://github.com/nomed/yukh/commit/3635a11492d3fa104907eaeacdcded8a66dcacda))
* implement first idempotent Project mutation ([#18](https://github.com/nomed/yukh/issues/18)) ([0379658](https://github.com/nomed/yukh/commit/03796583d0f1db69adebc6a5b29875c1115d48fd))
* implement idempotent relationship application ([#22](https://github.com/nomed/yukh/issues/22)) ([31c7a8d](https://github.com/nomed/yukh/commit/31c7a8dcf28bd6c973aba2ba8e2ab9850b2e6cea))
* implement issue contract parser and validator ([#14](https://github.com/nomed/yukh/issues/14)) ([5c1ba13](https://github.com/nomed/yukh/commit/5c1ba13c3909cfb9abfdd295a4b0b336bc76e364))
* implement policy loader and desired-state builder ([#15](https://github.com/nomed/yukh/issues/15)) ([77c16ef](https://github.com/nomed/yukh/commit/77c16ef154a7e6f484a5a5fc55ad04611849e165))
* implement read-only Project discovery and observed state ([7a8f0e4](https://github.com/nomed/yukh/commit/7a8f0e4a98ec1a78c0ccc6e204f53a42f86de617))
* implement read-only reconciliation report ([#16](https://github.com/nomed/yukh/issues/16)) ([3e76d99](https://github.com/nomed/yukh/commit/3e76d9934570a75f07c908fee4ce0a6acbb56f0b))
* implement relationship validation and reconciliation planning ([d8c15ed](https://github.com/nomed/yukh/commit/d8c15ed1e22da47a165e79cca9e89e9c76b67f7c))


### Bug Fixes

* bootstrap first release ([#34](https://github.com/nomed/yukh/issues/34)) ([867b3cc](https://github.com/nomed/yukh/commit/867b3cc63511777e6bd0a0eb23fcb34ccc520181))

## Changelog

All notable changes to Yukh are documented here. Releases are generated by release-please from Conventional Commits.

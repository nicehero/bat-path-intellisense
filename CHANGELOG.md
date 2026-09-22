# 更新日志

BAT Path IntelliSense 的所有重要变更都会记录在此文件中。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.0.1] - 2026-09-22

### 新增

- 为 `.bat` / `.cmd` 文件提供文件与目录的路径补全。
- 支持相对路径（`.\`、`..\`、`sub\`）、绝对路径（`C:\...`）与 UNC 路径（`\\server\share\...`）。
- 在 `\`、`/`、`.`、空格、`"` 之后自动触发补全。
- 目录补全自动追加 `\`，并把光标停在其后以便继续输入下一级。
- 文件名匹配大小写不敏感，符合 Windows 文件系统行为。
- 新增配置项 `batPathIntellisense.autoTrigger`、`batPathIntellisense.showFiles`、`batPathIntellisense.showDirectories`。

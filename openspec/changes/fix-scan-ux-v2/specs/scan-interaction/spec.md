## ADDED Requirements

### Requirement: 扫描失败显示原因
扫描失败时必须显示具体错误消息。

#### Scenario: 扫描失败
- **WHEN** scan_project 返回失败
- **THEN** 面板显示错误原因而非泛化的"扫描失败"

### Requirement: 扫描按钮禁用
扫描期间面板扫描按钮必须不可点击。

#### Scenario: 按钮禁用
- **WHEN** 扫描进行中
- **THEN** 扫描按钮 disabled + 显示"扫描中…"
- **AND** 用户无法重复点击

### Requirement: 版本号更新
所有版本号必须同步更新。

#### Scenario: 版本一致
- **WHEN** pom.xml 版本更新
- **THEN** jacg-bridge.ts 和 application.yml 中的版本号同步更新

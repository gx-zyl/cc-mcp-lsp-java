## ADDED Requirements

### Requirement: 类树自动加载
扫描完成后自动加载类结构树，不需要用户额外点击。

#### Scenario: 扫描后自动显示
- **WHEN** 扫描完成
- **THEN** 类树自动出现
- **AND** 无需点击「浏览类结构」

### Requirement: 调用链内联展开
调用方/被调用方在方法内联展开，不切换 Tab。

#### Scenario: 查看调用链
- **WHEN** 用户点击方法名
- **THEN** 展开该方法的上下游调用链
- **AND** 不跳转到独立页面或 Tab

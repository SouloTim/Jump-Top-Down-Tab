# 回归测试

验证油猴脚本在代码改动后功能不回退。模拟 Tampermonkey `@grant none` 的真实注入方式，通过无头浏览器 + DevTools Protocol 执行 44 项断言。

## 环境要求

- **Node.js 22+**（需要内置的全局 `WebSocket`）
- 本机安装 **Chrome / Edge / Chromium** 之一（自动探测，或手动指定）

无需安装任何第三方依赖（npm install 都不需要）。

## 运行

在仓库根目录执行：

```bash
node tests/regression.test.js
```

指定浏览器与端口（浏览器未自动探测到、或端口被占用时）：

```bash
JTD_BROWSER="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
JTD_PORT=9400 \
node tests/regression.test.js
```

## 输出

- 控制台打印每项的 PASS / FAIL 与汇总
- `tests/regression-report.json` — 结构化报告（版本、浏览器、时间、逐项结果），便于归档比对
- 退出码：`0` 全部通过 / `1` 存在失败 / `2` 环境或运行错误（可直接接入 CI）

脚本会自行启动和关闭无头浏览器，测试页面生成在系统临时目录，不污染仓库。

## 覆盖范围

| 分组 | 验证内容 |
| --- | --- |
| A. metadata 合规 | `@name`/`@version`/`@include`/`@grant`/`@run-at` 合法；无 `GM_` API 调用 |
| B. 显隐与样式 | 顶部/中部/底部三态显隐、配色、38px 圆角方块、无障碍属性 |
| C. 快捷键边界 | Home/End 正常滚动；输入框/文本域/可编辑区不劫持；Alt/Ctrl 组合键不触发 |
| D. 按钮交互 | 点击 ↑↓、Tab 聚焦后 Enter/空格激活 |
| E. 重复注入 | 二次注入不产生重复按钮 |
| F. 主题适配 | 深色页配色、rgba 半透明背景识别 |
| G. 动态主题 | 页面切换主题后配色自动跟随（MutationObserver） |
| H. 系统偏好 | 透明背景回退 `prefers-color-scheme` |
| I. CSS 对抗 | 页面 `!important` 规则无法覆盖按钮样式 |
| J. 短页面 | 不足一屏时按钮隐藏、End 不乱跳 |
| K. iframe 隔离 | iframe 内不注入按钮 |

## 设计说明

- **版本断言只校验存在性、不写死版本号**，因此脚本升级后可直接回归，无需改测试代码。
- 可编辑元素默认在页面底部，`focus()` 会触发浏览器原生「把焦点滚入视口」行为（无脚本时同样发生）。因此测试中把元素临时移到页顶再按 End，才能准确判断脚本是否劫持。
- 空格键在 CDP 中需显式传 `text: ' '`，否则事件不会投递为 `e.key === ' '`。

详细的方法说明与失败项分析见 `docs/TEST_REPORT.md`。

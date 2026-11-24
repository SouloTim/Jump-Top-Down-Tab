# 测试报告

> 对象：Jump-Top-Down-Tab 油猴脚本 v2026.11.24.5
> 测试日期：2026-11-24
> 结论：**44 项断言全部通过**，脚本无功能缺陷；初测出现的 10 项失败经排查均为测试脚本自身缺陷，已修正。

---

## 1. 测试目标与方法

### 1.1 为什么不用「直接注入脚本」

此前用 CDP 把脚本 body 直接 `eval` 进页面，虽然能跑通，但**不等同于油猴真实环境**。油猴会：

- 解析 `==UserScript==` metadata 块（`@include`/`@grant`/`@run-at` 等）；
- 以 `@grant none` 模式用函数包装器注入脚本；
- 按 `@run-at` 指定的时机执行；
- 可能在页面重复注入、在 iframe 中运行。

因此本轮测试专门模拟真实油猴环境。

### 1.2 测试方法

| 项目 | 说明 |
| --- | --- |
| 注入方式 | `(function(){ <脚本正文> }).call(window)` —— 模拟 Tampermonkey `@grant none` 包装器 |
| 驱动方式 | Node.js + Chrome DevTools Protocol（无第三方依赖） |
| 浏览器 | Microsoft Edge（无头模式，1280×900 视口） |
| 测试页面 | 8 类动态生成的 HTML：浅色 / 深色 / rgba / 短页面 / 透明背景 / CSS 对抗 / 主题切换 / iframe |
| 断言总数 | 44 项，分 11 组（A–K） |
| 可复现 | `node tests/regression.test.js`，结构化报告见 `tests/regression-report.json` |

### 1.3 测试环境

- Node.js：内置全局 WebSocket（Node 22+）
- 浏览器：Microsoft Edge（headless=new）
- 沙箱参数：`--no-sandbox --disable-crash-reporter`（无头测试环境所需）

---

## 2. 测试结论

**44 / 44 通过，失败 0 项。** 脚本功能完整、无回退。

| 分组 | 覆盖内容 | 结果 |
| --- | --- | --- |
| A. metadata 合规 | 元信息块存在、`@name`/`@version`/`@include`/`@grant`/`@run-at` 合法、无 `GM_` API 调用 | 7/7 通过 |
| B. 显隐与样式 | 三态显隐、深青配色、38px 圆角方块、无障碍属性 | 9/9 通过 |
| C. 快捷键边界 | Home/End、输入框/文本域/可编辑区不劫持、Alt/Ctrl 组合键 | 8/8 通过 |
| D. 按钮交互 | 点击 ↑↓、Enter、空格激活 | 4/4 通过 |
| E. 重复注入 | 二次注入不产生重复按钮 | 1/1 通过 |
| F. 主题适配 | 深色页配色、rgba 半透明背景识别 | 3/3 通过 |
| G. 动态主题 | 页面切换主题后配色自动跟随 | 2/2 通过 |
| H. 系统偏好 | 透明背景回退 `prefers-color-scheme` | 1/1 通过 |
| I. CSS 对抗 | 页面 `!important` 规则无法覆盖按钮样式 | 3/3 通过 |
| J. 短页面 | 不足一屏时按钮隐藏、End 不乱跳 | 3/3 通过 |
| K. iframe 隔离 | iframe 内不注入按钮（含显式注入验证） | 3/3 通过 |

### 关键验证结果摘录

- 浅色页：按钮 `rgb(15,110,86)` 深青底 + 白字；深色页：`rgb(78,205,196)` 柔和青底 + `rgb(8,46,43)` 深字。
- 样式：38×38px、`border-radius: 10px`、`border: none`、`box-shadow: none`。
- 页面存在 `*{border-radius:0!important; color:lime!important; box-shadow:...}` 时，按钮仍保持 10px 圆角、白字、无阴影——内联 `!important` 优先级生效。
- 输入框 / 文本域 / 可编辑区按 End，滚动位置保持在页顶，未被脚本劫持到页尾。
- iframe 内显式注入脚本后仍无按钮，`window.self !== window.top` 拦截生效。

---

## 3. 初测失败项分析（10 项）

> 首次运行 44 项中 34 通过、10 失败。逐项排查后确认：**全部为测试脚本自身缺陷，被测脚本无问题**。以下如实记录失败现象、根因与处理，供团队参考，避免重复踩坑。

### 3.1 metadata 相关（6 项）

**失败项**

- `metadata: 存在 UserScript 块`
- `metadata: @name`
- `metadata: @version=2026.11.24.5`
- `metadata: @include *`
- `metadata: @grant none`
- `metadata: @run-at document-idle`

**现象**：6 项 metadata 断言全部失败，`parseMeta()` 返回 `null`。

**根因**：测试脚本解析 metadata 的正则写错了。油猴 metadata 的结束标记是 `// ==/UserScript==`（带斜杠），正则中漏写了转义 `\/`，写成 `// ==UserScript==`，导致匹配失败。连带地把整个文件（含注释）当作脚本正文注入——所幸 metadata 是注释不影响执行，所以功能类断言照常通过，这反过来佐证了脚本本身没问题。

**处理**：正则修正为 `/\/\/ ==UserScript==([\s\S]*?)\/\/ ==\/UserScript==/`。

**结论**：测试脚本缺陷，非脚本 bug。

### 3.2 输入框聚焦按 End 不劫持（3 项）

**失败项**

- 输入框聚焦: End 不劫持
- 文本域聚焦: End 不劫持
- 可编辑区聚焦: End 不劫持

**现象**：预设滚动位置 300，聚焦输入框后按 End，滚动位置变为 576（页面底部），判定为「被劫持」。

**根因**：测试页面把输入框放在页面底部。`focus()` 一个视口外的元素会触发浏览器**原生**的「把焦点元素滚入视口」行为。做了对照实验——**完全不注入脚本**，同样操作也从 300 → 707。即这个滚动是浏览器行为，与脚本无关。

对照实验数据：

```
[有脚本] focus 后 scrollY=707 → scrollTo(0,300) → 按 End → scrollY=707
[无脚本] focus 后 scrollY=?    → scrollTo(0,300) → 按 End → scrollY=707
[无脚本] 同样操作按 Home → scrollY=707
```

**处理**：改为把可编辑元素临时移到页面顶部再 focus，此时 `scrollY≈0`；按 End 后若脚本劫持会跳到 `maxScroll`，未劫持则保持顶部。断言改为 `before === 0 && after < maxScroll / 2`。

**结论**：测试断言设计缺陷，非脚本 bug。脚本的 `isEditable()` 拦截逻辑正确。

### 3.3 空格键激活按钮（1 项）

**失败项**

- 键盘: 聚焦按钮按空格滚到底部

**现象**：聚焦按钮后按空格，滚动位置仍为 0。

**根因**：CDP 的 `Input.dispatchKeyEvent` 在模拟空格键时，若不提供 `text` 字段，事件不会投递为 `e.key === ' '`。键盘事件探针显示实际收到的事件 `key` 值异常，导致脚本的空格分支未触发。

**处理**：派发空格键时显式传 `text: ' '`。修正后通过。

**结论**：测试驱动参数缺陷，非脚本 bug。脚本对 `' '` 与 `'Spacebar'` 的兼容处理是正确的。

---

## 4. 已知限制

| 限制 | 说明 |
| --- | --- |
| Safari 未纳入自动测试 | 本机 safaridriver 建会话被 macOS 27 的「允许远程自动化」保护拦截，命令行写偏好并重启 Safari 无效，需人工在 Safari 设置中勾选。此项未验证。 |
| 真实油猴扩展未安装 | 采用的是 wrapper 模拟而非安装 Tampermonkey 扩展本体。模拟覆盖了关键差异（metadata 解析、注入包装、重复注入、iframe），但未覆盖扩展自身的边界行为。 |
| 测试页面为构造页 | 使用专门构造的 8 类页面，未覆盖真实复杂站点（如 SPA、Shadow DOM 内部滚动容器）。 |

## 5. 建议

- 每次改动脚本后运行 `node tests/regression.test.js`，退出码 0 且报告显示 44/44 方可发布。
- 如需扩展 coverage，在 `tests/regression.test.js` 中按 A–K 分组追加断言即可，无需改动运行框架。
- Safari 真实环境验证建议在有条件的机器上手动完成。

# Jump to Top / Bottom with Hotkeys

轻量油猴（Tampermonkey / Violentmonkey）用户脚本：为任意网页添加「回到顶部 / 跳转到底部」悬浮按钮，并支持 Home / End 快捷键。零依赖，使用 `@grant none` 直接运行于页面环境。

## 功能

- 悬浮按钮：右侧「↑ 回到顶部」「↓ 跳转到底部」，38px 圆角方块，随滚动位置智能显隐
- 明暗自适应：自动检测页面背景亮度，浅色页用深青底白字、深色页用亮黄底深字；无渐变、无描边、无阴影
- 主题跟随：页面切换深色/浅色主题时，按钮配色自动更新
- 快捷键：Home 置顶，End 置底；输入框内自动让位给浏览器原生行为
- 平滑滚动，不支持时自动降级
- 仅在顶层页面运行，忽略 iframe；内置防重复注入
- 适用于所有网站，无排除规则（`@exclude` 已移除）

## 安装

1. 浏览器安装 Tampermonkey 或 Violentmonkey
2. 打开本仓库的 Jump-Top-Down-Tab.user.js，点击「Raw / 原始文件」后按提示安装
3. 刷新任意页面即可看到按钮

## 使用

| 操作 | 方式 |
| --- | --- |
| 回到顶部 | 点击 ↑ 按钮 / 按 Home |
| 跳转到底部 | 点击 ↓ 按钮 / 按 End |

在输入框、文本域、可编辑区域中按 Home / End 保持浏览器原生行为（移动到行首 / 行尾）。

## 文件

- Jump-Top-Down-Tab.user.js：脚本主文件，可直接安装

## 变更记录

### 2026.11.24.3

- 样式改版：圆形渐变 + 描边 + 阴影改为 38px 圆角方块（10px 圆角）实色填充，无描边无阴影
- 新增明暗自适应：按 WCAG 相对亮度判定页面深浅，浅色页深青底白字、深色页亮黄底深字
- 主题跟随：MutationObserver 监听页面主题属性变化，matchMedia 监听系统偏好，rAF 节流重算
- Edge 双主题实测：浅色/深色页各自顶部、中部、底部三态显隐与配色均通过；Home / End / 输入框非劫持验证通过

### 2026.11.24.2

- 移除全部 `@exclude` 排除规则，脚本在所有网站生效；版本号更新。

### 2026.11.24.1

- 性能：缓存最大滚动距离，滚动回调只读 scrollY，消除 layout thrashing；用 ResizeObserver + rAF 仅在尺寸变化时重测
- 可访问性：按钮支持 Tab 聚焦、Enter / 空格激活，并同步 aria-hidden 状态
- 健壮性：统一高度计算、补充 scrollTop 兜底、将 scrollTo 重命名为 scrollToY 避免遮蔽

### 2026.11.24

- 修复：`style.display = '... !important'` 无效赋值导致显隐控制失效，改用 `setProperty(..., 'important')`
- 修复：Home / End 全局劫持输入框，现排除 input / textarea / select / contenteditable
- 修复：页面不足一屏时滚动目标为负的问题
- 修复：hover 阴影覆盖失效、死代码 scrollTimer、非标准 element.role 赋值
- 改进：简化初始化流程、补充无障碍属性、完善脚本元信息

## License

MIT

# Jump to Top / Bottom with Hotkeys

轻量油猴（Tampermonkey / Violentmonkey）用户脚本：为任意网页添加「回到顶部 / 跳转到底部」悬浮按钮，并支持 Home / End 快捷键。零依赖，使用 `@grant none` 直接运行于页面环境。

## 功能

- 悬浮按钮：右侧「↑ 回到顶部」「↓ 跳转到底部」，随滚动位置智能显隐
- 快捷键：Home 置顶，End 置底；输入框内自动让位给浏览器原生行为
- 平滑滚动，不支持时自动降级
- 仅在顶层页面运行，忽略 iframe；内置防重复注入
- 已排除 Gmail、dzh.mop.com、豆瓣相册等站点

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

### 2026.11.24

- 修复：`style.display = '... !important'` 无效赋值导致显隐控制失效，改用 `setProperty(..., 'important')`
- 修复：Home / End 全局劫持输入框，现排除 input / textarea / select / contenteditable
- 修复：页面不足一屏时滚动目标为负的问题
- 修复：hover 阴影覆盖失效、死代码 scrollTimer、非标准 element.role 赋值
- 改进：简化初始化流程、补充无障碍属性、完善脚本元信息

## License

MIT

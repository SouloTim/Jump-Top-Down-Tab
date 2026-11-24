// ==UserScript==
// @name         网页一键置顶/置底（按钮 + 快捷键）
// @name:en      Jump to Top / Bottom with Hotkeys
// @namespace    https://github.com/SouloTim/Jump-Top-Down-Tab
// @version      2026.11.24.3
// @author       Tim.soul
// @description  为网页添加「回到顶部 / 跳转到底部」悬浮按钮，按 Home / End 也可一键跳转；按钮随滚动位置智能显隐，配色随页面明暗自动适配。
// @description:en Floating Back-to-Top / Jump-to-Bottom buttons with Home / End hotkeys and auto-adaptive colors.
// @include      *
// @grant        none
// @license      MIT
// @homepageURL  https://github.com/SouloTim/Jump-Top-Down-Tab
// @supportURL   https://github.com/SouloTim/Jump-Top-Down-Tab/issues
// ==/UserScript==

(function () {
    'use strict';

    /* ============ 配置 ============ */
    const CFG = {
        size: 38,             // 按钮边长(px)
        radius: 10,           // 按钮圆角(px)
        right: 20,            // 距右侧(px)
        topOffset: '60%',     // 「置顶」按钮垂直位置
        bottomOffset: '40%',  // 「置底」按钮垂直位置
        showGap: 100,         // 距顶/底超过该像素才显示对应按钮
        darkThreshold: 0.4,   // 相对亮度低于此值判为深色页面
    };

    // 两套实色配色（无渐变、无描边、无阴影）
    const THEME = {
        light: { bg: '#0F6E56', fg: '#ffffff' },
        dark:  { bg: '#FAC775', fg: '#412402' },
    };

    /* ============ 样式 ============ */
    const CSS = {
        common: [
            'position: fixed',
            `width: ${CFG.size}px`,
            `height: ${CFG.size}px`,
            `right: ${CFG.right}px`,
            'z-index: 2147483647',
            'display: flex !important',
            'align-items: center !important',
            'justify-content: center !important',
            `border-radius: ${CFG.radius}px !important`,
            'font-size: 20px !important',
            'line-height: 1 !important',
            'text-align: center !important',
            'opacity: .95',
            'cursor: pointer',
            'user-select: none !important',
            'transition: transform .2s ease, opacity .2s ease, background-color .25s ease, color .25s ease',
        ].join('; '),
        top: `bottom: ${CFG.topOffset} !important`,
        bottom: `bottom: ${CFG.bottomOffset} !important`,
    };

    const docEl = document.documentElement;
    let maxScroll = 0;      // 缓存最大可滚动距离，避免滚动时强制回流
    let measureRaf = 0;
    let themeRaf = 0;
    let isDark = null;
    let topBtn = null;
    let bottomBtn = null;

    /* ============ 工具函数 ============ */
    function getScrollY() {
        return window.scrollY || window.pageYOffset || docEl.scrollTop || 0;
    }

    // 平滑滚动，不支持时降级
    function scrollToY(y) {
        try {
            window.scrollTo({ top: y, behavior: 'smooth' });
        } catch (e) {
            window.scrollTo(0, y);
        }
    }

    // 重新测量文档高度（会触发回流，仅在初始化/尺寸变化时调用）
    function measure() {
        const body = document.body;
        const viewH = window.innerHeight || docEl.clientHeight;
        const docH = Math.max(
            body.scrollHeight, docEl.scrollHeight,
            body.offsetHeight, docEl.offsetHeight,
            docEl.clientHeight
        );
        maxScroll = Math.max(0, docH - viewH);
        refresh();
    }

    // 解析 CSS 颜色为 [r,g,b,a]，支持 rgb()/rgba() 与 #hex
    function parseColor(str) {
        if (!str) return null;
        str = str.trim();
        const rgb = str.match(/^rgba?\(([^)]+)\)$/i);
        if (rgb) {
            const p = rgb[1].split(',').map(x => parseFloat(x));
            return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
        }
        const hex = str.match(/^#([0-9a-f]{3,8})$/i);
        if (hex) {
            let h = hex[1];
            if (h.length === 3) h = h.split('').map(c => c + c).join('');
            if (h.length >= 6) {
                return [
                    parseInt(h.slice(0, 2), 16),
                    parseInt(h.slice(2, 4), 16),
                    parseInt(h.slice(4, 6), 16),
                    h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
                ];
            }
        }
        return null;
    }

    // WCAG 相对亮度
    function luminance(r, g, b) {
        const f = c => {
            c /= 255;
            return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    }

    // 检测页面是否为深色背景：沿 body → html → 父链找第一个不透明背景色
    function detectDark() {
        let el = document.body || docEl;
        while (el && el.nodeType === 1) {
            const c = parseColor(window.getComputedStyle(el).backgroundColor);
            if (c && c[3] > 0.5) return luminance(c[0], c[1], c[2]) < CFG.darkThreshold;
            el = el.parentElement;
        }
        // 全透明时回退到系统主题偏好
        try {
            return window.matchMedia('(prefers-color-scheme: dark)').matches;
        } catch (e) {
            return false;
        }
    }

    // 应用配色（仅在明暗判定变化时写 DOM）
    function applyTheme(force) {
        const dark = detectDark();
        if (!force && dark === isDark) return;
        isDark = dark;
        const t = dark ? THEME.dark : THEME.light;
        [topBtn, bottomBtn].forEach(btn => {
            if (!btn) return;
            btn.style.setProperty('background-color', t.bg, 'important');
            btn.style.setProperty('color', t.fg, 'important');
        });
    }

    // rAF 节流的主题重算
    function scheduleTheme() {
        if (themeRaf) return;
        themeRaf = requestAnimationFrame(() => {
            themeRaf = 0;
            applyTheme(false);
        });
    }

    // 焦点是否在可编辑元素内（避免劫持输入框的 Home/End）
    function isEditable(el) {
        if (!el || el.nodeType !== 1) return false;
        const tag = el.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
               el.isContentEditable === true;
    }

    // 切换显隐：必须用 setProperty 带 important，才能覆盖 cssText 里的 !important
    function setVisible(btn, visible) {
        btn.style.setProperty('display', visible ? 'flex' : 'none', 'important');
        btn.style.visibility = visible ? 'visible' : 'hidden';
        btn.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }

    /* ============ 创建按钮 ============ */
    function createButton(isTop) {
        const btn = document.createElement('div');
        btn.id = isTop ? 'top-jump-button' : 'bottom-jump-button';
        btn.textContent = isTop ? '↑' : '↓';
        btn.setAttribute('role', 'button');
        btn.setAttribute('aria-label', isTop ? '回到顶部（Home）' : '跳转到底部（End）');
        btn.setAttribute('aria-hidden', 'true');
        btn.tabIndex = 0;
        btn.title = isTop ? '回到顶部 (Home)' : '跳转到底部 (End)';
        btn.style.cssText = CSS.common + '; ' + (isTop ? CSS.top : CSS.bottom);

        btn.addEventListener('mouseenter', () => { btn.style.transform = 'scale(1.08)'; });
        btn.addEventListener('mouseleave', () => { btn.style.transform = 'scale(1)'; });
        btn.addEventListener('click', () => scrollToY(isTop ? 0 : maxScroll));
        // 键盘激活：Tab 聚焦后 Enter / 空格触发（空格需阻止默认滚动）
        btn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                e.preventDefault();
                scrollToY(isTop ? 0 : maxScroll);
            }
        });
        // 阻止按钮上的鼠标事件冒泡，避免触发页面自身的处理器
        ['mousedown', 'mouseup'].forEach(evt =>
            btn.addEventListener(evt, e => e.stopPropagation())
        );
        return btn;
    }

    /* ============ 刷新按钮状态 ============ */
    // 仅读取 scrollY，不触碰布局属性，避免滚动时强制同步布局
    function refresh() {
        if (!topBtn || !bottomBtn) return;
        const y = getScrollY();
        setVisible(topBtn, y > CFG.showGap);
        setVisible(bottomBtn, y < maxScroll - CFG.showGap);
    }

    /* ============ 快捷键 ============ */
    function setupHotkeys() {
        document.addEventListener('keydown', (e) => {
            if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
            if (isEditable(e.target)) return;   // 输入框内保留 Home/End 原生行为

            if (e.key === 'Home') {
                e.preventDefault();
                scrollToY(0);
            } else if (e.key === 'End') {
                e.preventDefault();
                scrollToY(maxScroll);
            }
        }, true);
    }

    /* ============ 初始化 ============ */
    function init() {
        if (window.self !== window.top) return;                       // 仅在顶层页面运行
        if (!document.body) return;                                   // body 尚未就绪
        if (document.getElementById('top-jump-button') ||
            document.getElementById('bottom-jump-button')) return;    // 防重复注入

        topBtn = createButton(true);
        bottomBtn = createButton(false);

        window.addEventListener('scroll', refresh, { passive: true });

        // 尺寸变化时用 rAF 合并测量，避免 ResizeObserver 回调里改样式造成循环
        function scheduleMeasure() {
            if (measureRaf) return;
            measureRaf = requestAnimationFrame(() => {
                measureRaf = 0;
                measure();
            });
        }
        window.addEventListener('resize', scheduleMeasure, { passive: true });
        if (typeof ResizeObserver !== 'undefined') {
            const ro = new ResizeObserver(scheduleMeasure);
            ro.observe(document.body);
            ro.observe(docEl);
        }

        try {
            document.body.appendChild(topBtn);
            document.body.appendChild(bottomBtn);
        } catch (err) {
            console.error('[JumpTopBottom] 按钮注入失败:', err);
            return;
        }

        setupHotkeys();
        applyTheme(true);
        measure();

        // 监听页面主题变化（body/html 的 style 或 class 变动）
        if (typeof MutationObserver !== 'undefined') {
            const mo = new MutationObserver(scheduleTheme);
            [document.body, docEl].forEach(el => {
                if (el) mo.observe(el, { attributes: true, attributeFilter: ['style', 'class', 'data-theme'] });
            });
        }
        // 监听系统主题偏好变化
        try {
            const mq = window.matchMedia('(prefers-color-scheme: dark)');
            if (mq.addEventListener) mq.addEventListener('change', scheduleTheme);
            else if (mq.addListener) mq.addListener(scheduleTheme);
        } catch (e) { /* 旧浏览器不支持则忽略 */ }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();

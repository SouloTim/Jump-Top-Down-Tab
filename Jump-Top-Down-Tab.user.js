// ==UserScript==
// @name         网页一键置顶/置底（按钮 + 快捷键）
// @name:en      Jump to Top / Bottom with Hotkeys
// @namespace    https://github.com/SouloTim/Jump-Top-Down-Tab
// @version      2026.11.24.2
// @author       Tim.soul
// @description  为网页添加「回到顶部 / 跳转到底部」悬浮按钮，按 Home / End 也可一键跳转；按钮随滚动位置智能显隐。
// @description:en Floating Back-to-Top / Jump-to-Bottom buttons with Home / End hotkeys.
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
        size: 40,             // 按钮边长(px)
        right: 20,            // 距右侧(px)
        topOffset: '60%',     // 「置顶」按钮垂直位置
        bottomOffset: '40%',  // 「置底」按钮垂直位置
        showGap: 100,         // 距顶/底超过该像素才显示对应按钮
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
            'border-radius: 50% !important',
            'color: #fff !important',
            'font-size: 24px !important',
            'line-height: 1 !important',
            'text-align: center !important',
            'opacity: .9',
            'cursor: pointer',
            'user-select: none !important',
            'background: linear-gradient(45deg, #ff6b6b, #4ecdc4) !important',
            'box-shadow: 0 4px 12px rgba(255,107,107,.4) !important',
            'transition: transform .25s ease, box-shadow .25s ease, opacity .25s ease',
        ].join('; '),
        top: `bottom: ${CFG.topOffset} !important`,
        bottom: `bottom: ${CFG.bottomOffset} !important`,
    };

    const HOVER_SHADOW = '0 6px 16px rgba(255,107,107,.6)';
    const BASE_SHADOW  = '0 4px 12px rgba(255,107,107,.4)';

    const docEl = document.documentElement;
    let maxScroll = 0;      // 缓存最大可滚动距离，避免滚动时强制回流
    let measureRaf = 0;
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

        btn.addEventListener('mouseenter', () => {
            btn.style.transform = 'scale(1.1)';
            btn.style.setProperty('box-shadow', HOVER_SHADOW, 'important');
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.transform = 'scale(1)';
            btn.style.setProperty('box-shadow', BASE_SHADOW, 'important');
        });
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
        measure();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();

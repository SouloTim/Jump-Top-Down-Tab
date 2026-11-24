// ==UserScript==
// @name         网页一键置顶/置底（按钮 + 快捷键）
// @name:en      Jump to Top / Bottom with Hotkeys
// @namespace    https://github.com/SouloTim/Jump-Top-Down-Tab
// @version      2026.11.24
// @author       Tim.soul
// @description  为网页添加「回到顶部 / 跳转到底部」悬浮按钮，按 Home / End 也可一键跳转；按钮随滚动位置智能显隐。
// @description:en Floating Back-to-Top / Jump-to-Bottom buttons with Home / End hotkeys.
// @include      *
// @exclude      https://mail.google.com/*
// @exclude      http://dzh.mop.com/*
// @exclude      http://www.douban.com/photos/*
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

    /* ============ 工具函数 ============ */
    // 平滑滚动，不支持时降级
    function scrollTo(target) {
        try {
            window.scrollTo({ top: target, behavior: 'smooth' });
        } catch (e) {
            window.scrollTo(0, target);
        }
    }

    // 目标滚动位置（置底时避免负值）
    function targetScroll(isTop) {
        if (isTop) return 0;
        const doc = document.documentElement;
        const body = document.body;
        const max = Math.max(
            body.scrollHeight, doc.scrollHeight,
            body.offsetHeight, doc.offsetHeight,
            doc.clientHeight
        );
        return Math.max(0, max - window.innerHeight);
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
    }

    /* ============ 创建按钮 ============ */
    function createButton(isTop) {
        const btn = document.createElement('div');
        btn.id = isTop ? 'top-jump-button' : 'bottom-jump-button';
        btn.textContent = isTop ? '↑' : '↓';
        btn.setAttribute('role', 'button');
        btn.setAttribute('aria-label', isTop ? '回到顶部（Home）' : '跳转到底部（End）');
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
        btn.addEventListener('click', () => scrollTo(targetScroll(isTop)));
        // 阻止按钮上的鼠标事件冒泡，避免触发页面自身的处理器
        ['mousedown', 'mouseup'].forEach(evt =>
            btn.addEventListener(evt, e => e.stopPropagation())
        );
        return btn;
    }

    /* ============ 快捷键 ============ */
    function setupHotkeys() {
        document.addEventListener('keydown', (e) => {
            if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
            if (isEditable(e.target)) return;   // 输入框内保留 Home/End 原生行为

            if (e.key === 'Home') {
                e.preventDefault();
                scrollTo(0);
            } else if (e.key === 'End') {
                e.preventDefault();
                scrollTo(targetScroll(false));
            }
        }, true);
    }

    /* ============ 初始化 ============ */
    function init() {
        if (window.self !== window.top) return;                       // 仅在顶层页面运行
        if (!document.body) return;                                   // body 尚未就绪
        if (document.getElementById('top-jump-button') ||
            document.getElementById('bottom-jump-button')) return;    // 防重复注入

        const topBtn = createButton(true);
        const bottomBtn = createButton(false);

        function refresh() {
            const scrollY = window.scrollY || window.pageYOffset || 0;
            const viewH = window.innerHeight || document.documentElement.clientHeight;
            const docH = Math.max(
                document.body.scrollHeight,
                document.documentElement.scrollHeight,
                document.body.offsetHeight,
                document.documentElement.offsetHeight
            );
            setVisible(topBtn, scrollY > CFG.showGap);
            setVisible(bottomBtn, scrollY + viewH < docH - CFG.showGap);
        }

        window.addEventListener('scroll', refresh, { passive: true });
        window.addEventListener('resize', refresh, { passive: true });

        try {
            document.body.appendChild(topBtn);
            document.body.appendChild(bottomBtn);
        } catch (err) {
            console.error('[JumpTopBottom] 按钮注入失败:', err);
            return;
        }

        setupHotkeys();
        refresh();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();

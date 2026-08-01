"use client";

import { useEffect } from "react";

/**
 * 缓解 iOS Safari 输入框聚焦后：
 * - 整页被放大（font-size&lt;16px 时）
 * - 失焦后 visualViewport 不复位、页面「悬空」/底部被挡
 *
 * 根治仍依赖输入框 ≥16px；本组件做失焦与 viewport 变化时的滚动复位。
 */
export function MobileViewportGuard() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    const resetScroll = () => {
      // 键盘收起后把页面钉回顶部可见区，避免「放大残留」
      const y = window.scrollY;
      if (y !== 0 && y < 80) {
        window.scrollTo(0, 0);
      }
      // 部分 WebKit 需双读 layout
      requestAnimationFrame(() => {
        if (document.activeElement === document.body) {
          window.scrollTo(0, Math.min(window.scrollY, 1));
          window.scrollTo(0, 0);
        }
      });
    };

    const onFocusOut = (e: FocusEvent) => {
      const t = e.target;
      if (
        !(t instanceof HTMLInputElement) &&
        !(t instanceof HTMLTextAreaElement) &&
        !(t instanceof HTMLSelectElement)
      ) {
        return;
      }
      // 延迟到键盘动画后
      window.setTimeout(resetScroll, 100);
      window.setTimeout(resetScroll, 300);
    };

    const onFocusIn = (e: FocusEvent) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLSelectElement
      ) {
        // 轻微滚入可视区，避免被底栏/键盘挡住
        window.setTimeout(() => {
          try {
            t.scrollIntoView({ block: "center", behavior: "smooth" });
          } catch {
            /* ignore */
          }
        }, 50);
      }
    };

    document.addEventListener("focusout", onFocusOut, true);
    document.addEventListener("focusin", onFocusIn, true);

    const vv = window.visualViewport;
    let lastH = vv?.height ?? window.innerHeight;
    const onVv = () => {
      if (!vv) return;
      // 视口高度回升 ≈ 键盘收起
      if (vv.height > lastH + 80) {
        resetScroll();
      }
      lastH = vv.height;
    };
    vv?.addEventListener("resize", onVv);

    // iOS：旋转后复位
    const onOrient = () => window.setTimeout(resetScroll, 200);
    window.addEventListener("orientationchange", onOrient);

    return () => {
      document.removeEventListener("focusout", onFocusOut, true);
      document.removeEventListener("focusin", onFocusIn, true);
      vv?.removeEventListener("resize", onVv);
      window.removeEventListener("orientationchange", onOrient);
      void isIOS;
    };
  }, []);

  return null;
}

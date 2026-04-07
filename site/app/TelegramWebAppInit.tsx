"use client";

import { useEffect } from "react";

/**
 * Повноекранний режим мінідодатка, вимкнення вертикальних свайпів (закриття)
 * та підтвердження при закритті — офіційні методи Telegram Web App.
 */
export function TelegramWebAppInit({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const tg = window.Telegram?.WebApp;
      if (!tg) return;
      tg.expand?.();
      tg.disableVerticalSwipes?.();
      tg.enableClosingConfirmation?.();
      tg.ready?.();
    });
    return () => cancelAnimationFrame(id);
  }, []);

  return <>{children}</>;
}

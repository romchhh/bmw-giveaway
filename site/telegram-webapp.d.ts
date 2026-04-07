export {};

declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData?: string;
        ready: () => void;
        expand: () => void;
        disableVerticalSwipes?: () => void;
        enableClosingConfirmation?: () => void;
        sendData: (data: string) => void;
        openLink: (url: string, options?: { try_instant_view?: boolean }) => void;
        close?: () => void;
      };
    };
  }
}

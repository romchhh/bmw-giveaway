"use client";

import { useEffect } from "react";

/** Після оплати ведемо в чат бота (можна перевизначити в .env). */
const TELEGRAM_BOT_URL =
  process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL?.trim() || "https://t.me/M4_Giveaway_Bot";

function openBotFromWebApp(tw: NonNullable<typeof window.Telegram>["WebApp"]) {
  const ext = tw as typeof tw & { openTelegramLink?: (url: string) => void };
  if (typeof ext.openTelegramLink === "function") {
    ext.openTelegramLink(TELEGRAM_BOT_URL);
  } else {
    tw.openLink(TELEGRAM_BOT_URL);
  }
}

const th = {
  bg: "#0a0907",
  text: "#f2efe6",
  textSoft: "rgba(242, 239, 230, 0.52)",
  textFaint: "rgba(242, 239, 230, 0.28)",
  yellow: "#f0ca3a",
  gold: "#c4a035",
  line: "rgba(255, 255, 255, 0.08)",
};

export default function PaymentSuccessPage() {
  useEffect(() => {
    let cancelled = false;
    let openTimer = 0;
    let closeTimer = 0;

    const raf = requestAnimationFrame(() => {
      try {
        sessionStorage.setItem("gw_repost_after_pay", "1");
      } catch {
        /* ignore */
      }
      const tw = window.Telegram?.WebApp;
      tw?.expand?.();
      tw?.ready?.();

      const delayMs = tw ? 900 : 1200;

      openTimer = window.setTimeout(() => {
        if (cancelled) return;
        if (tw) {
          openBotFromWebApp(tw);
          closeTimer = window.setTimeout(() => {
            if (!cancelled) tw.close?.();
          }, 450);
        } else {
          window.location.replace(TELEGRAM_BOT_URL);
        }
      }, delayMs);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (openTimer !== 0) clearTimeout(openTimer);
      if (closeTimer !== 0) clearTimeout(closeTimer);
    };
  }, []);

  function goToBot() {
    const tw = window.Telegram?.WebApp;
    if (tw) {
      openBotFromWebApp(tw);
      setTimeout(() => tw.close?.(), 400);
    } else {
      window.location.replace(TELEGRAM_BOT_URL);
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body {
          background: ${th.bg};
          min-height: 100dvh;
          font-family: 'Montserrat', sans-serif;
          color: ${th.text};
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse-ring {
          0%   { box-shadow: 0 0 0 0 rgba(196,160,53,0.45); }
          70%  { box-shadow: 0 0 0 20px rgba(196,160,53,0); }
          100% { box-shadow: 0 0 0 0 rgba(196,160,53,0); }
        }
        .icon-ring {
          animation: pulse-ring 1.8s ease-out 0.3s;
        }
        .content {
          animation: fadeUp 0.55s ease;
        }
        .btn {
          transition: opacity 0.2s, transform 0.1s;
        }
        .btn:active { transform: scale(0.97); opacity: 0.85; }
      `}</style>

      <div style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "clamp(24px, 8vw, 48px) clamp(20px, 6vw, 40px)",
        textAlign: "center",
        gap: 0,
      }}>
        <div className="content" style={{ width: "100%", maxWidth: 360 }}>
          {/* Icon */}
          <div
            className="icon-ring"
            style={{
              width: 80, height: 80,
              borderRadius: "50%",
              border: `2px solid ${th.gold}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 28px",
              color: th.gold,
              fontSize: 36,
            }}
          >
            ✓
          </div>

          {/* Title */}
          <p style={{
            fontFamily: "'Montserrat', sans-serif",
            fontSize: 11,
            letterSpacing: "0.32em",
            textTransform: "uppercase",
            fontWeight: 600,
            color: th.textFaint,
            marginBottom: 12,
          }}>
            Оплата успішна
          </p>
          <h1 style={{
            fontSize: "clamp(22px, 6vw, 28px)",
            fontWeight: 800,
            color: th.text,
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
            marginBottom: 16,
          }}>
            Квитки вже твої
          </h1>
          <p style={{
            fontSize: 14,
            fontWeight: 500,
            color: th.textSoft,
            lineHeight: 1.7,
            marginBottom: 36,
          }}>
            Твоя участь у розіграші BMW M4&nbsp;підтверджена.
            Коди квитків з'являться в&nbsp;мінідодатку за&nbsp;кілька секунд.
          </p>

          {/* Divider */}
          <div style={{
            width: 40, height: 1,
            background: th.line,
            margin: "0 auto 36px",
          }} />

          {/* CTA */}
          <button
            type="button"
            className="btn"
            onClick={goToBot}
            style={{
              width: "100%",
              padding: "clamp(15px, 4.2vw, 18px)",
              borderRadius: "clamp(12px, 3vw, 16px)",
              background: "linear-gradient(180deg, #f7f0e4 0%, #e8dfd2 100%)",
              color: "#0d0c0a",
              border: "1px solid rgba(0,0,0,0.12)",
              cursor: "pointer",
              fontFamily: "'Montserrat', sans-serif",
              fontSize: "clamp(12px, 3.4vw, 14px)",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontWeight: 700,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)",
            }}
          >
            До бота
          </button>
        </div>
      </div>
    </>
  );
}

"use client";

import { useState, useEffect, useRef } from "react";

// ─── Constants ────────────────────────────────────────────────
const GIVEAWAY_POST_URL =
  process.env.NEXT_PUBLIC_GIVEAWAY_POST_URL ?? "https://t.me/your_channel/123";

const DEFAULT_TICKET_USD = Number(process.env.NEXT_PUBLIC_TICKET_PRICE_USD ?? "99");
const MAX_TICKETS = 10;
/** Лише fallback для прогрес-бару до відповіді API */
const POOL_TOTAL_FALLBACK = 10_000;

/** Темний фон + трохи золота лише як акцент */
const th = {
  bgGradient: "linear-gradient(180deg, #12110e 0%, #0c0b09 32%, #070605 100%)",
  bgFlat: "#0a0907",
  text: "#f2efe6",
  textSoft: "rgba(242, 239, 230, 0.52)",
  textFaint: "rgba(242, 239, 230, 0.28)",
  accentGold: "#c4a035",
  accentGoldSoft: "rgba(196, 160, 53, 0.55)",
  /** Жовтий акцент для числа квитків */
  yellow: "#f0ca3a",
  line: "rgba(255, 255, 255, 0.08)",
  lineStrong: "rgba(255, 255, 255, 0.12)",
  fillCard: "rgba(255, 255, 255, 0.035)",
  fillHover: "rgba(255, 255, 255, 0.06)",
  barTrack: "rgba(255, 255, 255, 0.07)",
  barFill: "linear-gradient(90deg, #6e5c24 0%, #a88a2e 45%, #c9a83a 100%)",
  ink: "#0d0c0a",
} as const;

/** Нейтральна форма квитків (без жовтого) */
const fm = {
  border: "rgba(255,255,255,0.1)",
  bg: "rgba(255,255,255,0.03)",
  title: "rgba(255,255,255,0.5)",
  divider: "rgba(255,255,255,0.08)",
  btnBorder: "rgba(255,255,255,0.14)",
  btnColor: "rgba(255,255,255,0.5)",
  payActiveBorder: "rgba(255,255,255,0.28)",
  payActiveBg: "rgba(255,255,255,0.07)",
} as const;

type PayMethod = "card" | "crypto";

/** Після повернення з оплати в тому ж WebView — відновлюємо polling квитків */
const PAY_PENDING_KEY = "gw_pay_pending";
/** Показати блок «Репост» лише після успішної оплати / тесту в цій сесії */
const REPOST_AFTER_PAY_KEY = "gw_repost_after_pay";

function savePayPending(countBefore: number, expectedNew: number) {
  try {
    sessionStorage.setItem(
      PAY_PENDING_KEY,
      JSON.stringify({ countBefore, expectedNew, ts: Date.now() }),
    );
  } catch {
    /* ignore */
  }
}

function clearPayPending() {
  try {
    sessionStorage.removeItem(PAY_PENDING_KEY);
  } catch {
    /* ignore */
  }
}

type SpecIconId = "power" | "sprint" | "awd" | "torque" | "vmax" | "diff" | "gear" | "brake";

function SpecSVG({ id }: { id: SpecIconId }) {
  const sw = 1.25;
  return (
    <svg width="28" height="28" viewBox="0 0 16 16" fill="none" aria-hidden style={{ display: "block" }}>
      {id === "power" && (
        <>
          <circle cx="8" cy="8.5" r="5" stroke="currentColor" strokeWidth={sw} />
          <path d="M8 8.6V6 M8 3.8l1.35 1.9" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
        </>
      )}
      {id === "sprint" && (
        <>
          <circle cx="8" cy="9" r="5.5" stroke="currentColor" strokeWidth={sw} />
          <path d="M8 9V5.2M10.2 6.8l-2.2 2.2" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
          <circle cx="8" cy="9" r="0.9" fill="currentColor" />
        </>
      )}
      {id === "awd" && (
        <>
          <path d="M3.5 6.5h9M5 6.5v2.2M11 6.5v2.2" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
          <circle cx="4.5" cy="11.5" r="1.35" stroke="currentColor" strokeWidth={sw} />
          <circle cx="11.5" cy="11.5" r="1.35" stroke="currentColor" strokeWidth={sw} />
          <path d="M6.2 11.5h3.6" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
        </>
      )}
      {id === "torque" && (
        <>
          <path d="M11.5 4.5a4.2 4.2 0 010 7M4.5 11.5a4.2 4.2 0 010-7" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
          <path d="M12.2 6.2l1.3-1.3M3.8 9.8l-1.3 1.3" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
        </>
      )}
      {id === "vmax" && (
        <>
          <path d="M3 12V5l4.5 2.5V12M7.5 7.5L13 5v7" stroke="currentColor" strokeWidth={sw} strokeLinejoin="round" />
          <path d="M10 10l2.5 1.5" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
        </>
      )}
      {id === "diff" && (
        <>
          <circle cx="8" cy="8" r="3.2" stroke="currentColor" strokeWidth={sw} />
          <path d="M8 4.8V2.8M8 11.2v2M4.8 8H2.8M11.2 8h2" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
          <circle cx="8" cy="8" r="0.85" fill="currentColor" />
        </>
      )}
      {id === "gear" && (
        <>
          <circle cx="8" cy="8" r="2.4" stroke="currentColor" strokeWidth={sw} />
          <path d="M8 2.2v1.4M8 12.4v1.4M2.2 8h1.4M12.4 8h1.4M4.1 4.1l1 1M10.9 10.9l1 1M11.9 4.1l-1 1M5.1 10.9l-1 1" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
        </>
      )}
      {id === "brake" && (
        <>
          <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth={sw} />
          <path d="M8 3.5V8l3.2 1.8" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" />
          <circle cx="8" cy="8" r="1.2" stroke="currentColor" strokeWidth={sw} />
        </>
      )}
    </svg>
  );
}

const CAR_SPECS: { val: string; label: string; icon: SpecIconId; valPx?: number }[] = [
  { val: "510", label: "к.с.", icon: "power", valPx: 20 },
  { val: "3.9 с", label: "0–100 км/год", icon: "sprint", valPx: 17 },
  { val: "RWD", label: "задній привід", icon: "diff", valPx: 14 },
  { val: "650", label: "Н·м крут. момент", icon: "torque", valPx: 20 },
  { val: "290+", label: "км/год max", icon: "vmax", valPx: 17 },
  { val: "M Steptronic", label: "8-ступ. АКПП", icon: "gear", valPx: 13 },
  { val: "M Compound", label: "гальма 380 мм", icon: "brake", valPx: 13 },
  { val: "Active M", label: "диференціал", icon: "diff", valPx: 14 },
];

// ─── Progress bar ─────────────────────────────────────────────
function TicketProgress({ sold, total }: { sold: number; total: number }) {
  const safeTotal = total > 0 ? total : 1;
  const ratio = Math.min(1, sold / safeTotal);
  /** Ширина смуги — точна частка (0.47%), не Math.round, інакше при великому пулі смуга не рухається. */
  const fillPct = ratio * 100;
  const pctLabel =
    ratio === 0
      ? 0
      : ratio < 0.001
        ? Math.round(ratio * 100000) / 1000
        : ratio < 0.01
          ? Math.round(ratio * 10000) / 100
          : ratio < 0.1
            ? Math.round(ratio * 1000) / 10
            : Math.round(ratio * 100);
  const freePct = (1 - ratio) * 100;
  const freeLabel =
    ratio >= 1
      ? 0
      : freePct >= 10
        ? Math.round(freePct)
        : Math.round(freePct * 10) / 10;

  return (
    <div style={{ padding: `0 clamp(14px, 5vw, 24px)` }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <div>
          <span style={s.statVal}>{pctLabel}%</span>
          <span style={s.statLabel}> пулу</span>
        </div>
        <div style={{ textAlign: "right" }}>
          <span style={s.statVal}>{freeLabel}%</span>
          <span style={s.statLabel}> вільно</span>
        </div>
      </div>

      {/* Bar */}
      <div style={{
        height: 6,
        borderRadius: 99,
        background: th.barTrack,
        overflow: "hidden",
        marginBottom: 0,
      }}>
        <div style={{
          height: "100%",
          width: `${fillPct}%`,
          borderRadius: 99,
          background: th.barFill,
          transition: "width 0.85s ease",
        }} />
      </div>
    </div>
  );
}

// ─── Shared styles ────────────────────────────────────────────
const s = {
  eyebrow: {
    fontFamily: "'Montserrat', sans-serif",
    fontSize: 11,
    letterSpacing: "0.28em",
    textTransform: "uppercase" as const,
    color: th.textSoft,
    fontWeight: 600,
  } as React.CSSProperties,
  statVal: {
    fontFamily: "'Montserrat', sans-serif",
    fontSize: 22,
    fontWeight: 700,
    color: th.text,
    letterSpacing: "-0.01em",
  } as React.CSSProperties,
  statLabel: {
    fontFamily: "'Montserrat', sans-serif",
    fontSize: 11,
    letterSpacing: "0.15em",
    textTransform: "uppercase" as const,
    color: th.textFaint,
    fontWeight: 600,
  } as React.CSSProperties,
  sep: {
    width: 40,
    height: 1,
    background: th.line,
    margin: "18px auto",
  } as React.CSSProperties,
};

// ─── Main component ───────────────────────────────────────────
export default function GiveawayPage() {
  const [tickets, setTickets] = useState(1);
  const [pay, setPay] = useState<PayMethod>("card");
  /** Після скролу до квитків або кліку «Взяти участь» — показуємо підсумок і «Оплатити» */
  const [ticketsFocus, setTicketsFocus] = useState(false);
  const ticketsFormRef = useRef<HTMLDivElement>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [canSendRepostToBot, setCanSendRepostToBot] = useState(false);
  const [statsSold, setStatsSold] = useState<number | null>(null);
  const [statsTotal, setStatsTotal] = useState<number | null>(null);
  const [myTickets, setMyTickets] = useState<{ code: string; createdAt: string }[]>([]);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [checkoutHint, setCheckoutHint] = useState<string | null>(null);
  /** Блок репосту — тільки після успішної покупки квитків (оплата або тест) */
  const [showRepostAfterPurchase, setShowRepostAfterPurchase] = useState(false);
  const [ticketPriceUsd, setTicketPriceUsd] = useState(
    Number.isFinite(DEFAULT_TICKET_USD) && DEFAULT_TICKET_USD > 0 ? DEFAULT_TICKET_USD : 99,
  );
  /** PAYMENT_TEST_MODE на сервері — реальна оплата з мінімальними сумами */
  const [paymentTestMode, setPaymentTestMode] = useState(false);
  const [testCheckoutWayforpayUah, setTestCheckoutWayforpayUah] = useState(1);
  const [testCheckoutPlisioUsd, setTestCheckoutPlisioUsd] = useState(2);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const mq = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setCanSendRepostToBot(typeof window.Telegram?.WebApp?.sendData === "function");
    });
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(REPOST_AFTER_PAY_KEY) === "1") {
        setShowRepostAfterPurchase(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  function markRepostAfterPay() {
    try {
      sessionStorage.setItem(REPOST_AFTER_PAY_KEY, "1");
    } catch {
      /* ignore */
    }
    setShowRepostAfterPurchase(true);
  }

  function clearRepostAfterPay() {
    try {
      sessionStorage.removeItem(REPOST_AFTER_PAY_KEY);
    } catch {
      /* ignore */
    }
    setShowRepostAfterPurchase(false);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/tickets/config");
        if (!res.ok) return;
        const cfg = (await res.json()) as {
          ticketPriceUsd?: number;
          paymentTestMode?: boolean;
          testCheckoutWayforpayUah?: number;
          testCheckoutPlisioUsd?: number;
        };
        if (cancelled) return;
        if (typeof cfg.ticketPriceUsd === "number" && cfg.ticketPriceUsd > 0) {
          setTicketPriceUsd(cfg.ticketPriceUsd);
        }
        if (cfg.paymentTestMode === true) {
          setPaymentTestMode(true);
          if (typeof cfg.testCheckoutWayforpayUah === "number") {
            setTestCheckoutWayforpayUah(cfg.testCheckoutWayforpayUah);
          }
          if (typeof cfg.testCheckoutPlisioUsd === "number") {
            setTestCheckoutPlisioUsd(cfg.testCheckoutPlisioUsd);
          }
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/tickets/stats", { cache: "no-store" });
        const data = (await res.json()) as { sold?: number; total?: number };
        if (cancelled) return;
        if (typeof data.sold === "number") setStatsSold(data.sold);
        if (typeof data.total === "number") setStatsTotal(data.total);
      } catch {
        if (!cancelled) {
          setStatsSold(0);
          setStatsTotal(POOL_TOTAL_FALLBACK);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const init = window.Telegram?.WebApp?.initData;
      if (!init) return;
      void (async () => {
        try {
          const res = await fetch("/api/tickets/me", {
            headers: { "x-telegram-init-data": init },
          });
          if (!res.ok) return;
          const data = (await res.json()) as { tickets?: { code: string; createdAt: string }[] };
          if (data.tickets) setMyTickets(data.tickets);
        } catch {
          /* ignore */
        }
      })();
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const hasTickets = myTickets.length > 0;
  const canBuyMore = myTickets.length < MAX_TICKETS;
  const maxThisPurchase = Math.max(0, MAX_TICKETS - myTickets.length);

  useEffect(() => {
    if (maxThisPurchase < 1) return;
    setTickets((t) => Math.min(Math.max(1, t), maxThisPurchase));
  }, [maxThisPurchase]);

  useEffect(() => {
    if (!canBuyMore) return;
    const el = ticketsFormRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.18) {
            setTicketsFocus(true);
          }
        }
      },
      { threshold: [0, 0.1, 0.18, 0.3, 0.5] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [canBuyMore]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const total = Math.round(tickets * ticketPriceUsd * 100) / 100;
  const checkoutDisplay =
    paymentTestMode && pay === "card"
      ? `${testCheckoutWayforpayUah.toFixed(2)} ₴`
      : paymentTestMode && pay === "crypto"
        ? `$${testCheckoutPlisioUsd.toFixed(2)}`
        : `$${total.toFixed(2)}`;

  async function refreshStatsAndMe(init: string) {
    const meRes = await fetch("/api/tickets/me", {
      headers: { "x-telegram-init-data": init },
    });
    if (meRes.ok) {
      const me = (await meRes.json()) as { tickets?: { code: string; createdAt: string }[] };
      if (me.tickets) setMyTickets(me.tickets);
    }
    const stRes = await fetch("/api/tickets/stats", { cache: "no-store" });
    if (stRes.ok) {
      const st = (await stRes.json()) as { sold?: number; total?: number };
      if (typeof st.sold === "number") setStatsSold(st.sold);
      if (typeof st.total === "number") setStatsTotal(st.total);
    }
  }

  function startTicketPolling(init: string, countBefore: number, expectedNew: number) {
    if (pollRef.current) clearInterval(pollRef.current);
    const stopAt = Date.now() + 180_000;
    pollRef.current = setInterval(() => {
      void (async () => {
        if (Date.now() > stopAt) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          clearPayPending();
          return;
        }
        const meRes = await fetch("/api/tickets/me", {
          headers: { "x-telegram-init-data": init },
        });
        if (!meRes.ok) return;
        const me = (await meRes.json()) as { tickets?: { code: string; createdAt: string }[] };
        const list = me.tickets ?? [];
        if (list.length >= countBefore + expectedNew) {
          setMyTickets(list);
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          clearPayPending();
          setCheckoutHint(null);
          markRepostAfterPay();
          const stRes = await fetch("/api/tickets/stats", { cache: "no-store" });
          if (stRes.ok) {
            const st = (await stRes.json()) as { sold?: number; total?: number };
            if (typeof st.sold === "number") setStatsSold(st.sold);
            if (typeof st.total === "number") setStatsTotal(st.total);
          }
        }
      })();
    }, 3000);
  }

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const init = window.Telegram?.WebApp?.initData;
      if (!init) return;
      let parsed: { countBefore: number; expectedNew: number; ts: number } | null = null;
      try {
        const raw = sessionStorage.getItem(PAY_PENDING_KEY);
        if (raw) parsed = JSON.parse(raw) as { countBefore: number; expectedNew: number; ts: number };
      } catch {
        clearPayPending();
        return;
      }
      if (!parsed || !Number.isFinite(parsed.countBefore) || !Number.isFinite(parsed.expectedNew)) {
        return;
      }
      if (Date.now() - parsed.ts > 20 * 60 * 1000) {
        clearPayPending();
        return;
      }
      setCheckoutHint("Повернення з оплати — оновлюємо квитки…");
      void (async () => {
        try {
          const meRes = await fetch("/api/tickets/me", {
            headers: { "x-telegram-init-data": init },
          });
          if (meRes.ok) {
            const me = (await meRes.json()) as { tickets?: { code: string; createdAt: string }[] };
            const list = me.tickets ?? [];
            if (list.length >= parsed!.countBefore + parsed!.expectedNew) {
              setMyTickets(list);
              clearPayPending();
              setCheckoutHint(null);
              markRepostAfterPay();
              const stRes = await fetch("/api/tickets/stats", { cache: "no-store" });
              if (stRes.ok) {
                const st = (await stRes.json()) as { sold?: number; total?: number };
                if (typeof st.sold === "number") setStatsSold(st.sold);
                if (typeof st.total === "number") setStatsTotal(st.total);
              }
              return;
            }
          }
        } catch {
          /* polling */
        }
        await refreshStatsAndMe(init);
        startTicketPolling(init, parsed.countBefore, parsed.expectedNew);
      })();
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once on mount; startTicketPolling stable enough
  }, []);
  const specsLoop = reducedMotion ? CAR_SPECS : [...CAR_SPECS, ...CAR_SPECS];
  const gx = "clamp(14px, 5vw, 24px)";
  const ticketWord =
    tickets === 1 ? "квиток" : tickets >= 2 && tickets <= 4 ? "квитки" : "квитків";
  const myTicketWord =
    myTickets.length === 1
      ? "квиток"
      : myTickets.length >= 2 && myTickets.length <= 4
        ? "квитки"
        : "квитків";

  return (
    <>
      {/* Google Fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,400;0,500;0,600;0,700;0,800;1,500;1,600&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body {
          background: ${th.bgFlat};
          background-image: ${th.bgGradient};
          background-attachment: fixed;
          overflow-x: hidden;
          width: 100%;
          max-width: 100%;
        }

        @keyframes floatCar {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        @keyframes pulseDot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .gw-cta:hover { opacity: 0.92 !important; filter: brightness(1.03); }
        .gw-cta:active { transform: scale(0.98) !important; }
        .gw-count-btn:hover { border-color: rgba(255,255,255,0.32) !important; color: rgba(255,255,255,0.85) !important; }
        .gw-pay:hover { border-color: rgba(255,255,255,0.22) !important; }

        @keyframes gwSpecsMarquee {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(-50%, 0, 0); }
        }
        .gw-specs-track {
          animation: gwSpecsMarquee 52s linear infinite;
          will-change: transform;
        }
        .gw-specs-panel {
          width: 96%;
          max-width: 100%;
          margin-left: auto;
          margin-right: auto;
          overflow-x: hidden;
          overflow-y: hidden;
          contain: layout paint;
        }
        .gw-specs-panel--scroll {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior-x: contain;
        }
        .gw-sticky-cta {
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
        }
        .gw-sticky-cta .gw-cta:hover { opacity: 0.9 !important; }
        .gw-sticky-cta .gw-cta:active { transform: scale(0.99) !important; }

        /* М’яке жовте підсвічування на фоні за машиною */
        .gw-car-bg-glow {
          position: absolute;
          left: 50%;
          top: 50%;
          /* translate3d + backface: стабільніший композит на iOS Safari */
          transform: translate3d(-50%, -50%, 0);
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          /* Широкий овал: більша ширина, менша висота */
          width: min(132%, 520px);
          height: clamp(150px, 46vw, 260px);
          max-width: none;
          border-radius: 50%;
          pointer-events: none;
          z-index: 0;
          background:
            radial-gradient(
              ellipse 125% 58% at 50% 50%,
              rgba(240, 202, 58, 0.52) 0%,
              rgba(200, 165, 50, 0.22) 42%,
              transparent 74%
            ),
            radial-gradient(
              ellipse 145% 78% at 50% 52%,
              rgba(255, 238, 170, 0.28) 0%,
              rgba(240, 200, 70, 0.1) 50%,
              transparent 70%
            );
          filter: blur(44px);
          -webkit-filter: blur(44px);
          /* Дубль «ореоли» без blur — видно навіть якщо filter на мобільному дає артефакти */
          box-shadow:
            0 0 55px 35px rgba(240, 202, 58, 0.22),
            0 0 100px 65px rgba(200, 160, 50, 0.1);
        }

        /* Градієнтне кільце навколо кнопок */
        .gw-btn-ring {
          display: inline-flex;
          padding: 2px;
          border-radius: 999px;
          background: linear-gradient(155deg, #fff3b0, #f0ca3a 40%, #b88918 100%);
          box-shadow: 0 0 14px rgba(240, 202, 58, 0.32);
        }
        .gw-pay-ring {
          padding: 2px;
          border-radius: 16px;
          background: linear-gradient(145deg, #fff4c4, #f0ca3a 35%, #c9a22a 70%, #ffe566 100%);
          box-shadow: 0 0 18px rgba(240, 202, 58, 0.22);
        }
        .gw-cta-ring {
          padding: 2px;
          border-radius: clamp(15px, 3.5vw, 18px);
          background: linear-gradient(135deg, #fff8d4, #f0ca3a 30%, #c9a22a 65%, #ffe566 100%);
          box-shadow: 0 4px 28px rgba(240, 200, 60, 0.38);
        }
        .gw-cta-ring .gw-cta {
          border-radius: clamp(13px, 3vw, 16px);
        }
      `}</style>

      {/* Mobile-first layout — full width, no device frame */}
      <div style={{
        minHeight: "100dvh",
        background: "transparent",
        fontFamily: "'Montserrat', sans-serif",
        width: "100%",
        maxWidth: 480,
        margin: "0 auto",
        position: "relative",
        overflowX: "hidden",
        paddingTop: "calc(clamp(32px, 8vw, 48px) + env(safe-area-inset-top, 0px))",
        paddingBottom:
          canBuyMore
            ? "calc(120px + env(safe-area-inset-bottom, 0px))"
            : "calc(24px + env(safe-area-inset-bottom, 0px))",
        boxSizing: "border-box",
      }}>

          {/* Nav */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: `0 ${gx} clamp(12px, 3vw, 16px)`,
          }}>
            <span style={s.eyebrow}>Exclusive Drop</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 5, height: 5,
                borderRadius: "50%",
                background: th.accentGold,
                boxShadow: "0 0 10px rgba(196, 160, 53, 0.35)",
                animation: "pulseDot 2s infinite",
              }} />
              <span style={{ ...s.eyebrow, letterSpacing: "0.2em" }}>Live</span>
            </div>
          </div>

          {/* Hero text */}
          <div style={{ padding: `clamp(12px, 3vw, 16px) ${gx} 0`, textAlign: "center", animation: "fadeUp 0.7s ease" }}>
            <p style={{ ...s.eyebrow, marginBottom: 14 }}>2026 · BMW M Series · Giveaway</p>
            <h1 style={{
              fontSize: "clamp(1.65rem, 7.2vw, 2.125rem)",
              fontWeight: 800,
              color: th.text,
              lineHeight: 1.12,
              letterSpacing: "-0.02em",
              marginBottom: 10,
            }}>
              Виграй<br />
              <em style={{
                fontStyle: "italic",
                fontWeight: 700,
                color: th.yellow,
                textShadow: "0 0 42px rgba(240, 202, 58, 0.35)",
              }}>
                BMW M4<br />Competition
              </em>
            </h1>
            <p style={{
              fontSize: "clamp(13px, 3.6vw, 15px)",
              fontWeight: 600,
              color: th.textSoft,
              letterSpacing: "0.03em",
              lineHeight: 1.7,
              marginBottom: 16,
              padding: "0 clamp(0px, 2vw, 8px)",
            }}>
              Від одного до десяти квитків — скільки візьмеш, вирішуєш ти.<br />
              Переможець буде один. Трофей — теж один.
            </p>
          </div>

          {/* Car — overflow visible so blurred glow isn’t clipped vertically */}
          <div style={{
            position: "relative",
            isolation: "isolate",
            padding: `clamp(28px, 7vw, 44px) ${gx} clamp(28px, 7vw, 44px)`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            overflow: "visible",
          }}>
            <div className="gw-car-bg-glow" aria-hidden />
            <img
              src="/bmw.png"
              alt="BMW"
              fetchPriority="high"
              decoding="async"
              style={{
                width: "auto",
                maxWidth: "min(100%, min(395px, 94vw))",
                height: "auto",
                maxHeight: "min(54vh, min(370px, 62vw))",
                objectFit: "contain",
                objectPosition: "center",
                position: "relative",
                zIndex: 1,
                display: "block",
                margin: "0 auto",
                filter: "drop-shadow(0 16px 36px rgba(0,0,0,0.5))",
                animation: "floatCar 5s ease-in-out infinite",
              }}
            />
          </div>

          {/* Specs — 96% width panel, clipped (no page horizontal swipe) */}
          <div
            className={`gw-specs-panel${reducedMotion ? " gw-specs-panel--scroll" : ""}`}
            style={{
              marginTop: 6,
              padding: "8px 0 12px",
              boxSizing: "border-box",
            }}
          >
            <div
              className={reducedMotion ? undefined : "gw-specs-track"}
              style={{
                display: "flex",
                flexDirection: "row",
                flexWrap: "nowrap",
                gap: "clamp(14px, 4vw, 20px)",
                width: "max-content",
                paddingLeft: "clamp(8px, 2vw, 12px)",
                paddingRight: "clamp(8px, 2vw, 12px)",
              }}
            >
              {specsLoop.map((spec, i) => (
                <div
                  key={`${spec.label}-${spec.val}-${i}`}
                  style={{
                    flex: "0 0 auto",
                    width: "clamp(92px, 30vw, 108px)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    textAlign: "center",
                    gap: 8,
                  }}
                >
                  <span style={{ color: "rgba(255,255,255,0.4)", lineHeight: 0 }}>
                    <SpecSVG id={spec.icon} />
                  </span>
                  <span style={{
                    display: "block",
                    fontSize: spec.valPx ?? 16,
                    fontWeight: 700,
                    color: th.text,
                    letterSpacing: "-0.02em",
                    lineHeight: 1.15,
                    maxWidth: "100%",
                  }}>
                    {spec.val}
                  </span>
                  <span style={{
                    display: "block",
                    fontSize: 9,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: th.textFaint,
                    fontWeight: 600,
                    lineHeight: 1.35,
                    padding: "0 4px",
                    maxWidth: "100%",
                  }}>
                    {spec.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div style={s.sep} />

          {/* Квитки з БД + форма докупівлі (до {MAX_TICKETS} на людину) */}
          <div style={{ margin: `0 clamp(12px, 3.5vw, 18px)` }}>
            {hasTickets && (
              <>
                <div style={{
                  border: `1px solid ${fm.border}`,
                  borderRadius: 24,
                  padding: "clamp(24px, 5vw, 32px) clamp(18px, 4vw, 22px)",
                  background: fm.bg,
                  textAlign: "center",
                  animation: "fadeUp 0.5s ease",
                  marginBottom: canBuyMore ? 18 : 0,
                }}>
                  <div style={{
                    width: 52, height: 52,
                    borderRadius: "50%",
                    border: `1px solid ${fm.payActiveBorder}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    margin: "0 auto 14px",
                    color: th.textSoft,
                    fontSize: 24,
                  }}>✓</div>
                  <p style={{ fontSize: 17, fontWeight: 600, color: th.text, letterSpacing: "0.04em", marginBottom: 8 }}>
                    Ви в грі
                  </p>
                  <p style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: th.textSoft,
                    letterSpacing: "0.03em",
                    lineHeight: 1.65,
                    marginBottom: 0,
                  }}>
                    Очікуй розіграш — коди своїх квитків дивись нижче під статистикою пулу.
                  </p>
                </div>

                {showRepostAfterPurchase && (
                <div style={{
                  marginBottom: canBuyMore ? 18 : 0,
                  border: `1px solid ${fm.border}`,
                  borderRadius: 24,
                  padding: "clamp(24px, 5vw, 32px) clamp(18px, 4vw, 22px)",
                  background: fm.bg,
                  textAlign: "center",
                  animation: "fadeUp 0.55s ease",
                }}>
                  <p style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: th.text,
                    letterSpacing: "0.06em",
                    marginBottom: 14,
                  }}>
                    ↗ Репост анонсу
                  </p>
                  <p style={{
                    fontSize: 13,
                    fontWeight: 400,
                    color: th.textSoft,
                    letterSpacing: "0.03em",
                    lineHeight: 1.75,
                    textAlign: "left",
                    marginBottom: 18,
                  }}>
                    Поділися постом про розіграш у Telegram: натисни «Відкрити анонс», перешли пост у «Збережене»,
                    друзям або в чат. Більше охоплення — більше прозорості для всіх учасників.
                  </p>
                  <p style={{
                    fontSize: 12,
                    fontWeight: 400,
                    color: th.textFaint,
                    letterSpacing: "0.03em",
                    lineHeight: 1.65,
                    textAlign: "left",
                    marginBottom: 20,
                  }}>
                    Коли репост зроблено — натисни «Репост зробив». Перевірки в боті немає, ми довіряємо на чесному слові.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <button
                      type="button"
                      onClick={() => {
                        const tw = window.Telegram?.WebApp;
                        if (tw?.openLink) tw.openLink(GIVEAWAY_POST_URL);
                        else window.open(GIVEAWAY_POST_URL, "_blank", "noopener,noreferrer");
                      }}
                      style={{
                        width: "100%",
                        padding: "14px 16px",
                        borderRadius: 14,
                        border: `1px solid ${fm.btnBorder}`,
                        background: "rgba(10, 9, 7, 0.92)",
                        color: th.textSoft,
                        cursor: "pointer",
                        fontFamily: "'Montserrat', sans-serif",
                        fontSize: 13,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        fontWeight: 700,
                      }}
                    >
                      Відкрити анонс
                    </button>
                    {canSendRepostToBot ? (
                      <div className="gw-cta-ring" style={{ width: "100%" }}>
                        <button
                          className="gw-cta"
                          type="button"
                          onClick={() => {
                            clearRepostAfterPay();
                            window.Telegram?.WebApp?.sendData("repost_done");
                          }}
                          style={{
                            width: "100%",
                            padding: "clamp(15px, 4.2vw, 18px)",
                            background: "linear-gradient(180deg, #f7f0e4 0%, #e8dfd2 100%)",
                            color: th.ink,
                            border: "1px solid rgba(0,0,0,0.12)",
                            cursor: "pointer",
                            fontFamily: "'Montserrat', sans-serif",
                            fontSize: "clamp(12px, 3.4vw, 14px)",
                            letterSpacing: "0.14em",
                            textTransform: "uppercase",
                            fontWeight: 700,
                            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)",
                          }}
                        >
                          Репост зробив
                        </button>
                      </div>
                    ) : (
                      <p style={{ fontSize: 12, color: th.textFaint, lineHeight: 1.6 }}>
                        Щоб зафіксувати репост у боті, відкрий цей додаток кнопкою «Додаток» у Telegram.
                      </p>
                    )}
                  </div>
                </div>
                )}
              </>
            )}

            {canBuyMore && (
              <div
                ref={ticketsFormRef}
                style={{
                  border: `1px solid ${fm.border}`,
                  borderRadius: "clamp(18px, 4vw, 24px)",
                  padding: "clamp(22px, 5vw, 28px) clamp(18px, 4.5vw, 24px)",
                  background: fm.bg,
                }}
              >
                <p style={{
                  fontFamily: "'Montserrat', sans-serif",
                  textAlign: "center",
                  marginBottom: 22,
                  fontSize: 13,
                  letterSpacing: "0.26em",
                  textTransform: "uppercase" as const,
                  fontWeight: 700,
                  color: fm.title,
                }}>
                  {hasTickets ? "Докупити квитки" : "Квитки"}
                </p>

                {/* Ticket counter */}
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 20,
                  paddingBottom: 20,
                  borderBottom: `1px solid ${fm.divider}`,
                }}>
                  <span style={{
                    fontSize: "clamp(14px, 3.8vw, 16px)",
                    fontWeight: 600,
                    color: th.textSoft,
                    letterSpacing: "0.04em",
                    lineHeight: 1.35,
                    flex: "1 1 auto",
                    minWidth: 0,
                  }}>
                    Кількість квитків
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: "clamp(14px, 4vw, 18px)", flexShrink: 0 }}>
                    <span className="gw-btn-ring">
                      <button
                        className="gw-count-btn"
                        type="button"
                        onClick={() => setTickets(Math.max(1, tickets - 1))}
                        style={{
                          width: 36, height: 36,
                          borderRadius: "50%",
                          border: "1px solid rgba(0,0,0,0.35)",
                          background: "rgba(10, 9, 7, 0.92)",
                          color: fm.btnColor,
                          cursor: "pointer",
                          fontSize: 19,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontFamily: "'Montserrat', sans-serif",
                          transition: "border-color 0.2s, color 0.2s",
                        }}
                      >−</button>
                    </span>
                    <span style={{ fontSize: "clamp(22px, 6vw, 26px)", fontWeight: 700, color: th.yellow, minWidth: 28, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
                      {tickets}
                    </span>
                    <span className="gw-btn-ring">
                      <button
                        className="gw-count-btn"
                        type="button"
                        onClick={() => setTickets(Math.min(maxThisPurchase, tickets + 1))}
                        style={{
                          width: 36, height: 36,
                          borderRadius: "50%",
                          border: "1px solid rgba(0,0,0,0.35)",
                          background: "rgba(10, 9, 7, 0.92)",
                          color: fm.btnColor,
                          cursor: "pointer",
                          fontSize: 19,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontFamily: "'Montserrat', sans-serif",
                          transition: "border-color 0.2s, color 0.2s",
                        }}
                      >+</button>
                    </span>
                  </div>
                </div>

                {/* Pay method */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "clamp(8px, 2.2vw, 12px)", marginBottom: 14 }}>
                  {(["card", "crypto"] as PayMethod[]).map((method) => (
                    <div key={method} className="gw-pay-ring">
                    <button
                      className="gw-pay"
                      type="button"
                      onClick={() => setPay(method)}
                      style={{
                        width: "100%",
                        padding: "12px 10px",
                        borderRadius: 13,
                        border: `1px solid ${pay === method ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.25)"}`,
                        background: pay === method ? "rgba(12, 11, 9, 0.95)" : "rgba(10, 9, 7, 0.92)",
                        color: pay === method ? th.text : th.textSoft,
                        cursor: "pointer",
                        fontFamily: "'Montserrat', sans-serif",
                        fontSize: 13,
                        letterSpacing: "0.07em",
                        fontWeight: 600,
                        transition: "all 0.2s",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                      }}
                    >
                      {method === "card" ? (
                        <svg width="13" height="10" viewBox="0 0 13 10" fill="none">
                          <rect x="0.5" y="0.5" width="12" height="9" rx="2" stroke="currentColor" />
                          <line x1="0.5" y1="3" x2="12.5" y2="3" stroke="currentColor" />
                        </svg>
                      ) : (
                        <svg width="10" height="13" viewBox="0 0 10 13" fill="none">
                          <path d="M2 1v11M7 1v11M1 4h6a2 2 0 010 4H1" stroke="currentColor" strokeLinecap="round" />
                        </svg>
                      )}
                      {method === "card" ? "Картка" : "Крипта"}
                    </button>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    void (async () => {
                      const init = window.Telegram?.WebApp?.initData;
                      if (!init) {
                        setPurchaseError("Тест доступний лише з Telegram (initData).");
                        return;
                      }
                      setPurchaseLoading(true);
                      setPurchaseError(null);
                      try {
                        const res = await fetch("/api/tickets/test-purchase", {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                            "x-telegram-init-data": init,
                          },
                          body: JSON.stringify({ quantity: tickets }),
                        });
                        const data = (await res.json()) as { error?: string };
                        if (!res.ok) {
                          if (data.error === "test_disabled") {
                            setPurchaseError(
                              "Тест оплати вимкнено на сервері. Додай у .env: PAYMENT_TEST_MODE=true",
                            );
                          } else {
                            setPurchaseError(
                              data.error === "user_cap"
                                ? `Ліміт ${MAX_TICKETS} квитків.`
                                : "Тест не вдався.",
                            );
                          }
                          return;
                        }
                        markRepostAfterPay();
                        await refreshStatsAndMe(init);
                      } catch {
                        setPurchaseError("Помилка мережі.");
                      } finally {
                        setPurchaseLoading(false);
                      }
                    })();
                  }}
                  disabled={purchaseLoading}
                  style={{
                    width: "100%",
                    marginTop: 14,
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: `1px dashed ${fm.payActiveBorder}`,
                    background: "transparent",
                    color: th.textFaint,
                    cursor: purchaseLoading ? "wait" : "pointer",
                    fontFamily: "'Montserrat', sans-serif",
                    fontSize: 11,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    fontWeight: 600,
                  }}
                >
                  Тест оплати
                </button>
              </div>
            )}
          </div>

          <div style={{ ...s.sep, marginTop: 24 }} />

          {/* Progress / Stats */}
          <TicketProgress
            sold={statsSold ?? 0}
            total={statsTotal ?? POOL_TOTAL_FALLBACK}
          />

          {hasTickets && (
            <div style={{ marginTop: 22, marginBottom: 8, padding: `0 clamp(14px, 5vw, 24px)` }}>
              <p style={{
                fontFamily: "'Montserrat', sans-serif",
                fontSize: 11,
                letterSpacing: "0.2em",
                textTransform: "uppercase" as const,
                fontWeight: 600,
                color: th.textFaint,
                textAlign: "center",
                marginBottom: 14,
              }}>
                Твої коди квитків
              </p>
              <p style={{
                fontSize: 13,
                fontWeight: 500,
                color: th.textSoft,
                textAlign: "center",
                lineHeight: 1.6,
                marginBottom: 14,
              }}>
                {myTickets.length === 1
                  ? "Твій код участі в розіграші — нижче."
                  : "Усі коди твоїх квитків — нижче."}
              </p>
              <div style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: 10,
              }}>
                {myTickets.map((t) => (
                  <span
                    key={t.code}
                    style={{
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
                      fontSize: "clamp(15px, 4.2vw, 17px)",
                      fontWeight: 700,
                      letterSpacing: "0.35em",
                      color: th.yellow,
                      padding: "12px 14px",
                      borderRadius: 12,
                      border: `1px solid ${fm.payActiveBorder}`,
                      background: "rgba(10, 9, 7, 0.85)",
                    }}
                  >
                    {t.code}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Нижній порожній простір (текст футера прибрано) */}
          <div
            aria-hidden
            style={{
              minHeight: "clamp(28px, 8vw, 44px)",
              marginTop: 22,
              padding: `0 ${gx} clamp(16px, 4vw, 20px)`,
              borderTop: `1px solid ${th.line}`,
            }}
          />

        </div>

        {canBuyMore && (
          <div
            style={{
              position: "fixed",
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 50,
              display: "flex",
              justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            <div
              className="gw-sticky-cta"
              style={{
                pointerEvents: "auto",
                width: "100%",
                maxWidth: 480,
                padding: `12px ${gx} calc(14px + env(safe-area-inset-bottom, 0px))`,
                background: "rgba(8, 7, 5, 0.94)",
                borderTop: `1px solid ${th.lineStrong}`,
                boxShadow: "0 -12px 40px rgba(0,0,0,0.5)",
              }}
            >
              {checkoutHint && (
                <p style={{
                  fontSize: 12,
                  color: th.accentGoldSoft,
                  textAlign: "center",
                  marginBottom: 10,
                  lineHeight: 1.45,
                  padding: "0 8px",
                }}>
                  {checkoutHint}
                </p>
              )}
              {purchaseError && (
                <p style={{
                  fontSize: 12,
                  color: "#e8a598",
                  textAlign: "center",
                  marginBottom: 10,
                  lineHeight: 1.45,
                  padding: "0 8px",
                }}>
                  {purchaseError}
                </p>
              )}
              {ticketsFocus && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-end",
                    justifyContent: "space-between",
                    gap: 12,
                    marginBottom: 10,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <span style={{
                      fontFamily: "'Montserrat', sans-serif",
                      fontSize: 10,
                      letterSpacing: "0.2em",
                      textTransform: "uppercase" as const,
                      fontWeight: 600,
                      color: th.textFaint,
                      display: "block",
                      marginBottom: 4,
                    }}>
                      До сплати
                      {paymentTestMode && (
                        <span style={{ display: "block", marginTop: 4, letterSpacing: "0.12em", opacity: 0.75 }}>
                          (тестова сума)
                        </span>
                      )}
                    </span>
                    <span style={{
                      fontSize: "clamp(24px, 6.5vw, 32px)",
                      fontWeight: 700,
                      color: th.text,
                      letterSpacing: "-0.02em",
                      fontVariantNumeric: "tabular-nums",
                    }}>
                      {checkoutDisplay}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: "clamp(12px, 3.2vw, 13px)",
                      fontWeight: 600,
                      color: th.textSoft,
                      textAlign: "right",
                      lineHeight: 1.35,
                      flexShrink: 0,
                    }}
                  >
                    {tickets} {ticketWord}
                  </span>
                </div>
              )}
              <div className="gw-cta-ring" style={{ width: "100%" }}>
                <button
                  className="gw-cta"
                  type="button"
                  disabled={purchaseLoading}
                  onClick={() => {
                    if (!ticketsFocus) {
                      ticketsFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                      setTicketsFocus(true);
                      return;
                    }
                    void (async () => {
                      const init = window.Telegram?.WebApp?.initData;
                      if (!init) {
                        setPurchaseError("Відкрий мінідодаток через кнопку «Додаток» у боті — так ми зможемо записати квитки на твій акаунт.");
                        return;
                      }
                      setPurchaseLoading(true);
                      setPurchaseError(null);
                      setCheckoutHint(null);
                      const countBefore = myTickets.length;
                      try {
                        const provider = pay === "crypto" ? "plisio" : "wayforpay";
                        const res = await fetch("/api/tickets/checkout", {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                            "x-telegram-init-data": init,
                          },
                          body: JSON.stringify({ quantity: tickets, provider }),
                        });
                        const data = (await res.json()) as {
                          error?: string;
                          provider?: string;
                          invoiceUrl?: string;
                          wayforpayOpenUrl?: string;
                          details?: string;
                        };
                        if (!res.ok) {
                          if (data.error === "user_cap") {
                            setPurchaseError(`На одного учасника — не більше ${MAX_TICKETS} квитків.`);
                          } else if (data.error === "pool_exhausted") {
                            setPurchaseError("Усі квитки з пулу вже розібрані.");
                          } else if (data.error === "plisio_not_configured" || data.error === "wayforpay_not_configured") {
                            setPurchaseError("Платіжна система не налаштована на сервері.");
                          } else if (data.error === "plisio_invoice_failed") {
                            setPurchaseError(data.details ?? "Не вдалося створити рахунок Plisio.");
                          } else {
                            setPurchaseError("Не вдалося відкрити оплату. Спробуй ще раз.");
                          }
                          return;
                        }
                        if (data.provider === "plisio" && data.invoiceUrl) {
                          const tw = window.Telegram?.WebApp;
                          if (tw?.openLink) {
                            tw.openLink(data.invoiceUrl);
                          } else {
                            window.open(data.invoiceUrl, "_blank", "noopener,noreferrer");
                          }
                          setTimeout(() => tw?.close?.(), 300);
                        } else if (data.provider === "wayforpay" && data.wayforpayOpenUrl) {
                          const tw = window.Telegram?.WebApp;
                          const payUrl = data.wayforpayOpenUrl;
                          if (tw?.openLink) {
                            tw.openLink(payUrl);
                          } else {
                            window.open(payUrl, "_blank", "noopener,noreferrer");
                          }
                          setTimeout(() => tw?.close?.(), 300);
                        }
                      } catch {
                        setPurchaseError("Помилка мережі. Перевір з’єднання й спробуй знову.");
                      } finally {
                        setPurchaseLoading(false);
                      }
                    })();
                  }}
                  style={{
                    width: "100%",
                    padding: "clamp(15px, 4.2vw, 18px)",
                    background: "linear-gradient(180deg, #f7f0e4 0%, #e8dfd2 100%)",
                    color: th.ink,
                    border: "1px solid rgba(0,0,0,0.12)",
                    cursor: purchaseLoading ? "wait" : "pointer",
                    opacity: purchaseLoading ? 0.72 : 1,
                    fontFamily: "'Montserrat', sans-serif",
                    fontSize: "clamp(12px, 3.4vw, 14px)",
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    fontWeight: 700,
                    transition: "opacity 0.2s, transform 0.1s, filter 0.2s",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)",
                  }}
                >
                  {!ticketsFocus ? "Взяти участь →" : purchaseLoading ? "Зачекай…" : "Перейти до оплати"}
                </button>
              </div>
            </div>
          </div>
        )}

    </>
  );
}
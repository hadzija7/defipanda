"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

interface WelcomeCardProps {
  description: string;
  children: React.ReactNode;
}

const SPEECH_BUBBLES = [
  "Let's get started! 🎋",
  "No crypto needed!",
  "I'll guide you ✨",
  "Investing simplified 🐼",
];

export function WelcomeCard({ description, children }: WelcomeCardProps) {
  const [bubbleIndex, setBubbleIndex] = useState(0);
  const [showBubble, setShowBubble] = useState(false);
  const [hasWaved, setHasWaved] = useState(false);

  useEffect(() => {
    const bubbleTimer = setTimeout(() => setShowBubble(true), 1200);
    const waveTimer = setTimeout(() => setHasWaved(true), 2500);
    return () => {
      clearTimeout(bubbleTimer);
      clearTimeout(waveTimer);
    };
  }, []);

  useEffect(() => {
    if (!showBubble) return;
    const interval = setInterval(() => {
      setShowBubble(false);
      setTimeout(() => {
        setBubbleIndex((i) => (i + 1) % SPEECH_BUBBLES.length);
        setShowBubble(true);
      }, 400);
    }, 3500);
    return () => clearInterval(interval);
  }, [showBubble]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-gradient-to-br from-white via-white to-amber-50/60 p-6 dark:border-zinc-800 dark:from-zinc-900 dark:via-zinc-900 dark:to-amber-950/20 sm:p-8">
      {/* Ambient sparkles */}
      <Sparkle className="right-24 top-4 delay-500" size={8} />
      <Sparkle className="right-12 top-16 delay-1000" size={6} />
      <Sparkle className="right-32 bottom-12 delay-2000" size={10} />
      <Sparkle className="right-48 top-10 delay-3000" size={5} />

      <div className="flex items-center gap-4 sm:gap-8">
        {/* Left: text content */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="animate-fade-in-up">
            <span className="mb-1 inline-block rounded-full bg-amber-100 px-3 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              New here? No worries!
            </span>
          </div>

          <h2 className="animate-fade-in-up delay-100 text-2xl font-bold tracking-tight sm:text-3xl">
            Welcome{" "}
            <span className="inline-block animate-panda-wave">👋</span>
          </h2>

          <p className="animate-fade-in-up delay-200 max-w-sm text-sm leading-relaxed text-zinc-500 dark:text-zinc-400 sm:text-base">
            {description}
          </p>

          <div className="animate-fade-in-up delay-300 mt-1">
            {children}
          </div>

          <div className="animate-fade-in-up delay-500 mt-1 flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500">
            <ShieldIcon />
            <span>Non-custodial &middot; You stay in control</span>
          </div>
        </div>

        {/* Right: panda image + speech bubble below */}
        <div className="relative hidden flex-shrink-0 flex-col items-center sm:flex">
          <div
            className={`${hasWaved ? "animate-panda-float" : ""} animate-slide-in-right`}
          >
            <div className="relative h-[200px] w-[180px]">
              <Image
                src="/rockPanda.png"
                alt="DefiPanda mascot"
                fill
                className="pointer-events-none select-none object-contain"
                style={{
                  maskImage: "linear-gradient(to left, transparent 0%, black 25%, black 70%, transparent 100%), linear-gradient(to top, transparent 0%, black 20%, black 80%, transparent 100%)",
                  maskComposite: "intersect",
                  WebkitMaskImage: "linear-gradient(to left, transparent 0%, black 25%, black 70%, transparent 100%), linear-gradient(to top, transparent 0%, black 20%, black 80%, transparent 100%)",
                  WebkitMaskComposite: "source-in",
                }}
                priority
              />
            </div>
          </div>

          {/* Speech bubble — fixed height so it never shifts the panda */}
          <div
            className={`mt-1 whitespace-nowrap rounded-xl bg-amber-50 px-3 py-1.5 text-center text-xs font-medium text-amber-700 transition-all duration-300 dark:bg-amber-950/30 dark:text-amber-300 ${
              showBubble
                ? "translate-y-0 opacity-100"
                : "-translate-y-1 opacity-0"
            }`}
          >
            {SPEECH_BUBBLES[bubbleIndex]}
          </div>
        </div>
      </div>
    </div>
  );
}

function Sparkle({ className = "", size = 8 }: { className?: string; size?: number }) {
  return (
    <div
      className={`animate-sparkle pointer-events-none absolute ${className}`}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
        <path
          d="M12 2L14 10L22 12L14 14L12 22L10 14L2 12L10 10L12 2Z"
          fill="rgb(245 158 11 / 0.5)"
        />
      </svg>
    </div>
  );
}

function ShieldIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

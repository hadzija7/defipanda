import Link from "next/link";

/* ─────────────────────────────────────────────────────────────────────────── *
 *  Landing page – Warm, minimal design inspired by lekker.finance            *
 *  Static server component (SSG-friendly, no wallet context)                 *
 * ─────────────────────────────────────────────────────────────────────────── */

// ── Inline SVG icons ─────────────────────────────────────────────────────

function IconArrowRight({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// ── Navbar ────────────────────────────────────────────────────────────────

function Navbar() {
  return (
    <nav className="fixed top-0 z-50 w-full bg-[#faf9f6]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl font-extrabold tracking-tight text-zinc-900">
            DefiPanda
          </span>
        </Link>

        <Link
          href="/app"
          className="rounded-full bg-amber-500 px-6 py-2 text-sm font-bold text-white shadow-sm transition-all hover:bg-amber-400 hover:shadow-md"
        >
          Launch App
        </Link>
      </div>
    </nav>
  );
}

// ── Hero Section ─────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-6 pt-16">
      {/* Warm gradient blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-blob-1 absolute -right-32 -top-32 h-[600px] w-[600px] rounded-full bg-gradient-to-br from-rose-200/70 via-pink-200/50 to-transparent blur-3xl" />
        <div className="animate-blob-2 absolute -left-20 top-20 h-[500px] w-[500px] rounded-full bg-gradient-to-br from-amber-200/60 via-orange-200/40 to-transparent blur-3xl" />
        <div className="animate-blob-2 absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-gradient-to-tl from-amber-100/50 via-yellow-100/30 to-transparent blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-4xl text-center">
        <h1 className="animate-fade-in-up text-[clamp(2.8rem,7vw,5.5rem)] font-extrabold leading-[1.05] tracking-tight text-zinc-900">
          Automate your<br />
          DCA strategy
        </h1>

        <p className="animate-fade-in-up delay-200 mx-auto mt-6 max-w-xl text-lg leading-relaxed text-zinc-500">
          Set it once, DCA forever. Dollar-cost average into ETH
          powered by Chainlink oracles and on-chain smart accounts.
        </p>

        <div className="animate-fade-in-up delay-300 mt-10">
          <Link
            href="/app"
            className="group inline-flex items-center gap-2.5 rounded-full bg-amber-500 px-8 py-3.5 text-base font-bold text-white shadow-lg shadow-amber-500/20 transition-all hover:bg-amber-400 hover:shadow-xl hover:shadow-amber-400/25"
          >
            Launch App
            <span className="transition-transform group-hover:translate-x-0.5">
              <IconArrowRight />
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}

// ── Architecture Diagram ─────────────────────────────────────────────────

function FlowCard({ title, desc, accent }: { title: string; desc: string; accent: string }) {
  return (
    <div className="flex w-56 flex-col items-center rounded-2xl border border-zinc-200/80 bg-white p-7 text-center shadow-sm transition-all hover:border-amber-300/60 hover:shadow-md">
      <div className={`mb-3 h-2 w-10 rounded-full ${accent}`} />
      <span className="text-lg font-bold text-zinc-900">{title}</span>
      <span className="mt-1.5 text-[15px] leading-snug text-zinc-400">{desc}</span>
    </div>
  );
}

function FlowArrowH({ label }: { label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1.5 px-3">
      <span className="whitespace-nowrap text-sm font-semibold text-zinc-400">{label}</span>
      <div className="flex w-full items-center">
        <div className="h-px flex-1 bg-zinc-300" />
        <svg width="9" height="12" viewBox="0 0 7 10" className="shrink-0 text-zinc-300">
          <path d="M1.5 1L5.5 5L1.5 9" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

function ArchitectureDiagram() {
  const mobileSteps = [
    { title: "Email / Social", desc: "Passwordless login", accent: "bg-zinc-400", arrow: "OTP" },
    { title: "Privy", desc: "MPC key management", accent: "bg-violet-500", arrow: "Embedded EOA" },
    { title: "Smart Wallet", desc: "Your keys, your funds", accent: "bg-sky-500", arrow: "Owner Signer" },
    { title: "Rhinestone", desc: "Smart sessions & permissions", accent: "bg-emerald-500", arrow: "Session Key" },
    { title: "Chainlink CRE", desc: "Scheduled DCA triggers", accent: "bg-blue-600", arrow: "Swap tx" },
    { title: "Uniswap V3", desc: "Best-price execution", accent: "bg-pink-500", arrow: null },
  ];

  return (
    <section className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="animate-fade-in-up text-center text-2xl font-extrabold tracking-tight text-zinc-900 sm:text-3xl">
          How it all<br />
          <span className="text-amber-500">works together</span>
        </h2>
        <p className="animate-fade-in-up delay-100 mx-auto mt-3 max-w-lg text-center text-lg text-zinc-500">
          Four protocols, one seamless DCA experience.
        </p>

        {/* ── Desktop diagram ── */}
        <div className="animate-fade-in-up delay-200 mt-16 hidden md:block">
          <p className="mb-4 text-sm font-bold uppercase tracking-widest text-amber-500/80">
            Authentication
          </p>
          <div className="flex items-center">
            <FlowCard title="Email / Social" desc="Passwordless login" accent="bg-zinc-400" />
            <FlowArrowH label="OTP" />
            <FlowCard title="Privy" desc="MPC key management" accent="bg-violet-500" />
            <FlowArrowH label="Embedded EOA" />
            <FlowCard title="Smart Wallet" desc="Your keys, your funds" accent="bg-sky-500" />
          </div>

          {/* Vertical connector */}
          <div className="flex items-center justify-center py-6">
            <div className="flex flex-col items-center gap-1.5">
              <div className="h-6 w-px bg-zinc-300" />
              <span className="rounded-full border border-zinc-200 bg-white px-6 py-2 text-sm font-semibold text-zinc-500 shadow-sm">
                Owner Signer
              </span>
              <div className="h-4 w-px bg-zinc-300" />
              <svg width="10" height="8" viewBox="0 0 8 6" className="text-zinc-300">
                <path d="M1 1l3 4 3-4" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>

          <p className="mb-4 text-sm font-bold uppercase tracking-widest text-amber-500/80">
            Automated Execution
          </p>
          <div className="flex items-center">
            <FlowCard title="Rhinestone" desc="Smart sessions & permissions" accent="bg-emerald-500" />
            <FlowArrowH label="Session Key" />
            <FlowCard title="Chainlink CRE" desc="Scheduled DCA triggers" accent="bg-blue-600" />
            <FlowArrowH label="Swap tx" />
            <FlowCard title="Uniswap V3" desc="Best-price execution" accent="bg-pink-500" />
          </div>
        </div>

        {/* ── Mobile diagram (vertical flow) ── */}
        <div className="animate-fade-in-up delay-200 mt-12 md:hidden">
          <div className="mx-auto flex max-w-sm flex-col items-center">
            {mobileSteps.map((node) => (
              <div key={node.title} className="flex w-full flex-col items-center">
                <div className="flex w-full items-center gap-4 rounded-xl border border-zinc-200/80 bg-white p-5 shadow-sm">
                  <div className={`h-12 w-1.5 shrink-0 rounded-full ${node.accent}`} />
                  <div>
                    <p className="text-lg font-bold text-zinc-900">{node.title}</p>
                    <p className="text-[15px] text-zinc-400">{node.desc}</p>
                  </div>
                </div>
                {node.arrow && (
                  <div className="flex flex-col items-center py-2">
                    <div className="h-4 w-px bg-zinc-300" />
                    <span className="text-sm font-semibold text-zinc-400">{node.arrow}</span>
                    <div className="h-3 w-px bg-zinc-300" />
                    <svg width="10" height="8" viewBox="0 0 8 6" className="text-zinc-300">
                      <path d="M1 1l3 4 3-4" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Roadmap Section ──────────────────────────────────────────────────────

function Roadmap() {
  const phases = [
    {
      status: "done" as const,
      label: "Completed",
      title: "Core Platform",
      items: [
        "Smart account wallets with social login",
        "DCA strategy creation & management",
        "Session key authorization",
        "Chainlink CRE automated execution",
        "Uniswap V3 swap integration",
        "Self-hosting via Docker Compose",
      ],
    },
    {
      status: "active" as const,
      label: "In Progress",
      title: "Mainnet Launch",
      items: [
        "Multi-network support",
        "Network selector in UI",
        "Gas strategy for mainnet",
        "Production CRE deployment",
        "Fee structure",
      ],
    },
    {
      status: "upcoming" as const,
      label: "Next",
      title: "Advanced Strategies",
      items: [
        "Custom token pair selection",
        "Limit-order hybrid DCA",
        "Portfolio rebalancing",
        "Multi-asset DCA baskets",
      ],
    },
    {
      status: "upcoming" as const,
      label: "Future",
      title: "Protocol Evolution",
      items: [
        "CRE-native signing",
        "Cross-chain DCA execution",
        "Strategy marketplace",
        "Developer SDK",
      ],
    },
  ];

  const dotColor = {
    done: "bg-emerald-500",
    active: "bg-amber-500 ring-4 ring-amber-500/20",
    upcoming: "bg-zinc-300",
  };

  const badgeStyle = {
    done: "bg-emerald-100 text-emerald-700",
    active: "bg-amber-100 text-amber-700",
    upcoming: "bg-zinc-100 text-zinc-500",
  };

  // Each segment color is determined by the status of the dot it leads INTO.
  // done→done = green, done→active = green, active→upcoming = amber, upcoming→upcoming = grey
  function segmentColor(fromStatus: string, toStatus: string): string {
    if (fromStatus === "done" && toStatus === "done") return "bg-emerald-500";
    if (fromStatus === "done" && toStatus === "active") return "bg-emerald-500";
    if (fromStatus === "active") return "bg-amber-500";
    return "bg-zinc-200";
  }

  return (
    <section id="roadmap" className="bg-[#faf9f6] py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="animate-fade-in-up text-center text-2xl font-extrabold tracking-tight text-zinc-900 sm:text-3xl">
          Roadmap
        </h2>
        <p className="animate-fade-in-up delay-100 mx-auto mt-3 max-w-md text-center text-lg text-zinc-500">
          Where we are and where we&apos;re going.
        </p>

        {/* Horizontal timeline */}
        <div className="animate-fade-in-up delay-200 relative mt-16 overflow-x-auto pb-4">
          <div className="min-w-[750px]">
            {/* Dots + line row — flexbox with equal spacing */}
            <div className="relative mb-10 flex items-center justify-between">
              {/* Background track (full-width grey line) */}
              <div className="absolute left-2 right-2 top-1/2 h-0.5 -translate-y-1/2 bg-zinc-200" />

              {/* Colored segments between dots */}
              {phases.map((phase, i) => {
                if (i === phases.length - 1) return null;
                const pct = (i / (phases.length - 1)) * 100;
                const nextPct = ((i + 1) / (phases.length - 1)) * 100;
                return (
                  <div
                    key={`seg-${phase.title}`}
                    className={`absolute top-1/2 h-0.5 -translate-y-1/2 ${segmentColor(phase.status, phases[i + 1].status)}`}
                    style={{ left: `${pct}%`, width: `${nextPct - pct}%` }}
                  />
                );
              })}

              {/* Dots */}
              {phases.map((phase) => (
                <div
                  key={`dot-${phase.title}`}
                  className={`relative z-10 h-5 w-5 shrink-0 rounded-full ${dotColor[phase.status]}`}
                />
              ))}
            </div>

            {/* Content columns — equal-width grid aligned to dots */}
            <div className="grid grid-cols-4">
              {phases.map((phase, i) => (
                <div key={phase.title} className={`animate-fade-in-up delay-${(i + 2) * 100} flex flex-col items-center text-center px-3`}>
                  <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${badgeStyle[phase.status]}`}>
                    {phase.label}
                  </span>
                  <h3 className="mt-3 text-lg font-bold text-zinc-900">{phase.title}</h3>
                  <ul className="mt-3 flex flex-col gap-1.5">
                    {phase.items.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-[15px] leading-snug text-zinc-500 text-left">
                        {phase.status === "done" ? (
                          <span className="mt-0.5 shrink-0 text-emerald-500"><IconCheck /></span>
                        ) : (
                          <span className="mt-[7px] inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-300" />
                        )}
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── CTA Section ──────────────────────────────────────────────────────────

function CallToAction() {
  return (
    <section className="relative overflow-hidden bg-white py-24 sm:py-32">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-blob-1 absolute left-1/2 top-1/2 h-[400px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-amber-200/40 via-rose-200/30 to-transparent blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-2xl px-6 text-center">
        <h2 className="animate-fade-in-up text-2xl font-extrabold tracking-tight text-zinc-900 sm:text-3xl">
          Ready to start?
        </h2>
        <p className="animate-fade-in-up delay-100 mt-3 text-base text-zinc-500">
          Connect your wallet, set your strategy, and let decentralized infrastructure handle the rest.
        </p>
        <div className="animate-fade-in-up delay-200 mt-8">
          <Link
            href="/app"
            className="group inline-flex items-center gap-2.5 rounded-full bg-amber-500 px-10 py-4 text-lg font-bold text-white shadow-lg shadow-amber-500/20 transition-all hover:bg-amber-400 hover:shadow-xl hover:shadow-amber-400/25"
          >
            Launch App
            <span className="transition-transform group-hover:translate-x-0.5">
              <IconArrowRight />
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}

// ── Footer ───────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="border-t border-zinc-100 bg-[#faf9f6] py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
        <div className="flex items-center gap-2">
          <span className="text-base font-extrabold text-zinc-900">DefiPanda</span>
          <span className="text-xs text-zinc-400">&copy; {new Date().getFullYear()}</span>
        </div>

        <div className="flex items-center gap-6 text-sm text-zinc-400">
          <a
            href="https://github.com/hadzija7/defipanda"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-zinc-700"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#faf9f6] text-zinc-900">
      <Navbar />
      <Hero />
      <ArchitectureDiagram />
      <Roadmap />
      <CallToAction />
      <Footer />
    </div>
  );
}

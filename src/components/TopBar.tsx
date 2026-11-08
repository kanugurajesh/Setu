"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { SITE } from "@/lib/site";
import { SetuMark } from "./icons";

type Health = { configured: boolean; provider: string; models: { text: string } };

export function TopBar() {
  const path = usePathname();
  const [health, setHealth] = useState<Health | null | "down">(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/health")
      .then((r) => r.json())
      .then((h: Health) => alive && setHealth(h))
      .catch(() => alive && setHealth("down"));
    return () => {
      alive = false;
    };
  }, []);

  const status =
    health === null ? (
      <span className="status">
        <i /> checking…
      </span>
    ) : health === "down" || !health.configured ? (
      <span className="status bad" title="Set GROQ_API_KEY on the server">
        <i /> AI not configured
      </span>
    ) : (
      <span className="status ok" title={`Served by ${health.provider}`}>
        <i /> {health.models.text.replace(/^openai\//, "")} · {health.provider.includes("groq") ? "Groq" : health.provider}
      </span>
    );

  return (
    <header className="topbar">
      <div className="topbar-in">
        <Link href="/" className="brand" aria-label="Setu home">
          <SetuMark />
          <div>
            <b>Setu</b>
            <span>Care → Thrive bridge</span>
          </div>
        </Link>
        <nav className="nav" aria-label="Main">
          <Link href="/" aria-current={path === "/" ? "page" : undefined}>
            Workspace
          </Link>
          <Link href="/how-it-works" aria-current={path === "/how-it-works" ? "page" : undefined}>
            How it&apos;s built
          </Link>
        </nav>
        {status}
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="foot">
      <span>
        Built by{" "}
        <a href={SITE.authorUrl} target="_blank" rel="noreferrer">
          {SITE.author}
        </a>{" "}
        as an independent prototype for an application to VitaInspire. Not affiliated with or endorsed by VitaInspire or Digiswasthya.
        {SITE.repoUrl && (
          <>
            {" "}
            ·{" "}
            <a href={SITE.repoUrl} target="_blank" rel="noreferrer">
              Source
            </a>
          </>
        )}
      </span>
      <span>Not a medical device. All sample patients are synthetic.</span>
    </footer>
  );
}

"use client";

import { useEffect } from "react";

/**
 * Scroll-Triggered Stagger Reveal Controller.
 * Smoothly animates spec cards (Battery, Range, Motor), storytelling chapters,
 * and technical specification matrices with a 70ms stagger as the user scrolls,
 * while respecting prefers-reduced-motion.
 */
export function ScrollRevealObserver() {
  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const targets = document.querySelectorAll<HTMLElement>(
      ".proposal-kpi-card, .proposal-showroom, .proposal-story-row, .proposal-spec-group-card, .proposal-offer",
    );

    targets.forEach((el, index) => {
      const rect = el.getBoundingClientRect();
      // Only animate elements starting below the initial fold
      if (rect.top > window.innerHeight * 0.92) {
        el.classList.add("will-scroll-reveal");
        el.style.setProperty("--reveal-stagger", `${(index % 6) * 70}ms`);
      }
    });

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-revealed");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -36px 0px" },
    );

    targets.forEach((el) => {
      if (el.classList.contains("will-scroll-reveal")) {
        observer.observe(el);
      }
    });

    return () => observer.disconnect();
  }, []);

  return null;
}

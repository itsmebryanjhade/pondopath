"use client";

import {
  type ComponentPropsWithoutRef,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

type ViewportSectionProps = ComponentPropsWithoutRef<"section"> & {
  activeClassName: string;
};

export function useInViewOnce<T extends Element>(threshold = 0.2) {
  const ref = useRef<T>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || isVisible) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [isVisible, threshold]);

  return { ref, isVisible };
}

export function ViewportSection({
  activeClassName,
  className = "",
  ...props
}: ViewportSectionProps) {
  const { ref, isVisible } = useInViewOnce<HTMLElement>(0.12);

  return (
    <section
      {...props}
      ref={ref}
      className={`${className} ${isVisible ? activeClassName : ""}`.trim()}
    />
  );
}

export function MotionListItem({
  activeClassName,
  className = "",
  children,
}: {
  activeClassName: string;
  className?: string;
  children: ReactNode;
}) {
  const { ref, isVisible } = useInViewOnce<HTMLLIElement>(0.35);

  return (
    <li ref={ref} className={`${className} ${isVisible ? activeClassName : ""}`.trim()}>
      {children}
    </li>
  );
}

export function CountUpAmount({
  value,
  showPlus = false,
  suffix = "",
  duration = 850,
}: {
  value: number;
  showPlus?: boolean;
  suffix?: string;
  duration?: number;
}) {
  const { ref, isVisible } = useInViewOnce<HTMLSpanElement>(0.5);
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    if (!isVisible) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const frame = requestAnimationFrame(() => setDisplayValue(value));
      return () => cancelAnimationFrame(frame);
    }

    let frame = 0;
    const startedAt = performance.now();
    const animate = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(value * eased));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [duration, isVisible, value]);

  const format = (amount: number) => {
    const sign = amount < 0 ? "−" : showPlus && amount > 0 ? "+" : "";
    return `${sign}₱${Math.abs(amount).toLocaleString("en-PH")}${suffix}`;
  };

  return (
    <span ref={ref} aria-label={format(value)}>
      {format(displayValue)}
    </span>
  );
}

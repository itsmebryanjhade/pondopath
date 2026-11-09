"use client";

import { useState } from "react";
import { calculateForecast } from "@/lib/domain/forecast";
import { DashboardIcon } from "./dashboard-icon";
import { CountUpAmount, useInViewOnce } from "./viewport-motion";
import styles from "@/app/landing.module.css";

export function LandingPreview() {
  const [delayed, setDelayed] = useState(true);
  const { ref, isVisible } = useInViewOnce<HTMLElement>(0.2);
  const receiptDate = delayed ? "2026-11-03" : "2026-10-29";
  const forecast = calculateForecast({
    referenceDate: "2026-10-29",
    availableCents: 4_000_000,
    invoices: [{
      id: "sample-invoice",
      outstandingCents: 5_000_000,
      expectation: { id: "sample-expectation", date: receiptDate, remainingCents: 5_000_000, kind: "assumption", needsReview: false },
    }],
    expenses: [{ id: "sample-expenses", dueDate: "2026-10-30", unpaidCents: 8_000_000 }],
  });
  const x = (index: number) => 52 + (index / 29) * 418;
  const y = (cents: number) => 12 + ((10_000_000 - cents) / 15_000_000) * 116;
  const points = forecast.days.map((day, index) => `${x(index)},${y(day.closingCents)}`).join(" ");
  const shortageIndex = forecast.firstShortage ? forecast.days.findIndex((day) => day.date === forecast.firstShortage?.date) : -1;

  return (
    <section ref={ref} className={`${styles.preview} ${isVisible ? styles.previewMotion : ""}`} aria-labelledby="preview-heading">
      <div className={styles.previewTop}>
        <div><p className={styles.previewEyebrow}>Cash-flow outlook</p><h2 id="preview-heading">Your 30-day cash plan</h2></div>
        <span className={styles.sampleBadge}>Sample data</span>
      </div>
      <div className={styles.previewHero}>
        <div className={styles.previewStatus}>
          <span className={styles.previewStatusLabel}><DashboardIcon name="alert" size={15} />Projected cash in 30 days</span>
          <strong><CountUpAmount value={forecast.days[29].closingCents / 100} /></strong>
          <p>Expected payments are not recorded cash.</p>
          <div className={delayed ? styles.shortfall : styles.noShortfall} role="status" aria-live="polite" aria-atomic="true">
            <span>{delayed ? "Projected shortfall" : "No projected shortage"}</span>
            <strong>{delayed ? "₱40,000 · Friday" : "Based on entered records"}</strong>
          </div>
        </div>
        <div className={styles.previewChartArea}>
          <div className={styles.chartHeader}><div><strong>Cash balance</strong><span>29 Oct – 27 Nov</span></div><span>PHP</span></div>
          <svg key={receiptDate} className={styles.previewChart} viewBox="0 0 500 162" role="img" aria-labelledby="preview-chart-title preview-chart-desc">
            <title id="preview-chart-title">Sample 30-day cash balance</title>
            <desc id="preview-chart-desc">{delayed ? "The projected balance falls forty thousand pesos below zero on Friday and recovers after the customer payment on Monday." : "The customer payment arrives before Friday's expenses, keeping the projected balance above zero."}</desc>
            {[10_000_000, 5_000_000, 0, -5_000_000].map((value) => (
              <g key={value}>
                <line x1="52" x2="470" y1={y(value)} y2={y(value)} className={value === 0 ? styles.zeroLine : styles.gridLine} />
                <text x="43" y={y(value) + 4} textAnchor="end">{value / 100_000}k</text>
              </g>
            ))}
            <path d={`${points.split(" ").map((point, index) => `${index ? "L" : "M"}${point}`).join(" ")} L470,128 L52,128 Z`} className={styles.chartFill} />
            <polyline points={points} fill="none" className={styles.forecastLine} />
            {shortageIndex >= 0 && <circle cx={x(shortageIndex)} cy={y(forecast.days[shortageIndex].closingCents)} r="5" className={styles.shortagePoint} />}
            <text x="52" y="155">29 Oct</text><text x={x(14)} y="155" textAnchor="middle">12 Nov</text><text x="470" y="155" textAnchor="end">27 Nov</text>
          </svg>
          <div className={styles.chartKey}><span><i />Projected balance</span><strong>{delayed ? "Below zero Friday" : "Above zero"}</strong></div>
        </div>
      </div>
      <dl className={styles.previewMetrics}>
        <div><span className={`${styles.metricIcon} ${styles.greenIcon}`}><DashboardIcon name="wallet" /></span><dt>Recorded cash</dt><dd>₱40,000</dd><small>Verified balance</small></div>
        <div><span className={`${styles.metricIcon} ${styles.blueIcon}`}><DashboardIcon name="arrowIn" /></span><dt>Expected receipts</dt><dd>₱50,000</dd><small>Not yet received</small></div>
        <div><span className={`${styles.metricIcon} ${styles.purpleIcon}`}><DashboardIcon name="arrowOut" /></span><dt>Upcoming expenses</dt><dd>₱80,000</dd><small>Due Friday</small></div>
      </dl>
      <div className={styles.previewRecord}>
        <div><span className={styles.metricIcon}><DashboardIcon name="receipt" /></span><p><strong>Customer payment promise</strong><small>DEMO-001 · expected {delayed ? "Monday" : "Thursday"}</small></p></div>
        <strong>₱50,000</strong>
        <span className={delayed ? styles.riskBadge : styles.safeBadge}>{delayed ? "Needs follow-up" : "On schedule"}</span>
      </div>
      <fieldset className={styles.previewToggle}>
        <legend>Compare payment timing</legend>
        <div>
          <label><input type="radio" name="sample-timing" checked={!delayed} onChange={() => setDelayed(false)} />On time</label>
          <label><input type="radio" name="sample-timing" checked={delayed} onChange={() => setDelayed(true)} />Monday</label>
        </div>
      </fieldset>
    </section>
  );
}

"use client";

import { useState } from "react";
import { calculateForecast } from "@/lib/domain/forecast";
import { formatPHP } from "@/lib/domain/money";
import styles from "@/app/landing.module.css";

export function LandingPreview() {
  const [delayed, setDelayed] = useState(false);
  const receiptDate = delayed ? "2026-11-03" : "2026-10-29";
  const forecast = calculateForecast({
    referenceDate: "2026-10-29",
    availableCents: 4_000_000,
    invoices: [{ id: "example-invoice", outstandingCents: 5_000_000, expectation: { id: "example-expectation", date: receiptDate, remainingCents: 5_000_000, kind: "assumption", needsReview: false } }],
    expenses: [{ id: "example-bills", dueDate: "2026-10-30", unpaidCents: 8_000_000 }],
  });
  const x = (index: number) => 72 + (index / 29) * 384;
  const y = (cents: number) => 12 + ((10_000_000 - cents) / 15_000_000) * 100;
  const points = forecast.days.map((day, index) => `${x(index)},${y(day.closingCents)}`).join(" ");
  const shortageIndex = forecast.firstShortage ? forecast.days.findIndex((day) => day.date === forecast.firstShortage?.date) : -1;

  return (
    <section className={styles.preview} aria-labelledby="example-heading">
      <div className={styles.previewHeader}><div><p className={styles.previewEyebrow}>Illustrative example</p><h2 id="example-heading">The same money. Different timing.</h2></div><span className={styles.exampleLabel}>PHP · 30 days</span></div>
      <dl className={styles.previewMetrics}>
        <div><dt>Recorded cash</dt><dd>{formatPHP(4_000_000)}</dd></div>
        <div><dt>Expected receipt</dt><dd>{formatPHP(5_000_000)}</dd></div>
        <div><dt>Upcoming bills</dt><dd>{formatPHP(8_000_000)}</dd></div>
      </dl>
      <div className={styles.previewBody}>
        <fieldset className={styles.scenarioChoice}><legend>What if the customer pays…</legend><div><label><input type="radio" name="example-timing" checked={!delayed} onChange={() => setDelayed(false)} />On time</label><label><input type="radio" name="example-timing" checked={delayed} onChange={() => setDelayed(true)} />5 days late</label></div></fieldset>
        <div className={styles.chartHeading}><span>Projected closing cash</span><span>29 Oct – 27 Nov</span></div>
        <svg className={styles.previewChart} viewBox="0 0 480 154" role="img" aria-labelledby="example-chart-title example-chart-description">
          <title id="example-chart-title">Illustrative 30-day cash forecast</title>
          <desc id="example-chart-description">{delayed ? "A receipt arriving on November 3 leaves a projected shortage of PHP 40,000 from October 30 through November 2." : "A receipt arriving on October 29 covers the October 30 bills. Projected cash stays above zero."} The projected end balance is PHP 10,000 in both examples.</desc>
          {[10_000_000, 5_000_000, 0, -5_000_000].map((value) => <g key={value}><line x1="72" x2="456" y1={y(value)} y2={y(value)} className={value === 0 ? styles.zeroLine : styles.gridLine} /><text x="60" y={y(value) + 4} textAnchor="end">{value / 100_000}k</text></g>)}
          <polyline points={points} fill="none" className={styles.forecastLine} />
          {shortageIndex >= 0 && <circle cx={x(shortageIndex)} cy={y(forecast.days[shortageIndex].closingCents)} r="5" className={styles.shortagePoint} />}
          <text x="72" y="148">29 Oct</text><text x={x(14)} y="148" textAnchor="middle">12 Nov</text><text x="456" y="148" textAnchor="end">27 Nov</text>
        </svg>
        <div className={`${styles.exampleFinding} ${delayed ? styles.findingWarning : ""}`} role="status" aria-live="polite" aria-atomic="true"><span className={styles.findingSymbol} aria-hidden="true">{delayed ? "!" : "✓"}</span><div><strong>{forecast.firstShortage ? `${formatPHP(forecast.firstShortage.shortfallCents)} gap on 30 October` : `${formatPHP(forecast.days[29].closingCents)} projected end balance`}</strong><p>{delayed ? "Bills are due first. Confirm the customer’s payment date." : "Expected receipts cover the entered bills."}</p></div></div>
      </div>
      <details className={styles.previewDetails}>
        <summary>How this example is calculated</summary>
        <div className={styles.exampleSources}>
          <p><span>Customer payment</span><strong>Expected {delayed ? "3 Nov" : "29 Oct"}</strong></p>
          <p><span>Payroll & other bills</span><strong>Due 30 Oct</strong></p>
        </div>
        <p className={styles.previewFootnote}>Fictional amounts, calculated with PondoPath’s forecast rules. Expected receipts are planning assumptions.</p>
      </details>
    </section>
  );
}

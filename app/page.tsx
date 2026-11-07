import type { CSSProperties } from "react";
import Link from "next/link";
import { DM_Sans, Manrope } from "next/font/google";
import { DashboardIcon } from "@/components/dashboard-icon";
import { LandingMobileMenu } from "@/components/landing-mobile-menu";
import { LandingPreview } from "@/components/landing-preview";
import { ProductBrand } from "@/components/product-brand";
import { CountUpAmount, MotionListItem, ViewportSection } from "@/components/viewport-motion";
import styles from "./landing.module.css";

const bodyFont = DM_Sans({ subsets: ["latin"], display: "swap" });
const headingFont = Manrope({ subsets: ["latin"], display: "swap", variable: "--font-landing-heading" });

const steps = [
  ["receipt", "Enter your records", "Add unpaid invoices, expenses and opening cash, or bring them in from a file.", "You"],
  ["calendar", "See your 30-day forecast", "The earliest shortage and its amount appear right away, calculated by programmed rules.", "Automatic"],
  ["sparkle", "Turn replies into updates", "Paste a customer reply. PondoPath proposes a new date and amount for you to review.", "You confirm"],
  ["bell", "Follow up with confidence", "Send owner-approved reminders and get a task when a promised date passes.", "Owner approves"],
] as const;

const features = [
  ["calendar", "30-day cash forecast", "See the earliest shortfall, biggest gap and the records behind it.", []],
  ["receipt", "Collections workspace", "Keep unpaid, due and overdue invoices beside their next action.", ["Unpaid", "Due", "Overdue"]],
  ["arrowIn", "Reply to cash impact", "Review an English, Tagalog or Taglish reply before its proposed update is saved.", ["English", "Tagalog", "Taglish"]],
  ["sparkle", "What-if comparison", "Move a payment from Friday to Monday without changing real records.", ["Friday \u2192 Monday"]],
  ["alert", "Owner-approved reminders", "Edit, approve, then copy a draft into the channel your team already uses.", ["Edit", "Approve", "Copy"]],
  ["arrowRight", "Missed-promise follow-ups", "Create a task when a promised date passes without a recorded payment.", ["Task created"]],
  ["more", "Full history", "See who changed what, when it changed and why.", ["Who", "When", "Why"]],
] as const;

const controls = [
  ["receipt", "Rules do the math", "Calculations are done by programmed rules, not by AI."],
  ["sparkle", "AI cannot act", "AI explains results and drafts text. It cannot post payments, change records or send messages."],
  ["wallet", "Promises are not cash", "A customer promise is not money received. Cash is recorded only after staff verifies it."],
  ["bell", "Owners approve reminders", "Finance staff cannot bypass that approval."],
  ["lock", "Private by default", "Every workspace is private with role-based access."],
  ["plus", "Works without AI", "Manual entry and templates keep working if AI is unavailable."],
] as const;

const approvalFlow = [
  ["sparkle", "Proposed", "AI or an import suggests a change"],
  ["search", "You review", "Check it, edit it or reject it"],
  ["check", "Saved", "Only after you confirm"],
] as const;

function SafetyIcon({ name }: { name: "lock" | "check" }) {
  return (
    <svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {name === "lock" ? <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></> : <path d="M5 12.5l4.5 4.5L19 7.5" />}
    </svg>
  );
}


const liveRecords = [
  ["CSV or Excel upload", "Choose the columns and rows to bring in."],
  ["Connect Google", "Read a Google Sheet, or an Excel or CSV file in your Drive."],
  ["Review before saving", "Every row arrives as a proposal. Nothing changes until you confirm."],
];
const plannedRecords = ["Business messaging intake", "Receipt-image extraction"];

const inboxRows = [
  ["Invoice", "INV-104 \u00b7 Fictional Trading", "\u20b115,000", "Due 20 Nov", true],
  ["Expense", "Internet", "\u20b12,499", "Due 18 Nov", true],
  ["Invoice", "INV-105 \u00b7 Sample Supply", "\u20b18,250", "Due 25 Nov", false],
] as const;

const peso = (amount: number) => `${amount < 0 ? "\u2212" : ""}\u20b1${Math.abs(amount).toLocaleString("en-PH")}`;

const timelines = [
  {
    label: "Customer pays on time", risk: false,
    terms: [["\u20b140,000", "on hand"], ["+ \u20b150,000", "expected"], ["\u2212 \u20b180,000", "due Friday"]],
    days: [["Thu", 40_000], ["Fri", 10_000], ["Mon", 10_000]],
    resultLabel: "Projected cash", result: 10_000, note: "",
  },
  {
    label: "Payment slips to Monday", risk: true,
    terms: [["\u20b140,000", "on hand"], ["\u2212 \u20b180,000", "due Friday"]],
    days: [["Thu", 40_000], ["Fri", -40_000], ["Mon", 10_000]],
    resultLabel: "Friday shortfall", result: 40_000, note: "The balance recovers Monday, but payroll day still needs action.",
  },
] as const;

const stagger = (index: number) => ({ "--i": index }) as CSSProperties;

const faqs = [
  ["Does it send messages to customers?", "No. You copy approved drafts and send them yourself."],
  ["Does it replace accounting software?", "No. It focuses on cash timing and collections."],
  ["Does it guarantee faster payment?", "No. It helps you see problems earlier and follow up consistently."],
  ["What does the AI do?", "It explains forecast results and extracts details from replies. You confirm everything."],
  ["Is my data safe?", "Each workspace is private with role-based access. PondoPath is in its pilot period, so start with records you are comfortable testing with."],
  ["How much does it cost?", "Free during the pilot period."],
];

function Arrow() {
  return <span aria-hidden="true">↗</span>;
}

function SectionHeading({ id, eyebrow, title, description }: { id: string; eyebrow: string; title: string; description?: string }) {
  return (
    <div className={styles.sectionHeading}>
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h2 id={id}>{title}</h2>
      {description && <p>{description}</p>}
    </div>
  );
}

export default function Home() {
  return (
    <div className={`${styles.landing} ${bodyFont.className} ${headingFont.variable}`}>
      <a className="skip-link" href="#landing-main">Skip to content</a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link className={styles.brand} href="/" aria-label="PondoPath home"><ProductBrand /></Link>
          <nav className={styles.desktopNav} aria-label="Main navigation">
            <a href="#how-it-works">How it works</a>
            <a href="#features">Features</a>
            <a href="#control">Control &amp; safety</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className={styles.headerActions}>
            <Link className={styles.outlineButton} href="/login">Log in</Link>
            <Link className={styles.primaryButton} href="/signup">Create workspace</Link>
          </div>
          <LandingMobileMenu />
        </div>
      </header>

      <main id="landing-main" tabIndex={-1}>
        <section className={styles.hero} aria-labelledby="hero-heading">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Cash-flow action planning for Philippine B2B teams</p>
            <h1 id="hero-heading"><span>See your cash flow.</span><span>Plan your next move.</span></h1>
            <p className={styles.heroDescription}>PondoPath connects your unpaid invoices, customer payment promises and upcoming expenses into one 30-day cash plan, so you know what to follow up on today.</p>
            <div className={styles.heroActions}>
              <Link className={styles.primaryButton} href="/signup">Create workspace <Arrow /></Link>
              <a className={styles.secondaryButton} href="#how-it-works">See how it works</a>
            </div>
            <p className={styles.heroNote}><DashboardIcon name="wallet" size={16} />Built for small Philippine B2B businesses. Amounts in PHP.</p>
          </div>
          <LandingPreview />
        </section>

        <ViewportSection className={styles.problemSection} activeClassName={styles.problemMotion} aria-labelledby="problem-heading">
          <div className={styles.problemHeader}>
            <div className={styles.problemIntro}>
            <SectionHeading id="problem-heading" eyebrow="The timing problem" title="A healthy total can still hide a difficult Friday." />
            </div>
            <div className={styles.problemSummary}>
              <p>Your totals can look healthy while the dates still leave you short. The order of events matters as much as the amount.</p>
              <span className={styles.sampleBadge}>Fictional example</span>
            </div>
          </div>
          <div className={styles.cashSequence}>
            <ol className={styles.cashRail} aria-label="Cash position from Thursday to Monday">
              <MotionListItem className={styles.cashOpening} activeClassName={styles.cashEventVisible}>
                <span className={styles.railDate}>Thursday · Today</span>
                <span className={styles.railIcon}><DashboardIcon name="wallet" size={18} /></span>
                <p>Recorded cash</p>
                <strong><CountUpAmount value={40_000} /></strong>
                <small>Available in the account</small>
              </MotionListItem>
              <MotionListItem className={styles.cashRisk} activeClassName={styles.cashEventVisible}>
                <span className={styles.railDate}>Friday</span>
                <span className={styles.railIcon}><DashboardIcon name="arrowOut" size={18} /></span>
                <p>Payroll and bills</p>
                <strong><CountUpAmount value={-80_000} /></strong>
                <small>The due dates remain fixed</small>
                <div className={styles.shortfallMarker}>
                  <span>Cash gap</span>
                  <strong><CountUpAmount value={40_000} suffix=" short" /></strong>
                  <small>Before the payment arrives</small>
                </div>
              </MotionListItem>
              <MotionListItem className={styles.cashExpected} activeClassName={styles.cashEventVisible}>
                <span className={styles.railDate}>Monday</span>
                <span className={styles.railIcon}><DashboardIcon name="arrowIn" size={18} /></span>
                <p>Customer payment</p>
                <strong><CountUpAmount value={50_000} showPlus /></strong>
                <small>Expected—not received cash</small>
              </MotionListItem>
            </ol>
          </div>
          <div className={styles.problemFooter}>
            <ul className={styles.problemSources} aria-label="Cash planning records">
              <li><DashboardIcon name="receipt" size={15} /><span>Unpaid invoices</span></li>
              <li><DashboardIcon name="arrowIn" size={15} /><span>Customer promises</span></li>
              <li><DashboardIcon name="calendar" size={15} /><span>Upcoming expenses</span></li>
            </ul>
            <p><strong>The total looks positive.</strong> <span>The timing creates the gap.</span></p>
          </div>
          <div className={styles.problemCompare}>
            <h3>The same money. Different timing.</h3>
            <p>This is the gap a spreadsheet total can hide.</p>
            <ol className={styles.compareGrid} aria-label="Two ways the same money can play out">
              {timelines.map((timeline) => (
                <MotionListItem key={timeline.label} className={`${styles.compareCard} ${timeline.risk ? styles.compareRisk : ""}`} activeClassName={styles.compareVisible}>
                  <span className={styles.comparisonLabel}><DashboardIcon name={timeline.risk ? "alert" : "calendar"} size={17} />{timeline.label}</span>
                  <p className={styles.compareTerms}>{timeline.terms.map(([amount, text]) => <span key={text}><strong>{amount}</strong> {text}</span>)}</p>
                  <div className={styles.balanceBars} role="img" aria-label={`Cash at the end of each day: ${timeline.days.map(([day, value]) => `${day} ${peso(value)}`).join(", ")}.`}>
                    {timeline.days.map(([day, value], index) => (
                      <div key={day} className={`${styles.balanceDay} ${value < 0 ? styles.balanceNegative : ""}`} style={{ "--h": Math.abs(value) / 40_000, "--d": index } as CSSProperties}>
                        <div className={styles.barUp}>{value >= 0 && <i />}</div>
                        <div className={styles.barDown}>{value < 0 && <i />}</div>
                        <small>{day}</small><b>{peso(value)}</b>
                      </div>
                    ))}
                  </div>
                  <div className={styles.compareResult}><span>{timeline.resultLabel}</span><strong><CountUpAmount value={timeline.result} /></strong></div>
                  {timeline.note && <small>{timeline.note}</small>}
                </MotionListItem>
              ))}
            </ol>
          </div>
        </ViewportSection>

        <ViewportSection id="how-it-works" className={`${styles.section} ${styles.howSection}`} activeClassName={styles.sectionMotion} aria-labelledby="workflow-heading">
          <SectionHeading id="workflow-heading" eyebrow="How it works" title="From scattered records to today’s next action." description="One reviewable workflow. Your team confirms every change." />
          <ol className={styles.stepGrid}>
            {steps.map(([icon, title, body, who], index) => (
              <li className={styles.stepCard} key={title} style={stagger(index)}>
                <div className={styles.stepTop}><span className={styles.stepIcon}><DashboardIcon name={icon} size={20} /></span><span className={styles.stepNumber}>0{index + 1}</span></div>
                <h3>{title}</h3>
                <p>{body}</p>
                <span className={styles.stepWho}>{who}</span>
              </li>
            ))}
          </ol>
          <p className={styles.audienceLine}>Made for finance and admin staff, owners and managers, and owner-operators who do both.</p>
        </ViewportSection>

        <ViewportSection id="features" className={`${styles.section} ${styles.featuresSection}`} activeClassName={styles.sectionMotion} aria-labelledby="features-heading">
          <SectionHeading id="features-heading" eyebrow="Built around the work" title="The cash plan stays connected to the records behind it." />
          <div className={styles.featureGrid}>
            {features.map(([icon, title, body, chips], index) => (
              <article className={`${styles.featureCard} ${index === 0 ? styles.featureWide : ""}`} key={title} style={stagger(index)}>
                <div className={styles.featureBody}>
                  <span className={styles.cardIcon}><DashboardIcon name={icon} /></span>
                  <h3>{title}</h3>
                  <p>{body}</p>
                  {chips.length > 0 && <ul className={styles.featureChips}>{chips.map((chip) => <li key={chip}>{chip}</li>)}</ul>}
                </div>
                {index === 0 && (
                  <svg className={styles.featureChart} viewBox="0 0 260 112" aria-hidden="true" focusable="false">
                    <line className={styles.featureZero} x1="0" y1="64" x2="260" y2="64" />
                    <path className={styles.featureLine} pathLength="1" d="M4 26 C40 24 70 30 100 50 S150 98 176 92 S236 46 256 38" fill="none" />
                    <circle className={styles.featureDot} cx="150" cy="88" r="5" />
                    <text className={styles.featureNote} x="160" y="106">Below zero Friday</text>
                  </svg>
                )}
              </article>
            ))}
          </div>
        </ViewportSection>

        <ViewportSection id="control" className={styles.controlSection} activeClassName={styles.sectionMotion} aria-labelledby="control-heading">
          <div className={styles.controlIntro}>
            <p className={styles.eyebrow}>Control &amp; safety</p>
            <h2 id="control-heading">You stay in control.</h2>
            <p>Automation supports the review. It does not replace it.</p>
            <ol className={styles.approvalFlow} aria-label="How a change reaches your records">
              {approvalFlow.map(([icon, title, body], index) => (
                <li key={title} style={stagger(index)}>
                  <span className={styles.flowNode}>{icon === "check" ? <SafetyIcon name="check" /> : <DashboardIcon name={icon} size={18} />}</span>
                  <strong>{title}</strong>
                  <small>{body}</small>
                </li>
              ))}
            </ol>
          </div>
          <ul className={styles.controlList}>
            {controls.map(([icon, title, body], index) => (
              <li key={title} style={stagger(index)}>
                <span>{icon === "lock" ? <SafetyIcon name="lock" /> : <DashboardIcon name={icon} size={18} />}</span>
                <div><h3>{title}</h3><p>{body}</p></div>
              </li>
            ))}
          </ul>
        </ViewportSection>

        <ViewportSection id="import" className={styles.recordsSection} activeClassName={styles.sectionMotion} aria-labelledby="records-heading">
          <div className={styles.recordsIntro}>
            <p className={styles.eyebrow}>Bring your records in</p>
            <h2 id="records-heading">Start from the files you already keep.</h2>
            <p>Upload a file or connect Google. PondoPath reads only the files you pick and never changes them.</p>
            <ul className={styles.liveList}>
              {liveRecords.map(([title, body], index) => (
                <li key={title} style={stagger(index)}><span className={styles.liveCheck}><SafetyIcon name="check" /></span><div><strong>{title}</strong><small>{body}</small></div></li>
              ))}
            </ul>
            <p className={styles.plannedLine}><span>Planned</span>{plannedRecords.join(" \u00b7 ")}</p>
          </div>
          <div className={styles.inboxMock} role="img" aria-label="Example: three rows from a spreadsheet wait in the Review Inbox. Two are selected, and nothing is saved until you confirm them.">
            <div className={styles.mockSources}><span>sales-november.xlsx</span><span>Google Sheet · Invoices</span></div>
            <div className={styles.mockPanel}>
              <div className={styles.mockHead}><strong>Review Inbox</strong><span>3 waiting</span></div>
              <ul>
                {inboxRows.map(([type, name, amount, due, checked], index) => (
                  <li key={name} className={checked ? styles.mockChecked : ""} style={stagger(index)}>
                    <span className={styles.mockBox}>{checked && <SafetyIcon name="check" />}</span>
                    <span className={styles.mockType}>{type}</span>
                    <span className={styles.mockName}>{name}<small>{due}</small></span>
                    <b>{amount}</b>
                  </li>
                ))}
              </ul>
              <div className={styles.mockFoot}><small>Nothing is saved until you confirm.</small><span className={styles.mockButton}>Confirm selected (2)</span></div>
            </div>
          </div>
        </ViewportSection>

        <section id="faq" className={`${styles.section} ${styles.faqSection}`} aria-labelledby="faq-heading">
          <SectionHeading id="faq-heading" eyebrow="FAQ" title="Straight answers before you start." />
          <div className={styles.faqList}>
            {faqs.map(([question, answer]) => (
              <details key={question}><summary>{question}<DashboardIcon name="chevron" /></summary><p>{answer}</p></details>
            ))}
          </div>
        </section>

        <section className={styles.finalCta} aria-labelledby="cta-heading">
          <div><p className={styles.eyebrow}>Your next cash decision</p><h2 id="cta-heading">Ready to see your next 30 days?</h2></div>
          <div><Link className={styles.lightButton} href="/signup">Create workspace <Arrow /></Link><Link className={styles.darkOutlineButton} href="/login">Log in</Link></div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div><ProductBrand /><p>Cash-flow action planning for small Philippine B2B businesses.</p></div>
        <div className={styles.footerMeta}><a href="mailto:bryanjhade.e@gmail.com">bryanjhade.e@gmail.com</a><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div>
        <p className={styles.disclaimer}>Pilot version. Not accounting, tax or payment software.</p>
        <p className={styles.copyright}>© 2026 SoloForge.</p>
      </footer>
    </div>
  );
}

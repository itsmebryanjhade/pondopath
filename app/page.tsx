import Link from "next/link";
import { DM_Sans, Manrope } from "next/font/google";
import { DashboardIcon } from "@/components/dashboard-icon";
import { LandingPreview } from "@/components/landing-preview";
import { ProductBrand } from "@/components/product-brand";
import { CountUpAmount, MotionListItem, ViewportSection } from "@/components/viewport-motion";
import styles from "./landing.module.css";

const bodyFont = DM_Sans({ subsets: ["latin"], display: "swap" });
const headingFont = Manrope({ subsets: ["latin"], display: "swap", variable: "--font-landing-heading" });

const steps = [
  "Enter unpaid invoices, expenses and opening cash.",
  "See your 30-day forecast with the earliest shortage and its amount.",
  "Paste a customer reply. PondoPath proposes a date and amount update, and you confirm it.",
  "Follow up with owner-approved reminders and automatic checks on missed promises.",
];

const features = [
  ["calendar", "30-day cash forecast", "See the earliest shortfall, biggest gap and the records behind it."],
  ["receipt", "Collections workspace", "Keep unpaid, due and overdue invoices beside their next action."],
  ["arrowIn", "Reply to cash impact", "Review an English, Tagalog or Taglish reply before its proposed update is saved."],
  ["sparkle", "What-if comparison", "Move a payment from Friday to Monday without changing real records."],
  ["alert", "Owner-approved reminders", "Edit, approve, then copy a draft into the channel your team already uses."],
  ["arrowRight", "Missed-promise follow-ups", "Create a task when a promised date passes without a recorded payment."],
  ["more", "Full history", "See who changed what, when it changed and why."],
] as const;

const controls = [
  "Calculations are done by programmed rules, not by AI.",
  "AI explains results and drafts text. It cannot post payments, change records or send messages.",
  "A customer promise is not money received. Cash is recorded only after staff verifies it.",
  "Owners approve reminders. Finance staff cannot bypass that.",
  "Every workspace is private with role-based access.",
  "Manual entry and templates keep working if AI is unavailable.",
];

const audiences = [
  ["Finance and admin staff", "Record an update once and see its effect across the cash plan."],
  ["Owners and managers", "Understand what is due, what is expected and what is still uncertain."],
  ["Owner-operators", "Handle both roles in one practical workflow."],
];

const planned = ["CSV / Excel import", "Google Sheets reading", "Business messaging intake", "Receipt-image extraction"];

const faqs = [
  ["Does it send messages to customers?", "No. You copy approved drafts and send them yourself."],
  ["Does it replace accounting software?", "No. It focuses on cash timing and collections."],
  ["Does it guarantee faster payment?", "No. It helps you see problems earlier and follow up consistently."],
  ["What does the AI do?", "It explains forecast results and extracts details from replies. You confirm everything."],
  ["Is my data safe?", "Each workspace is private. This is a demo version, so please use fictional data."],
  ["How much does it cost?", "Free during the demo and pilot period."],
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
          <details className={styles.mobileMenu}>
            <summary aria-label="Open navigation"><span>Menu</span><DashboardIcon name="chevron" /></summary>
            <div className={styles.mobileMenuPanel}>
              <nav aria-label="Mobile navigation">
                <a href="#how-it-works">How it works</a>
                <a href="#features">Features</a>
                <a href="#control">Control &amp; safety</a>
                <a href="#faq">FAQ</a>
              </nav>
              <div>
                <Link className={styles.outlineButton} href="/login">Log in</Link>
                <Link className={styles.primaryButton} href="/signup">Create workspace</Link>
              </div>
            </div>
          </details>
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
              <Link className={styles.secondaryButton} href="/overview">Try the demo <Arrow /></Link>
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
        </ViewportSection>

        <section id="how-it-works" className={styles.section} aria-labelledby="workflow-heading">
          <SectionHeading id="workflow-heading" eyebrow="How it works" title="From scattered records to today’s next action." description="One reviewable workflow. Your team confirms every change." />
          <ol className={styles.stepGrid}>
            {steps.map((step, index) => (
              <li key={step}><span>0{index + 1}</span><p>{step}</p></li>
            ))}
          </ol>
        </section>

        <section id="features" className={`${styles.section} ${styles.featuresSection}`} aria-labelledby="features-heading">
          <SectionHeading id="features-heading" eyebrow="Built around the work" title="The cash plan stays connected to the records behind it." />
          <div className={styles.featureGrid}>
            {features.map(([icon, title, body]) => (
              <article className={styles.featureCard} key={title}>
                <span className={styles.cardIcon}><DashboardIcon name={icon} /></span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.exampleSection} aria-labelledby="example-heading">
          <div className={styles.exampleIntro}>
            <p className={styles.eyebrow}>Worked example</p>
            <h2 id="example-heading">The same money. Different timing.</h2>
            <p>This is the gap a spreadsheet total can hide.</p>
            <span className={styles.sampleBadge}>Fictional sample data</span>
          </div>
          <div className={styles.comparison}>
            <article className={styles.comparisonSafe}>
              <span className={styles.comparisonLabel}><DashboardIcon name="calendar" size={17} />Customer pays on time</span>
              <p><strong>₱40,000</strong> on hand <span>+</span> <strong>₱50,000</strong> expected <span>−</span> <strong>₱80,000</strong> due Friday</p>
              <div><span>Projected cash</span><strong>₱10,000</strong></div>
            </article>
            <article className={styles.comparisonRisk}>
              <span className={styles.comparisonLabel}><DashboardIcon name="alert" size={17} />Payment slips to Monday</span>
              <p><strong>₱40,000</strong> on hand <span>−</span> <strong>₱80,000</strong> due Friday</p>
              <div><span>Friday shortfall</span><strong>₱40,000</strong></div>
              <small>The balance recovers later, but payroll day still needs action.</small>
            </article>
          </div>
        </section>

        <section id="control" className={styles.controlSection} aria-labelledby="control-heading">
          <div className={styles.controlIntro}>
            <p className={styles.eyebrow}>Control &amp; safety</p>
            <h2 id="control-heading">You stay in control.</h2>
            <p>Automation supports the review. It does not replace it.</p>
            <Link href="/signup" className={styles.lightButton}>Create workspace <Arrow /></Link>
          </div>
          <ul className={styles.controlList}>
            {controls.map((control) => <li key={control}><span><DashboardIcon name="sparkle" size={16} /></span><p>{control}</p></li>)}
          </ul>
        </section>

        <section className={styles.section} aria-labelledby="audience-heading">
          <SectionHeading id="audience-heading" eyebrow="Made for the whole cash workflow" title="One plan, three practical points of view." />
          <div className={styles.audienceGrid}>
            {audiences.map(([title, body], index) => (
              <article key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{body}</p></article>
            ))}
          </div>
        </section>

        <section className={styles.plannedSection} aria-labelledby="planned-heading">
          <div><p className={styles.eyebrow}>Coming next</p><h2 id="planned-heading">More ways to bring records in.</h2><p>These capabilities are planned and are not live integrations yet.</p></div>
          <ul>{planned.map((item) => <li key={item}><span>Planned</span>{item}</li>)}</ul>
        </section>

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
        <div className={styles.footerMeta}><span>contact@soloforge.example</span><span>Privacy</span><span>Terms</span></div>
        <p className={styles.disclaimer}>Hackathon MVP. Not accounting, tax or payment software.</p>
        <p className={styles.copyright}>© 2026 SoloForge.</p>
      </footer>
    </div>
  );
}

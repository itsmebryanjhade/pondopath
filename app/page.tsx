import Link from "next/link";
import { DM_Sans } from "next/font/google";
import { ProductBrand } from "@/components/product-brand";
import { LandingPreview } from "@/components/landing-preview";
import styles from "./landing.module.css";

const dmSans = DM_Sans({ subsets: ["latin"], display: "swap" });

const steps = [
  ["Bring the records together", "Start with recorded cash, unpaid customer invoices, and upcoming payroll, supplier bills, and other expenses."],
  ["Review the next 30 days", "See when expected receipts may fall behind obligations, and check the records behind a possible gap."],
  ["Plan the next follow-up", "Confirm a customer's expected payment date, prepare a reminder for owner review, and keep the next action clear."],
  ["Record what actually arrived", "Verify a receipt through your normal process, record it once, and see the cash plan update."],
];

export default function Home() {
  return (
    <div className={`${styles.landing} ${dmSans.className}`}>
      <a className="skip-link" href="#landing-main">Skip to content</a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link className={styles.brand} href="/" aria-label="PondoPath home"><ProductBrand /></Link>
          <nav className={styles.headerNav} aria-label="Main navigation">
            <a href="#how-it-works">How it works</a>
            <a href="#your-control">Your team, in control</a>
          </nav>
          <Link className={styles.signIn} href="/login">Sign in <span aria-hidden="true">↗</span></Link>
        </div>
      </header>

      <main id="landing-main" tabIndex={-1}>
        <section className={styles.hero} aria-labelledby="hero-heading">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>For Philippine B2B businesses</p>
            <h1 id="hero-heading">See cash clearly.<br /><span>Plan what’s next.</span></h1>
            <p className={styles.heroDescription}>Customer payments don’t always arrive when bills are due. Bring collections, upcoming expenses, and a 30-day forecast into one practical cash plan.</p>
            <div className={styles.heroActions}>
              <Link className={styles.primaryLink} href="/login">Open your workspace <span aria-hidden="true">↗</span></Link>
              <a className={styles.textLink} href="#how-it-works">See how it works <span aria-hidden="true">↓</span></a>
            </div>
            <p className={styles.accessNote}>For existing owner and finance accounts.</p>
            <ul className={styles.heroFacts} aria-label="Planning essentials">
              <li>30-day visibility</li><li>Peso-based planning</li><li>Human-reviewed actions</li>
            </ul>
          </div>
          <LandingPreview />
        </section>

        <section className={styles.valueSection} aria-labelledby="value-heading">
          <div className={styles.sectionIntro}>
            <p className={styles.eyebrow}>From a cash gap to a next step</p>
            <h2 id="value-heading">A balance tells you where you are.<br />A plan helps you move.</h2>
            <p>Built for the owner checking the month ahead and the finance staff following up on today’s payments.</p>
          </div>
          <div className={styles.valueGrid}>
            <article><span className={styles.sectionNumber}>01 / Visibility</span><h3>See the dates that matter.</h3><p>Bring expected customer payments and upcoming obligations into the same view, with a clear distinction between expected and received cash.</p></article>
            <article><span className={styles.sectionNumber}>02 / Context</span><h3>Understand the pressure.</h3><p>Connect a possible shortage to the invoices and expenses behind it. Check the assumptions before making your next decision.</p></article>
            <article><span className={styles.sectionNumber}>03 / Action</span><h3>Keep follow-ups moving.</h3><p>Track payment commitments, prepare reviewed reminders, and give each collection follow-up a clear owner and date.</p></article>
          </div>
        </section>

        <section id="how-it-works" className={styles.workflow} aria-labelledby="workflow-heading">
          <div className={styles.sectionHeading}>
            <div><p className={styles.eyebrow}>A practical working rhythm</p><h2 id="workflow-heading">One shared picture.<br />Four clear steps.</h2></div>
            <p>Keep the cash plan close to the work your team already does: checking records, talking to customers, and confirming payments.</p>
          </div>
          <ol className={styles.steps}>
            {steps.map(([title, body], index) => <li key={title}><span className={styles.stepNumber}>0{index + 1}</span><h3>{title}</h3><p>{body}</p></li>)}
          </ol>
        </section>

        <section id="your-control" className={styles.controlSection} aria-labelledby="control-heading">
          <div className={styles.controlInner}>
            <div><p className={styles.eyebrow}>Clarity at every step</p><h2 id="control-heading">Your team makes<br />the call.</h2><p>Review the assumptions, approve the message, and confirm the money. Each step stays visible to the people responsible.</p><Link href="/login" className={styles.lightLink}>Sign in to PondoPath <span aria-hidden="true">↗</span></Link></div>
            <div className={styles.controlRules}>
              <article><span aria-hidden="true">01</span><div><h3>A promise stays a promise.</h3><p>Expected customer payments help the forecast. They become recorded cash only after someone verifies the receipt.</p></div></article>
              <article><span aria-hidden="true">02</span><div><h3>Reminders get a human review.</h3><p>The owner approves the exact draft before staff copy it to their usual communication channel.</p></div></article>
              <article><span aria-hidden="true">03</span><div><h3>Changes stay traceable.</h3><p>Keep payment updates, follow-up outcomes, and corrections together with the records they affect.</p></div></article>
            </div>
          </div>
        </section>

        <section className={styles.questions} aria-labelledby="questions-heading">
          <div><p className={styles.eyebrow}>Good to know</p><h2 id="questions-heading">A few practical details.</h2></div>
          <div className={styles.answers}>
            <details><summary>Who is PondoPath for?</summary><p>Small Philippine B2B suppliers and service businesses that let customers pay after delivery or completion. Finance and admin staff maintain the records; owners review the cash plan and approve reminders.</p></details>
            <details><summary>Does PondoPath send reminders or make payments?</summary><p>Your team copies an approved reminder and sends it through its existing channel. Reporting a manual send does not confirm delivery. Payments stay with the business’s existing payment process.</p></details>
            <details><summary>How do I get access?</summary><p>Sign in with the owner or finance account provided for your business workspace. Public registration is not currently available.</p></details>
          </div>
        </section>

        <section className={styles.finalCta} aria-labelledby="cta-heading"><div><p className={styles.eyebrow}>PondoPath by SoloForge</p><h2 id="cta-heading">Give the next cash decision<br />a clearer starting point.</h2></div><Link href="/login" className={styles.primaryLink}>Open your workspace <span aria-hidden="true">↗</span></Link></section>
      </main>

      <footer className={styles.footer}><div><Link className={styles.brand} href="/" aria-label="PondoPath home"><ProductBrand /></Link><p>A cash-flow action planner for Philippine B2B teams.</p></div><nav aria-label="Footer navigation"><a href="#how-it-works">How it works</a><a href="#your-control">Your team, in control</a><Link href="/login">Sign in</Link></nav><p className={styles.copyright}>© 2026 SoloForge. Cash planning starts with the records you enter.</p></footer>
    </div>
  );
}

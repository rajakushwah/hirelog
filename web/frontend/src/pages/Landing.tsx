import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Bell,
  Briefcase,
  BriefcaseMetal,
  CalendarCheck,
  ChartBar,
  ChatCircleText,
  CheckCircle,
  Confetti,
  FileArrowDown,
  Heart,
  HouseLine,
  Leaf,
  List,
  LockKey,
  Paperclip,
  Rocket,
  ShieldCheck,
  Sparkle,
  UsersThree,
  X,
} from "@phosphor-icons/react";
import { api } from "../api";
import { AndroidDownloadSection } from "../components/AndroidDownload";
import { ErrorNote, Field, InlineSpinner, TextArea } from "../components/ui";
import "../landing.css";
import { Logo } from "../components/Logo";

const NAV = [
  { id: "features", label: "Features" },
  { id: "how", label: "How it works" },
  { id: "about", label: "About" },
  { id: "careers", label: "Careers" },
  { id: "downloads", label: "Downloads" },
  { id: "contact", label: "Contact" },
];

const FEATURES = [
  { icon: Briefcase, title: "Every application, one place", text: "Company, role, CTC, recruiter and source — with 10 clear statuses from Interested to Offer Accepted." },
  { icon: CalendarCheck, title: "Interview rounds & calendar", text: "Log each round with type, interviewer and meeting link. See your month or week at a glance and add it to your calendar." },
  { icon: ChatCircleText, title: "Personal question bank", text: "Save every question you were asked, with your answer, difficulty and tags. Search it before the next interview." },
  { icon: ChartBar, title: "Dashboard that motivates", text: "Pipeline donut, monthly applications, rounds per company and what's coming up next." },
  { icon: Paperclip, title: "Screenshots & documents", text: "Attach offer letters, assignments and screenshots to any round. Images are cleaned of location data." },
  { icon: FileArrowDown, title: "Export & share", text: "One-click Excel or PDF report, and a beautiful offer card ready for your LinkedIn post." },
];

const STEPS = [
  { n: 1, title: "Add an application", text: "Paste the company and role. Takes ten seconds." },
  { n: 2, title: "Track every round", text: "Schedule rounds, get reminders, log questions and feedback." },
  { n: 3, title: "Land the offer", text: "Watch your pipeline move and celebrate with a shareable card." },
];

const PIPELINE = [
  { label: "Applied", tone: "info" },
  { label: "Recruiter Screening", tone: "warn" },
  { label: "Interview In Progress", tone: "brand" },
  { label: "Offer Received", tone: "coral" },
];

const VALUES = [
  { icon: LockKey, title: "Private by design", text: "Your data stays on your own server. No ads, no tracking, no selling." },
  { icon: Leaf, title: "Calm, not chaotic", text: "Job hunting is stressful. The tool shouldn't be." },
  { icon: UsersThree, title: "Built with candidates", text: "Every feature started as a real candidate's request." },
];

const TOPICS = ["General", "Support", "Feedback", "Careers", "Partnership"] as const;
type Topic = (typeof TOPICS)[number];

export function Landing() {
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [topic, setTopic] = useState<Topic>("General");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const go = (id: string) => {
    setMenu(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="lp">
      <header className={`lp-nav${scrolled ? " scrolled" : ""}`}>
        <div className="lp-wrap lp-nav-inner">
          <button className="lp-brand" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            <Logo size={36} />
            HireLog
          </button>
          <nav className={`lp-links${menu ? " open" : ""}`} aria-label="Sections">
            {NAV.map((n) => (
              <button key={n.id} onClick={() => go(n.id)}>{n.label}</button>
            ))}
            <span className="lp-links-cta">
              <Link className="btn btn-outline sm" to="/login">Sign in</Link>
              <Link className="btn btn-primary sm" to="/login?mode=signup">Get started</Link>
            </span>
          </nav>
          <button className="lp-menu" onClick={() => setMenu((m) => !m)} aria-label={menu ? "Close menu" : "Open menu"} aria-expanded={menu}>
            {menu ? <X size={24} /> : <List size={24} />}
          </button>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="lp-hero">
          <div className="lp-blob a" aria-hidden />
          <div className="lp-blob b" aria-hidden />
          <div className="lp-wrap lp-hero-grid">
            <div className="lp-hero-copy">
              <span className="lp-eyebrow"><Sparkle size={14} weight="fill" /> Track every interview. Land the offer.</span>
              <h1>
                Your job hunt,<br />
                <span className="lp-accent">finally organised.</span>
              </h1>
              <p className="lp-lead">
                HireLog keeps your applications, interview rounds, questions, notes and offers in one calm,
                private workspace — so you can focus on preparing, not on spreadsheets.
              </p>
              <div className="lp-cta-row">
                <Link className="btn btn-primary lg" to="/login?mode=signup">
                  Create free account <ArrowRight size={18} weight="bold" />
                </Link>
                <Link className="btn btn-outline lg" to="/login">Sign in</Link>
              </div>
              <ul className="lp-ticks">
                <li><CheckCircle size={18} weight="fill" /> Free forever for personal use</li>
                <li><CheckCircle size={18} weight="fill" /> Your data on your own server</li>
              </ul>
            </div>
            <div className="lp-hero-art">
              <img src="/landing/hero.webp" alt="A candidate organising job applications, interviews and questions on a laptop" width={1200} height={800} />
              <div className="lp-float one">
                <span className="lp-float-icon coral"><Bell size={16} weight="fill" /></span>
                <span><strong>System Design</strong><small>Tomorrow · 10:30 AM</small></span>
              </div>
              <div className="lp-float two">
                <span className="lp-float-icon"><Confetti size={16} weight="fill" /></span>
                <span><strong>Offer received!</strong><small>4 rounds · 21 days</small></span>
              </div>
            </div>
          </div>
          <div className="lp-wrap lp-stats">
            {[
              ["10", "application statuses"],
              ["8", "interview types incl. AI"],
              ["13", "question categories"],
              ["1-click", "Excel & PDF export"],
            ].map(([v, l]) => (
              <div key={l} className="lp-stat"><strong>{v}</strong><span>{l}</span></div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section id="features" className="lp-section">
          <div className="lp-wrap">
            <SectionHead eyebrow="Features" title="Everything your job hunt needs" text="Built from real candidates' workflows — from the first application to the signed offer." />
            <div className="lp-features">
              {FEATURES.map(({ icon: Icon, title, text }) => (
                <article key={title} className="lp-feature">
                  <span className="lp-feature-icon"><Icon size={24} weight="duotone" /></span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="lp-section tint">
          <div className="lp-wrap lp-how">
            <div>
              <SectionHead eyebrow="How it works" title="Three steps to a clearer search" align="left" />
              <ol className="lp-steps">
                {STEPS.map((s) => (
                  <li key={s.n}>
                    <span className="lp-step-n">{s.n}</span>
                    <span><strong>{s.title}</strong><span>{s.text}</span></span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="lp-pipeline" aria-label="Example application moving through statuses">
              <div className="lp-pipe-head">
                <span className="lp-logo sm"><Briefcase size={16} weight="fill" /></span>
                <span><strong>Acme Corp</strong><small>Senior Software Engineer</small></span>
              </div>
              {PIPELINE.map((p, i) => (
                <div key={p.label} className="lp-pipe-row" style={{ animationDelay: `${i * 0.15}s` }}>
                  <span className={`lp-dot ${p.tone}`} />
                  <span className="grow">{p.label}</span>
                  {i < PIPELINE.length - 1 ? <CheckCircle size={18} weight="fill" className="lp-ok" /> : <Confetti size={18} weight="fill" className="lp-party" />}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* About */}
        <section id="about" className="lp-section">
          <div className="lp-wrap lp-split">
            <div className="lp-art-card"><img src="/landing/about.webp" alt="A small team planning a career journey together" loading="lazy" width={1200} height={800} /></div>
            <div>
              <SectionHead eyebrow="About us" title="We've been on the other side of the table" align="left" />
              <p className="lp-body">
                HireLog started when one of us lost track of a final-round interview in a mess of emails, notes
                and spreadsheets. We built the tool we wished we had: simple enough to update in seconds, thorough enough
                to remember every question and every piece of feedback.
              </p>
              <p className="lp-body">
                Today it helps engineers, designers and analysts run their search like a project — and walk into every
                interview prepared.
              </p>
              <div className="lp-values">
                {VALUES.map(({ icon: Icon, title, text }) => (
                  <div key={title} className="lp-value">
                    <span className="lp-feature-icon sm"><Icon size={20} weight="duotone" /></span>
                    <span><strong>{title}</strong><span>{text}</span></span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Careers */}
        <section id="careers" className="lp-section tint">
          <div className="lp-wrap lp-split reverse">
            <div>
              <SectionHead eyebrow="Careers" title="Help people land the job they want" align="left" />
              <p className="lp-body">
                We're a small, remote-friendly team that cares about craft, privacy and kindness. We aren't hiring right
                now, but this is how we'll work when we grow.
              </p>
              <ul className="lp-perks">
                <li><Rocket size={18} weight="duotone" /> Real ownership, small team</li>
                <li><HouseLine size={18} weight="duotone" /> Remote-first, flexible hours</li>
                <li><Heart size={18} weight="duotone" /> Health cover & learning budget</li>
              </ul>
            </div>
            <div className="lp-art-card"><img src="/landing/careers.webp" alt="Two teammates celebrating a product launch" loading="lazy" width={1200} height={800} /></div>
          </div>
          <div className="lp-wrap">
            <div className="lp-no-openings" role="status">
              <span className="lp-feature-icon"><BriefcaseMetal size={26} weight="duotone" /></span>
              <div className="grow">
                <h3>No open positions right now</h3>
                <p>We're not hiring at the moment. New openings will be posted here, so please check back later.</p>
              </div>
            </div>
          </div>
        </section>

        <AndroidDownloadSection />

        {/* Contact */}
        <section id="contact" className="lp-section">
          <div className="lp-wrap lp-split">
            <div>
              <SectionHead eyebrow="Contact" title="We'd love to hear from you" align="left" />
              <p className="lp-body">Questions, feedback, partnership ideas or a job application — send us a note and we'll get back to you.</p>
              <div className="lp-art-card"><img src="/landing/contact.webp" alt="A paper airplane flying out of an envelope" loading="lazy" width={1200} height={800} /></div>
            </div>
            <ContactForm topic={topic} setTopic={setTopic} />
          </div>
        </section>

        {/* Final CTA */}
        <section className="lp-wrap">
          <div className="lp-final">
            <div>
              <h2>Ready to take control of your job search?</h2>
              <p>Create your account in under a minute. It's free.</p>
            </div>
            <Link className="btn btn-coral lg" to="/login?mode=signup">
              Get started <ArrowRight size={18} weight="bold" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-inner">
          <div className="lp-brand static">
            <Logo size={36} />
            HireLog
          </div>
          <nav aria-label="Footer">
            {NAV.map((n) => <button key={n.id} onClick={() => go(n.id)}>{n.label}</button>)}
            <Link to="/login">Sign in</Link>
          </nav>
          <span className="lp-footnote"><ShieldCheck size={16} weight="fill" /> © {new Date().getFullYear()} HireLog · Your data stays yours.</span>
        </div>
      </footer>
    </div>
  );
}

function SectionHead({ eyebrow, title, text, align = "center" }: { eyebrow: string; title: string; text?: string; align?: "center" | "left" }) {
  return (
    <div className={`lp-head ${align}`}>
      <span className="lp-eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      {text ? <p>{text}</p> : null}
    </div>
  );
}

function ContactForm({ topic, setTopic }: { topic: Topic; setTopic: (t: Topic) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<unknown>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setState("sending");
    setError(null);
    try {
      await api("/contact", { json: { name: name.trim(), email: email.trim(), topic, message: message.trim(), website } });
      setState("sent");
    } catch (err) {
      setError(err);
      setState("idle");
    }
  };

  if (state === "sent") {
    return (
      <div className="lp-form lp-sent" role="status">
        <span className="lp-feature-icon"><CheckCircle size={28} weight="fill" /></span>
        <h3>Thanks, {name.split(" ")[0] || "friend"}!</h3>
        <p>Your message has been received. We'll reply to {email}.</p>
        <button className="btn btn-tint" onClick={() => { setState("idle"); setMessage(""); }}>Send another message</button>
      </div>
    );
  }

  const valid = name.trim() && email.trim() && message.trim().length >= 10;
  return (
    <form className="lp-form" onSubmit={onSubmit} noValidate>
      <div className="lp-form-row">
        <Field label="Your name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required maxLength={200} />
        <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required maxLength={320} />
      </div>
      <div className="field">
        <label className="label" htmlFor="lp-topic">Topic</label>
        <select id="lp-topic" className="input" value={topic} onChange={(e) => setTopic(e.target.value as Topic)}>
          {TOPICS.map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>
      <TextArea label="Message" value={message} onChange={(e) => setMessage(e.target.value)} required minLength={10} maxLength={5000} rows={6} placeholder="How can we help?" />
      <div className="lp-hp" aria-hidden>
        <label>Website <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
      </div>
      <ErrorNote error={error} />
      <button className="btn btn-primary lg block" type="submit" disabled={!valid || state === "sending"}>
        {state === "sending" ? <InlineSpinner /> : <>Send message <ArrowRight size={18} weight="bold" /></>}
      </button>
      <span className="small">We only use your email to reply. Messages are stored on this server.</span>
    </form>
  );
}

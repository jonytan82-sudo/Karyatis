import { useEffect } from 'react';
import Logo from './Logo.jsx';
import Icon from './Icons.jsx';
import Hero from './Hero.jsx';
import { AMAZON_DISCLOSURE, COMPANY, SHOW_AMAZON_DISCLOSURE, SUPPORT, contactVcard, downloadVcard } from '../contact.js';

const ROLES = [
  {
    icon: 'yacht', title: 'Owners', lead: 'Know the state of your yacht without chasing anyone.',
    points: [
      'See what is overdue, due soon and on schedule, and every open issue.',
      'Approve who joins the crew and what each person can do.',
      'Search CJM Marine crew by position, region, certificates and reviews.',
      'Review the crew who served aboard.',
    ],
  },
  {
    icon: 'gauge', title: 'Captains', lead: 'Run the maintenance program and the crew from one screen.',
    points: [
      'Schedule recurring and one-time jobs, assign them and track sign-offs.',
      'Set each person’s job title and access level separately.',
      'Email reminders at 30, 10 and 0 days, and a daily Google Sheets backup.',
      'Run more than one vessel from the same login.',
    ],
  },
  {
    icon: 'crew', title: 'Crew', lead: 'Build a work record that stays with you from boat to boat.',
    points: [
      'Profile with headline, home port, operating regions and languages.',
      'Sea time per vessel, verified by your time aboard on CJM Marine.',
      'Certifications with expiry dates, work reviews scored 1 to 10, and recommendations.',
      'A business card with QR codes, and a weekly copy of your record by email.',
    ],
  },
];

const STEPS = [
  ['CJM sets up the vessel', 'CJM Marine creates the vessel and the Captain or Owner account.'],
  ['The Captain brings in the crew', 'Crew are invited by email or request an account. Each person gets a job title and an access level.'],
  ['Work is tracked and signed off', 'Jobs turn green, amber or red as they come due. Whoever does the work signs it off with the date and notes.'],
  ['Records build up', 'Every sign-off goes into the vessel history and the crew member’s own record. Backups go out daily.'],
];

const SHOTS = [
  ['desktop-board.jpg', 'Board', 'Overdue, due within 10 days, on schedule and open issues at a glance.', 'wide'],
  ['phone-board.jpg', 'On the phone', 'The same board on deck, in a layout made for one hand.', 'tall'],
  ['desktop-calendar.jpg', 'Calendar', 'Due dates by month, with future repeats of recurring jobs shown dashed.', 'wide'],
  ['profile-preview.jpg', 'Crew profile', 'How owners and captains see a crew member, with verified time aboard.', 'wide'],
  ['card-front.jpg', 'Business card', 'Printable card with contact and reviews QR codes on the back. Vessel names are never printed.', 'card'],
];

export default function Landing({ focus }) {
  useEffect(() => {
    if (focus) document.getElementById(focus)?.scrollIntoView();
  }, [focus]);
  const year = new Date().getFullYear();

  return (
    <div className="lp">
      <header className="lp-top">
        <a href="/" className="lp-logo" aria-label="CJM Marine home"><Logo size="sm" /></a>
        <nav className="lp-nav" aria-label="Page sections">
          <a href="#how">How it works</a>
          <a href="#who">Who it’s for</a>
          <a href="#look">Screens</a>
          <a href="#contact">Contact</a>
        </nav>
        <a className="lp-btn gold" href="/login">Log in</a>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-text">
          <p className="lp-eyebrow">CJM Marine · Yacht maintenance &amp; crew</p>
          <h1>Every job, every crew member, every record. One place for the whole vessel.</h1>
          <p className="lp-sub">
            CJM Marine keeps each yacht’s maintenance program, crew and records together. Owners see the state of the boat,
            captains run the schedule, and crew build a work record that goes with them from boat to boat.
          </p>
          <div className="lp-ctas">
            <a className="lp-btn gold" href="/?request=1">Request an account</a>
            <a className="lp-btn ghost" href="/login">Log in</a>
          </div>
          <ul className="lp-facts">
            <li><span className="dot dot-green" /> Green more than 10 days out</li>
            <li><span className="dot dot-amber" /> Amber 0 to 10 days</li>
            <li><span className="dot dot-red" /> Red when overdue</li>
          </ul>
        </div>
        <div className="lp-hero-art" aria-hidden="true">
          <img className="lp-shot-desk" src="/landing/desktop-board.jpg" alt="" width="1600" height="1025" />
          <div className="lp-phone"><img src="/landing/phone-menu.jpg" alt="" width="780" height="1688" /></div>
        </div>
      </section>

      <section className="lp-section" id="who">
        <h2>Built for the people who run the boat</h2>
        <div className="lp-roles">
          {ROLES.map((r) => (
            <article key={r.title} className="lp-role">
              <span className="lp-role-ico"><Icon name={r.icon} /></span>
              <h3>{r.title}</h3>
              <p className="lp-role-lead">{r.lead}</p>
              <ul>{r.points.map((x) => <li key={x}>{x}</li>)}</ul>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-section lp-band" id="how">
        <div className="lp-band-in">
          <h2>How it works</h2>
          <ol className="lp-steps">
            {STEPS.map(([t, d]) => <li key={t}><b>{t}</b><span>{d}</span></li>)}
          </ol>
          <div className="lp-access">
            <h3>Job title and access are separate</h3>
            <p>
              Crew pick from 39 standard yacht titles, from Captain / Master to Galley Assistant. The Captain then sets what each person can do:
              Command, Owner oversight, Department lead, Qualified crew, Supervised crew, External contractor or View only.
              Contractors see only the jobs assigned to them, and each vessel’s data is visible only to its own crew.
            </p>
          </div>
        </div>
      </section>

      <section className="lp-section" id="look">
        <h2>What it looks like</h2>
        <p className="lp-note">Screens below use sample data.</p>
        <div className="lp-gallery">
          {SHOTS.map(([f, t, d, shape]) => (
            <figure key={f} className={`lp-fig ${shape}`}>
              <div className="lp-fig-img"><img src={`/landing/${f}`} alt={`${t}: ${d}`} loading="lazy" /></div>
              <figcaption><b>{t}</b> {d}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="lp-section lp-split">
        <div>
          <h2>Your records, kept safe</h2>
          <ul className="lp-checks">
            <li>Each Captain receives a daily Google Sheets backup of open tasks, issues and recent sign-offs, with an Excel copy.</li>
            <li>Each crew member receives their own record every week: sea time, certificates, reviews and work log.</li>
            <li>Every create, edit and sign-off is logged with the person and the date.</li>
            <li>Passwords are stored as salted hashes, and reset codes expire after 15 minutes.</li>
          </ul>
        </div>
        <div className="lp-soon">
          <span className="lp-tag">Coming soon</span>
          <h3>Parts and supplies planning</h3>
          <p>
            Save the parts each job needs. CJM Marine adds up what the next 30, 60 or 90 days of maintenance will use, takes off what is already aboard,
            and links each item to its product page at retailers such as Amazon, so the crew can order without retyping a list.
          </p>
          {SHOW_AMAZON_DISCLOSURE && <p className="lp-disclosure">{AMAZON_DISCLOSURE}</p>}
        </div>
      </section>

      <section className="lp-section lp-contact" id="contact">
        <div className="lp-contact-text">
          <h2>About CJM Marine</h2>
          <p>
            CJM Marine is the marine division of CJM ({COMPANY.parent}), based in {COMPANY.region}. We set up vessels on the platform,
            support captains and crew, and keep the system running.
          </p>
          <div className="lp-ctas">
            <a className="lp-btn gold" href="/?request=1&as=owner">Set up my vessel</a>
            <a className="lp-btn navy" href="/?request=1&as=crew">Join as crew</a>
          </div>
        </div>
        <address className="lp-card">
          <b>Contact us</b>
          <span className="lp-contact-line"><Icon name="user" /> {SUPPORT.name}</span>
          <a className="lp-contact-line" href={`tel:${SUPPORT.phone}`}>{SUPPORT.phoneDisplay}</a>
          <a className="lp-contact-line" href={`mailto:${SUPPORT.email}`}>{SUPPORT.email}</a>
          <button type="button" className="lp-btn ghost-dark" onClick={() => downloadVcard(contactVcard({ url: window.location.origin }), 'CJM-Marine-Support.vcf')}>
            Save contact
          </button>
        </address>
      </section>

      <section className="lp-section lp-privacy" id="privacy">
        <h2>Privacy</h2>
        <div className="lp-privacy-cols">
          <div>
            <h3>What we keep</h3>
            <p>
              Your name, email and password (stored as a salted hash). If you choose to add them: phone, photo, headline, home port,
              operating regions, languages, certifications and experience. For each vessel: its crew list, maintenance tasks, notes,
              sign-offs and reviews.
            </p>
            <h3>Who sees it</h3>
            <p>
              A vessel’s maintenance data is visible only to that vessel’s crew and to CJM Marine administrators. Owners and captains can find crew
              profiles; your phone and email show only if you turn that on. Your public reviews page exists only if you turn it on, and it hides reviewers’ names.
            </p>
          </div>
          <div>
            <h3>Where it is stored</h3>
            <p>
              Data is kept in CJM Marine’s Google Sheets and Google Drive. The website is hosted on Netlify. Backups are emailed to the vessel’s Captain
              and to CJM Marine, and your own record is emailed to you. We do not sell personal data or use advertising trackers.
            </p>
            <h3>Cookies, links and your choices</h3>
            <p>
              Your browser stores a login key so you stay signed in. Fonts load from Google Fonts. Links to other sites, including Amazon, follow those sites’ own
              privacy policies and cookies. To see, correct or delete your data, email <a href={`mailto:${SUPPORT.email}`}>{SUPPORT.email}</a>.
            </p>
          </div>
        </div>
      </section>

      <div className="lp-hero-strip"><Hero line1="From the bridge" line2="to the engine room…" foot="It all connects." /></div>

      <footer className="lp-foot">
        <span>© {year} {COMPANY.name} · {COMPANY.parent}</span>
        <nav aria-label="Footer">
          <a href="/privacy">Privacy</a>
          <a href="#contact">Contact</a>
          <a href="/login">Log in</a>
        </nav>
        {SHOW_AMAZON_DISCLOSURE && <span className="lp-foot-disc">{AMAZON_DISCLOSURE}</span>}
      </footer>
    </div>
  );
}

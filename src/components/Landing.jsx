import { useEffect } from 'react';
import Logo from './Logo.jsx';
import Icon from './Icons.jsx';
import Hero from './Hero.jsx';
import { AMAZON_DISCLOSURE, COMPANY, SHOW_AMAZON_DISCLOSURE, SUPPORT, contactVcard, downloadVcard } from '../contact.js';

// The parts journey: a real sequence, drawn as a course line with waypoints.
const ROUTE = [
  ['Requested', 'Crew add the part to the task or issue, with part number and quantity.'],
  ['Approved', 'The Captain or the boat’s parts buyer approves or declines, with a reason.'],
  ['Ordered', 'Supplier, order number, carrier and tracking go on the order. One tap sends a list to an Amazon cart.'],
  ['In transit', 'Whoever asked gets the tracking link by email and can follow it in the app.'],
  ['Received', 'Mark it received and say where it was left: “Bridge locker 2”.'],
  ['Returned or core sent', 'Wrong part, damaged, or a core due back by a date. RMA, serial numbers off and on, credit.'],
];

// A contractor's job, start to finish: a real sequence.
const WORK_STEPS = [
  ['Open a work order on any boat', 'Pick one of your boats, or type the boat name and its Captain’s email. It does not have to be on CJM Marine.'],
  ['Log the work as you go', 'Each item: what you found, what you did, hours by date, and parts with part and serial numbers off and on.'],
  ['Sign each item', 'Your name, credential and the time go on every item you finish. A signed item is locked.'],
  ['The Captain reviews it', 'In the app, where it can sign off one of the boat’s own tasks, or from an email with no account needed. Scored 1 to 10 for your record.'],
  ['Invoice from the work order', 'Hours, parts, travel, consumables and tax are filled in for you. Print it or email a link. The boat pays you directly.'],
];

const FEATURES = [
  {
    id: 'program', img: 'lp-starter.jpg', w: 1200, h: 1013,
    title: 'A maintenance program on day one',
    text: 'Pick the boat’s size, flag, use and what is aboard. CJM Marine suggests the routine jobs, from impellers to liferafts, and you tick the ones to add.',
    points: [
      'About 130 common jobs, grouped by system, with suggested intervals.',
      'Each job is labelled Recommended, Manufacturer or Regulatory, so nobody mistakes advice for a rule.',
      'First due dates are spread over the coming weeks, so the board does not turn red on day one.',
    ],
  },
  {
    id: 'board', img: 'lp-board-parts.jpg', w: 1400, h: 613,
    title: 'See what is holding each job up',
    text: 'Five blocks on the board: overdue, due in 10 days, on schedule, open issues and waiting on parts. Tap one to see those jobs with their status and latest note.',
    points: [
      'Status on every job: In work, Pending, Needs review.',
      'Waiting on parts switches on by itself when parts are requested and off when they arrive.',
      'Crew can suggest a job or log work that was not on the list. Nothing enters the log until the Captain approves.',
    ],
  },
  {
    id: 'rotation', img: 'lp-rotation.jpg', w: 1400, h: 672,
    title: 'Rotations and handovers',
    text: 'Who is aboard each day, by department, with minimum crew warnings. When someone is due off, the app drafts their handover from the log.',
    points: [
      'Back-to-back pairs, leave requests and extra days, approved by the Captain.',
      'The relief taps “Got it”, so you know the handover was read.',
      'Sea time counts only the days actually aboard.',
    ],
  },
  {
    id: 'record', img: 'profile-preview.jpg', w: 1400, h: 1100,
    title: 'A work record that goes with you',
    text: 'Crew and contractors keep their record from boat to boat: sea time, certificates and jobs scored 1 to 10 by the captains they worked for.',
    points: [
      'Log a job on any boat. Its captain confirms it from an email, no account needed.',
      'Printable business card with a QR code to your reviews.',
      'Your record is emailed to you every week.',
    ],
  },
];

const ROLES = [
  {
    icon: 'yacht', title: 'Owners',
    points: ['The state of the boat at a glance, without chasing anyone.', 'Approve crew, access levels and parts.', 'Find crew by position, region, certificates and reviews.'],
  },
  {
    icon: 'gauge', title: 'Captains and parts buyers',
    points: ['Run the program, crew, rotations and orders from one login.', 'Approve parts, record orders with tracking, follow returns and cores.', 'Approve contractor work orders onto your own open tasks.', 'Daily Google Sheets backup of the boat.'],
  },
  {
    icon: 'crew', title: 'Crew and contractors',
    points: ['Report issues and request parts from your phone.', 'Hand over in a few taps when you go off rotation.', 'Work orders and invoices for jobs on any boat.', 'Build a verified record of the work you do.'],
  },
];

export default function Landing({ focus }) {
  useEffect(() => {
    if (focus) document.getElementById(focus)?.scrollIntoView();
  }, [focus]);
  const year = new Date().getFullYear();

  return (
    <div className="lx">
      <header className="lx-top">
        <a href="/" className="lx-logo" aria-label="CJM Marine home"><Logo size="sm" /></a>
        <nav className="lx-nav" aria-label="Page sections">
          <a href="#features">What it does</a>
          <a href="#parts">Parts</a>
          <a href="#contractors">Contractors</a>
          <a href="#who">Who it’s for</a>
          <a href="#why">Why CJM</a>
          <a href="#contact">Contact</a>
        </nav>
        <a className="lx-link" href="/login">Log in</a>
        <a className="lx-btn gold small" href="/?request=1">Join free</a>
      </header>

      <section className="lx-hero">
        <div className="lx-hero-in">
          <div className="lx-hero-text">
            <h1>The whole boat in one log.</h1>
            <p className="lx-lede">
              Maintenance, crew, rotations and parts for your yacht, from the bridge to the engine room.
              Owners see the state of the boat, captains run it, and crew and contractors build a record that stays with them.
            </p>
            <div className="lx-ctas">
              <a className="lx-btn gold" href="/?request=1">Create a free account</a>
              <a className="lx-btn line" href="/login">Log in</a>
            </div>
            <p className="lx-free">Free to sign up. Captains, owners, crew and contractors are all welcome.</p>
            <a className="lx-new" href="#contractors"><b>New</b> Work orders and invoices for contractors, on any boat</a>
          </div>
          <div className="lx-hero-art" aria-hidden="true">
            <img className="lx-desk" src="/landing/lp-board-parts.jpg" alt="" width="1400" height="613" />
            <div className="lx-phone"><img src="/landing/lp-phone-task.jpg" alt="" width="700" height="1104" /></div>
          </div>
        </div>
      </section>

      <section className="lx-section" id="features">
        <h2 className="lx-h2">What it does</h2>
        <p className="lx-note">Screens use the M/Y Meridian Star sample boat.</p>
        {FEATURES.map((f, i) => (
          <article key={f.id} className={`lx-feature ${i % 2 ? 'flip' : ''}`}>
            <div className="lx-feature-text">
              <h3>{f.title}</h3>
              <p>{f.text}</p>
              <ul>{f.points.map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
            <figure className="lx-shot">
              <img src={`/landing/${f.img}`} alt={f.title} width={f.w} height={f.h} loading="lazy" />
            </figure>
          </article>
        ))}
      </section>

      <section className="lx-chart" id="parts">
        <div className="lx-chart-in">
          <h2 className="lx-h2 light">Parts, from request to return</h2>
          <p className="lx-chart-lede">Every part has a course you can follow. The person who asked is emailed at each step.</p>
          <ol className="lx-route">
            {ROUTE.map(([t, d], i) => (
              <li key={t} style={{ '--i': i }}>
                <span className="lx-wp" aria-hidden="true" />
                <b>{t}</b>
                <span>{d}</span>
              </li>
            ))}
          </ol>
          <div className="lx-chart-shots">
            <figure className="lx-shot dark"><img src="/landing/lp-requests.jpg" alt="Parts requests waiting for the Captain’s approval" width="1400" height="719" loading="lazy" /></figure>
            <figure className="lx-shot dark narrow"><img src="/landing/lp-phone-supplies.jpg" alt="Suggested parts for a generator service, with the make added" width="700" height="833" loading="lazy" /></figure>
          </div>
          <p className="lx-chart-foot">
            Each job suggests the parts it usually needs and adds the make and model when the task names it. Save the exact part once and it comes back every time the job is due.
            {SHOW_AMAZON_DISCLOSURE && <> {AMAZON_DISCLOSURE}</>}
          </p>
        </div>
      </section>

      <section className="lx-section lx-work" id="contractors">
        <div className="lx-work-grid">
          <div className="lx-work-text">
            <h2 className="lx-h2">Work orders and invoices for contractors</h2>
            <p className="lx-work-lede">
              For technicians who work on more than one boat, and crew who take outside jobs. Open a work order, sign off the work,
              send it to the Captain and invoice from it, all in one place.
            </p>
            <ol className="lx-steps">
              {WORK_STEPS.map(([t, d]) => <li key={t}><b>{t}</b><span>{d}</span></li>)}
            </ol>
            <p className="lx-work-note">
              Crew can be contractors too: tick the box when you sign up, or switch it on later in your profile.
              CJM Marine keeps the record and never handles the money.
            </p>
            <div className="lx-ctas">
              <a className="lx-btn gold" href="/?request=1&as=contractor">Join as a contractor</a>
              <a className="lx-btn line dark" href="/?request=1&as=crew">Join as crew</a>
            </div>
          </div>
          <div className="lx-work-art">
            <figure className="lx-shot"><img src="/landing/lp-wo-board.jpg" alt="A contractor’s work orders: waiting on parts, with the Captain, approved, and unpaid invoices" width="1300" height="658" loading="lazy" /></figure>
            <figure className="lx-shot lx-paper"><img src="/landing/lp-wo-invoice.jpg" alt="An invoice built from a stabilizer service work order" width="1012" height="1310" loading="lazy" /></figure>
          </div>
        </div>
      </section>

      <section className="lx-section" id="who">
        <h2 className="lx-h2">Built for the people who run the boat</h2>
        <div className="lx-roles">
          {ROLES.map((r) => (
            <div key={r.title} className="lx-role">
              <span className="lx-role-ico"><Icon name={r.icon} /></span>
              <h3>{r.title}</h3>
              <ul>{r.points.map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
          ))}
        </div>
      </section>

      <section className="lx-section lx-why" id="why">
        <h2 className="lx-h2">Why CJM Marine</h2>
        <div className="lx-why-grid">
          <blockquote className="lx-why-quote">
            <p>The people who keep beautiful machines running deserve a platform as much as the machines deserve care.</p>
          </blockquote>
          <div className="lx-why-text">
            <p>
              I’m Jonathan Carballo, an FAA-certified A&amp;P mechanic with 19 years in business aviation, most of it in AOG and avionics work
              on Citations, Challengers, Globals, Falcons and Gulfstreams.
            </p>
            <p>
              In aviation, every job is logged, signed off and traceable. Parts are tracked down to the serial number, and a core goes back with its
              paperwork. Nothing is left to memory. CJM Marine brings that standard to yachts.
            </p>
            <p>
              The captain makes sure the work happens. The crew performs it. CJM Marine gives both a record that proves it.
            </p>
            <p className="lx-why-sign"><b>Jonathan Carballo</b><span>Founder, CJM Marine and CJM Aero</span></p>
          </div>
        </div>
        <ul className="lx-why-std" aria-label="Aviation practices CJM Marine follows">
          <li><b>Logged</b><span>Every job, with who did it and when</span></li>
          <li><b>Signed off</b><span>By the person responsible, never assumed</span></li>
          <li><b>Traceable</b><span>Part and serial numbers, off and on</span></li>
          <li><b>Credited</b><span>Each crew member keeps their record</span></li>
        </ul>
      </section>

      <section className="lx-section lx-honest">
        <div>
          <h2 className="lx-h2">Advice is labelled as advice</h2>
          <p>
            Suggested jobs and intervals are general practice and are marked <b>Recommended</b>. CJM Marine is working with a marine compliance consultant
            to confirm flag, state and class requirements; only rules they approve, with a source, are marked <b>Regulatory</b>. When the boat’s tonnage,
            use or flag is unknown, the app says a review is needed instead of guessing.
          </p>
        </div>
        <div>
          <h2 className="lx-h2">Your records, kept safe</h2>
          <ul className="lx-checks">
            <li>Daily Google Sheets backup for each Captain, with an Excel copy.</li>
            <li>Every create, edit, sign-off, order and return is logged with the person and date.</li>
            <li>Captains and owners confirm each login with an emailed code.</li>
            <li>Each boat’s data is visible only to its own crew.</li>
          </ul>
        </div>
      </section>

      <section className="lx-join">
        <div className="lx-join-in">
          <h2>Start free today</h2>
          <p>Ask for your boat to be set up, or join as crew or a contractor and start your record. Contractors get work orders and invoices from day one.</p>
          <div className="lx-ctas center">
            <a className="lx-btn gold" href="/?request=1&as=owner">Set up my boat</a>
            <a className="lx-btn line" href="/?request=1&as=crew">Join as crew</a>
            <a className="lx-btn line" href="/?request=1&as=contractor">I’m a contractor</a>
          </div>
        </div>
      </section>

      <section className="lx-section lx-contact" id="contact">
        <div>
          <h2 className="lx-h2">About CJM Marine</h2>
          <p>
            CJM Marine is the marine division of CJM ({COMPANY.parent}), based in {COMPANY.region}. We set up boats on the platform,
            support captains and crew, and keep the system running.
          </p>
        </div>
        <address className="lx-card">
          <b>Contact us</b>
          <span className="lx-contact-line"><Icon name="user" /> {SUPPORT.name}</span>
          <a className="lx-contact-line" href={`tel:${SUPPORT.phone}`}>{SUPPORT.phoneDisplay}</a>
          <a className="lx-contact-line" href={`mailto:${SUPPORT.email}`}>{SUPPORT.email}</a>
          <button type="button" className="lx-btn line small" onClick={() => downloadVcard(contactVcard({ url: window.location.origin }), 'CJM-Marine-Support.vcf')}>
            Save contact
          </button>
        </address>
      </section>

      <section className="lx-section lx-privacy" id="privacy">
        <h2 className="lx-h2">Privacy</h2>
        <div className="lx-privacy-cols">
          <div>
            <h3>What we keep</h3>
            <p>
              Your name, email and password (stored as a salted hash). If you choose to add them: phone, photo, headline, home port,
              operating regions, languages, certifications and experience. For each boat: its details, crew list, rotations, maintenance tasks,
              notes, photos, sign-offs, reviews, and parts requests and orders, including suppliers, tracking numbers, returns and where parts were left aboard.
              For contractors: business details, rates and payment instructions you enter, work orders, and invoices with the name and email they are billed to.
            </p>
            <h3>Who sees it</h3>
            <p>
              A boat’s data is visible only to that boat’s crew and to CJM Marine administrators. Owners and captains can find crew
              profiles; your phone and email show only if you turn that on. Your public reviews page exists only if you turn it on, and it hides reviewers’ names.
              A captain who confirms a job by email sees only that job. An invoice link shows only that invoice. CJM Marine does not process payments.
            </p>
          </div>
          <div>
            <h3>Where it is stored</h3>
            <p>
              Data is kept in CJM Marine’s Google Sheets and Google Drive. The website is hosted on Netlify. Backups are emailed to the boat’s Captain
              and to CJM Marine, and your own record is emailed to you. We do not sell personal data or use advertising trackers.
            </p>
            <h3>Cookies, links and your choices</h3>
            <p>
              Your browser stores a login key so you stay signed in. Fonts load from Google Fonts. Links to other sites, including Amazon and carriers’
              tracking pages, follow those sites’ own privacy policies and cookies. To see, correct or delete your data, email <a href={`mailto:${SUPPORT.email}`}>{SUPPORT.email}</a>.
            </p>
          </div>
        </div>
      </section>

      <div className="lx-strip"><Hero line1="From the bridge" line2="to the engine room…" foot="It all connects." /></div>

      <footer className="lx-foot">
        <span>© {year} {COMPANY.name}, {COMPANY.parent}</span>
        <nav aria-label="Footer">
          <a href="/privacy">Privacy</a>
          <a href="#contact">Contact</a>
          <a href="/login">Log in</a>
        </nav>
        {SHOW_AMAZON_DISCLOSURE && <span className="lx-foot-disc">{AMAZON_DISCLOSURE}</span>}
      </footer>
    </div>
  );
}

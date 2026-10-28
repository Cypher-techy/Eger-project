import { ArrowDownRight, ArrowRight, BadgeCheck, BriefcaseBusiness, CheckCircle2, CircleDollarSign, Clock3, FileText, ShieldCheck, Smartphone, Users, WalletCards, Zap } from "lucide-react";

const jobs = [
  { category: "Digital tasks", title: "Review a local business listing", detail: "Check opening hours and contact details", pay: "Example KSh 80", time: "5–8 min", tag: "Beginner friendly", icon: FileText },
  { category: "Research", title: "Complete a short consumer survey", detail: "Share feedback on everyday products", pay: "Example KSh 120", time: "8–12 min", tag: "Quick task", icon: CircleDollarSign },
  { category: "Online support", title: "Categorise product information", detail: "Organise product descriptions and tags", pay: "Example KSh 200", time: "15–20 min", tag: "Flexible", icon: BriefcaseBusiness }
];

export default function Home() {
  return <main>
    <div className="topline"><div className="container top-inner"><span><span className="live-dot"/> Opportunities for people across Kenya</span><span className="top-right">Transparent payouts · M-Pesa supported</span></div></div>
    <header className="container nav">
      <a className="brand" href="#"><span className="brand-icon">K</span><span>Kazi<span className="brand-green">Mashinani</span> Jobs<small>KENYA</small></span></a>
      <nav><a href="#opportunities">Find work</a><a href="#how">How it works</a><a href="#payments">Payments</a></nav>
      <div className="nav-actions"><a className="sign-in" href="/account">Sign in</a><a className="btn btn-dark" href="/account">Create account <ArrowRight size={16}/></a></div>
    </header>

    <section className="hero">
      <div className="hero-orb orb-one"/><div className="hero-orb orb-two"/>
      <div className="container hero-grid">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-star">✳</span> YOUR NEXT OPPORTUNITY STARTS HERE</div>
          <h1>Make your time<br/>work <span>for you.</span></h1>
          <p className="hero-description">Discover flexible online tasks and job opportunities, grow your skills, and keep track of every shilling you earn.</p>
          <div className="hero-buttons"><a className="btn btn-primary" href="#get-started">Explore opportunities <ArrowRight size={17}/></a><a className="btn btn-outline" href="#how"><span className="play">▶</span> How it works</a></div>
          <div className="trust-row"><div className="avatar-stack"><span>JM</span><span>AK</span><span>BW</span><span>+ </span></div><div><strong>Built for opportunity</strong><small>Clear task details. Clear payment status.</small></div></div>
        </div>
        <div className="hero-art">
          <div className="art-glow"/>
          <div className="dashboard-card">
            <div className="dash-top"><div><small>YOUR WORKSPACE</small><h3>Welcome to your next step</h3></div><span className="status-chip"><span/> Account preview</span></div>
            <div className="balance-card"><div className="balance-label"><WalletCards size={17}/> New user bonus</div><div className="balance-amount">KES 750<span>*</span></div><div className="balance-bottom"><span>New user bonus</span><span className="pending-chip">Withdrawable after verification</span></div><div className="balance-line"><span/></div><small className="balance-note">After successful phone verification, the funded KES 750 bonus is withdrawable immediately.</small></div>
            <div className="mini-stats"><div><span className="stat-icon green"><BriefcaseBusiness size={17}/></span><div><small>Open tasks</small><strong>Explore jobs</strong></div></div><div><span className="stat-icon yellow"><CircleDollarSign size={17}/></span><div><small>Cash earnings</small><strong>KSh 0.00</strong></div></div></div>
            <div className="activity-title">A simple way to get started <ArrowDownRight size={16}/></div>
            <div className="activity-row"><span className="activity-icon"><CheckCircle2 size={17}/></span><div><strong>Create your profile</strong><small>Keep your details up to date</small></div><span className="activity-tag">STEP 1</span></div>
            <div className="activity-row"><span className="activity-icon purple"><Zap size={17}/></span><div><strong>Choose a suitable task</strong><small>Review the reward before starting</small></div><span className="activity-tag">STEP 2</span></div>
          </div>
          <div className="float-card float-top"><span className="float-icon"><ShieldCheck size={19}/></span><div><strong>Payment clarity</strong><small>Track each transaction</small></div></div>
          <div className="float-card float-bottom"><span className="float-icon lime"><Smartphone size={19}/></span><div><strong>M-Pesa ready</strong><small>After setup & verification</small></div></div>
        </div>
      </div>
      <div className="container hero-foot"><span><ShieldCheck size={15}/> Secure account access</span><span><CircleDollarSign size={15}/> Clear reward terms</span><span><Smartphone size={15}/> M-Pesa payment integration</span></div>
    </section>

    <section className="metrics container"><div><strong>01<span>.</span></strong><p>One account for your<br/>opportunities</p></div><div><strong>02<span>.</span></strong><p>Clear rewards before<br/>you begin a task</p></div><div><strong>03<span>.</span></strong><p>Track payments and<br/>withdrawal status</p></div><div className="metric-last"><span className="metric-icon"><BadgeCheck size={20}/></span><p>Designed around<br/><b>trust and clarity</b></p></div></section>

    <section className="section container" id="opportunities">
      <div className="section-heading"><div><div className="eyebrow">FIND YOUR FIT</div><h2>Opportunities worth<br/>your time.</h2></div><a className="text-link" href="#get-started">View all opportunities <ArrowRight size={16}/></a></div>
      <div className="jobs-grid">{jobs.map((job) => { const Icon = job.icon; return <article className="job-card" key={job.title}><div className="job-top"><span className="job-icon"><Icon size={20}/></span><span className="job-tag">EXAMPLE</span></div><small className="job-category">{job.category}</small><h3>{job.title}</h3><p>{job.detail}</p><div className="job-footer"><div><strong>{job.pay}</strong><small><Clock3 size={13}/> {job.time}</small></div><a href="#get-started" aria-label={`Explore ${job.title}`}><ArrowRight size={18}/></a></div></article>})}</div>
      <p className="demo-note">Sample listings for the initial design. Publish only real, reviewed opportunities with verified reward terms.</p>
    </section>

    <section className="how-section" id="how"><div className="container"><div className="center-heading"><div className="eyebrow">SIMPLE BY DESIGN</div><h2>From sign-up to payout.</h2><p>A clear process, so you know what happens at every step.</p></div><div className="steps"><div className="step"><span className="step-number">01</span><span className="step-icon"><Users size={22}/></span><h3>Create your account</h3><p>Register securely and verify the phone number you use for your account.</p></div><div className="step-connector"/><div className="step"><span className="step-number">02</span><span className="step-icon"><BriefcaseBusiness size={22}/></span><h3>Choose real work</h3><p>Read the requirements, completion criteria and reward before you start.</p></div><div className="step-connector"/><div className="step"><span className="step-number">03</span><span className="step-icon"><WalletCards size={22}/></span><h3>Track your earnings</h3><p>Approved task earnings appear in your wallet with a transaction record.</p></div><div className="step-connector"/><div className="step"><span className="step-number">04</span><span className="step-icon"><Smartphone size={22}/></span><h3>Request a payout</h3><p>Request a withdrawal from your available cash balance to M-Pesa.</p></div></div></div></section>

    <section className="container payment-section" id="payments"><div className="payment-copy"><div className="eyebrow">NO SURPRISES</div><h2>Know what your money<br/>means.</h2><p>We separate promotional offers from cash earnings, show transaction status, and make eligibility rules visible before you take action.</p><div className="payment-checks"><span><CheckCircle2 size={18}/> Itemised transaction history</span><span><CheckCircle2 size={18}/> Verified payment confirmations</span><span><CheckCircle2 size={18}/> Admin-reviewed withdrawals</span></div></div><div className="payment-panel"><div className="panel-top"><span className="mpesa-mark">M</span><span className="secure-label"><ShieldCheck size={14}/> Payment information</span></div><h3>Phone verification</h3><p>Phone verification costs KSh 70 via M-Pesa STK Push. After Safaricom confirms the payment, an eligible funded KES 750 bonus is credited once and becomes withdrawable.</p><div className="charge-row"><span>Phone verification</span><strong>KSh 70</strong></div><div className="charge-row"><span>Welcome promotion</span><strong>KSh 750*</strong></div><div className="panel-disclaimer">*The KES 750 welcome bonus is credited only after Safaricom confirms the KSh 70 payment and the funded promotion is enabled. Once credited to your available wallet, it is immediately withdrawable. An STK prompt alone is not confirmation.</div><a className="btn btn-primary panel-btn" href="#get-started">Get started <ArrowRight size={16}/></a></div></section>

    <section className="cta-section" id="get-started"><div className="container cta-inner"><div><div className="eyebrow light">YOUR NEXT CHAPTER</div><h2>Ready to find your<br/>next opportunity?</h2><p>Create an account, verify your phone, and track the funded welcome bonus and withdrawal requests from your dashboard.</p></div><div className="cta-actions"><a className="btn btn-lime" href="/account">Request early access <ArrowRight size={17}/></a><span><ShieldCheck size={15}/> No earnings are guaranteed.</span></div></div></section>

    <footer><div className="container footer-main"><a className="brand footer-brand" href="#"><span className="brand-icon">K</span><span>Kazi<span className="brand-green">Connect</span><small>KENYA</small></span></a><p>Making online opportunities easier to discover and manage.</p><div className="footer-links"><a href="#opportunities">Opportunities</a><a href="#how">How it works</a><a href="#payments">Payment terms</a><a href="/account">Contact</a></div></div><div className="container footer-bottom"><span>© {new Date().getFullYear()} KaziMashinani Jobs Kenya</span><span>Built for transparency. Work with confidence.</span></div></footer>
  </main>;
}
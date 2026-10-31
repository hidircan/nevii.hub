import type { SiteLocaleContent } from "./types";

/** English site content — translation of the Turkish source. Prices, plan names and demo data stay as-is. */
export const enContent: SiteLocaleContent = {
  locale: "en",
  meta: {
    title: "NeviiHub — Management platform for education businesses",
    description:
      "Scheduling, attendance, makeup lessons, contracts and collections, with teacher and parent portals.",
  },
  skip: "Skip to content",
  header: { login: "Sign in", languageLabel: "Language", demo: "Request a Demo" },
  nav: [
    { label: "Home", href: "#ust" },
    { label: "About", href: "#hakkimizda" },
    { label: "Features", href: "#ozellikler" },
    { label: "Plans", href: "#fiyatlandirma" },
    { label: "How to buy", href: "#satin-alma" },
    { label: "Try free", href: "/deneme" },
    { label: "References", href: "#referanslar" },
    { label: "Contact", href: "#iletisim" },
  ],
  hero: {
    headline: "Your entire school on one platform",
    subline:
      "Scheduling, attendance, makeup lessons, contract and collection management — together with teacher and parent portals. Dedicated, multi-branch and secure.",
    login: "Sign in",
    trial: "Try free for 30 days",
    tour: "Discover the platform →",
    highlights: [
      "One panel for multi-branch schools",
      "KVKK + photo/video consent flows",
      "No message is sent without approval",
      "Works on phones too",
    ],
  },
  about: {
    title: "Designed for your school's daily operations",
    description:
      "NeviiHub brings everything from lesson planning to attendance, from contracts to collections into one place. Each school sees only its own data, and each role sees only what it is authorized for.",
  },
  features: {
    title: "All of your school's work, on one platform",
    description: "A dedicated screen for every process — from planning to collections, contracts to communication.",
  },
  groups: [
    {
      title: "Lesson planning & scheduling",
      description: "The full weekly lesson calendar is built and run on a single screen.",
      points: [
        "Weekly schedule by branch, teacher and studio",
        "Drag-and-drop lesson moves and duration changes",
        "Recurring lessons and bulk planning",
        "Conflict-free placement with studio capacity and instrument info",
      ],
    },
    {
      title: "Attendance & makeup lessons",
      description: "Attendance tracking and makeup flow follow fixed rules.",
      points: [
        "Fast attendance with Present / Processed / Makeup states",
        "Automatic makeup credit, deadline and quota rules",
        "Available-slot suggestions and a makeup center",
        "Attendance reports per student and term",
      ],
    },
    {
      title: "Student & teacher records",
      description: "Your school's people stay organized and searchable.",
      points: [
        "Student records: branch, instrument, teacher, plan and contract status",
        "Advanced filters, sorting and archiving",
        "Teacher cards: branches, workload and contact info",
        "Instrument and staff definitions",
      ],
    },
    {
      title: "Learning progress",
      description: "Learning progress is tracked lesson by lesson.",
      points: [
        "Curriculum and topic progress tracking",
        "Homework assignment and homework reports",
        "Trial lesson records and follow-up",
        "Term assessments and feedback",
      ],
    },
    {
      title: "Payments & finance",
      description: "Your school's cash flow stays linked to lessons.",
      points: [
        "Installment plans with due-date and overdue tracking",
        "Receipt printouts and payment history",
        "Teacher payout calculation and tracking",
        "Fee rules, plan definitions and finance summary",
      ],
    },
    {
      title: "Contracts & documents",
      description: "Official paperwork is produced from one center.",
      points: [
        "Enrollment contract, KVKK notice and photo/video consent form",
        "School-specific document templates",
        "Student and payment statements",
        "Printable official outputs",
      ],
    },
    {
      title: "Communication & announcements",
      description: "Internal and external communication stays on record.",
      points: [
        "Bulk announcements and notifications",
        "Communication center and message history",
        "CRM tracking with lead and meeting records",
        "Internal staff messaging",
      ],
    },
    {
      title: "Setup & management",
      description: "Your school's structure and daily flow, managed.",
      points: [
        "Step-by-step setup: branches, studios, plans and users",
        "Bulk import of existing records",
        "Task lists and assignments",
        "Audit log with who-did-what-when traceability",
      ],
    },
    {
      title: "AI assistance",
      description: "Smart help with repetitive work.",
      points: [
        "School assistant you can ask in natural language",
        "Automatic daily and term summaries",
        "Contextual answers from recorded history",
      ],
    },
  ],
  platform: { title: "Three portals, one platform", description: "Everyone focuses on their own work; data stays in one place." },
  surfaces: [
    {
      title: "Management panel",
      description: "The main screen where owners, managers and office staff run all operations.",
      points: [
        "Daily overview: today's lessons, pending attendance and makeup requests, overdue collections",
        "Scheduling, attendance, makeup center, student and teacher records",
        "Contracts, documents, payments, teacher payouts and finance summary",
        "Central management of branches, studios, plans, curricula and user roles",
        "Full traceability with announcements, notifications, communication center and audit log",
      ],
    },
    {
      title: "Teacher portal",
      description: "Teachers focus only on their own lessons and students.",
      points: [
        "Personal lesson schedule with classroom info",
        "Attendance entry and lesson status tracking",
        "Own students, homework, curriculum and assessment screens",
        "Availability reporting and payout viewing",
        "Learning materials, task tracking and feedback screens",
      ],
    },
    {
      title: "Parent & student portal",
      description: "Families and students reach their own information from anywhere.",
      points: [
        "Lesson schedule, attendance status and makeup info",
        "Homework, curriculum progress and term assessments",
        "Payment info, contracts and downloadable documents",
        "Assessment results and school announcements",
        "Each user sees only their own record; data isolated per school",
      ],
    },
  ],
  references: {
    title: "References",
    empty: "Our reference schools and success stories will be published in this section soon.",
    story: "Read the story →",
  },
  pricing: {
    title: "Plans & Pricing",
    description: "The same catalog also feeds the checkout screen; the amount you see is re-verified at purchase.",
  },
  pricingPlaceholder: {
    title: "Let's find the right plan for your school together",
    description:
      "We build a suitable plan based on your branch count, student count and the modules you need. Contact us for current plan and pricing information.",
    cta: "Contact us",
  },
  pricingChrome: {
    periodLabel: "Billing period",
    monthly: "Monthly",
    yearly: "Yearly",
    perMonth: "mo",
    perYear: "yr",
    yearlyNote: "Single yearly charge. Monthly equivalent {equiv}.",
    savings: "{pct}% cheaper than monthly billing",
    sandboxZero: "SANDBOX test amount",
    customQuote: "Custom quote",
    notApproved: "This plan has no approved price yet; real checkout is closed.",
    unlimited: "Unlimited",
    students: "students",
    users: "users",
    branches: "branches",
    moreModules: "· {n} more modules",
    buy: "Buy",
    quote: "Request quote",
    demoNote:
      "Demo catalog: amounts are sample prices, not real sale prices. This note is removed once an approved price is published.",
    trialTeaser: "Undecided? Try free for 30 days without entering card details.",
    trialCta: "Try free for 30 days",
  },
  purchase: {
    title: "How to buy?",
    description:
      "Every step from plan selection to subscription management is transparent; you always see the total before paying.",
    cta: "Browse plans →",
  },
  mobileApp: {
    title: "NeviiHub in your pocket",
    description: "Attendance, homework and announcements on your phone. Download links will appear here once the app is published.",
    appStore: "Download on the App Store",
    play: "Get it on Google Play",
    soon: "The mobile app is coming soon to the stores.",
    openInApp: "Open in app",
    dismiss: "Dismiss",
  },
  steps: [
    {
      title: "1. Review the plan",
      description: "See the right plan for your school in Plans & Pricing, with monthly / yearly options and the VAT-excluded list price.",
    },
    {
      title: "2. Buy or request a quote",
      description: "Buy shows you the full module and limit details; for corporate needs, reach us via Request quote.",
    },
    {
      title: "3. Approve the order summary",
      description: "Amount, VAT-included total, renewal date, post-campaign price and cancellation terms are shown on one screen before payment.",
    },
    {
      title: "4. Secure payment",
      description: "The payment step completes over secure payment infrastructure; your card details never reach our servers.",
    },
    {
      title: "5. Manage the subscription",
      description: "Renewal date, payment history, card updates and cancellation are always available in your school panel.",
    },
  ],
  media: {
    title: "Take a closer look",
    description: "Real NeviiHub screens: from scheduling to student management.",
  },
  mediaItems: [],
  faq: { title: "Frequently asked questions", description: "What people ask about the product, setup and purchasing." },
  faqItems: [
    {
      question: "Does our data get mixed with other schools?",
      answer:
        "No. Every record belongs to a single school and the school identity is resolved only from the session; it cannot be changed by a user-supplied value.",
    },
    {
      question: "What can teachers and parents see?",
      answer:
        "Each role sees only data in its own scope. Teachers see their own schedule and students; parents/students see only their own record.",
    },
    {
      question: "How are contracts and KVKK documents produced?",
      answer:
        "Your school's uploaded templates are used. The enrollment contract, KVKK notice and photo/video consent form are printed as one output with separate sections and signature fields.",
    },
    {
      question: "Can it be used on mobile devices?",
      answer: "Yes. All portals are designed to work in mobile browsers.",
    },
    {
      question: "How do setup and migration work?",
      answer:
        "During setup your school structure (branches, studios, teaching staff) is defined together, and the migration plan follows your term calendar. Contact us at info@neviihub.com for details.",
    },
    {
      question: "How many branches and users are supported?",
      answer:
        "Limits depend on your plan; each plan's student, user and branch limits are listed in Plans & Pricing. You can move to a larger plan as you grow.",
    },
    {
      question: "How can I buy?",
      answer:
        "Pick your plan and press Buy to see the full module and limit details, then continue to the order summary and secure payment step. See How to buy for the step-by-step flow.",
    },
    {
      question: "Do prices include VAT?",
      answer:
        "Our list prices exclude VAT and show +VAT next to the price. The VAT-included total is clearly shown in the order summary before payment.",
    },
    {
      question: "Is there a trial period?",
      answer:
        "Yes, we offer a 30-day free trial. Apply via Try free and use all features in your plan's scope during the trial.",
    },
    {
      question: "Can I cancel anytime?",
      answer:
        "Yes. When you cancel, your access continues until the end of your paid period; no renewal happens after the term ends. You can cancel from your school panel.",
    },
    {
      question: "Which payment methods are accepted?",
      answer:
        "Secure infrastructure for online card payments is being prepared. Contact info@neviihub.com for current payment options and pilot terms.",
    },
    {
      question: "How can I get a demo?",
      answer:
        "Write to the email address in the contact section; we'll schedule a short demo tailored to your school.",
    },
    {
      question: "Can I import my existing student list?",
      answer:
        "Yes. Students from your CSV file can be imported; enrollment details and initial collection records are preserved.",
    }
  ],
  contact: {
    title: "Contact",
    description: "Let's determine the right setup and plan for your school together.",
    phone: "Phone",
    email: "Email",
    address: "Address",
    pending: "Our contact details will be published here soon. If you have a school account, you can reach us from the panel.",
    demoTitle: "Request a free demo",
    demoCta: "Send demo email",
    follow: "Follow us on social media",
    soon: "soon",
    mapTitle: "Location map",
  },
  footer: { rights: "" },
};

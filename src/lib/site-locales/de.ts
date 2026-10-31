import type { SiteLocaleContent } from "./types";

/** Deutsche Inhalte der öffentlichen Website — Übersetzung der türkischen Quelle. */
export const deContent: SiteLocaleContent = {
  locale: "de",
  meta: {
    title: "NeviiHub — Verwaltungsplattform für Bildungseinrichtungen",
    description:
      "Stundenplanung, Anwesenheit, Nachholstunden, Verträge und Inkasso — mit Lehrer- und Elternportalen.",
  },
  skip: "Zum Inhalt springen",
  header: { login: "Anmelden", languageLabel: "Sprache", demo: "Demo anfordern" },
  nav: [
    { label: "Start", href: "#ust" },
    { label: "Über uns", href: "#hakkimizda" },
    { label: "Funktionen", href: "#ozellikler" },
    { label: "Tarife", href: "#fiyatlandirma" },
    { label: "Kaufen", href: "#satin-alma" },
    { label: "Gratis testen", href: "/deneme" },
    { label: "Referenzen", href: "#referanslar" },
    { label: "Kontakt", href: "#iletisim" },
  ],
  hero: {
    headline: "Ihre gesamte Bildungseinrichtung auf einer Plattform",
    subline:
      "Stundenplanung, Anwesenheit, Nachholstunden, Vertrags- und Inkassoverwaltung — zusammen mit Lehrer- und Elternportalen. Eigenständig, mehrstandortfähig und sicher.",
    login: "Anmelden",
    trial: "30 Tage gratis testen",
    tour: "Plattform entdecken →",
    highlights: [
      "Ein Panel für Schulen mit mehreren Standorten",
      "KVKK- + Foto-/Video-Einwilligungsabläufe",
      "Keine Nachricht ohne Freigabe",
      "Auch auf dem Handy nutzbar",
    ],
  },
  about: {
    title: "Für den Alltag Ihrer Schule gemacht",
    description:
      "NeviiHub vereint alles — von der Stundenplanung über die Anwesenheit bis zu Verträgen und Inkasso — an einem Ort. Jede Schule sieht nur ihre eigenen Daten, jede Rolle nur das, wozu sie berechtigt ist.",
  },
  features: {
    title: "Die gesamte Arbeit Ihrer Schule auf einer Plattform",
    description: "Für jeden Prozess ein eigener Bildschirm — von der Planung bis zum Inkasso.",
  },
  groups: [
    {
      title: "Stundenplanung",
      description: "Der gesamte Wochenplan wird auf einem Bildschirm erstellt und geführt.",
      points: [
        "Wochenansicht nach Standort, Lehrkraft und Studio",
        "Stunden per Drag-and-drop verschieben und verlängern",
        "Wiederkehrende Stunden und Sammelplanung",
        "Überschneidungsfreie Belegung mit Kapazitäts- und Instrumenteninfo",
      ],
    },
    {
      title: "Anwesenheit & Nachholstunden",
      description: "Anwesenheit und Nachholstunden folgen festen Regeln.",
      points: [
        "Schnelle Erfassung mit Anwesend / Verarbeitet / Nachholen",
        "Automatische Guthaben-, Frist- und Kontingentregeln",
        "Terminvorschläge und Nachholzentrale",
        "Anwesenheitsberichte pro Schüler und Zeitraum",
      ],
    },
    {
      title: "Schüler- & Lehrerdaten",
      description: "Die Menschen Ihrer Schule bleiben geordnet und auffindbar.",
      points: [
        "Schülerdaten: Standort, Instrument, Lehrkraft, Tarif und Vertragsstatus",
        "Erweiterte Filter, Sortierung und Archivierung",
        "Lehrerkarten: Fächer, Auslastung und Kontaktdaten",
        "Instrumenten- und Personaldefinitionen",
      ],
    },
    {
      title: "Lernfortschritt",
      description: "Der Lernfortschritt wird Stunde für Stunde verfolgt.",
      points: [
        "Lehrplan- und Themenfortschritt",
        "Hausaufgaben und Hausaufgabenberichte",
        "Probestunden erfassen und nachverfolgen",
        "Zeitraumbeurteilungen und Feedback",
      ],
    },
    {
      title: "Zahlungen & Finanzen",
      description: "Der Geldfluss bleibt mit den Stunden verknüpft.",
      points: [
        "Ratenpläne mit Fälligkeits- und Mahnverfolgung",
        "Quittungsausdruck und Zahlungsverlauf",
        "Lehrerhonorare berechnen und verfolgen",
        "Gebührenregeln, Tarifdefinitionen und Finanzübersicht",
      ],
    },
    {
      title: "Verträge & Dokumente",
      description: "Offizielle Unterlagen entstehen an einer Stelle.",
      points: [
        "Anmeldevertrag, KVKK-Hinweis und Foto-/Video-Einwilligung",
        "Schuleigene Dokumentvorlagen",
        "Schüler- und Zahlungsauszüge",
        "Druckfähige offizielle Ausgaben",
      ],
    },
    {
      title: "Kommunikation & Mitteilungen",
      description: "Interne und externe Kommunikation bleibt dokumentiert.",
      points: [
        "Sammelmitteilungen und Benachrichtigungen",
        "Kommunikationszentrale und Nachrichtenverlauf",
        "CRM mit Interessenten- und Gesprächsdatensätzen",
        "Interne Nachrichten der Mitarbeiter",
      ],
    },
    {
      title: "Einrichtung & Verwaltung",
      description: "Struktur und Tagesablauf Ihrer Schule, verwaltet.",
      points: [
        "Schrittweise Einrichtung: Standorte, Studios, Tarife und Benutzer",
        "Sammelimport bestehender Datensätze",
        "Aufgabenlisten und Zuweisungen",
        "Prüfprotokoll mit Wer-was-wann-Nachvollziehbarkeit",
      ],
    },
    {
      title: "KI-Unterstützung",
      description: "Intelligente Hilfe bei wiederkehrender Arbeit.",
      points: [
        "Schulassistent in natürlicher Sprache",
        "Automatische Tages- und Zeitraumzusammenfassungen",
        "Kontextbezogene Antworten aus dem Verlauf",
      ],
    },
  ],
  platform: { title: "Drei Portale, eine Plattform", description: "Jeder konzentriert sich auf seine Arbeit; die Daten bleiben an einem Ort." },
  surfaces: [
    {
      title: "Verwaltungspanel",
      description: "Der Hauptbildschirm, auf dem Inhaber, Leitung und Büro alle Abläufe steuern.",
      points: [
        "Tagesübersicht: heutige Stunden, offene Anwesenheiten und Nachholanfragen, überfällige Zahlungen",
        "Stundenplan, Anwesenheit, Nachholzentrale, Schüler- und Lehrerdaten",
        "Verträge, Dokumente, Zahlungen, Lehrerhonorare und Finanzübersicht",
        "Zentrale Verwaltung von Standorten, Studios, Tarifen, Lehrplänen und Benutzerrollen",
        "Volle Nachvollziehbarkeit mit Mitteilungen, Nachrichtenzentrale und Prüfprotokoll",
      ],
    },
    {
      title: "Lehrerportal",
      description: "Lehrkräfte konzentrieren sich nur auf ihre Stunden und Schüler.",
      points: [
        "Persönlicher Stundenplan mit Rauminformation",
        "Anwesenheitserfassung und Stundenstatus",
        "Eigene Schüler, Hausaufgaben, Lehrpläne und Beurteilungen",
        "Verfügbarkeitsmeldung und Honorareinsicht",
        "Lernmaterialien, Aufgaben und Feedback",
      ],
    },
    {
      title: "Eltern- & Schülerportal",
      description: "Familien und Schüler erreichen ihre Informationen von überall.",
      points: [
        "Stundenplan, Anwesenheitsstatus und Nachholstunden",
        "Hausaufgaben, Lehrplanfortschritt und Beurteilungen",
        "Zahlungsinfo, Verträge und herunterladbare Dokumente",
        "Beurteilungsergebnisse und Schulmitteilungen",
        "Jeder sieht nur seinen eigenen Datensatz; Daten pro Schule isoliert",
      ],
    },
  ],
  references: {
    title: "Referenzen",
    empty: "Unsere Referenzschulen und Erfolgsgeschichten werden hier in Kürze veröffentlicht.",
    story: "Geschichte lesen →",
  },
  pricing: {
    title: "Tarife & Preise",
    description: "Derselbe Katalog speist auch die Kaufseite; der angezeigte Betrag wird beim Kauf erneut geprüft.",
  },
  pricingPlaceholder: {
    title: "Finden wir gemeinsam den passenden Tarif für Ihre Schule",
    description:
      "Wir erstellen einen passenden Tarif nach Standortzahl, Schülerzahl und benötigten Modulen. Kontaktieren Sie uns für aktuelle Tarif- und Preisinformationen.",
    cta: "Kontakt aufnehmen",
  },
  pricingChrome: {
    periodLabel: "Abrechnungszeitraum",
    monthly: "Monatlich",
    yearly: "Jährlich",
    perMonth: "Monat",
    perYear: "Jahr",
    yearlyNote: "Einmalige Jahresabbuchung. Monatsäquivalent {equiv}.",
    savings: "{pct} % günstiger als Monatszahlung",
    sandboxZero: "SANDBOX-Testbetrag",
    customQuote: "Individuelles Angebot",
    notApproved: "Für diesen Tarif gibt es noch keinen freigegebenen Preis; der echte Kauf ist geschlossen.",
    unlimited: "Unbegrenzt",
    students: "Schüler",
    users: "Benutzer",
    branches: "Standorte",
    moreModules: "· {n} weitere Module",
    buy: "Kaufen",
    quote: "Angebot anfordern",
    demoNote:
      "Demokatalog: Beträge sind Beispielpreise, keine echten Verkaufspreise. Dieser Hinweis entfällt mit dem freigegebenen Preis.",
    trialTeaser: "Unentschlossen? 30 Tage gratis testen — ohne Kartendaten.",
    trialCta: "30 Tage gratis testen",
  },
  purchase: {
    title: "Wie kaufe ich?",
    description:
      "Jeder Schritt von der Tarifwahl bis zur Aboverwaltung ist transparent; die Gesamtsumme sehen Sie immer vor der Zahlung.",
    cta: "Tarife ansehen →",
  },
  mobileApp: {
    title: "NeviiHub für unterwegs",
    description: "Anwesenheit, Hausaufgaben und Mitteilungen auf dem Handy. Download-Links erscheinen hier nach der Veröffentlichung.",
    appStore: "Im App Store laden",
    play: "Bei Google Play laden",
    soon: "Die mobile App erscheint bald in den Stores.",
    openInApp: "In der App öffnen",
    dismiss: "Schließen",
  },
  steps: [
    {
      title: "1. Tarif prüfen",
      description: "Sehen Sie den passenden Tarif mit Monats-/Jahresoption und Nettolistenpreis unter Tarife & Preise.",
    },
    {
      title: "2. Kaufen oder Angebot anfordern",
      description: "Kaufen zeigt alle Modul- und Limitdetails; für Firmenbedarf erreichen Sie uns über Angebot anfordern.",
    },
    {
      title: "3. Bestellübersicht bestätigen",
      description: "Betrag, Bruttosumme, Verlängerungsdatum, Preis nach der Kampagne und Stornobedingungen stehen vor der Zahlung auf einem Bildschirm.",
    },
    {
      title: "4. Sicher zahlen",
      description: "Der Zahlungsschritt läuft über sichere Zahlungsinfrastruktur; Ihre Kartendaten erreichen unsere Server nie.",
    },
    {
      title: "5. Abo verwalten",
      description: "Verlängerungsdatum, Zahlungsverlauf, Kartenaktualisierung und Kündigung sind in Ihrem Schulpaneel immer verfügbar.",
    },
  ],
  media: {
    title: "Lernen Sie die Plattform kennen",
    description: "Echte NeviiHub-Bildschirme: vom Stundenplan bis zur Schülerverwaltung.",
  },
  mediaItems: [],
  faq: { title: "Häufige Fragen", description: "Was man über Produkt, Einrichtung und Kauf wissen möchte." },
  faqItems: [
    {
      question: "Vermischen sich unsere Daten mit anderen Schulen?",
      answer:
        "Nein. Jeder Datensatz gehört zu genau einer Schule, und die Schulidentität wird nur aus der Sitzung aufgelöst; sie kann nicht durch einen benutzerdefinierten Wert geändert werden.",
    },
    {
      question: "Was sehen Lehrkräfte und Eltern?",
      answer:
        "Jede Rolle sieht nur Daten in ihrem Bereich. Lehrkräfte sehen ihren Plan und ihre Schüler; Eltern/Schüler nur ihren eigenen Datensatz.",
    },
    {
      question: "Wie entstehen Verträge und KVKK-Dokumente?",
      answer:
        "Es werden die hochgeladenen Vorlagen Ihrer Schule verwendet. Anmeldevertrag, KVKK-Hinweis und Foto-/Video-Einwilligung werden als eine Ausgabe mit getrennten Abschnitten und Unterschriftsfeldern gedruckt.",
    },
    {
      question: "Funktioniert es auf Mobilgeräten?",
      answer: "Ja. Alle Portale sind für mobile Browser ausgelegt.",
    },
    {
      question: "Wie laufen Einrichtung und Umstellung?",
      answer:
        "Bei der Einrichtung wird Ihre Schulstruktur (Standorte, Studios, Lehrpersonal) gemeinsam definiert, und der Umstellungsplan folgt Ihrem Terminkalender. Details unter info@neviihub.com.",
    },
    {
      question: "Wie viele Standorte und Benutzer werden unterstützt?",
      answer:
        "Die Limits hängen von Ihrem Tarif ab; Schüler-, Benutzer- und Standortlimits stehen unter Tarife & Preise. Bei Wachstum wechseln Sie in einen größeren Tarif.",
    },
    {
      question: "Wie kann ich kaufen?",
      answer:
        "Wählen Sie Ihren Tarif und drücken Sie Kaufen, um alle Modul- und Limitdetails zu sehen; danach geht es zur Bestellübersicht und zum sicheren Zahlungsschritt. Schritt für Schritt unter Wie kaufe ich.",
    },
    {
      question: "Sind die Preise inkl. MwSt.?",
      answer:
        "Unsere Listenpreise sind Nettopreise mit +MwSt.-Hinweis. Die Bruttosumme steht vor der Zahlung klar in der Bestellübersicht.",
    },
    {
      question: "Gibt es eine Testphase?",
      answer:
        "Ja, wir bieten 30 Tage gratis. Bewerben Sie sich über Gratis testen und nutzen Sie in der Testphase alle Funktionen Ihres Tarifs.",
    },
    {
      question: "Kann ich jederzeit kündigen?",
      answer:
        "Ja. Nach der Kündigung läuft Ihr Zugang bis zum Ende des bezahlten Zeitraums; danach erfolgt keine Verlängerung. Die Kündigung erfolgt in Ihrem Schulpaneel.",
    },
    {
      question: "Welche Zahlungsmethoden werden akzeptiert?",
      answer:
        "Sichere Infrastruktur für Online-Kartenzahlung wird vorbereitet. Aktuelle Zahlungsoptionen und Pilotkonditionen unter info@neviihub.com.",
    },
    {
      question: "Wie erhalte ich eine Demo?",
      answer:
        "Schreiben Sie an die E-Mail-Adresse im Kontaktbereich; wir planen eine kurze Demo für Ihre Einrichtung.",
    },
    {
      question: "Kann ich meine bestehende Schülerliste übernehmen?",
      answer:
        "Ja. Schüler aus Ihrer CSV-Datei können importiert werden; Anmeldedaten und erste Zahlungseinträge bleiben erhalten.",
    }
  ],
  contact: {
    title: "Kontakt",
    description: "Bestimmen wir gemeinsam die passende Einrichtung und den Tarif für Ihre Schule.",
    phone: "Telefon",
    email: "E-Mail",
    address: "Adresse",
    pending: "Unsere Kontaktdaten werden hier in Kürze veröffentlicht. Mit Schulkonto erreichen Sie uns über das Panel.",
    demoTitle: "Kostenlose Demo anfordern",
    demoCta: "Demo-E-Mail senden",
    follow: "Folgen Sie uns in sozialen Medien",
    soon: "bald",
    mapTitle: "Standortkarte",
  },
  footer: { rights: "" },
};

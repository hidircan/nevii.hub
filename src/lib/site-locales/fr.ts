import type { SiteContent } from "./types";

/** Contenu français du site public — traduction de la source turque. */
export const frContent: SiteContent = {
  locale: "fr",
  meta: {
    title: "NeviiHub — Plateforme de gestion pour écoles de musique",
    description:
      "Planning, présence, rattrapages, contrats et recouvrement — avec portails enseignants et parents.",
  },
  skip: "Aller au contenu",
  header: { login: "Se connecter", languageLabel: "Langue" },
  nav: [
    { label: "Accueil", href: "#ust" },
    { label: "À propos", href: "#hakkimizda" },
    { label: "Fonctions", href: "#ozellikler" },
    { label: "Formules", href: "#fiyatlandirma" },
    { label: "Acheter", href: "#satin-alma" },
    { label: "Essai gratuit", href: "/deneme" },
    { label: "Références", href: "#referanslar" },
    { label: "Contact", href: "#iletisim" },
  ],
  hero: {
    headline: "Toute votre école de musique sur une seule plateforme",
    subline:
      "Planning, présence, rattrapages, contrats et recouvrement — avec portails enseignants et parents. Dédié, multi-sites et sécurisé.",
    login: "Se connecter",
    trial: "Essai gratuit de 30 jours",
    tour: "Découvrir la plateforme →",
  },
  about: {
    title: "Conçu pour le quotidien de votre école",
    description:
      "NeviiHub réunit tout — du planning aux présences, des contrats au recouvrement — au même endroit. Chaque école ne voit que ses données, chaque rôle uniquement ce qu'il est autorisé à voir.",
  },
  features: {
    title: "Tout le travail de votre école, sur une plateforme",
    description: "Un écran dédié pour chaque processus — de la planification au recouvrement.",
  },
  groups: [
    {
      title: "Planification des cours",
      description: "Tout l'emploi du temps hebdomadaire est construit et géré sur un seul écran.",
      points: [
        "Vue hebdomadaire par site, enseignant et studio",
        "Déplacement et prolongation des cours par glisser-déposer",
        "Cours récurrents et planification groupée",
        "Placement sans conflit avec capacités et instruments des studios",
      ],
    },
    {
      title: "Présences & rattrapages",
      description: "Le suivi des présences et les rattrapages suivent des règles fixes.",
      points: [
        "Saisie rapide : Présent / Traité / Rattrapage",
        "Règles automatiques de crédit, délai et quota",
        "Suggestions de créneaux et centre de rattrapage",
        "Rapports de présence par élève et par période",
      ],
    },
    {
      title: "Dossiers élèves & enseignants",
      description: "Les personnes de votre école restent organisées et recherchables.",
      points: [
        "Dossiers élèves : site, instrument, enseignant, formule et contrat",
        "Filtres avancés, tri et archivage",
        "Fiches enseignants : matières, charge et coordonnées",
        "Définition des instruments et du personnel",
      ],
    },
    {
      title: "Suivi pédagogique",
      description: "La progression est suivie cours par cours.",
      points: [
        "Suivi du programme et des notions",
        "Devoirs et rapports de devoirs",
        "Cours d'essai enregistrés et suivis",
        "Évaluations périodiques et retours",
      ],
    },
    {
      title: "Paiements & finances",
      description: "La trésorerie reste liée aux cours.",
      points: [
        "Échéanciers avec suivi des échéances et retards",
        "Reçus imprimables et historique des paiements",
        "Calcul et suivi des rémunérations d'enseignants",
        "Règles tarifaires, formules et synthèse financière",
      ],
    },
    {
      title: "Contrats & documents",
      description: "Les documents officiels sont produits en un seul centre.",
      points: [
        "Contrat d'inscription, notice KVKK et consentement photo/vidéo",
        "Modèles de documents propres à l'école",
        "Relevés élèves et relevés de paiement",
        "Éditions officielles imprimables",
      ],
    },
    {
      title: "Communication & annonces",
      description: "La communication interne et externe reste tracée.",
      points: [
        "Annonces collectives et notifications",
        "Centre de communication et historique des messages",
        "Suivi CRM avec prospects et entretiens",
        "Messagerie interne du personnel",
      ],
    },
    {
      title: "Installation & gestion",
      description: "La structure et le quotidien de votre école, gérés.",
      points: [
        "Installation guidée : sites, studios, formules et utilisateurs",
        "Import groupé des dossiers existants",
        "Listes de tâches et affectations",
        "Journal d'audit : qui-a-fait-quoi-quand",
      ],
    },
    {
      title: "Assistance IA",
      description: "Une aide intelligente pour les tâches répétitives.",
      points: [
        "Assistant d'école en langage naturel",
        "Résumés quotidiens et périodiques automatiques",
        "Réponses contextuelles issues de l'historique",
      ],
    },
  ],
  platform: { title: "Trois portails, une plateforme", description: "Chacun se concentre sur son travail ; les données restent au même endroit." },
  surfaces: [
    {
      title: "Panneau de gestion",
      description: "L'écran principal où direction et bureau gèrent toutes les opérations.",
      points: [
        "Résumé du jour : cours, présences et rattrapages en attente, impayés",
        "Planning, présences, centre de rattrapage, dossiers élèves et enseignants",
        "Contrats, documents, paiements, rémunérations et synthèse financière",
        "Gestion centrale des sites, studios, formules, programmes et rôles",
        "Traçabilité complète : annonces, notifications, communication et audit",
      ],
    },
    {
      title: "Portail enseignant",
      description: "Les enseignants se concentrent sur leurs cours et leurs élèves.",
      points: [
        "Emploi du temps personnel avec salles",
        "Saisie des présences et suivi des cours",
        "Élèves, devoirs, programmes et évaluations",
        "Déclaration de disponibilités et consultation des rémunérations",
        "Supports de cours, tâches et retours",
      ],
    },
    {
      title: "Portail parents & élèves",
      description: "Familles et élèves accèdent à leurs informations de partout.",
      points: [
        "Emploi du temps, assiduité et rattrapages",
        "Devoirs, progression et évaluations",
        "Paiements, contrats et documents téléchargeables",
        "Résultats d'évaluations et annonces de l'école",
        "Chacun ne voit que son dossier ; données isolées par école",
      ],
    },
  ],
  references: {
    title: "Références",
    empty: "Nos écoles de référence et réussites seront publiées ici prochainement.",
    story: "Lire l'histoire →",
  },
  pricing: {
    title: "Formules & tarifs",
    description: "Le même catalogue alimente aussi l'écran d'achat ; le montant affiché est revérifié à l'achat.",
  },
  pricingPlaceholder: {
    title: "Trouvons ensemble la formule adaptée à votre école",
    description:
      "Nous construisons une formule adaptée selon vos sites, vos élèves et vos modules. Contactez-nous pour les formules et tarifs actuels.",
    cta: "Nous contacter",
  },
  pricingChrome: {
    periodLabel: "Période de facturation",
    monthly: "Mensuel",
    yearly: "Annuel",
    perMonth: "mois",
    perYear: "an",
    yearlyNote: "Prélèvement annuel unique. Équivalent mensuel {equiv}.",
    savings: "{pct} % moins cher que le mensuel",
    sandboxZero: "Montant de test SANDBOX",
    customQuote: "Devis personnalisé",
    notApproved: "Cette formule n'a pas encore de prix validé ; l'achat réel est fermé.",
    unlimited: "Illimité",
    students: "élèves",
    users: "utilisateurs",
    branches: "sites",
    moreModules: "· {n} modules de plus",
    buy: "Acheter",
    quote: "Demander un devis",
    demoNote:
      "Catalogue de démonstration : les montants sont des prix d'exemple, pas des prix réels. Cette note disparaît avec le prix validé.",
    trialTeaser: "Indécis ? Essayez 30 jours gratuitement, sans carte bancaire.",
    trialCta: "Essai gratuit de 30 jours",
  },
  purchase: {
    title: "Comment acheter ?",
    description:
      "Chaque étape, du choix de la formule à la gestion de l'abonnement, est transparente ; vous voyez toujours le total avant de payer.",
    cta: "Voir les formules →",
  },
  mobileApp: {
    title: "NeviiHub dans votre poche",
    description: "Présences, devoirs et annonces sur votre téléphone. Les liens apparaîtront ici après la publication.",
    appStore: "Télécharger sur l'App Store",
    play: "Disponible sur Google Play",
    soon: "L'application mobile arrive bientôt dans les boutiques.",
    openInApp: "Ouvrir dans l'app",
    dismiss: "Fermer",
  },
  steps: [
    {
      title: "1. Examinez la formule",
      description: "Voyez la formule adaptée sous Formules & tarifs, avec options mensuelle/annuelle et prix hors TVA.",
    },
    {
      title: "2. Achetez ou demandez un devis",
      description: "Acheter affiche tous les modules et limites ; pour les besoins entreprises, contactez-nous via Devis.",
    },
    {
      title: "3. Validez le récapitulatif",
      description: "Montant, total TTC, date de renouvellement, prix après campagne et annulation sur un seul écran avant paiement.",
    },
    {
      title: "4. Paiement sécurisé",
      description: "Le paiement passe par une infrastructure sécurisée ; vos données bancaires n'atteignent jamais nos serveurs.",
    },
    {
      title: "5. Gérez l'abonnement",
      description: "Renouvellement, historique, carte et résiliation restent disponibles dans votre panneau d'école.",
    },
  ],
  media: {
    title: "Découvrez la plateforme",
    description: "De vrais écrans NeviiHub : du planning à la gestion des élèves.",
  },
  mediaItems: [],
  faq: { title: "Questions fréquentes", description: "Ce qu'on demande sur le produit, l'installation et l'achat." },
  faqItems: [
    {
      question: "Nos données sont-elles mélangées avec d'autres écoles ?",
      answer:
        "Non. Chaque enregistrement appartient à une seule école, et l'identité de l'école est résolue uniquement depuis la session ; elle ne peut pas être modifiée par une valeur fournie par l'utilisateur.",
    },
    {
      question: "Que voient enseignants et parents ?",
      answer:
        "Chaque rôle ne voit que son périmètre. Les enseignants voient leur planning et leurs élèves ; parents/élèves uniquement leur dossier.",
    },
    {
      question: "Comment sont produits contrats et documents KVKK ?",
      answer:
        "Vos modèles téléversés sont utilisés. Contrat d'inscription, notice KVKK et consentement photo/vidéo sont imprimés en une seule édition avec sections et signatures séparées.",
    },
    {
      question: "Est-ce utilisable sur mobile ?",
      answer: "Oui. Tous les portails sont conçus pour les navigateurs mobiles.",
    },
    {
      question: "Comment se passent l'installation et la migration ?",
      answer:
        "À l'installation, la structure de votre école (sites, studios, enseignants) est définie ensemble, et la migration suit votre calendrier. Détails : info@neviihub.com.",
    },
    {
      question: "Combien de sites et d'utilisateurs ?",
      answer:
        "Les limites dépendent de votre formule ; elles sont listées sous Formules & tarifs. Vous pouvez passer à une formule supérieure en grandissant.",
    },
    {
      question: "Comment acheter ?",
      answer:
        "Choisissez votre formule et cliquez Acheter pour voir tous les modules et limites, puis continuez vers le récapitulatif et le paiement sécurisé. Étapes sous Comment acheter.",
    },
    {
      question: "Les prix incluent-ils la TVA ?",
      answer:
        "Nos prix sont hors TVA avec mention +TVA. Le total TTC est clairement affiché dans le récapitulatif avant paiement.",
    },
    {
      question: "Y a-t-il une période d'essai ?",
      answer:
        "Oui, 30 jours gratuits. Inscrivez-vous via Essai gratuit et utilisez toutes les fonctions de votre formule pendant l'essai.",
    },
    {
      question: "Puis-je résilier à tout moment ?",
      answer:
        "Oui. Après résiliation, votre accès continue jusqu'à la fin de la période payée ; aucun renouvellement ensuite. Résiliation depuis votre panneau d'école.",
    },
    {
      question: "Quels moyens de paiement ?",
      answer:
        "Une infrastructure sécurisée de paiement par carte est en préparation. Options actuelles et conditions pilotes : info@neviihub.com.",
    },
  ],
  contact: {
    title: "Contact",
    description: "Déterminons ensemble l'installation et la formule adaptées à votre école.",
    phone: "Téléphone",
    email: "E-mail",
    address: "Adresse",
    pending: "Nos coordonnées seront publiées ici prochainement. Avec un compte école, contactez-nous depuis le panneau.",
    follow: "Suivez-nous sur les réseaux",
    soon: "bientôt",
    mapTitle: "Carte de localisation",
  },
  footer: { rights: "" },
};

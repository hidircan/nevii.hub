import type { SiteContent } from "./types";

/** Contenido español del sitio público — traducción de la fuente turca. */
export const esContent: SiteContent = {
  locale: "es",
  meta: {
    title: "NeviiHub — Plataforma de gestión para escuelas de música",
    description:
      "Horarios, asistencia, recuperaciones, contratos y cobros — con portales para docentes y familias.",
  },
  skip: "Saltar al contenido",
  header: { login: "Entrar", languageLabel: "Idioma", demo: "Solicitar una demo" },
  nav: [
    { label: "Inicio", href: "#ust" },
    { label: "Nosotros", href: "#hakkimizda" },
    { label: "Funciones", href: "#ozellikler" },
    { label: "Planes", href: "#fiyatlandirma" },
    { label: "Comprar", href: "#satin-alma" },
    { label: "Prueba gratis", href: "/deneme" },
    { label: "Referencias", href: "#referanslar" },
    { label: "Contacto", href: "#iletisim" },
  ],
  hero: {
    headline: "Toda tu escuela de música en una plataforma",
    subline:
      "Horarios, asistencia, recuperaciones, contratos y cobros — junto con portales para docentes y familias. Dedicado, multisede y seguro.",
    login: "Entrar",
    trial: "Prueba 30 días gratis",
    tour: "Descubre la plataforma →",
    highlights: [
      "Un solo panel para centros multisede",
      "Flujos KVKK + consentimiento de foto/vídeo",
      "Ningún mensaje sin aprobación",
      "Funciona también en el móvil",
    ],
  },
  about: {
    title: "Diseñado para el día a día de tu escuela",
    description:
      "NeviiHub reúne todo — de los horarios a la asistencia, de los contratos a los cobros — en un solo lugar. Cada escuela solo ve sus datos, y cada rol solo aquello para lo que está autorizado.",
  },
  features: {
    title: "Todo el trabajo de tu escuela, en una plataforma",
    description: "Una pantalla dedicada para cada proceso — de la planificación a los cobros.",
  },
  groups: [
    {
      title: "Planificación de clases",
      description: "Todo el calendario semanal se crea y gestiona en una sola pantalla.",
      points: [
        "Vista semanal por sede, docente y estudio",
        "Mover y alargar clases con arrastrar y soltar",
        "Clases recurrentes y planificación masiva",
        "Asignación sin choques con capacidad e instrumentos",
      ],
    },
    {
      title: "Asistencia y recuperaciones",
      description: "La asistencia y las recuperaciones siguen reglas fijas.",
      points: [
        "Registro rápido: Presente / Procesada / Recuperación",
        "Reglas automáticas de crédito, plazo y cupo",
        "Sugerencias de horarios y centro de recuperaciones",
        "Informes de asistencia por alumno y período",
      ],
    },
    {
      title: "Registros de alumnos y docentes",
      description: "Las personas de tu escuela, ordenadas y fáciles de encontrar.",
      points: [
        "Fichas de alumnos: sede, instrumento, docente, plan y contrato",
        "Filtros avanzados, orden y archivo",
        "Fichas de docentes: materias, carga y contacto",
        "Definición de instrumentos y personal",
      ],
    },
    {
      title: "Seguimiento del aprendizaje",
      description: "El progreso se sigue clase por clase.",
      points: [
        "Seguimiento del programa y los temas",
        "Tareas e informes de tareas",
        "Clases de prueba registradas y seguidas",
        "Evaluaciones periódicas y retroalimentación",
      ],
    },
    {
      title: "Pagos y finanzas",
      description: "El dinero de la escuela sigue ligado a las clases.",
      points: [
        "Planes de cuotas con vencimientos y mora",
        "Recibos imprimibles e historial de pagos",
        "Cálculo y seguimiento de pagos a docentes",
        "Reglas de tarifas, planes y resumen financiero",
      ],
    },
    {
      title: "Contratos y documentos",
      description: "La documentación oficial se produce en un solo centro.",
      points: [
        "Contrato de inscripción, aviso KVKK y consentimiento foto/vídeo",
        "Plantillas propias de la escuela",
        "Extractos de alumnos y de pagos",
        "Documentos oficiales imprimibles",
      ],
    },
    {
      title: "Comunicación y avisos",
      description: "La comunicación interna y externa queda registrada.",
      points: [
        "Avisos masivos y notificaciones",
        "Centro de comunicación e historial de mensajes",
        "CRM con prospectos y reuniones",
        "Mensajería interna del personal",
      ],
    },
    {
      title: "Configuración y gestión",
      description: "La estructura y el día a día de tu escuela, gestionados.",
      points: [
        "Configuración guiada: sedes, estudios, planes y usuarios",
        "Importación masiva de registros existentes",
        "Listas de tareas y asignaciones",
        "Auditoría: quién hizo qué y cuándo",
      ],
    },
    {
      title: "Ayuda con IA",
      description: "Ayuda inteligente para el trabajo repetitivo.",
      points: [
        "Asistente de la escuela en lenguaje natural",
        "Resúmenes diarios y periódicos automáticos",
        "Respuestas contextuales desde el historial",
      ],
    },
  ],
  platform: { title: "Tres portales, una plataforma", description: "Cada uno se concentra en su trabajo; los datos quedan en un lugar." },
  surfaces: [
    {
      title: "Panel de gestión",
      description: "La pantalla principal donde dirección y oficina gestionan todo.",
      points: [
        "Resumen del día: clases, asistencias y recuperaciones pendientes, mora",
        "Horarios, asistencia, recuperaciones, alumnos y docentes",
        "Contratos, documentos, pagos, pagos a docentes y finanzas",
        "Gestión central de sedes, estudios, planes, programas y roles",
        "Trazabilidad total: avisos, notificaciones, comunicación y auditoría",
      ],
    },
    {
      title: "Portal docente",
      description: "Los docentes se concentran en sus clases y alumnos.",
      points: [
        "Horario personal con aulas",
        "Registro de asistencia y estado de clases",
        "Alumnos, tareas, programas y evaluaciones",
        "Disponibilidad y consulta de pagos",
        "Materiales, tareas y retroalimentación",
      ],
    },
    {
      title: "Portal de familias y alumnos",
      description: "Familias y alumnos acceden a su información desde donde sea.",
      points: [
        "Horario, asistencia y recuperaciones",
        "Tareas, progreso del programa y evaluaciones",
        "Pagos, contratos y documentos descargables",
        "Resultados de evaluaciones y avisos",
        "Cada uno solo ve su ficha; datos aislados por escuela",
      ],
    },
  ],
  references: {
    title: "Referencias",
    empty: "Nuestras escuelas de referencia y casos de éxito se publicarán aquí pronto.",
    story: "Leer el caso →",
  },
  pricing: {
    title: "Planes y precios",
    description: "El mismo catálogo alimenta la pantalla de compra; el importe se verifica de nuevo al comprar.",
  },
  pricingPlaceholder: {
    title: "Encontremos juntos el plan ideal para tu escuela",
    description:
      "Creamos un plan a medida según tus sedes, alumnos y módulos. Contáctanos para planes y precios actuales.",
    cta: "Contáctanos",
  },
  pricingChrome: {
    periodLabel: "Período de facturación",
    monthly: "Mensual",
    yearly: "Anual",
    perMonth: "mes",
    perYear: "año",
    yearlyNote: "Un solo cargo anual. Equivalente mensual {equiv}.",
    savings: "{pct} % más barato que el pago mensual",
    sandboxZero: "Importe de prueba SANDBOX",
    customQuote: "Cotización personalizada",
    notApproved: "Este plan aún no tiene precio aprobado; la compra real está cerrada.",
    unlimited: "Ilimitado",
    students: "alumnos",
    users: "usuarios",
    branches: "sedes",
    moreModules: "· {n} módulos más",
    buy: "Comprar",
    quote: "Pedir cotización",
    demoNote:
      "Catálogo demo: los importes son precios de ejemplo, no precios reales. Esta nota desaparece con el precio aprobado.",
    trialTeaser: "¿Indeciso? Prueba 30 días gratis sin dar tu tarjeta.",
    trialCta: "Prueba 30 días gratis",
  },
  purchase: {
    title: "¿Cómo comprar?",
    description:
      "Cada paso, del plan a la suscripción, es transparente; siempre ves el total antes de pagar.",
    cta: "Ver planes →",
  },
  mobileApp: {
    title: "NeviiHub en tu bolsillo",
    description: "Asistencia, tareas y avisos en tu teléfono. Los enlaces aparecerán aquí cuando se publique.",
    appStore: "Descargar en App Store",
    play: "Disponible en Google Play",
    soon: "La aplicación móvil llegará pronto a las tiendas.",
    openInApp: "Abrir en la app",
    dismiss: "Cerrar",
  },
  steps: [
    {
      title: "1. Revisa el plan",
      description: "Ve el plan adecuado en Planes y precios, con opción mensual/anual y precio sin IVA.",
    },
    {
      title: "2. Compra o pide cotización",
      description: "Comprar muestra todos los módulos y límites; para empresas, contáctanos con Cotización.",
    },
    {
      title: "3. Confirma el resumen",
      description: "Importe, total con IVA, renovación, precio tras la campaña y cancelación en una pantalla antes de pagar.",
    },
    {
      title: "4. Pago seguro",
      description: "El pago pasa por infraestructura segura; los datos de tu tarjeta nunca llegan a nuestros servidores.",
    },
    {
      title: "5. Gestiona la suscripción",
      description: "Renovación, historial, tarjeta y cancelación siempre disponibles en tu panel.",
    },
  ],
  media: {
    title: "Conoce la plataforma",
    description: "Pantallas reales de NeviiHub: de los horarios a los alumnos.",
  },
  mediaItems: [],
  faq: { title: "Preguntas frecuentes", description: "Lo que preguntan sobre el producto, la instalación y la compra." },
  faqItems: [
    {
      question: "¿Se mezclan nuestros datos con otras escuelas?",
      answer:
        "No. Cada registro pertenece a una sola escuela y la identidad se resuelve solo desde la sesión; ningún valor del usuario puede cambiarla.",
    },
    {
      question: "¿Qué ven docentes y familias?",
      answer:
        "Cada rol solo ve su ámbito. Los docentes ven su horario y alumnos; las familias/alumnos solo su ficha.",
    },
    {
      question: "¿Cómo se producen los contratos y documentos KVKK?",
      answer:
        "Se usan tus plantillas. El contrato, el aviso KVKK y el consentimiento foto/vídeo se imprimen juntos, con secciones y firmas separadas.",
    },
    {
      question: "¿Funciona en móviles?",
      answer: "Sí. Todos los portales están diseñados para navegadores móviles.",
    },
    {
      question: "¿Cómo son la instalación y la migración?",
      answer:
        "Definimos juntos tu estructura (sedes, estudios, docentes) y la migración sigue tu calendario. Detalles: info@neviihub.com.",
    },
    {
      question: "¿Cuántas sedes y usuarios?",
      answer:
        "Los límites dependen del plan y están en Planes y precios. Puedes subir de plan al crecer.",
    },
    {
      question: "¿Cómo compro?",
      answer:
        "Elige tu plan y pulsa Comprar para ver módulos y límites, luego sigue al resumen y al pago seguro. Pasos en ¿Cómo comprar?",
    },
    {
      question: "¿Los precios incluyen IVA?",
      answer:
        "Nuestros precios son sin IVA, con mención +IVA. El total con IVA se muestra claro antes de pagar.",
    },
    {
      question: "¿Hay período de prueba?",
      answer:
        "Sí, 30 días gratis. Apúntate en Prueba gratis y usa todas las funciones de tu plan durante la prueba.",
    },
    {
      question: "¿Puedo cancelar cuando quiera?",
      answer:
        "Sí. Tras cancelar, tu acceso sigue hasta el fin del período pagado; luego no se renueva. Se cancela desde tu panel.",
    },
    {
      question: "¿Qué métodos de pago aceptan?",
      answer:
        "Se prepara infraestructura segura de pago con tarjeta. Opciones actuales y condiciones piloto: info@neviihub.com.",
    },
    {
      question: "¿Cómo puedo obtener una demostración?",
      answer:
        "Escriba a la dirección de correo de la sección de contacto; programaremos una breve demostración adaptada a su centro.",
    },
    {
      question: "¿Puedo importar mi lista actual de alumnos?",
      answer:
        "Sí. Los alumnos de su archivo CSV pueden importarse; los datos de matrícula y los primeros registros de cobro se conservan.",
    }
  ],
  contact: {
    title: "Contacto",
    description: "Definamos juntos la instalación y el plan ideales para tu escuela.",
    phone: "Teléfono",
    email: "Correo",
    address: "Dirección",
    pending: "Nuestros datos se publicarán aquí pronto. Con cuenta de escuela, contáctanos desde el panel.",
    demoTitle: "Solicite una demostración gratuita",
    demoCta: "Enviar correo de demo",
    follow: "Síguenos en redes sociales",
    soon: "pronto",
    mapTitle: "Mapa de ubicación",
  },
  footer: { rights: "" },
};

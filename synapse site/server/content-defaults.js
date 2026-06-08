// Snapshot dei contenuti iniziali del sito. Vengono inseriti in DB al primo avvio
// e possono poi essere modificati via pannello admin.
module.exports = {
  hero: {
    eyebrow: "SynapseBot Hub",
    title: "Bot Discord, siti web, hosting e identità visiva su misura",
    titleHighlight: "su misura",
    lead: "Il punto di riferimento per bot personalizzati, siti web professionali, hosting affidabile e supporto tecnico per il tuo progetto online.",
    startingPrice: "4,99€",
    ctaPrimary: { label: "Entra su Discord", href: "https://discord.gg/FU9WuQcqeB" },
    ctaSecondary: { label: "Vedi listino prodotti", href: "#listino-prodotti" },
  },
  about: {
    title: "Chi è Synapse",
    intro: "Synapse unisce sviluppo bot, siti web, hosting e design in un'unica esperienza semplice e intuitiva, con supporto H24 gratuito e progetti costruiti sulle tue esigenze.",
    features: [
      { icon: "rocket", text: "Bot dedicati, da Discord ai social" },
      { icon: "globe", text: "Siti web statici, professionali e avanzati" },
      { icon: "tag", text: "Prezzi chiari, listino ufficiale" },
      { icon: "briefcase", text: "Ogni progetto è realizzato su misura" },
    ],
    footer: "👑 Fondatore · 🧠 Co-Fondatore",
  },
  bot: {
    title: "Listino prezzi bot",
    intro: "Piani hosting bot — funzionalità e prezzi ufficiali.",
    plans: [
      {
        name: "Bot Basic",
        price: "4,99",
        badge: "",
        featured: false,
        features: [
          { text: "Nessun supporto embed", excluded: true },
          { text: "Fino a 5 comandi", excluded: false },
          { text: "Risposte semplici", excluded: false },
        ],
      },
      {
        name: "Bot Standard",
        price: "9,99",
        badge: "",
        featured: false,
        features: [
          { text: "Fino a 10 comandi", excluded: false },
          { text: "Embed personalizzati", excluded: false },
          { text: "Risposte con ticket", excluded: false },
        ],
      },
      {
        name: "Bot Advanced",
        price: "19,99",
        badge: "",
        featured: false,
        features: [
          { text: "Fino a 20 comandi", excluded: false },
          { text: "Embed avanzati e curati", excluded: false },
          { text: "Gestione ruoli + log canali", excluded: false },
        ],
      },
      {
        name: "Bot Pro",
        price: "29,99",
        badge: "Popolare",
        featured: true,
        features: [
          { text: "Fino a 30 comandi", excluded: false },
          { text: "Sistema ticket (base)", excluded: false },
          { text: "Moderazione automatica", excluded: false },
          { text: "Tutte le funzioni dei piani precedenti", excluded: false },
        ],
      },
      {
        name: "Bot Elite",
        price: "49,99",
        badge: "",
        featured: false,
        features: [
          { text: "Fino a 50 comandi (+5 extra)", excluded: false },
          { text: "Moderazione avanzata", excluded: false },
          { text: "15 emoji gratuite", excluded: false },
          { text: "Hosting incluso per 2 settimane", excluded: false },
          { text: "Tutte le funzioni dei piani precedenti", excluded: false },
        ],
      },
    ],
    emojiPack: {
      title: "Emoji pack",
      rows: [
        { quantity: "5 emoji", price: "1,99€" },
        { quantity: "10 emoji", price: "2,99€" },
        { quantity: "20 emoji", price: "4,99€" },
        { quantity: "30 emoji", price: "6,99€" },
        { quantity: "50 emoji", price: "8,99€" },
        { quantity: "Emoji illimitate", price: "11,99€" },
      ],
    },
  },
  hosting: {
    title: "Hosting Pro+ e tariffe",
    calloutTitle: "Hosting Pro+",
    calloutItems: [
      "1 settimana gratuita inclusa con il bot Pro+",
      "Hosting personale sempre compatibile",
    ],
    tariffsTitle: "Tariffe hosting",
    rows: [
      { duration: "1 settimana", price: "2,99€", note: "Poi 3,99€/settimana" },
      { duration: "2 settimane", price: "5,49€", note: "—" },
      { duration: "1 mese (4 settimane)", price: "9,99€", note: "—" },
      { duration: "2 mesi", price: "18,99€", note: "—" },
      { duration: "3 mesi", price: "26,99€", note: "+ 1 settimana gratuita" },
      { duration: "6 mesi", price: "49,99€", note: "—" },
      { duration: "1 anno", price: "69,99€", note: "Best deal" },
    ],
  },
  code: {
    title: "Accesso al codice sorgente",
    plans: [
      {
        name: "Accesso parziale (consultazione)",
        price: "14,99",
        badge: "",
        featured: false,
        features: [
          { text: "Visione funzioni specifiche", excluded: false },
          { text: "Porzioni di codice su richiesta", excluded: false },
          { text: "Nessun file completo", excluded: true },
        ],
      },
      {
        name: "Accesso completo",
        price: "34,99",
        badge: "Premium",
        featured: true,
        features: [
          { text: "Codice sorgente completo", excluded: false },
          { text: "Tutti i file .py", excluded: false },
          { text: "Struttura progetto, cartelle cogs/ e utils/", excluded: false },
          { text: "Documentazione minima", excluded: false },
        ],
      },
    ],
    legal: "❗ La rivendita o duplicazione del codice rimane vietata.",
  },
  notes: {
    title: "Note importanti",
    body: "Una volta confermati i comandi, non è possibile sostituirli. Grazie della comprensione.",
  },
  logos: {
    title: "Listino loghi Synapse",
    intro: "Scegli il piano più adatto e lascia che il tuo brand prenda vita.",
    plans: [
      {
        name: "Free",
        price: "0,00",
        badge: "",
        featured: false,
        features: [{ text: "Logo semplice solo con immagine e nome" }],
      },
      {
        name: "Basic",
        price: "0,79",
        badge: "",
        featured: false,
        features: [
          { text: "Logo semplice, pulito e veloce" },
          { text: "1 concept base" },
          { text: "Consegna rapida (entro 24h)" },
          { text: "Formato PNG" },
        ],
      },
      {
        name: "Standard",
        price: "1,99",
        badge: "",
        featured: false,
        features: [
          { text: "Logo con più dettagli e rifiniture" },
          { text: "2 concept diversi tra cui scegliere" },
          { text: "1 revisione gratuita" },
          { text: "File PNG + trasparente" },
        ],
      },
      {
        name: "Advanced",
        price: "3,49",
        badge: "",
        featured: false,
        features: [
          { text: "Design curato nei minimi particolari" },
          { text: "3 proposte creative" },
          { text: "2 revisioni gratuite" },
          { text: "Formati PNG + JPEG + trasparente" },
        ],
      },
      {
        name: "Pro",
        price: "4,49",
        badge: "",
        featured: false,
        features: [
          { text: "Logo professionale e versatile" },
          { text: "4 concept unici" },
          { text: "3 revisioni gratuite" },
          { text: "File ottimizzati per social e stampa" },
          { text: "Formati PNG, JPEG, SVG" },
        ],
      },
      {
        name: "Elite",
        price: "5,99",
        badge: "Top",
        featured: true,
        features: [
          { text: "Logo di alto livello, su misura per il brand" },
          { text: "5+ proposte originali" },
          { text: "Revisione illimitata" },
          { text: "Tutti i formati (PNG, JPEG, SVG, PDF)" },
          { text: "File sorgente incluso (.PSD)" },
          { text: "Supporto post-progetto" },
          { text: "Logo animato (rotazione su se stesso inclusa)" },
        ],
      },
    ],
  },

  websites: {
    title: "Siti web professionali",
    intro: "Oltre ai bot realizziamo siti web per attività locali, professionisti e brand che vogliono una presenza online chiara, moderna e ottimizzata per smartphone.",
    plans: [
      {
        name: "Pacchetto Iniziale — Sito Statico",
        price: "44,99",
        badge: "Entry",
        featured: false,
        tagline: "Soluzione semplice per essere online.",
        recommendedFor: "Attività molto piccole, negozi con poche informazioni, chi vuole solo essere online.",
        features: [
          { text: "1 pagina statica con nome attività, foto principale, orari e contatti" },
          { text: "Design semplice e ottimizzato per smartphone" },
          { text: "Nessun modulo di contatto" },
          { text: "Nessuna sezione servizi dettagliata" },
          { text: "Nessuna mappa Google, solo indirizzo testuale" },
        ],
      },
      {
        name: "Pacchetto Base — Sito Essenziale",
        price: "69,99",
        badge: "Base",
        featured: false,
        tagline: "Presenza online moderna e professionale.",
        recommendedFor: "Bar, estetiste, parrucchieri e piccoli negozi.",
        features: [
          { text: "1 pagina unica con presentazione attività, foto, orari e contatti" },
          { text: "Mappa Google" },
          { text: "Modulo di contatto semplice" },
          { text: "Design moderno e pulito" },
          { text: "Sito completamente ottimizzato per smartphone" },
        ],
      },
      {
        name: "Pacchetto Standard — Sito Professionale",
        price: "89,99",
        badge: "Consigliato",
        featured: true,
        tagline: "Sito più completo, strutturato e curato.",
        recommendedFor: "Ristoranti, pizzerie, palestre, meccanici e professionisti.",
        features: [
          { text: "2 pagine separate: Home e Contatti" },
          { text: "Sezione servizi o prodotti" },
          { text: "Modulo contatto avanzato" },
          { text: "Ottimizzazione base per Google" },
          { text: "Design personalizzato e responsive" },
        ],
      },
      {
        name: "Pacchetto Premium — Sito Avanzato",
        price: "139,99",
        badge: "Premium",
        featured: false,
        tagline: "Sito completo, ricco di contenuti e altamente professionale.",
        recommendedFor: "Ristoranti, hotel, centri estetici e attività strutturate.",
        features: [
          { text: "4–6 pagine: Home, Chi Siamo, Servizi, Galleria, Contatti, ecc." },
          { text: "Galleria fotografica professionale" },
          { text: "Sezione recensioni" },
          { text: "Modulo contatto avanzato e SEO base" },
          { text: "Design premium personalizzato, integrazione social e caricamento menù/listino se richiesto" },
        ],
      },
    ],
    extrasTitle: "Servizi extra opzionali",
    extras: [
      { name: "Pagina aggiuntiva", price: "19,99€", note: "Pagina dedicata a Menù, Servizi, Galleria, Listino o contenuti extra." },
      { name: "Menù digitale", price: "14,99€", note: "Pagina menù con categorie, prezzi, foto e QR code." },
      { name: "Ottimizzazione Google Maps", price: "14,99€", note: "Migliora la visibilità del locale su Google." },
      { name: "Traduzione sito", price: "19,99€", note: "Versione del sito in un’altra lingua." },
      { name: "Aggiornamenti mensili", price: "9,99€/mese", note: "Modifiche, nuove foto e aggiornamenti. Disponibile anche prezzo singolo su richiesta." },
      { name: "Gestione hosting", price: "Variabile", note: "Mantiene il sito online e aggiornato." },
    ],
  },
  customServices: {
    title: "Altri servizi su richiesta",
    intro: "Dal pannello admin puoi aggiungere nuovi servizi senza modificare quelli già esistenti. Ogni scheda può avere titolo, descrizione, prezzo, badge e punti inclusi.",
    services: [
      {
        title: "Consulenza progetto",
        description: "Analisi rapida delle esigenze e proposta tecnica per bot, sito web o identità digitale.",
        price: "Su richiesta",
        badge: "Personalizzato",
        features: ["Valutazione obiettivi", "Stima tempi e costi", "Consiglio sul pacchetto più adatto"],
      },
    ],
  },
  reviews: {
    title: "Clienti soddisfatti",
    intro: "Recensioni pubbliche e simulazioni live mostrano il livello di cura del servizio: supporto rapido, consegne chiare e community soddisfatta.",
    ratingText: "Valutazione media elevata",
    items: [
      { name: "Lorenzo Bianchi", rating: 5, text: "Servizio veloce, chiaro e molto professionale." },
      { name: "Marta Ricci", rating: 5, text: "Bot consegnato come richiesto e supporto sempre disponibile." },
      { name: "Gabriele Esposito", rating: 5, text: "Sito semplice da consultare e perfetto da smartphone." },
      { name: "Sara Morelli", rating: 5, text: "Ottima esperienza, prezzi trasparenti e assistenza precisa." },
    ],
  },
  promotions: {
    title: "Promozioni",
    body: "Su tutti i prodotti puoi risparmiare fino al 3% con le offerte stagionali attive sul server. Più spendi, più risparmi: con 2 loghi fino all'8% sui piani sotto 4€, fino al 13% sugli altri; acquistando l'intera gamma loghi fino al 48% di sconto sul bundle.",
    footer: "Dettagli e date aggiornate nel canale Discord.",
  },
};

module.exports.defaultStatus = {
  server: "online", // online | maintenance | degraded | offline
  service: "active", // active | maintenance | suspended
  message: "Tutti i servizi sono operativi.",
  updatedAt: null,
};

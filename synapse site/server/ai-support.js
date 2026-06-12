// Assistente AI Synapse per la chat supporto.
// La chiave NON va scritta nel codice: usare ANTHROPIC_API_KEY in ambiente.

function normalizeText(value) {
  return String(value == null ? "" : value).trim();
}

function isHumanRequest(text) {
  const value = normalizeText(text).toLowerCase();
  return /\b(parlare|parla|contattare|contatta|chiamare|chiama|voglio|vorrei|desidero|mi serve|richiedo)\b[\s\S]{0,80}\b(umano|admin|amministratore|staff|operatore|persona|supporto umano)\b/.test(value)
    || /\b(passami|passa|chiama|avvisa)\b[\s\S]{0,60}\b(admin|staff|operatore|umano)\b/.test(value)
    || /\b(apri|manda|inoltra)\b[\s\S]{0,80}\b(ticket|richiesta)\b[\s\S]{0,80}\b(admin|staff|umano)\b/.test(value);
}

function isClearlyOffTopic(text) {
  const value = normalizeText(text).toLowerCase();
  if (!value) return false;
  // Blocca domande matematiche/trivia palesemente non collegate al sito.
  if (/\b(quanto\s+fa|calcola|risolvi)\b[\s\S]{0,40}\d+\s*(\+|pi[uù]|-|meno|x|\*|per|\/|diviso)\s*\d+/.test(value)) return true;
  if (/^\s*\d+\s*(\+|pi[uù]|-|meno|x|\*|per|\/|diviso)\s*\d+\s*\??\s*$/.test(value)) return true;
  return false;
}

function compactList(items, mapper) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 18).map(mapper).filter(Boolean);
}

function buildSiteContext(content, status) {
  content = content || {};
  status = status || {};
  const lines = [];
  lines.push("Nome progetto: Synapse.");
  lines.push("Synapse vende e presenta servizi digitali: bot Discord, script FiveM, script Roblox, hosting, loghi, accesso al codice sorgente, siti web professionali, servizi custom e supporto tramite ticket/chat.");
  lines.push("Regola rimborsi: dopo conferma/inizio lavorazione non è previsto rimborso automatico; viene offerta assistenza continuativa per avvicinare il prodotto alla richiesta iniziale.");
  lines.push("Metodo pagamento disponibile: esclusivamente Revolut tramite checkout Synapse e link ufficiale https://revolut.me/angelo2tqp. Synapse non acquisisce dati carta.");
  if (status.server || status.service || status.message) {
    lines.push("Stato pubblico: server=" + (status.server || "n/d") + ", servizio=" + (status.service || "n/d") + (status.message ? ", messaggio=" + status.message : ""));
  }
  compactList(content.bot && content.bot.plans, function (p) {
    return "Bot Discord - " + (p.name || "Piano") + ": " + (p.price || "prezzo n/d") + "€; " + compactList(p.features, function (f) { return f && f.text; }).join(", ");
  }).forEach(function (x) { lines.push(x); });
  compactList(content.hosting && content.hosting.rows, function (r) {
    return "Hosting - " + (r.duration || "durata") + ": " + (r.price || "prezzo n/d") + "; " + (r.note || "");
  }).forEach(function (x) { lines.push(x); });
  compactList(content.fivemScripts && content.fivemScripts.plans, function (p) {
    return "Script FiveM - " + (p.name || "Piano") + ": " + (p.price || "prezzo n/d") + "; " + compactList(p.features, function (f) { return f && f.text; }).join(", ");
  }).forEach(function (x) { lines.push(x); });
  compactList(content.robloxScripts && content.robloxScripts.plans, function (p) {
    return "Script Roblox - " + (p.name || "Piano") + ": " + (p.price || "prezzo n/d") + "; " + compactList(p.features, function (f) { return f && f.text; }).join(", ");
  }).forEach(function (x) { lines.push(x); });
  compactList(content.code && content.code.plans, function (p) {
    return "Codice sorgente - " + (p.name || "Piano") + ": " + (p.price || "prezzo n/d") + "€; " + compactList(p.features, function (f) { return f && f.text; }).join(", ");
  }).forEach(function (x) { lines.push(x); });
  compactList(content.logos && content.logos.plans, function (p) {
    return "Loghi - " + (p.name || "Piano") + ": " + (p.price || "prezzo n/d") + "€; " + compactList(p.features, function (f) { return f && f.text; }).join(", ");
  }).forEach(function (x) { lines.push(x); });
  compactList(content.websites && content.websites.plans, function (p) {
    return "Siti web - " + (p.name || "Piano") + ": " + (p.price || "prezzo n/d") + "€; " + (p.tagline || "") + "; " + compactList(p.features, function (f) { return f && f.text; }).join(", ");
  }).forEach(function (x) { lines.push(x); });
  compactList(content.customServices && content.customServices.items, function (p) {
    return "Servizio custom - " + (p.title || "Servizio") + ": " + (p.price || "prezzo n/d") + "; " + (p.description || "");
  }).forEach(function (x) { lines.push(x); });
  if (content.notes && content.notes.body) lines.push("Note operative: " + content.notes.body);
  if (content.promotions && content.promotions.body) lines.push("Promozioni: " + content.promotions.body);
  return lines.join("\n").slice(0, 14000);
}

function formatHistory(messages) {
  return (messages || [])
    .slice(-12)
    .filter(function (m) { return m && m.content && m.senderRole !== "bot"; })
    .map(function (m) {
      return {
        role: m.senderRole === "admin" ? "assistant" : "user",
        content: String(m.content).slice(0, 1600),
      };
    });
}

async function callAnthropic({ apiKey, model, message, history, siteContext }) {
  if (typeof fetch !== "function") {
    throw new Error("fetch non disponibile nella versione Node corrente");
  }
  const system = [
    "Sei l'assistente AI ufficiale di Synapse, in italiano.",
    "Rispondi solo a domande inerenti al sito Synapse, ai prodotti, prezzi, ticket, chat, privacy, rimborsi, tempi, consegna, Discord e supporto.",
    "Per qualunque domanda non inerente al sito devi rispondere esattamente: Non posso rispondere a questa domanda.",
    "Non inventare prezzi o condizioni: usa solo il contesto fornito. Se il dato manca, dillo e chiedi dettagli oppure suggerisci supporto umano.",
    "Se l'utente chiede espressamente un umano/admin/staff, oppure se serve una decisione commerciale, una trattativa, un pagamento, un intervento manuale, un accesso privato o non puoi risolvere, inizia la risposta con [ESCALATE].",
    "Quando spieghi come chiamare un umano, dì chiaramente: scrivi 'voglio parlare con un umano'.",
    "Sii breve, professionale, pratico. Massimo 8 righe.",
    "Contesto sito Synapse:\n" + siteContext,
  ].join("\n\n");

  const body = {
    model: model || "claude-3-5-haiku-20241022",
    max_tokens: 520,
    temperature: 0.2,
    system,
    messages: formatHistory(history).concat([{ role: "user", content: message }]),
  };

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(function () { return null; });
  if (!response.ok) {
    const errMsg = payload && payload.error && payload.error.message ? payload.error.message : "Errore API AI";
    throw new Error(errMsg);
  }
  const text = payload && Array.isArray(payload.content)
    ? payload.content.map(function (p) { return p && p.type === "text" ? p.text : ""; }).join("\n").trim()
    : "";
  if (!text) throw new Error("Risposta AI vuota");
  return text;
}

async function answerSupportQuestion({ apiKey, model, message, history, content, status }) {
  const clean = normalizeText(message);
  if (!clean) return { text: "Scrivimi la tua richiesta e ti aiuto sul servizio Synapse.", escalate: false };
  if (isHumanRequest(clean)) {
    return {
      text: "Ho chiamato un admin. Uno staffer vedrà la richiesta nel pannello e continuerà da qui appena possibile.",
      escalate: true,
    };
  }
  if (isClearlyOffTopic(clean)) {
    return { text: "Non posso rispondere a questa domanda.", escalate: false };
  }
  if (!apiKey) {
    return {
      text: "L'assistente AI non è configurato in questo momento. Ho chiamato un admin per continuare la richiesta.",
      escalate: true,
    };
  }

  const raw = await callAnthropic({
    apiKey,
    model,
    message: clean,
    history,
    siteContext: buildSiteContext(content, status),
  });
  const escalate = /^\s*\[ESCALATE\]/i.test(raw);
  const text = raw.replace(/^\s*\[ESCALATE\]\s*:?\s*/i, "").trim() || "Ho chiamato un admin. Uno staffer continuerà la richiesta appena possibile.";
  return { text, escalate };
}

module.exports = {
  answerSupportQuestion,
  buildSiteContext,
  isHumanRequest,
  isClearlyOffTopic,
};

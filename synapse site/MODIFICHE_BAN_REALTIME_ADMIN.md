# Fix ban, IP, realtime e pannello admin

Modifiche applicate:

- Schermata bannato/sospeso migliorata con icona, titolo chiaro, messaggio e nota operativa.
- Rendering immediato della schermata di blocco quando arriva un evento realtime di moderazione.
- Gestione errori `blocked` anche durante login/sessione API.
- Rilevamento IP migliorato per Render/proxy: priorità a `cf-connecting-ip`, `true-client-ip`, `x-real-ip`, `x-forwarded-for`, `forwarded`, poi fallback locali.
- Presenza live più leggibile con statistiche, connessioni attive, account collegati allo stesso IP e IP bannati attivi.
- Nuova gestione IP bannati anche offline: un IP può essere sbloccato anche quando l'utente bannato non è più presente in live.
- Riattivazione account migliorata: l'admin può scegliere se sbloccare anche gli IP collegati.
- Nuova tab “Moderazione” nel pannello admin per sospendere, bannare, riattivare utenti e sbloccare IP.
- Realtime supporto corretto: le risposte admin alle segnalazioni e gli aggiornamenti ticket arrivano anche all'utente senza refresh manuale.
- Header/navbar corretto: dopo il login non va più a capo e non sballa la parte superiore; sotto 1180px passa al menu mobile.
- UI admin migliorata: layout più largo, card statistiche, sezioni più leggibili, stati account evidenziati.

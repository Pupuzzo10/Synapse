const { createApp } = require("./app");
const adminOps = require("./admin-ops");

const { app, authDb, config, mailer } = createApp();

adminOps
  .seedAdmin(authDb, config)
  .then(function (result) {
    if (result) {
      console.log(
        "[auth] Admin " + (result.created ? "creato" : "aggiornato") + " con email " + config.adminEmail
      );
    } else {
      console.log("[auth] Nessun ADMIN_EMAIL/ADMIN_PASSWORD configurato: seed admin saltato.");
    }
  })
  .catch(function (error) {
    console.error("[auth] Seed admin fallito:", error.message);
  });

app.listen(config.port, function () {
  console.log(`[server] Synapse in ascolto su ${config.baseUrl}`);

  mailer
    .verifyConnection()
    .then(function (result) {
      if (result.simulated) {
        console.log(
          "[auth][email] Provider email non configurato: in sviluppo le email sono simulate e i link di verifica vengono scritti nei log."
        );
      } else if (result.mode === "resend") {
        console.log("[auth][email] Resend API configurata con successo.");
      } else {
        console.log("[auth][email] Provider email verificato con successo.");
      }
    })
    .catch(function (error) {
      console.error("[auth][email] Verifica provider email fallita:", error.message);
    });
});

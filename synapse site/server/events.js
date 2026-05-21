// Broadcaster Server-Sent Events: tiene aperte le risposte dei client
// e permette di pubblicare aggiornamenti (content/status) a tutti.
function createBroadcaster() {
  const clients = new Set();

  // userId puo' essere null (visitatore non loggato) o un id numerico.
  function addClient(res, userId, opts) {
    const client = { res, userId: userId || null, isAdmin: !!(opts && opts.isAdmin) };
    clients.add(client);
    res.on("close", function () {
      clients.delete(client);
    });
    return client;
  }

  function hasAdminOnline() {
    let found = false;
    clients.forEach(function (c) { if (c.isAdmin) found = true; });
    return found;
  }

  // opts.userIds (array): se presente, evento privato consegnato solo a quegli utenti.
  // Se assente, evento pubblico consegnato a tutti.
  function broadcast(eventName, payload, opts) {
    const data = "event: " + eventName + "\n" + "data: " + JSON.stringify(payload) + "\n\n";
    const audience = opts && Array.isArray(opts.userIds) ? opts.userIds : null;
    clients.forEach(function (client) {
      if (audience) {
        if (client.userId == null || audience.indexOf(client.userId) === -1) return;
      }
      try {
        client.res.write(data);
      } catch (_e) {
        clients.delete(client);
      }
    });
  }

  function size() { return clients.size; }

  return { addClient, broadcast, size, hasAdminOnline };
}

module.exports = { createBroadcaster };

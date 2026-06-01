// Broadcaster Server-Sent Events: tiene aperte le risposte dei client
// e permette di pubblicare aggiornamenti (content/status/support) a tutti.
function createBroadcaster() {
  const clients = new Set();

  function safeWrite(client, eventName, payload) {
    const data = "event: " + eventName + "\n" + "data: " + JSON.stringify(payload) + "\n\n";
    try {
      client.res.write(data);
      return true;
    } catch (_e) {
      clients.delete(client);
      return false;
    }
  }

  function publicClient(client) {
    return {
      id: client.id,
      userId: client.userId,
      username: client.username || (client.isAdmin ? "Admin" : "Visitatore"),
      email: client.email || null,
      isAdmin: !!client.isAdmin,
      ip: client.ip || null,
      page: client.page || "Sito",
      lastEvent: client.lastEvent || "Connessione attiva",
      connectedAt: client.connectedAt,
      lastSeenAt: client.lastSeenAt,
    };
  }

  function presenceSnapshot() {
    return {
      online: hasAdminOnline(),
      total: clients.size,
      clients: Array.from(clients).map(publicClient),
    };
  }

  function broadcastPresence() {
    const snapshot = presenceSnapshot();
    clients.forEach(function (client) {
      if (client.isAdmin) safeWrite(client, "presence", snapshot);
    });
  }

  // userId puo' essere null (visitatore non loggato) o un id numerico.
  function addClient(res, userId, opts) {
    opts = opts || {};
    const now = new Date().toISOString();
    const client = {
      id: Math.random().toString(16).slice(2) + Date.now().toString(16),
      res,
      userId: userId || null,
      sessionId: opts.sessionId || null,
      username: opts.username || null,
      email: opts.email || null,
      isAdmin: !!opts.isAdmin,
      ip: opts.ip || null,
      page: opts.page || "Sito",
      lastEvent: "Connessione SSE",
      connectedAt: now,
      lastSeenAt: now,
    };
    clients.add(client);
    res.on("close", function () {
      clients.delete(client);
      broadcastPresence();
    });
    broadcastPresence();
    return client;
  }

  function updateClient(client, patch) {
    if (!client || !clients.has(client)) return null;
    patch = patch || {};
    if (typeof patch.page === "string" && patch.page.trim()) client.page = patch.page.trim().slice(0, 120);
    if (typeof patch.lastEvent === "string" && patch.lastEvent.trim()) client.lastEvent = patch.lastEvent.trim().slice(0, 160);
    client.lastSeenAt = new Date().toISOString();
    broadcastPresence();
    return publicClient(client);
  }

  function updateClientByUserId(userId, patch) {
    let updated = null;
    clients.forEach(function (client) {
      if (client.userId === userId) updated = updateClient(client, patch);
    });
    return updated;
  }

  function updateClientBySessionId(sessionId, patch) {
    let updated = null;
    clients.forEach(function (client) {
      if (client.sessionId === sessionId) updated = updateClient(client, patch);
    });
    return updated;
  }

  function hasAdminOnline() {
    let found = false;
    clients.forEach(function (c) { if (c.isAdmin) found = true; });
    return found;
  }

  // opts.userIds (array): evento privato consegnato solo a quegli utenti.
  // opts.ips (array): evento consegnato solo alle connessioni con quegli IP.
  // Se assenti, evento pubblico consegnato a tutti.
  function broadcast(eventName, payload, opts) {
    const audience = opts && Array.isArray(opts.userIds) ? opts.userIds : null;
    const ipAudience = opts && Array.isArray(opts.ips) ? opts.ips : null;
    clients.forEach(function (client) {
      if (audience) {
        if (client.userId == null || audience.indexOf(client.userId) === -1) return;
      }
      if (ipAudience) {
        if (!client.ip || ipAudience.indexOf(client.ip) === -1) return;
      }
      safeWrite(client, eventName, payload);
    });
  }

  function size() { return clients.size; }

  return {
    addClient,
    updateClient,
    updateClientByUserId,
    updateClientBySessionId,
    broadcast,
    broadcastPresence,
    presenceSnapshot,
    size,
    hasAdminOnline,
  };
}

module.exports = { createBroadcaster };

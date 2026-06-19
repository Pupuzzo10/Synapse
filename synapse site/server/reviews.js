const SETTING_KEY = "order_reviews_v1";

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value, max) {
  return String(value == null ? "" : value).trim().replace(/\s+/g, " ").slice(0, max || 300);
}

function loadStore(authDb) {
  const raw = authDb.getSetting(SETTING_KEY);
  if (!raw || typeof raw !== "object") return { version: 1, reviews: [] };
  return { version: 1, reviews: Array.isArray(raw.reviews) ? raw.reviews : [] };
}

function saveStore(authDb, store) {
  authDb.setSetting(SETTING_KEY, { version: 1, reviews: Array.isArray(store.reviews) ? store.reviews : [] });
}

function publicReview(entry) {
  return {
    name: entry.displayName,
    rating: entry.rating,
    text: entry.text,
    productName: entry.productName || null,
    createdAt: entry.createdAt,
    verifiedOrder: true,
  };
}

function orderCanReceiveReview(order) {
  return order && order.id && order.status === "completed";
}

function createReviews(authDb) {
  function listPublicReviews() {
    const store = loadStore(authDb);
    return store.reviews
      .filter(function (entry) { return entry && !entry.removedAt; })
      .sort(function (a, b) { return String(b.createdAt || "").localeCompare(String(a.createdAt || "")); })
      .map(publicReview);
  }

  function hasReviewForOrder(orderId) {
    const store = loadStore(authDb);
    const id = Number(orderId);
    return store.reviews.some(function (entry) { return entry && !entry.removedAt && Number(entry.orderId) === id; });
  }

  function pendingReviewForUser(orders) {
    const completed = (orders || [])
      .filter(orderCanReceiveReview)
      .sort(function (a, b) { return String(b.completedAt || b.updatedAt || "").localeCompare(String(a.completedAt || a.updatedAt || "")); });
    for (let i = 0; i < completed.length; i += 1) {
      if (!hasReviewForOrder(completed[i].id)) return completed[i];
    }
    return null;
  }

  function createReview(order, input, user) {
    if (!orderCanReceiveReview(order)) throw new Error("Puoi recensire solo un ordine completato dallo staff.");
    if (!user || order.userId !== user.id) throw new Error("Non puoi recensire questo ordine.");
    const store = loadStore(authDb);
    if (store.reviews.some(function (entry) { return entry && !entry.removedAt && Number(entry.orderId) === Number(order.id); })) {
      throw new Error("Hai gia inviato una recensione per questo ordine.");
    }

    const displayName = normalizeText(input && input.displayName, 80);
    const discordName = normalizeText(input && input.discordName, 80);
    const text = normalizeText(input && input.text, 700);
    const rating = Math.max(1, Math.min(5, Math.round(Number(input && input.rating) || 0)));

    if (displayName.length < 2) throw new Error("Inserisci il nome da mostrare nella recensione.");
    if (!rating) throw new Error("Seleziona una valutazione da 1 a 5 stelle.");
    if (text.length < 10) throw new Error("Scrivi una descrizione di almeno 10 caratteri.");

    const entry = {
      orderId: order.id,
      userId: user.id,
      userEmail: user.email || null,
      displayName,
      discordName: discordName || null,
      rating,
      text,
      productCategory: order.productCategory || null,
      productName: order.productName || null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    store.reviews.unshift(entry);
    saveStore(authDb, store);
    return publicReview(entry);
  }

  return {
    listPublicReviews,
    pendingReviewForUser,
    createReview,
    hasReviewForOrder,
  };
}

module.exports = { createReviews };

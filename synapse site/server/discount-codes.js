const crypto = require("crypto");

const SETTING_KEY = "discount_codes_v1";

function nowIso() {
  return new Date().toISOString();
}

function id() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return crypto.randomBytes(16).toString("hex");
}

function normalizeText(value, max) {
  return String(value == null ? "" : value).trim().replace(/\s+/g, " ").slice(0, max || 180);
}

function normalizeCode(value) {
  return normalizeText(value, 80).toUpperCase();
}

function normalizeProductKey(category, name) {
  return [normalizeText(category, 120).toLowerCase(), normalizeText(name, 180).toLowerCase()].join("::");
}

function parsePercent(value) {
  const percent = Number(String(value == null ? "" : value).replace(",", "."));
  if (!Number.isFinite(percent)) return null;
  const rounded = Math.round(percent * 100) / 100;
  if (rounded <= 0 || rounded > 100) return null;
  return rounded;
}

function moneyNumberFromLabel(label) {
  const text = String(label || "").trim();
  const matches = text.match(/\d+(?:[.,]\d{1,2})?/g) || [];
  if (matches.length !== 1) return null;
  const amount = Number(matches[0].replace(",", "."));
  if (!Number.isFinite(amount)) return null;
  return amount;
}

function formatEuro(amount) {
  const safe = Math.max(0, Math.round(Number(amount || 0) * 100) / 100);
  return "€" + safe.toFixed(2).replace(".", ",");
}

function discountPriceLabel(originalPriceLabel, percent) {
  const amount = moneyNumberFromLabel(originalPriceLabel);
  if (amount == null) return "Sconto " + percent + "% su " + normalizeText(originalPriceLabel, 80);
  return formatEuro(amount * (1 - percent / 100));
}

function loadStore(authDb) {
  const raw = authDb.getSetting(SETTING_KEY);
  if (!raw || typeof raw !== "object") return { version: 1, codes: [] };
  const codes = Array.isArray(raw.codes) ? raw.codes : [];
  return { version: 1, codes };
}

function saveStore(authDb, store) {
  authDb.setSetting(SETTING_KEY, { version: 1, codes: Array.isArray(store.codes) ? store.codes : [] });
}

function statusOf(code) {
  if (code.removedAt) return "removed";
  if (code.usedAt || code.completedOrderId) return "used";
  if (code.attachedOrderId) return "attached";
  if (code.reservedByUserId) return "reserved";
  return "available";
}

function serialize(code) {
  const status = statusOf(code || {});
  return {
    id: code.id,
    code: code.code,
    percent: code.percent,
    productCategory: code.productCategory,
    productName: code.productName,
    productKey: code.productKey,
    status,
    createdAt: code.createdAt,
    createdBy: code.createdBy || null,
    createdByEmail: code.createdByEmail || null,
    reservedByUserId: code.reservedByUserId || null,
    reservedByEmail: code.reservedByEmail || null,
    reservedAt: code.reservedAt || null,
    attachedOrderId: code.attachedOrderId || null,
    attachedAt: code.attachedAt || null,
    usedAt: code.usedAt || null,
    removedAt: code.removedAt || null,
  };
}

function publicDiscount(code, originalPriceLabel) {
  return {
    id: code.id,
    code: code.code,
    percent: code.percent,
    productCategory: code.productCategory,
    productName: code.productName,
    originalPriceLabel: normalizeText(originalPriceLabel, 80),
    discountedPriceLabel: discountPriceLabel(originalPriceLabel, code.percent),
    status: statusOf(code),
  };
}

function findById(store, codeId) {
  return store.codes.find(function (entry) { return entry && entry.id === codeId; }) || null;
}

function createDiscountCodes(authDb) {
  function listDiscountCodes() {
    return loadStore(authDb).codes.filter(function (code) { return code && !code.removedAt; }).map(serialize);
  }

  function createDiscountCode(input, admin) {
    const code = normalizeText(input && input.code, 80);
    const codeKey = normalizeCode(code);
    const percent = parsePercent(input && input.percent);
    const productCategory = normalizeText(input && input.productCategory, 120);
    const productName = normalizeText(input && input.productName, 180);
    if (!code || code.length < 2) throw new Error("Inserisci un codice sconto di almeno 2 caratteri.");
    if (!percent) throw new Error("Inserisci una percentuale valida tra 1 e 100.");
    if (!productCategory || !productName) throw new Error("Seleziona un prodotto valido.");
    const store = loadStore(authDb);
    if (store.codes.some(function (entry) { return entry && !entry.removedAt && entry.codeKey === codeKey; })) {
      throw new Error("Esiste gia un codice sconto con questo nome.");
    }
    const now = nowIso();
    const entry = {
      id: id(),
      code,
      codeKey,
      percent,
      productCategory,
      productName,
      productKey: normalizeProductKey(productCategory, productName),
      createdAt: now,
      createdBy: admin && admin.id ? admin.id : null,
      createdByEmail: admin && admin.email ? admin.email : null,
      updatedAt: now,
    };
    store.codes.unshift(entry);
    saveStore(authDb, store);
    return serialize(entry);
  }

  function removeDiscountCode(codeId, admin) {
    const store = loadStore(authDb);
    const code = findById(store, codeId);
    if (!code || code.removedAt) return null;
    const now = nowIso();
    code.removedAt = now;
    code.removedBy = admin && admin.id ? admin.id : null;
    code.updatedAt = now;
    saveStore(authDb, store);
    return serialize(code);
  }

  function reserveDiscountCode(input, user) {
    const codeKey = normalizeCode(input && input.code);
    const productCategory = normalizeText(input && input.productCategory, 120);
    const productName = normalizeText(input && input.productName, 180);
    const priceLabel = normalizeText(input && input.priceLabel, 80);
    const productKey = normalizeProductKey(productCategory, productName);
    if (!codeKey) throw new Error("Inserisci un codice sconto.");
    if (!user || !user.id) throw new Error("Devi effettuare l'accesso.");
    const store = loadStore(authDb);
    const code = store.codes.find(function (entry) { return entry && !entry.removedAt && entry.codeKey === codeKey; });
    if (!code) throw new Error("Codice sconto non valido o gia utilizzato.");
    if (code.productKey !== productKey) throw new Error("Questo codice sconto non e valido per il prodotto selezionato.");
    if ((code.usedAt || code.completedOrderId) && code.reservedByUserId !== user.id) {
      throw new Error("Codice sconto non valido o gia utilizzato.");
    }
    if (code.reservedByUserId && code.reservedByUserId !== user.id) {
      throw new Error("Codice sconto non valido o gia utilizzato.");
    }
    const now = nowIso();
    if (!code.reservedByUserId) {
      code.reservedByUserId = user.id;
      code.reservedByEmail = user.email || null;
      code.reservedAt = now;
      code.updatedAt = now;
      saveStore(authDb, store);
    }
    return publicDiscount(code, priceLabel);
  }

  function reservedDiscountForProduct(input, user) {
    if (!user || !user.id) return null;
    const productCategory = normalizeText(input && input.productCategory, 120);
    const productName = normalizeText(input && input.productName, 180);
    const priceLabel = normalizeText(input && input.priceLabel, 80);
    const productKey = normalizeProductKey(productCategory, productName);
    const store = loadStore(authDb);
    const code = store.codes.find(function (entry) {
      return entry && !entry.removedAt && !entry.usedAt && !entry.completedOrderId && entry.productKey === productKey && entry.reservedByUserId === user.id;
    });
    return code ? publicDiscount(code, priceLabel) : null;
  }

  function validateOrderDiscount(input, user) {
    if (!input || !input.discountCodeId) return null;
    if (!user || !user.id) throw new Error("Devi effettuare l'accesso.");
    const store = loadStore(authDb);
    const code = findById(store, input.discountCodeId);
    const productKey = normalizeProductKey(input.productCategory, input.productName);
    if (!code || code.removedAt || code.usedAt || code.completedOrderId) throw new Error("Codice sconto non valido o gia utilizzato.");
    if (code.productKey !== productKey) throw new Error("Questo codice sconto non e valido per il prodotto selezionato.");
    if (code.reservedByUserId !== user.id) throw new Error("Questo codice sconto e associato a un altro utente.");
    if (code.attachedOrderId) throw new Error("Questo codice sconto e gia associato all'ordine #" + code.attachedOrderId + ". Completa quell'ordine per non perdere lo sconto.");
    return publicDiscount(code, input.priceLabel);
  }

  function attachDiscountToOrder(codeId, user, product, orderId) {
    if (!codeId || !orderId) return null;
    const store = loadStore(authDb);
    const code = findById(store, codeId);
    if (!code || code.removedAt || code.usedAt || code.completedOrderId) return null;
    if (!user || code.reservedByUserId !== user.id) return null;
    if (code.productKey !== normalizeProductKey(product.productCategory, product.productName)) return null;
    const now = nowIso();
    code.attachedOrderId = orderId;
    code.attachedAt = now;
    code.updatedAt = now;
    saveStore(authDb, store);
    return serialize(code);
  }

  function markOrderPaymentOpened(orderId) {
    const store = loadStore(authDb);
    const code = store.codes.find(function (entry) { return entry && entry.attachedOrderId === orderId && !entry.usedAt; });
    if (!code) return null;
    code.paymentOpenedAt = code.paymentOpenedAt || nowIso();
    code.updatedAt = nowIso();
    saveStore(authDb, store);
    return serialize(code);
  }

  function markOrderCompleted(orderId) {
    const store = loadStore(authDb);
    const code = store.codes.find(function (entry) { return entry && entry.attachedOrderId === orderId && !entry.usedAt; });
    if (!code) return null;
    const now = nowIso();
    code.usedAt = now;
    code.completedOrderId = orderId;
    code.updatedAt = now;
    saveStore(authDb, store);
    return serialize(code);
  }

  return {
    listDiscountCodes,
    createDiscountCode,
    removeDiscountCode,
    reserveDiscountCode,
    reservedDiscountForProduct,
    validateOrderDiscount,
    attachDiscountToOrder,
    markOrderPaymentOpened,
    markOrderCompleted,
  };
}

module.exports = { createDiscountCodes, discountPriceLabel };

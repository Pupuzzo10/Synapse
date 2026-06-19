(function () {
  var REVOLUT_PAYMENT_LINK = "https://revolut.me/angelo2tqp";
  var appBaseUrl = (function () {
    var cfg = document.documentElement.getAttribute("data-app-base-url") || "";
    if (cfg) return cfg.replace(/\/+$/, "");
    if (window.location.protocol !== "file:" && window.location.origin && window.location.origin !== "null") return window.location.origin;
    return "http://localhost:3000";
  })();

  var currentUser = null;
  var currentProduct = null;
  var currentOrder = null;
  var currentDiscount = null;
  var step = "checkout";
  var modal = null;
  var titleEl = null;
  var bodyEl = null;

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "class") node.className = attrs[k];
        else if (k === "text") node.textContent = attrs[k];
        else if (k === "value") node.value = attrs[k];
        else if (k.indexOf("on") === 0 && typeof attrs[k] === "function") node.addEventListener(k.slice(2), attrs[k]);
        else node.setAttribute(k, attrs[k]);
      });
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (c == null) return;
        node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
      });
    }
    return node;
  }

  function clear(node) {
    if (!node) return;
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function authHeaders(extra) {
    return (window.SynapseAuth && window.SynapseAuth.headers) ? window.SynapseAuth.headers(extra || {}) : (extra || {});
  }

  function normalizePrice(value) {
    var raw = String(value || "Da confermare").trim();
    if (!raw) return "Da confermare";
    if (/€|euro/i.test(raw) || /richiesta|confermare|gratis|free/i.test(raw)) return raw;
    if (/^[0-9]+([,.][0-9]{1,2})?$/.test(raw)) return "€" + raw;
    return raw;
  }

  function encodeQuery(params) {
    return Object.keys(params || {}).map(function (key) {
      return encodeURIComponent(key) + "=" + encodeURIComponent(params[key] == null ? "" : params[key]);
    }).join("&");
  }

  function activePriceLabel() {
    if (currentDiscount && currentDiscount.discountedPriceLabel) return currentDiscount.discountedPriceLabel;
    if (currentOrder && currentOrder.priceLabel) return normalizePrice(currentOrder.priceLabel);
    return normalizePrice(currentProduct && currentProduct.priceLabel);
  }

  function productMatchesOrder(order, product) {
    if (!order || !product) return false;
    return String(order.productCategory || "").trim().toLowerCase() === String(product.productCategory || "").trim().toLowerCase()
      && String(order.productName || "").trim().toLowerCase() === String(product.productName || "").trim().toLowerCase();
  }

  function setMessage(target, text, type) {
    if (!target) return;
    target.textContent = text || "";
    target.hidden = !text;
    target.classList.remove("is-error", "is-success", "is-info");
    if (text) target.classList.add(type === "success" ? "is-success" : type === "info" ? "is-info" : "is-error");
  }

  function fetchJson(path, options) {
    var opts = Object.assign({}, options || {});
    opts.headers = authHeaders(Object.assign({ Accept: "application/json" }, opts.headers || {}));
    return fetch(appBaseUrl + path, opts).then(function (res) {
      return res.json().catch(function () { return { ok: false, message: "Risposta server non valida." }; }).then(function (data) {
        if (!res.ok) throw new Error(data.message || "Richiesta non riuscita.");
        return data;
      });
    });
  }

  function ensureModal() {
    if (modal) return;
    var existing = document.getElementById("checkout-modal");
    if (existing) {
      modal = existing;
      titleEl = existing.querySelector("#checkout-modal-title") || existing.querySelector(".modal-title");
      bodyEl = existing.querySelector(".checkout-body") || existing.querySelector(".modal-body");
      if (!existing.getAttribute("data-checkout-bound")) {
        var existingClose = existing.querySelector(".checkout-modal-close");
        if (existingClose) existingClose.addEventListener("click", closeModal);
        existing.setAttribute("data-checkout-bound", "true");
      }
      return;
    }
    modal = el("div", { id: "checkout-modal", class: "modal checkout-modal", role: "dialog", "aria-modal": "true", "aria-labelledby": "checkout-modal-title", hidden: "" });
    var dialog = el("div", { class: "modal-dialog checkout-dialog" });
    var header = el("header", { class: "modal-header" });
    titleEl = el("h2", { id: "checkout-modal-title", class: "modal-title", text: "Checkout Synapse" });
    var closeBtn = el("button", { type: "button", class: "modal-close checkout-modal-close", "aria-label": "Chiudi", text: "×", onclick: closeModal });
    bodyEl = el("div", { class: "modal-body checkout-body" });
    header.appendChild(titleEl);
    header.appendChild(closeBtn);
    dialog.appendChild(header);
    dialog.appendChild(bodyEl);
    modal.appendChild(dialog);
    document.body.appendChild(modal);
  }

  function openModal() {
    ensureModal();
    modal.removeAttribute("hidden");
    document.body.style.overflow = "hidden";
    render();
  }

  function closeModal() {
    if (!modal) return;
    modal.setAttribute("hidden", "");
    document.body.style.overflow = "";
  }

  function productSummary() {
    var priceNode;
    if (currentDiscount) {
      priceNode = el("span", { class: "checkout-price checkout-price-discounted" }, [
        el("span", { class: "checkout-discount-label", text: "Sconto -" + currentDiscount.percent + "%" }),
        el("del", { text: currentDiscount.originalPriceLabel || normalizePrice(currentProduct.priceLabel) }),
        el("strong", { text: currentDiscount.discountedPriceLabel || activePriceLabel() }),
      ]);
    } else {
      priceNode = el("span", { class: "checkout-price", text: activePriceLabel() });
    }
    var summary = el("div", { class: "checkout-summary" }, [
      el("span", { class: "checkout-kicker", text: currentProduct.productCategory || "Prodotto Synapse" }),
      el("strong", { class: "checkout-product-title", text: currentProduct.productName || "Prodotto Synapse" }),
      priceNode,
    ]);
    if (currentDiscount) {
      summary.appendChild(el("span", { class: "checkout-discount-applied", text: "Codice " + currentDiscount.code + " applicato al tuo account" }));
    }
    return summary;
  }

  function field(label, input, hint) {
    var children = [el("span", { class: "auth-label", text: label }), input];
    if (hint) children.push(el("span", { class: "auth-hint", text: hint }));
    return el("label", { class: "auth-field" }, children);
  }

  function discountControls(feedback) {
    var wrap = el("div", { class: "checkout-discount-box" });
    var row = el("div", { class: "checkout-discount-row" });
    var input = el("input", { type: "text", class: "checkout-discount-input", maxlength: "80", autocomplete: "off", placeholder: "Inserisci codice sconto" });
    var applyBtn = el("button", { type: "button", class: "btn btn-warning checkout-discount-btn", text: currentDiscount ? "Codice sconto applicato" : "Applica codice sconto" });
    if (currentDiscount) {
      input.value = currentDiscount.code || "";
      input.disabled = true;
      applyBtn.disabled = true;
    }
    applyBtn.addEventListener("click", function () {
      var code = input.value.trim();
      if (!code) { setMessage(feedback, "Inserisci il codice sconto.", "error"); return; }
      applyBtn.disabled = true;
      setMessage(feedback, "Verifica codice sconto in corso...", "info");
      fetchJson("/api/discount-codes/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code,
          productCategory: currentProduct.productCategory,
          productName: currentProduct.productName,
          priceLabel: normalizePrice(currentProduct.priceLabel),
          discountCodeId: currentDiscount && currentDiscount.id,
        }),
      }).then(function (data) {
        currentDiscount = data.discount || null;
        setMessage(feedback, "Codice sconto applicato: -" + currentDiscount.percent + "%.", "success");
        render();
      }).catch(function (error) {
        applyBtn.disabled = false;
        setMessage(feedback, error.message, "error");
      });
    });
    row.appendChild(input);
    row.appendChild(applyBtn);
    wrap.appendChild(row);
    wrap.appendChild(el("p", { class: "checkout-discount-hint", text: currentDiscount ? "Lo sconto è riservato al tuo account e segue la validità configurata dall'admin: " + (currentDiscount.scopeLabel || "Tutti i prodotti") + "." : "Il codice può valere su tutti i prodotti, su una categoria o su un prodotto specifico, in base alla configurazione admin." }));
    return wrap;
  }

  function renderLoginRequired() {
    titleEl.textContent = "Checkout Synapse";
    clear(bodyEl);
    bodyEl.appendChild(productSummary());
    bodyEl.appendChild(el("p", { class: "checkout-lead", text: "Accedi o registra un account prima di procedere all'acquisto." }));
    bodyEl.appendChild(el("button", { type: "button", class: "btn btn-primary checkout-wide", text: "Accedi o registrati", onclick: function () {
      closeModal();
      var btn = document.getElementById("open-auth-modal");
      if (btn) btn.click();
    } }));
  }

  function renderCheckout() {
    titleEl.textContent = "Checkout Synapse";
    clear(bodyEl);
    var form = el("form", { class: "auth-form checkout-form", novalidate: "" });
    var feedback = el("p", { class: "auth-message", "aria-live": "polite", hidden: "" });
    var nameInput = el("input", { type: "text", name: "customerName", required: "", autocomplete: "name", maxlength: "120" });
    var phoneInput = el("input", { type: "tel", name: "phone", required: "", autocomplete: "tel", inputmode: "tel", maxlength: "40" });
    var discordInput = el("input", { type: "text", name: "discordUsername", autocomplete: "off", maxlength: "80" });
    var submit = el("button", { type: "submit", class: "btn btn-primary checkout-wide", text: "Continua al pagamento su Revolut" });
    if (currentUser && currentUser.username && !nameInput.value) nameInput.value = "";
    form.appendChild(productSummary());
    form.appendChild(el("div", { class: "checkout-payment-card" }, [
      el("span", { class: "checkout-kicker", text: "Metodo di pagamento" }),
      el("strong", { text: "Revolut" }),
      el("p", { text: "Unico metodo disponibile. Stripe, PayPal, Klarna e altri gateway non sono attivi." }),
      el("span", { class: "checkout-official-link", text: REVOLUT_PAYMENT_LINK }),
    ]));
    form.appendChild(field("Nome e cognome", nameInput));
    form.appendChild(field("Numero di telefono", phoneInput, "Obbligatorio e visibile allo staff nell'area ordini."));
    form.appendChild(field("Username Discord", discordInput, "Facoltativo. Verrà usato solo per comunicazioni operative."));
    form.appendChild(el("p", { class: "checkout-note", text: "Dopo l'apertura del pagamento Revolut passerai automaticamente al modulo obbligatorio dei dettagli del servizio." }));
    form.appendChild(discountControls(feedback));
    form.appendChild(feedback);
    form.appendChild(submit);
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var customerName = nameInput.value.trim();
      var phone = phoneInput.value.trim();
      var discordUsername = discordInput.value.trim();
      if (!/^\S+\s+\S+/.test(customerName)) { setMessage(feedback, "Inserisci nome e cognome.", "error"); return; }
      if (!phone || !/^[+()0-9\s.-]{6,40}$/.test(phone) || phone.replace(/\D/g, "").length < 6) { setMessage(feedback, "Inserisci un numero di telefono valido.", "error"); return; }
      submit.disabled = true;
      setMessage(feedback, "Creazione ordine in corso...", "info");
      fetchJson("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: customerName,
          phone: phone,
          discordUsername: discordUsername,
          productCategory: currentProduct.productCategory,
          productName: currentProduct.productName,
          priceLabel: normalizePrice(currentProduct.priceLabel),
          discountCodeId: currentDiscount && currentDiscount.id,
        }),
      }).then(function (data) {
        currentOrder = data.order;
        step = "payment";
        render();
      }).catch(function (error) {
        submit.disabled = false;
        setMessage(feedback, error.message, "error");
      });
    });
    bodyEl.appendChild(form);
  }

  function renderPayment() {
    titleEl.textContent = "Pagamento Revolut";
    clear(bodyEl);
    var feedback = el("p", { class: "auth-message", "aria-live": "polite", hidden: "" });
    var payBtn = el("a", { class: "btn btn-primary checkout-wide checkout-revolut-btn", href: REVOLUT_PAYMENT_LINK, target: "_blank", rel: "noopener noreferrer", text: "Paga ora con Revolut" });
    payBtn.addEventListener("click", function () {
      if (payBtn.getAttribute("aria-disabled") === "true") return;
      payBtn.setAttribute("aria-disabled", "true");
      payBtn.classList.add("is-loading");
      setMessage(feedback, "Revolut è stato aperto. Questa schermata passa automaticamente al modulo dettagli obbligatorio.", "info");
      fetchJson("/api/orders/" + currentOrder.id + "/confirm-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }).then(function (data) {
        currentOrder = data.order;
        window.setTimeout(function () {
          step = "details";
          render();
        }, 650);
      }).catch(function (error) {
        payBtn.setAttribute("aria-disabled", "false");
        payBtn.classList.remove("is-loading");
        setMessage(feedback, error.message, "error");
      });
    });
    bodyEl.appendChild(productSummary());
    bodyEl.appendChild(el("div", { class: "checkout-payment-card checkout-payment-card-active" }, [
      el("span", { class: "checkout-kicker", text: "Ordine #" + currentOrder.id }),
      el("strong", { text: "Pagamento esclusivamente tramite Revolut" }),
      el("p", { text: "Importo: " + activePriceLabel() + ". Usa solo il link ufficiale mostrato qui sotto. Non vengono richiesti dati carta su questo sito." }),
      el("span", { class: "checkout-official-link", text: REVOLUT_PAYMENT_LINK }),
    ]));
    bodyEl.appendChild(el("div", { class: "checkout-payment-flow" }, [
      el("span", { text: "1. Si apre Revolut in una nuova scheda." }),
      el("span", { text: "2. Completi il pagamento nel link ufficiale." }),
      el("span", { text: "3. Torni qui e compili il modulo dettagli obbligatorio già pronto." }),
    ]));
    bodyEl.appendChild(payBtn);
    bodyEl.appendChild(feedback);
  }

  function renderDetails() {
    titleEl.textContent = "Dettagli del servizio";
    clear(bodyEl);
    var form = el("form", { class: "auth-form checkout-form", novalidate: "" });
    var feedback = el("p", { class: "auth-message", "aria-live": "polite", hidden: "" });
    var textarea = el("textarea", { name: "serviceDetails", rows: "12", maxlength: "15000", required: "" });
    var counter = el("span", { class: "auth-hint", text: "0 / 15000" });
    var submit = el("button", { type: "submit", class: "btn btn-primary checkout-wide", text: "Invia dettagli e finalizza ordine" });
    textarea.placeholder = "Descrivi in modo completo il servizio richiesto, gli obiettivi, le specifiche tecniche, le preferenze grafiche o funzionali, gli account o server coinvolti, eventuali scadenze e tutto ciò che serve per eseguire correttamente il lavoro.";
    textarea.addEventListener("input", function () { counter.textContent = textarea.value.length + " / 15000"; });
    form.appendChild(productSummary());
    form.appendChild(el("div", { class: "checkout-paid-banner" }, [
      el("span", { class: "checkout-paid-icon", text: "✓" }),
      el("div", {}, [
        el("strong", { text: "Modulo obbligatorio post-pagamento" }),
        el("p", { text: "Inserisci una descrizione molto dettagliata: servizio richiesto, obiettivi, specifiche tecniche, preferenze e ogni informazione utile alla consegna." }),
      ]),
    ]));
    form.appendChild(el("label", { class: "auth-field" }, [
      el("span", { class: "auth-label", text: "Descrizione completa del servizio" }),
      textarea,
      counter,
    ]));
    form.appendChild(feedback);
    form.appendChild(submit);
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var details = textarea.value.trim();
      if (details.length < 40) { setMessage(feedback, "Inserisci una descrizione più completa del servizio richiesto.", "error"); return; }
      submit.disabled = true;
      setMessage(feedback, "Invio dettagli in corso...", "info");
      fetchJson("/api/orders/" + currentOrder.id + "/details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceDetails: details }),
      }).then(function (data) {
        currentOrder = data.order;
        step = "done";
        render();
      }).catch(function (error) {
        submit.disabled = false;
        setMessage(feedback, error.message, "error");
      });
    });
    bodyEl.appendChild(form);
  }

  function renderDone() {
    titleEl.textContent = "Ordine ricevuto";
    clear(bodyEl);
    bodyEl.appendChild(productSummary());
    bodyEl.appendChild(el("div", { class: "checkout-success checkout-done" }, [
      el("span", { class: "checkout-success-icon checkout-done-icon", text: "✓" }),
      el("strong", { text: "Dettagli ricevuti" }),
      el("p", { text: "Lo staff ha ricevuto ordine, telefono e dettagli del servizio. Potrai essere contattato tramite WhatsApp o Discord per completare l'esecuzione del lavoro." }),
    ]));
    bodyEl.appendChild(el("button", { type: "button", class: "btn btn-primary checkout-wide", text: "Chiudi", onclick: closeModal }));
  }

  function render() {
    ensureModal();
    if (!currentUser) { renderLoginRequired(); return; }
    if (step === "payment") renderPayment();
    else if (step === "details") renderDetails();
    else if (step === "done") renderDone();
    else renderCheckout();
  }

  function loadReservedDiscountForCurrentProduct() {
    if (!currentUser || !currentProduct || currentOrder) return Promise.resolve(null);
    return fetchJson("/api/discount-codes/reserved?" + encodeQuery({
      productCategory: currentProduct.productCategory,
      productName: currentProduct.productName,
      priceLabel: normalizePrice(currentProduct.priceLabel),
    }), { method: "GET" }).then(function (data) {
      currentDiscount = data.discount || null;
      if (currentDiscount) render();
      return currentDiscount;
    }).catch(function () { return null; });
  }

  function resumeOrderForCurrentProduct() {
    if (!currentUser || !currentProduct) return Promise.resolve(false);
    return fetchJson("/api/orders/mine", { method: "GET" }).then(function (data) {
      var pending = (data.orders || []).find(function (order) {
        return productMatchesOrder(order, currentProduct)
          && ["awaiting_payment", "payment_pending_details", "payment_confirmed"].indexOf(order.status) !== -1
          && !order.serviceDetails;
      });
      if (!pending) return false;
      currentOrder = pending;
      currentDiscount = null;
      currentProduct = {
        productCategory: pending.productCategory,
        productName: pending.productName,
        priceLabel: pending.priceLabel,
      };
      step = pending.status === "awaiting_payment" ? "payment" : "details";
      render();
      return true;
    }).catch(function () { return false; });
  }

  function openFor(product) {
    currentProduct = Object.assign({ productCategory: "Prodotto Synapse", productName: "Prodotto Synapse", priceLabel: "Da confermare" }, product || {});
    currentProduct.priceLabel = normalizePrice(currentProduct.priceLabel);
    currentOrder = null;
    currentDiscount = null;
    step = "checkout";
    openModal();
    resumeOrderForCurrentProduct().then(function (resumed) {
      if (!resumed) loadReservedDiscountForCurrentProduct();
    });
  }

  function resumeRequiredDetails() {
    if (!currentUser) return;
    fetchJson("/api/orders/mine", { method: "GET" }).then(function (data) {
      var pending = (data.orders || []).find(function (order) {
        return ["payment_pending_details", "payment_confirmed"].indexOf(order.status) !== -1 && !order.serviceDetails;
      });
      if (!pending || (modal && !modal.hasAttribute("hidden"))) return;
      currentOrder = pending;
      currentDiscount = null;
      currentProduct = {
        productCategory: pending.productCategory,
        productName: pending.productName,
        priceLabel: pending.priceLabel,
      };
      step = "details";
      openModal();
    }).catch(function () {});
  }

  var reviewModal = null;
  var reviewOrder = null;

  function ensureReviewModal() {
    if (reviewModal) return;
    reviewModal = el("div", { id: "review-modal", class: "modal checkout-modal review-modal", role: "dialog", "aria-modal": "true", "aria-labelledby": "review-modal-title", hidden: "" });
    var dialog = el("div", { class: "modal-dialog checkout-dialog review-dialog" });
    var header = el("header", { class: "modal-header" });
    header.appendChild(el("h2", { id: "review-modal-title", class: "modal-title", text: "Lascia una recensione" }));
    header.appendChild(el("button", { type: "button", class: "modal-close checkout-modal-close", "aria-label": "Chiudi", text: "×", onclick: closeReviewModal }));
    dialog.appendChild(header);
    dialog.appendChild(el("div", { class: "modal-body review-body" }));
    reviewModal.appendChild(dialog);
    document.body.appendChild(reviewModal);
  }

  function closeReviewModal() {
    if (!reviewModal) return;
    reviewModal.setAttribute("hidden", "");
    document.body.style.overflow = "";
  }

  function openReviewForOrder(order) {
    if (!order || !currentUser) return;
    reviewOrder = order;
    ensureReviewModal();
    var body = reviewModal.querySelector(".review-body");
    clear(body);
    var feedback = el("p", { class: "auth-message", "aria-live": "polite", hidden: "" });
    var form = el("form", { class: "auth-form review-form", novalidate: "" });
    var nameInput = el("input", { type: "text", maxlength: "80", required: "", autocomplete: "name", value: currentUser.username || "" });
    var discordInput = el("input", { type: "text", maxlength: "80", autocomplete: "off", placeholder: "Facoltativo" });
    var ratingInput = el("select", { required: "" }, [
      el("option", { value: "5", text: "5 stelle" }),
      el("option", { value: "4", text: "4 stelle" }),
      el("option", { value: "3", text: "3 stelle" }),
      el("option", { value: "2", text: "2 stelle" }),
      el("option", { value: "1", text: "1 stella" }),
    ]);
    var textInputReview = el("textarea", { rows: "6", maxlength: "700", required: "", placeholder: "Descrivi la tua esperienza con Synapse." });
    var submit = el("button", { type: "submit", class: "btn btn-primary checkout-wide", text: "Invia recensione" });
    form.appendChild(el("div", { class: "checkout-success review-invite" }, [
      el("span", { class: "checkout-success-icon", text: "★" }),
      el("strong", { text: "Ordine completato" }),
      el("p", { text: "Lo staff ha confermato l'ordine " + (order.productName || "Synapse") + ". Puoi pubblicare una recensione verificata." }),
    ]));
    form.appendChild(field("Nome da mostrare", nameInput));
    form.appendChild(field("Discord", discordInput, "Facoltativo, non viene mostrato pubblicamente se lasci vuoto."));
    form.appendChild(field("Valutazione", ratingInput));
    form.appendChild(field("Descrizione", textInputReview));
    form.appendChild(feedback);
    form.appendChild(submit);
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      submit.disabled = true;
      setMessage(feedback, "Invio recensione in corso...", "info");
      fetchJson("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: reviewOrder.id,
          displayName: nameInput.value,
          discordName: discordInput.value,
          rating: ratingInput.value,
          text: textInputReview.value,
        }),
      }).then(function () {
        setMessage(feedback, "Recensione inviata e pubblicata.", "success");
        setTimeout(closeReviewModal, 900);
        if (window.SynapseContent && window.SynapseContent.reload) window.SynapseContent.reload();
      }).catch(function (error) {
        submit.disabled = false;
        setMessage(feedback, error.message, "error");
      });
    });
    body.appendChild(form);
    reviewModal.removeAttribute("hidden");
    document.body.style.overflow = "hidden";
  }

  function checkPendingReview() {
    if (!currentUser) return;
    fetchJson("/api/reviews/pending", { method: "GET" }).then(function (data) {
      if (data.order && !(reviewModal && !reviewModal.hasAttribute("hidden"))) openReviewForOrder(data.order);
    }).catch(function () {});
  }

  document.addEventListener("synapse:open-checkout", function (event) { openFor(event.detail || {}); });
  document.addEventListener("synapse:auth-changed", function (event) {
    currentUser = event.detail && event.detail.user ? event.detail.user : null;
    if (modal && !modal.hasAttribute("hidden")) render();
    if (currentUser) { resumeRequiredDetails(); setTimeout(checkPendingReview, 700); }
  });
  document.addEventListener("synapse:orders-changed", function (event) {
    var order = event.detail && event.detail.order;
    if (!currentUser || !order || order.userId !== currentUser.id || order.status !== "completed") return;
    setTimeout(checkPendingReview, 700);
  });

  if (window.SynapseAuth && window.SynapseAuth.getCurrentUser) {
    currentUser = window.SynapseAuth.getCurrentUser();
    if (currentUser) { resumeRequiredDetails(); setTimeout(checkPendingReview, 1200); }
  }

  window.SynapseCheckout = { openFor: openFor, checkPendingReview: checkPendingReview };
})();

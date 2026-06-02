function nowIso() {
  return new Date().toISOString();
}

function rowToOrder(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email,
    customerName: row.customer_name,
    phone: row.phone,
    discordUsername: row.discord_username || null,
    productCategory: row.product_category,
    productName: row.product_name,
    priceLabel: row.price_label,
    paymentMethod: row.payment_method,
    paymentLink: row.payment_link,
    paymentStatus: row.payment_status,
    serviceDetails: row.service_details || null,
    status: row.status,
    ip: row.ip || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    paidMarkedAt: row.paid_marked_at || null,
    paymentOpenedAt: row.payment_opened_at || null,
    detailsSubmittedAt: row.details_submitted_at || null,
    completedAt: row.completed_at || null,
    username: row.username || null,
  };
}

function createOrders(authDb) {
  const db = authDb.db;
  const stmts = {
    insertOrder: db.prepare(`
      INSERT INTO orders (
        user_id, email, customer_name, phone, discord_username, product_category, product_name, price_label,
        payment_method, payment_link, payment_status, status, ip, created_at, updated_at
      )
      VALUES (
        @user_id, @email, @customer_name, @phone, @discord_username, @product_category, @product_name, @price_label,
        @payment_method, @payment_link, 'awaiting_revolut', 'awaiting_payment', @ip, @now, @now
      )
    `),
    findOrderById: db.prepare(`
      SELECT o.*, u.username FROM orders o
      LEFT JOIN users u ON u.id = o.user_id
      WHERE o.id = ?
    `),
    listOrders: db.prepare(`
      SELECT o.*, u.username FROM orders o
      LEFT JOIN users u ON u.id = o.user_id
      ORDER BY
        CASE o.status
          WHEN 'awaiting_payment' THEN 0
          WHEN 'payment_pending_details' THEN 1
          WHEN 'details_received' THEN 2
          WHEN 'completed' THEN 3
          ELSE 4
        END,
        o.created_at DESC
    `),
    listOrdersByUser: db.prepare(`
      SELECT o.*, u.username FROM orders o
      LEFT JOIN users u ON u.id = o.user_id
      WHERE o.user_id = ?
      ORDER BY o.created_at DESC
    `),
    markPaymentOpened: db.prepare(`
      UPDATE orders
      SET payment_status = CASE WHEN payment_status = 'verified' THEN payment_status ELSE 'revolut_opened' END,
          status = CASE WHEN status = 'awaiting_payment' THEN 'payment_pending_details' ELSE status END,
          payment_opened_at = COALESCE(payment_opened_at, @now),
          paid_marked_at = COALESCE(paid_marked_at, @now),
          updated_at = @now
      WHERE id = @id
    `),
    saveDetails: db.prepare(`
      UPDATE orders
      SET service_details = @service_details,
          payment_status = CASE WHEN payment_status = 'verified' THEN payment_status ELSE 'customer_details_received' END,
          status = CASE WHEN status = 'completed' THEN status ELSE 'details_received' END,
          details_submitted_at = @now,
          updated_at = @now
      WHERE id = @id
    `),
    markCompleted: db.prepare(`
      UPDATE orders
      SET payment_status = 'verified', status = 'completed', completed_at = @now, updated_at = @now
      WHERE id = @id
    `),
  };

  function createOrder(input) {
    const now = nowIso();
    const result = stmts.insertOrder.run({
      user_id: input.userId,
      email: input.email,
      customer_name: input.customerName,
      phone: input.phone,
      discord_username: input.discordUsername || null,
      product_category: input.productCategory,
      product_name: input.productName,
      price_label: input.priceLabel,
      payment_method: input.paymentMethod,
      payment_link: input.paymentLink,
      ip: input.ip || null,
      now,
    });
    return getOrder(result.lastInsertRowid);
  }

  function getOrder(id) {
    return rowToOrder(stmts.findOrderById.get(id));
  }

  function listAllOrders() {
    return stmts.listOrders.all().map(rowToOrder);
  }

  function listMyOrders(userId) {
    return stmts.listOrdersByUser.all(userId).map(rowToOrder);
  }

  function markPaymentConfirmed(id) {
    stmts.markPaymentOpened.run({ id, now: nowIso() });
    return getOrder(id);
  }

  function saveServiceDetails(id, serviceDetails) {
    stmts.saveDetails.run({ id, service_details: serviceDetails, now: nowIso() });
    return getOrder(id);
  }

  function markCompleted(id) {
    stmts.markCompleted.run({ id, now: nowIso() });
    return getOrder(id);
  }

  return {
    createOrder,
    getOrder,
    listAllOrders,
    listMyOrders,
    markPaymentConfirmed,
    saveServiceDetails,
    markCompleted,
  };
}

module.exports = { createOrders };

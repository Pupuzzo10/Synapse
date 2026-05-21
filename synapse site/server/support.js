// Gestione ticket di segnalazione + chat di supporto.
// Usa la stessa istanza SQLite del modulo auth (authDb.db).

const TICKET_STATUSES = ["pending", "approved", "declined", "replied", "in_chat", "closed"];
const CHAT_STATUSES = ["open", "paused", "suspended", "closed"];
// Motivi di chiusura conversazione (decisi dall'admin via "Termina conversazione")
const CLOSURE_REASONS = {
  resolved:  { label: "Risolto",   chatStatus: "closed",    ticketStatus: "closed"   },
  unresolved:{ label: "Irrisolto", chatStatus: "closed",    ticketStatus: "closed"   },
  suspended: { label: "Sospesa",   chatStatus: "suspended", ticketStatus: "in_chat"  },
  declined:  { label: "Declinata", chatStatus: "closed",    ticketStatus: "declined" },
};

function nowIso() {
  return new Date().toISOString();
}

function rowToTicket(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email,
    message: row.message,
    status: row.status,
    adminReply: row.admin_reply,
    chatId: row.chat_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    username: row.username || null,
  };
}

function rowToChat(row) {
  if (!row) return null;
  return {
    id: row.id,
    ticketId: row.ticket_id,
    userId: row.user_id,
    adminId: row.admin_id,
    status: row.status,
    userCanSend: !!row.user_can_send,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at,
    closureReason: row.closure_reason || null,
    closureReasonLabel: row.closure_reason && CLOSURE_REASONS[row.closure_reason]
      ? CLOSURE_REASONS[row.closure_reason].label
      : null,
    username: row.username || null,
    userEmail: row.user_email || null,
    adminUsername: row.admin_username || null,
  };
}

function rowToMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    chatId: row.chat_id,
    senderId: row.sender_id,
    senderRole: row.sender_role,
    content: row.content,
    createdAt: row.created_at,
  };
}

function createSupport(authDb) {
  const db = authDb.db;

  const stmts = {
    insertTicket: db.prepare(`
      INSERT INTO tickets (user_id, email, message, status, created_at, updated_at)
      VALUES (@user_id, @email, @message, 'pending', @now, @now)
    `),
    findTicketById: db.prepare(`
      SELECT t.*, u.username FROM tickets t
      LEFT JOIN users u ON u.id = t.user_id
      WHERE t.id = ?
    `),
    listTickets: db.prepare(`
      SELECT t.*, u.username FROM tickets t
      LEFT JOIN users u ON u.id = t.user_id
      ORDER BY
        CASE t.status WHEN 'pending' THEN 0 WHEN 'in_chat' THEN 1 WHEN 'approved' THEN 2 WHEN 'replied' THEN 3 ELSE 4 END,
        t.created_at DESC
    `),
    listTicketsByUser: db.prepare(`
      SELECT t.*, u.username FROM tickets t
      LEFT JOIN users u ON u.id = t.user_id
      WHERE t.user_id = ?
      ORDER BY t.created_at DESC
    `),
    updateTicketStatus: db.prepare(`
      UPDATE tickets SET status = @status, updated_at = @now WHERE id = @id
    `),
    updateTicketReply: db.prepare(`
      UPDATE tickets SET admin_reply = @reply, status = 'replied', updated_at = @now WHERE id = @id
    `),
    setTicketChat: db.prepare(`
      UPDATE tickets SET chat_id = @chat_id, status = 'in_chat', updated_at = @now WHERE id = @id
    `),

    insertChat: db.prepare(`
      INSERT INTO chats (ticket_id, user_id, admin_id, status, user_can_send, created_at, updated_at)
      VALUES (@ticket_id, @user_id, @admin_id, 'open', 1, @now, @now)
    `),
    findChatById: db.prepare(`
      SELECT c.*, u.username, u.email AS user_email, a.username AS admin_username
      FROM chats c
      LEFT JOIN users u ON u.id = c.user_id
      LEFT JOIN users a ON a.id = c.admin_id
      WHERE c.id = ?
    `),
    findChatByTicket: db.prepare(`SELECT * FROM chats WHERE ticket_id = ?`),
    listChats: db.prepare(`
      SELECT c.*, u.username, u.email AS user_email, a.username AS admin_username
      FROM chats c
      LEFT JOIN users u ON u.id = c.user_id
      LEFT JOIN users a ON a.id = c.admin_id
      ORDER BY
        CASE c.status WHEN 'open' THEN 0 WHEN 'paused' THEN 1 WHEN 'suspended' THEN 2 ELSE 3 END,
        c.updated_at DESC
    `),
    listChatsByUser: db.prepare(`
      SELECT c.*, u.username, u.email AS user_email, a.username AS admin_username
      FROM chats c
      LEFT JOIN users u ON u.id = c.user_id
      LEFT JOIN users a ON a.id = c.admin_id
      WHERE c.user_id = ?
      ORDER BY c.updated_at DESC
    `),
    updateChatStatus: db.prepare(`
      UPDATE chats SET status = @status, updated_at = @now,
        closed_at = CASE WHEN @status = 'closed' THEN @now ELSE closed_at END
      WHERE id = @id
    `),
    updateChatPermissions: db.prepare(`
      UPDATE chats SET user_can_send = @user_can_send, updated_at = @now WHERE id = @id
    `),

    insertMessage: db.prepare(`
      INSERT INTO chat_messages (chat_id, sender_id, sender_role, content, created_at)
      VALUES (@chat_id, @sender_id, @sender_role, @content, @now)
    `),
    listMessages: db.prepare(`
      SELECT * FROM chat_messages WHERE chat_id = ? ORDER BY id ASC
    `),
  };

  function createTicket({ userId, email, message }) {
    const result = stmts.insertTicket.run({
      user_id: userId,
      email,
      message,
      now: nowIso(),
    });
    return rowToTicket(stmts.findTicketById.get(result.lastInsertRowid));
  }

  function getTicket(id) { return rowToTicket(stmts.findTicketById.get(id)); }
  function listAllTickets() { return stmts.listTickets.all().map(rowToTicket); }
  function listMyTickets(userId) { return stmts.listTicketsByUser.all(userId).map(rowToTicket); }

  function setTicketStatus(id, status) {
    if (TICKET_STATUSES.indexOf(status) === -1) throw new Error("Stato ticket non valido");
    stmts.updateTicketStatus.run({ id, status, now: nowIso() });
    return getTicket(id);
  }

  function replyToTicket(id, reply) {
    stmts.updateTicketReply.run({ id, reply, now: nowIso() });
    return getTicket(id);
  }

  function openChatForTicket(ticketId, adminId) {
    const ticket = getTicket(ticketId);
    if (!ticket) throw new Error("Ticket inesistente");
    let chat = stmts.findChatByTicket.get(ticketId);
    if (chat) {
      stmts.setTicketChat.run({ id: ticketId, chat_id: chat.id, now: nowIso() });
      return getChat(chat.id);
    }
    const result = stmts.insertChat.run({
      ticket_id: ticketId,
      user_id: ticket.userId,
      admin_id: adminId,
      now: nowIso(),
    });
    stmts.setTicketChat.run({ id: ticketId, chat_id: result.lastInsertRowid, now: nowIso() });
    return getChat(result.lastInsertRowid);
  }

  function getChat(id) { return rowToChat(stmts.findChatById.get(id)); }
  function listAllChats() { return stmts.listChats.all().map(rowToChat); }
  function listChatsByUser(userId) { return stmts.listChatsByUser.all(userId).map(rowToChat); }

  function setChatStatus(id, status) {
    if (CHAT_STATUSES.indexOf(status) === -1) throw new Error("Stato chat non valido");
    stmts.updateChatStatus.run({ id, status, now: nowIso() });
    return getChat(id);
  }

  function setChatPermissions(id, userCanSend) {
    stmts.updateChatPermissions.run({ id, user_can_send: userCanSend ? 1 : 0, now: nowIso() });
    return getChat(id);
  }

  function postMessage({ chatId, senderId, senderRole, content }) {
    const result = stmts.insertMessage.run({
      chat_id: chatId,
      sender_id: senderId,
      sender_role: senderRole,
      content,
      now: nowIso(),
    });
    stmts.updateChatStatus.run({ id: chatId, status: getChat(chatId).status, now: nowIso() });
    return rowToMessage({
      id: result.lastInsertRowid,
      chat_id: chatId,
      sender_id: senderId,
      sender_role: senderRole,
      content,
      created_at: nowIso(),
    });
  }

  function listMessages(chatId) {
    return stmts.listMessages.all(chatId).map(rowToMessage);
  }

  return {
    TICKET_STATUSES,
    CHAT_STATUSES,
    createTicket,
    getTicket,
    listAllTickets,
    listMyTickets,
    setTicketStatus,
    replyToTicket,
    openChatForTicket,
    getChat,
    listAllChats,
    listChatsByUser,
    setChatStatus,
    setChatPermissions,
    postMessage,
    listMessages,
  };
}

module.exports = { createSupport };

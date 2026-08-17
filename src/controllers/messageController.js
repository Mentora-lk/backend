const { pool } = require('../config/db');
const { isUserOnline } = require('../socket');

// Direct messages are a simple sender/recipient pair (see `messages` table:
// id, sender_id, recipient_id, content, is_read, created_at) — there is no
// separate "conversation" row; a conversation is identified by the other
// user's id.

/**
 * GET /api/messages/contacts
 *
 * Returns the people the current user can chat with: anyone they share an
 * enrollment with (student <-> tutor of one of their courses) unioned with
 * anyone they already have message history with (covers the case where the
 * other side messaged first, or the enrollment was later cancelled).
 */
const getContacts = async (req, res) => {
  try {
    const myId = req.user.id;
    const myRole = req.user.role;

    const contactIdsResult = await pool.query(
      `WITH contact_ids AS (
         SELECT DISTINCT
           CASE WHEN $2 = 'student' THEN c.tutor_id ELSE e.student_id END AS other_id
         FROM enrollments e
         JOIN courses c ON c.id = e.class_id
         WHERE ($2 = 'student' AND e.student_id = $1)
            OR ($2 = 'tutor' AND c.tutor_id = $1)
         UNION
         SELECT DISTINCT
           CASE WHEN sender_id = $1 THEN recipient_id ELSE sender_id END AS other_id
         FROM messages
         WHERE sender_id = $1 OR recipient_id = $1
       )
       SELECT other_id FROM contact_ids WHERE other_id IS NOT NULL AND other_id != $1`,
      [myId, myRole]
    );

    const contactIds = contactIdsResult.rows.map((r) => r.other_id);

    if (contactIds.length === 0) {
      return res.status(200).json({ status: 'success', data: [] });
    }

    const [profilesResult, lastMessagesResult, unreadResult] = await Promise.all([
      pool.query(
        `SELECT u.id, u.role,
                COALESCE(sp.full_name, tp.full_name, tp.name) AS name,
                COALESCE(sp.profile_picture_url, tp.profile_picture_url) AS avatar_url,
                tp.subject
         FROM users u
         LEFT JOIN student_profiles sp ON sp.user_id = u.id AND u.role = 'student'
         LEFT JOIN tutor_profiles tp ON tp.user_id = u.id AND u.role = 'tutor'
         WHERE u.id = ANY($1::int[])`,
        [contactIds]
      ),
      pool.query(
        `SELECT DISTINCT ON (other_id) other_id, content, created_at, sender_id
         FROM (
           SELECT CASE WHEN sender_id = $1 THEN recipient_id ELSE sender_id END AS other_id,
                  content, created_at, sender_id
           FROM messages
           WHERE sender_id = $1 OR recipient_id = $1
         ) t
         WHERE other_id = ANY($2::int[])
         ORDER BY other_id, created_at DESC`,
        [myId, contactIds]
      ),
      pool.query(
        `SELECT sender_id, COUNT(*)::int AS unread_count
         FROM messages
         WHERE recipient_id = $1 AND is_read = false AND sender_id = ANY($2::int[])
         GROUP BY sender_id`,
        [myId, contactIds]
      ),
    ]);

    const lastMessageByContact = new Map(lastMessagesResult.rows.map((r) => [r.other_id, r]));
    const unreadByContact = new Map(unreadResult.rows.map((r) => [r.sender_id, r.unread_count]));

    const contacts = profilesResult.rows.map((profile) => {
      const lastMessage = lastMessageByContact.get(profile.id);
      return {
        userId: profile.id,
        name: profile.name || 'Unknown User',
        role: profile.role,
        avatarUrl: profile.avatar_url || null,
        subject: profile.subject || null,
        online: isUserOnline(profile.id),
        lastMessage: lastMessage ? lastMessage.content : null,
        lastMessageAt: lastMessage ? lastMessage.created_at : null,
        lastMessageFromMe: lastMessage ? lastMessage.sender_id === myId : null,
        unreadCount: unreadByContact.get(profile.id) || 0,
      };
    });

    // Most recently active conversations first; contacts with no messages yet go last.
    contacts.sort((a, b) => {
      if (!a.lastMessageAt && !b.lastMessageAt) return a.name.localeCompare(b.name);
      if (!a.lastMessageAt) return 1;
      if (!b.lastMessageAt) return -1;
      return new Date(b.lastMessageAt) - new Date(a.lastMessageAt);
    });

    res.status(200).json({ status: 'success', data: contacts });
  } catch (error) {
    console.error('❌ Error fetching contacts:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * GET /api/messages/unread-count
 *
 * Unread DM count for the current user, both as a single total (sidebar
 * badge) and broken down per sender with their display name (bell dropdown
 * text, e.g. "3 new messages from Jane Silva") — cheaper than getContacts(),
 * which also joins avatars/last-message/subject for the full contact list.
 */
const getUnreadCount = async (req, res) => {
  try {
    const bySenderResult = await pool.query(
      `SELECT m.sender_id AS "senderId",
              COALESCE(sp.full_name, tp.full_name, tp.name, 'Unknown User') AS "senderName",
              COUNT(*)::int AS count
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       LEFT JOIN student_profiles sp ON sp.user_id = m.sender_id AND u.role = 'student'
       LEFT JOIN tutor_profiles tp ON tp.user_id = m.sender_id AND u.role = 'tutor'
       WHERE m.recipient_id = $1 AND m.is_read = false
       GROUP BY m.sender_id, sp.full_name, tp.full_name, tp.name
       ORDER BY count DESC`,
      [req.user.id]
    );

    const totalUnread = bySenderResult.rows.reduce((sum, r) => sum + r.count, 0);

    res.status(200).json({
      status: 'success',
      data: { totalUnread, bySender: bySenderResult.rows },
    });
  } catch (error) {
    console.error('❌ Error fetching unread message count:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * GET /api/messages/:userId
 *
 * Returns the full message history between the current user and :userId,
 * oldest first, and marks any unread messages from :userId as read.
 */
const getMessages = async (req, res) => {
  try {
    const myId = req.user.id;
    const otherId = parseInt(req.params.userId, 10);

    if (!otherId) {
      return res.status(400).json({ status: 'error', message: 'Invalid userId' });
    }

    const result = await pool.query(
      `SELECT id, sender_id, recipient_id, content, is_read, created_at
       FROM messages
       WHERE (sender_id = $1 AND recipient_id = $2)
          OR (sender_id = $2 AND recipient_id = $1)
       ORDER BY created_at ASC`,
      [myId, otherId]
    );

    const unreadIds = result.rows
      .filter((m) => m.recipient_id === myId && !m.is_read)
      .map((m) => m.id);

    if (unreadIds.length > 0) {
      await pool.query(`UPDATE messages SET is_read = true WHERE id = ANY($1::int[])`, [unreadIds]);

      const io = req.app.locals.io;
      if (io) {
        // To the other party: updates their "· Read" receipt on the messages they sent.
        io.to(`user:${otherId}`).emit('messages_read', { by: myId, messageIds: unreadIds });
        // Back to the reader's own other tabs/devices: clears their bell/sidebar
        // unread badge for this sender without waiting on any other trigger.
        io.to(`user:${myId}`).emit('messages_read', { by: myId, messageIds: unreadIds });
      }
    }

    res.status(200).json({ status: 'success', data: result.rows });
  } catch (error) {
    console.error('❌ Error fetching messages:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * POST /api/messages/:userId
 * Body: { content: string }
 *
 * Persists a new message and pushes it in real time to the recipient (and
 * back to the sender's other open tabs/devices) over Socket.io.
 */
const sendMessage = async (req, res) => {
  try {
    const myId = req.user.id;
    const otherId = parseInt(req.params.userId, 10);
    const { content } = req.body;

    if (!otherId) {
      return res.status(400).json({ status: 'error', message: 'Invalid userId' });
    }
    if (!content || !content.trim()) {
      return res.status(400).json({ status: 'error', message: 'Message content is required' });
    }

    const result = await pool.query(
      `INSERT INTO messages (sender_id, recipient_id, content, is_read, created_at)
       VALUES ($1, $2, $3, false, NOW() AT TIME ZONE 'UTC')
       RETURNING id, sender_id, recipient_id, content, is_read, created_at`,
      [myId, otherId, content.trim()]
    );

    const message = result.rows[0];

    const io = req.app.locals.io;
    if (io) {
      io.to(`user:${otherId}`).emit('new_message', message);
      io.to(`user:${myId}`).emit('new_message', message);
    }

    res.status(201).json({ status: 'success', data: message });
  } catch (error) {
    console.error('❌ Error sending message:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

module.exports = { getContacts, getMessages, sendMessage, getUnreadCount };

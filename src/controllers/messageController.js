const { pool } = require('../config/db');

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/messages/conversations
// Returns a list of unique conversations for the logged-in user,
// including the other party's name/avatar and the last message.
// Works for both students and tutors.
// ─────────────────────────────────────────────────────────────────────────────
const getConversations = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT DISTINCT ON (other_user_id)
         other_user_id,
         other_name,
         other_avatar,
         other_role,
         last_content,
         last_sent_at,
         unread_count
       FROM (
         SELECT
           CASE WHEN m.sender_id = $1 THEN m.recipient_id ELSE m.sender_id END AS other_user_id,
           COALESCE(tp.full_name, sp.full_name, 'Unknown')                     AS other_name,
           COALESCE(tp.profile_picture_url, sp.profile_picture_url)            AS other_avatar,
           CASE WHEN tp.user_id IS NOT NULL THEN 'tutor' ELSE 'student' END    AS other_role,
           m.content                                                            AS last_content,
           m.created_at                                                         AS last_sent_at,
           (
             SELECT COUNT(*) FROM messages m2
             WHERE m2.sender_id != $1
               AND m2.recipient_id = $1
               AND m2.is_read = FALSE
               AND (m2.sender_id = CASE WHEN m.sender_id = $1 THEN m.recipient_id ELSE m.sender_id END)
           ) AS unread_count
         FROM messages m
         LEFT JOIN tutor_profiles  tp ON tp.user_id  = CASE WHEN m.sender_id = $1 THEN m.recipient_id ELSE m.sender_id END
         LEFT JOIN student_profiles sp ON sp.user_id = CASE WHEN m.sender_id = $1 THEN m.recipient_id ELSE m.sender_id END
         WHERE m.sender_id = $1 OR m.recipient_id = $1
         ORDER BY m.created_at DESC
       ) sub
       ORDER BY other_user_id, last_sent_at DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/messages/:userId
// Returns the full message thread between the current user and :userId.
// Also marks all incoming messages as read.
// ─────────────────────────────────────────────────────────────────────────────
const getMessages = async (req, res, next) => {
  try {
    const myId     = req.user.id;
    const otherId  = parseInt(req.params.userId, 10);

    // Mark messages from the other user as read
    await pool.query(
      `UPDATE messages SET is_read = TRUE
       WHERE sender_id = $1 AND recipient_id = $2 AND is_read = FALSE`,
      [otherId, myId]
    );

    const result = await pool.query(
      `SELECT
         m.id,
         m.sender_id,
         m.recipient_id,
         m.content,
         m.is_read,
         m.created_at,
         COALESCE(tp.full_name, sp.full_name, 'Unknown') AS sender_name,
         COALESCE(tp.profile_picture_url, sp.profile_picture_url) AS sender_avatar
       FROM messages m
       LEFT JOIN tutor_profiles   tp ON tp.user_id  = m.sender_id
       LEFT JOIN student_profiles sp ON sp.user_id  = m.sender_id
       WHERE (m.sender_id = $1 AND m.recipient_id = $2)
          OR (m.sender_id = $2 AND m.recipient_id = $1)
       ORDER BY m.created_at ASC`,
      [myId, otherId]
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/messages/:userId
// Sends a message from the current user to :userId.
// Also emits a real-time Socket.io event to the recipient.
// ─────────────────────────────────────────────────────────────────────────────
const sendMessage = async (req, res, next) => {
  try {
    const senderId    = req.user.id;
    const recipientId = parseInt(req.params.userId, 10);
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'Message content cannot be empty.' });
    }

    // Check recipient exists
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [recipientId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Recipient not found.' });
    }

    const result = await pool.query(
      `INSERT INTO messages (sender_id, recipient_id, content)
       VALUES ($1, $2, $3)
       RETURNING id, sender_id, recipient_id, content, is_read, created_at`,
      [senderId, recipientId, content.trim()]
    );

    const message = result.rows[0];

    // Emit real-time event to recipient via Socket.io
    const io = req.app.locals.io;
    if (io) {
      io.to(`user:${recipientId}`).emit('new_message', {
        ...message,
        sender_name: req.user.name || 'Unknown',
      });
    }

    res.status(201).json(message);
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/messages/contacts
// Returns tutors the student is enrolled with (approved memberships),
// so students know who they can message.
// ─────────────────────────────────────────────────────────────────────────────
const getContacts = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const role   = req.user.role;

    let result;
    if (role === 'student') {
      result = await pool.query(
        `SELECT DISTINCT
           u.id,
           tp.full_name  AS name,
           tp.profile_picture_url AS avatar,
           'tutor' AS role
         FROM community_memberships cm
         JOIN communities c  ON c.id = cm.community_id
         JOIN users u        ON u.id = c.tutor_id
         JOIN tutor_profiles tp ON tp.user_id = u.id
         WHERE cm.student_id = $1 AND cm.status = 'approved'
         ORDER BY tp.full_name ASC`,
        [userId]
      );
    } else {
      // For tutors: return students enrolled in their communities
      result = await pool.query(
        `SELECT DISTINCT
           u.id,
           sp.full_name AS name,
           sp.profile_picture_url AS avatar,
           'student' AS role
         FROM communities c
         JOIN community_memberships cm ON cm.community_id = c.id
         JOIN users u        ON u.id = cm.student_id
         JOIN student_profiles sp ON sp.user_id = u.id
         WHERE c.tutor_id = $1 AND cm.status = 'approved'
         ORDER BY sp.full_name ASC`,
        [userId]
      );
    }

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
};

module.exports = { getConversations, getMessages, sendMessage, getContacts };

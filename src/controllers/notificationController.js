const { pool } = require('../config/db');

// Columns: id, user_id, type, title, body, related_enrollment_id,
// related_community_id, related_membership_id, related_post_id,
// related_deadline_id, related_message_id, related_review_id, is_read,
// created_at. This table + its indexes (idx_notifications_user,
// idx_notifications_user_unread) already existed in the DB, unused by any
// code — this controller is the first thing to read/write it.

// GET /api/notifications?limit=20
const getNotifications = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const result = await pool.query(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [req.user.id, limit]
    );
    res.status(200).json({ status: 'success', data: result.rows });
  } catch (error) {
    console.error('❌ Error fetching notifications:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// GET /api/notifications/unread-count
const getUnreadCount = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = false`,
      [req.user.id]
    );
    res.status(200).json({ status: 'success', data: { count: result.rows[0].count } });
  } catch (error) {
    console.error('❌ Error fetching unread notification count:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// PATCH /api/notifications/:id/read
const markAsRead = async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2 RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Notification not found' });
    }
    res.status(200).json({ status: 'success', data: result.rows[0] });
  } catch (error) {
    console.error('❌ Error marking notification read:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// PATCH /api/notifications/read-all
const markAllAsRead = async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false`,
      [req.user.id]
    );
    res.status(200).json({ status: 'success' });
  } catch (error) {
    console.error('❌ Error marking all notifications read:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * Shared "persist then emit" helper — mirrors messageController.sendMessage's
 * INSERT-then-`io.to('user:<id>').emit(...)` pattern. Call from any
 * controller that has `req.app.locals.io` and knows who to notify.
 *
 * `relatedId`/`relatedColumn` populate one of the table's typed FK columns
 * (e.g. related_enrollment_id) — pass relatedColumn: null to leave all of
 * them null (not every notification type needs one).
 */
const createNotification = async ({ io, userId, type, title, body, relatedColumn, relatedId }) => {
  const columns = ['user_id', 'type', 'title', 'body'];
  const values = [userId, type, title, body];
  if (relatedColumn) {
    columns.push(relatedColumn);
    values.push(relatedId);
  }
  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

  const result = await pool.query(
    `INSERT INTO notifications (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`,
    values
  );
  const notification = result.rows[0];
  if (io) io.to(`user:${userId}`).emit('new_notification', notification);
  return notification;
};

module.exports = { getNotifications, getUnreadCount, markAsRead, markAllAsRead, createNotification };

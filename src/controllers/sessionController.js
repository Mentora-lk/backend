const { pool } = require('../config/db');

module.exports = {
  // GET /api/admin/sessions
  getSessions: async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          s.id,
          s.subject,
          s.session_time,
          s.mode,
          s.status,
          s.fee,
          s.created_at,
          tu.email AS tutor_email,
          tp.full_name AS tutor_name,
          su.email AS student_email,
          sp.full_name AS student_name
        FROM sessions s
        LEFT JOIN users tu ON s.tutor_id = tu.id
        LEFT JOIN tutor_profiles tp ON tp.user_id = tu.id
        LEFT JOIN users su ON s.student_id = su.id
        LEFT JOIN student_profiles sp ON sp.user_id = su.id
        ORDER BY s.created_at DESC
      `);
      res.json(result.rows);
    } catch (err) {
      console.error('Get sessions error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  },

  // POST /api/admin/sessions
  createSession: async (req, res) => {
    const { tutor_id, student_id, subject, session_time, mode, fee } = req.body;
    if (!subject || !session_time) {
      return res.status(400).json({ message: 'Subject and time are required' });
    }
    try {
      const result = await pool.query(
        `INSERT INTO sessions (tutor_id, student_id, subject, session_time, mode, fee, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'Pending') RETURNING *`,
        [tutor_id || null, student_id || null, subject, session_time, mode || 'Online', fee || null]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error('Create session error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  },

  // PUT /api/admin/sessions/:id
  updateSessionStatus: async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ message: 'Status is required' });
    }
    try {
      const result = await pool.query(
        'UPDATE sessions SET status = $1 WHERE id = $2 RETURNING *',
        [status, id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Session not found' });
      }
      res.json(result.rows[0]);
    } catch (err) {
      console.error('Update session error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  },
};

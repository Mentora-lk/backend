const { pool } = require('../config/db');
const { hashPassword, comparePassword } = require('../utils/passwordHash');

module.exports = {
  // GET /api/admin/dashboard
  getDashboard: async (req, res) => {
    try {
      const totalUsers    = await pool.query("SELECT COUNT(*) FROM users");
      const totalTutors   = await pool.query("SELECT COUNT(*) FROM tutor_profiles");
      const totalStudents = await pool.query("SELECT COUNT(*) FROM student_profiles");
      const totalCourses  = await pool.query("SELECT COUNT(*) FROM courses");
      res.json({
        totalUsers:    parseInt(totalUsers.rows[0].count),
        totalTutors:   parseInt(totalTutors.rows[0].count),
        totalStudents: parseInt(totalStudents.rows[0].count),
        totalCourses:  parseInt(totalCourses.rows[0].count),
      });
    } catch (err) {
      console.error('Dashboard error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  },

  // GET /api/admin/tutors
  getTutors: async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT tp.id, tp.full_name, tp.email, tp.subject, tp.city, u.created_at,
              tp.university, tp.degree_title, tp.graduation_year, tp.experience,
              tp.credentials, tp.description,
              tp.dob, tp.gender, tp.phone, tp.address,
              tp.medium, tp.level, tp.grade_range, tp.class_type, tp.fee
       FROM tutor_profiles tp
       JOIN users u ON tp.user_id = u.id
       ORDER BY u.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get tutors error:', err);
    res.status(500).json({ message: 'Server error' });
  }
},

  // POST /api/admin/tutors
  createTutor: async (req, res) => {
    const { fullName, email, password, subject, city, phone } = req.body;
    if (!fullName || !email || !password) {
      return res.status(400).json({ message: 'Full name, email and password are required' });
    }
    try {
      const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (exists.rows.length > 0) {
        return res.status(400).json({ message: 'Email already registered' });
      }
      const password_hash = await hashPassword(password);
      const userResult = await pool.query(
        `INSERT INTO users (email, password_hash, role, is_verified) VALUES ($1, $2, 'tutor', true) RETURNING id`,
        [email, password_hash]
      );
      const userId = userResult.rows[0].id;
      await pool.query(
        `INSERT INTO tutor_profiles (user_id, full_name, email, subject, city, phone)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, fullName, email, subject || null, city || null, phone || null]
      );
      res.status(201).json({ message: 'Tutor created successfully' });
    } catch (err) {
      console.error('Create tutor error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  },

  // GET /api/admin/students
  getStudents: async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT sp.user_id, sp.full_name, sp.school_institute, sp.age, sp.language,
              sp.grade_level, sp.address, sp.phone, sp.bio, sp.profile_picture_url,
              u.email, u.created_at
       FROM student_profiles sp
       JOIN users u ON sp.user_id = u.id
       ORDER BY u.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get students error:', err);
    res.status(500).json({ message: 'Server error' });
  }
},

  // POST /api/admin/students
  createStudent: async (req, res) => {
    const { fullName, email, password, gradeLevel, schoolInstitute, phone } = req.body;
    if (!fullName || !email || !password) {
      return res.status(400).json({ message: 'Full name, email and password are required' });
    }
    try {
      const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (exists.rows.length > 0) {
        return res.status(400).json({ message: 'Email already registered' });
      }
      const password_hash = await hashPassword(password);
      const userResult = await pool.query(
        `INSERT INTO users (email, password_hash, role, is_verified) VALUES ($1, $2, 'student', true) RETURNING id`,
        [email, password_hash]
      );
      const userId = userResult.rows[0].id;
      await pool.query(
        `INSERT INTO student_profiles (user_id, full_name, grade_level, school_institute, phone)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, fullName, gradeLevel || null, schoolInstitute || null, phone || null]
      );
      res.status(201).json({ message: 'Student created successfully' });
    } catch (err) {
      console.error('Create student error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  },

  // GET /api/admin/sessions (READ ONLY from enrollments)
  getSessions: async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT
           e.id,
           e.full_name   AS student,
           e.preferred_mode AS mode,
           e.selected_day,
           e.selected_time,
           e.status,
           e.grade,
           e.school,
           e.sessions_attended,
           e."createdAt"
         FROM enrollments e
         ORDER BY e."createdAt" DESC`
      );
      res.json(result.rows);
    } catch (err) {
      console.error('Get sessions error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  },

  // POST /api/admin/sessions
  createSession: async (req, res) => {
    const { classId, studentId, fullName, phone, school, grade, email, message, preferredMode, selectedDay, selectedTime } = req.body;
    if (!classId || !studentId || !fullName || !selectedDay || !selectedTime) {
      return res.status(400).json({ message: 'Class ID, Student ID, name, day and time are required' });
    }
    try {
      await pool.query(
        `INSERT INTO enrollments
           (class_id, student_id, full_name, phone, school, grade, email, message, preferred_mode, selected_day, selected_time, status, sessions_attended, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'requested', 0, NOW(), NOW())`,
        [classId || null, studentId || null, fullName, phone || null, school || null, grade || null, email || null, message || null, preferredMode || 'online', selectedDay, selectedTime]
      );
      res.status(201).json({ message: 'Session created successfully' });
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
        'UPDATE enrollments SET status = $1 WHERE id = $2 RETURNING *',
        [status, id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Session not found' });
      }
      res.json(result.rows[0]);
    } catch (err) {
      console.error('Update session status error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  },

  // GET /api/admin/payments
  getPayments: async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT * FROM enrollments ORDER BY "createdAt" DESC`
      );
      res.json(result.rows);
    } catch (err) {
      console.error('Get payments error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  },

  // GET /api/admin/tutor-payments
  // Payments tutors made for advertisement placements (tutor_payments table),
  // joined with tutor_profiles to get the tutor's display name.
  getTutorPayments: async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT tp.*, tprof.full_name as tutor_name
         FROM tutor_payments tp
         LEFT JOIN tutor_profiles tprof ON tp.tutor_id = tprof.id
         ORDER BY tp."createdAt" DESC`
      );
      res.json(result.rows);
    } catch (err) {
      console.error('Get tutor payments error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  },

  // GET /api/admin/ads
  getAds: async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT a.*, tp.full_name as tutor_name
         FROM advertisements a
         JOIN tutor_profiles tp ON a.tutor_id = tp.id
         ORDER BY a.created_at DESC`
      );
      res.json(result.rows);
    } catch (err) {
      console.error('Get ads error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  },

  // POST /api/admin/ads
  createAd: async (req, res) => {
    const { tutorId, title, description, price } = req.body;
    if (!tutorId || !title) {
      return res.status(400).json({ message: 'Tutor and title are required' });
    }
    try {
      await pool.query(
        `INSERT INTO advertisements (tutor_id, title, description, price, status, created_at)
         VALUES ($1, $2, $3, $4, 'pending', NOW())`,
        [tutorId, title, description || null, price || null]
      );
      res.status(201).json({ message: 'Advertisement created successfully' });
    } catch (err) {
      console.error('Create ad error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  },

  // PUT /api/admin/ads/:id
  updateAdStatus: async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    try {
      await pool.query(
        'UPDATE advertisements SET status = $1 WHERE id = $2',
        [status, id]
      );
      res.json({ message: 'Ad status updated' });
    } catch (err) {
      console.error('Update ad error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  },

  // GET /api/admin/me
  getMe: async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, full_name, email, admin_code, contact_number, photo_url, created_at
         FROM admins WHERE id = $1`,
        [req.admin.id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Admin not found' });
      }
      res.json(result.rows[0]);
    } catch (err) {
      console.error('Get admin profile error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  },

  // PUT /api/admin/me
  updateMe: async (req, res) => {
    const { fullName, contactNumber, photoUrl } = req.body;
    if (!fullName || !fullName.trim()) {
      return res.status(400).json({ message: 'Full name is required' });
    }
    try {
      const result = await pool.query(
        `UPDATE admins SET full_name = $1, contact_number = $2, photo_url = $3
         WHERE id = $4
         RETURNING id, full_name, email, admin_code, contact_number, photo_url, created_at`,
        [fullName.trim(), contactNumber || null, photoUrl || null, req.admin.id]
      );
      res.json(result.rows[0]);
    } catch (err) {
      console.error('Update admin profile error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  },

  // PUT /api/admin/me/password
  changePassword: async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new password are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'New password must be at least 8 characters' });
    }
    try {
      const result = await pool.query('SELECT * FROM admins WHERE id = $1', [req.admin.id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Admin not found' });
      }
      const admin = result.rows[0];
      const isMatch = await comparePassword(currentPassword, admin.password_hash);
      if (!isMatch) {
        return res.status(401).json({ message: 'Current password is incorrect' });
      }
      const password_hash = await hashPassword(newPassword);
      await pool.query('UPDATE admins SET password_hash = $1 WHERE id = $2', [password_hash, req.admin.id]);
      res.json({ message: 'Password updated successfully' });
    } catch (err) {
      console.error('Change password error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  },
};
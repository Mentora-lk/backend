// src/controllers/enrollmentController.js

const { pool } = require('../config/db');

//!POST /api/enrollments
const createEnrollment = async (req, res, next) => {
  try {
    const {
      classId,
      fullName,
      email,
      phone,
      school,
      grade,
      message,
      preferredMode,
      selectedDay,
      selectedTime,
    } = req.body;

    if (!classId || !fullName || !email || !phone || !grade || !selectedDay || !selectedTime) {
      return res.status(400).json({ message: 'Missing required enrollment fields' });
    }

    // Use authenticated user's ID, fallback to 1 if not authenticated
    const studentId = req.user?.id || 1;

    // Check course exists
    const courseResult = await pool.query(
      'SELECT * FROM courses WHERE id = $1',
      [classId]
    );

    if (courseResult.rows.length === 0) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const course = courseResult.rows[0];

    if (course.status !== 'active') {
      return res.status(400).json({ message: 'This course is not accepting enrollments' });
    }

    // Prevent duplicate enrollment
    const existingResult = await pool.query(
      'SELECT * FROM enrollments WHERE student_id = $1 AND class_id = $2',
      [studentId, classId]
    );

    if (existingResult.rows.length > 0) {
      return res.status(409).json({
        message: 'You are already enrolled or have a pending request for this class',
      });
    }

    // Check max students
    const enrolledResult = await pool.query(
      "SELECT COUNT(*) FROM enrollments WHERE class_id = $1 AND status IN ('approved', 'active')",
      [classId]
    );

    const enrolledCount = parseInt(enrolledResult.rows[0].count);

    if (enrolledCount >= course.max_students) {
      return res.status(400).json({ message: 'This class is full' });
    }

    //! Create enrollment
    const bookingResult = await pool.query(
      `INSERT INTO enrollments 
        (student_id, class_id, status, full_name, phone, school, grade, message, preferred_mode, selected_day, selected_time, "createdAt", "updatedAt")
       VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
       RETURNING *`,
      [
        studentId,
        classId,
        'requested',
        fullName,
        phone,
        school || null,
        grade,
        message || null,
        preferredMode || course.mode,
        selectedDay,
        selectedTime,
      ]
    );

    res.status(201).json({
      message: 'Enrollment request submitted successfully',
      enrollment: bookingResult.rows[0],
    });
  } catch (err) {
    next(err);
  }
};

//! GET /api/enrollments/mine
const getMyEnrollments = async (req, res, next) => {
  try {
    const { status } = req.query;
    let where = ['e.student_id = $1'];
    let params = [req.user.id];

    if (status && status !== 'all') {
      where.push(`e.status = $2`);
      params.push(status);
    }

    const result = await pool.query(
      `SELECT 
        e.*,
        c.title,
        c.subject,
        c.mode,
        c.location,
        c.fee,
        c.image,
        c.average_rating,
        c.max_students,
        c.schedule,
        c.badge,
        tp.full_name AS tutor_name,
        tp.id   AS tutor_id,
        tp.profile_picture_url AS tutor_avatar
       FROM enrollments e
       LEFT JOIN courses c ON e.class_id = c.id
       LEFT JOIN tutor_profiles tp ON c.tutor_id = tp.id
       WHERE ${where.join(' AND ')}
       ORDER BY e."createdAt" DESC`,
      params
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
};

//! GET /api/enrollments/schedule
const getMySchedule = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT 
        e.id          AS enrollment_id,
        e.selected_day,
        e.selected_time,
        e.preferred_mode,
        e.status,
        c.id          AS course_id,
        c.title,
        c.subject,
        c.schedule,
        c.mode,
        c.location,
        tp.full_name  AS tutor_name
       FROM enrollments e
       LEFT JOIN courses c ON e.class_id = c.id
       LEFT JOIN tutor_profiles tp ON c.tutor_id = tp.id
       WHERE e.student_id = $1
         AND e.status IN ('approved', 'active')`,
      [req.user.id]
    );

    // Shape for schedule page
    const sessions = result.rows.map(row => ({
      enrollmentId: row.enrollment_id,
      courseId:     row.course_id,
      title:        row.title,
      subject:      row.subject,
      tutor:        row.tutor_name,
      mode:         row.preferred_mode || row.mode,
      location:     row.location,
      selectedDay:  row.selected_day,
      selectedTime: row.selected_time,
      schedule:     row.schedule,
    }));

    res.json(sessions);
  } catch (err) {
    next(err);
  }
};

//! PATCH /api/enrollments/:id
const updateEnrollmentStatus = async (req, res, next) => {
  try {
    const { status } = req.body;

    const validStatuses = ['approved', 'rejected', 'active', 'cancelled'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        message: `Status must be one of: ${validStatuses.join(', ')}`,
      });
    }

    const existingResult = await pool.query(
      'SELECT * FROM enrollments WHERE id = $1',
      [req.params.id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ message: 'Enrollment not found' });
    }

    const updateResult = await pool.query(
      `UPDATE enrollments
       SET status = $1, "updatedAt" = NOW()
       WHERE id = $2
       RETURNING *`,
      [status, req.params.id]
    );

    res.json({
      message: `Enrollment ${status}`,
      enrollment: updateResult.rows[0],
    });
  } catch (err) {
    next(err);
  }
};

//! DELETE /api/enrollments/:id
const deleteEnrollment = async (req, res, next) => {
  try {
    // Use authenticated user's ID
    const studentId = req.user.id;

    const existingResult = await pool.query(
      'SELECT * FROM enrollments WHERE id = $1',
      [req.params.id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ message: 'Enrollment not found' });
    }

    const enrollment = existingResult.rows[0];

    if (enrollment.student_id !== studentId) {
      return res.status(403).json({ message: 'Not your enrollment' });
    }

    await pool.query(
      'DELETE FROM enrollments WHERE id = $1',
      [req.params.id]
    );

    res.json({ message: 'Enrollment removed' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createEnrollment,
  getMyEnrollments,
  getMySchedule,
  updateEnrollmentStatus,
  deleteEnrollment,
};
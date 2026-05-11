const { pool } = require('../config/db');

// GET /api/courses
const getCourses = async (req, res, next) => {
  try {
    const {
      subject, mode, location,
      minRating = 0, maxFee = 99999,
      sortBy = 'rating', page = 1, limit = 6,
      q = '',
    } = req.query;

    let where = ['status = $1'];
    let params = ['active'];
    let index = 2;

    if (subject && subject !== 'All') {
      where.push(`subject = $${index++}`);
      params.push(subject);
    }
    if (mode && mode !== 'All') {
      where.push(`mode = $${index++}`);
      params.push(mode);
    }
    if (location && location !== 'All Locations') {
      where.push(`location = $${index++}`);
      params.push(location);
    }
    if (maxFee) {
      where.push(`fee <= $${index++}`);
      params.push(Number(maxFee));
    }
    if (minRating > 0) {
      where.push(`average_rating >= $${index++}`);
      params.push(Number(minRating));
    }
    if (q) {
      where.push(`(title ILIKE $${index} OR subject ILIKE $${index + 1})`);
      params.push(`%${q}%`, `%${q}%`);
      index += 2;
    }

    const orderMap = {
      rating: 'average_rating DESC',
      fee_asc: 'fee ASC',
      fee_desc: 'fee DESC',
      reviews: 'review_count DESC',
    };

    const orderBy = orderMap[sortBy] || orderMap.rating;
    const offset = (page - 1) * limit;

    // Count
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM PoatAD WHERE ${where.join(' AND ')}`,
      params
    );

    const total = parseInt(countResult.rows[0].count);

    // Courses
    const coursesResult = await pool.query(
      `SELECT * FROM PoatAD
       WHERE ${where.join(' AND ')}
       ORDER BY ${orderBy}
       LIMIT $${index} OFFSET $${index + 1}`,
      [...params, limit, offset]
    );

    res.json({
      courses: coursesResult.rows,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: Number(page),
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/courses (Tutor only)
const createCourse = async (req, res, next) => {
  try {
    const { title, subject, description, fee, schedule, medium, mode, location, max_students, image, grade } = req.body;
    
    // Validate required fields
    if (!title || !subject || !fee) {
      return res.status(400).json({ message: 'Title, subject, and fee are required' });
    }

    const tutorId = req.user.id; // From authMiddleware

    const result = await pool.query(
      `INSERT INTO PoatAD 
       (tutor_id, title, subject, description, fee, schedule, mode, location, max_students, status, image, grade, medium, "createdAt", "updatedAt") 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW()) RETURNING *`,
      [tutorId, title, subject, description, fee, schedule, mode || 'both', location || 'Remote', max_students || 50, 'active', image || '', grade || '', medium || '']
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/courses/:id (Tutor only)
const deleteCourse = async (req, res, next) => {
  try {
    const courseId = req.params.id;
    const tutorId = req.user.id; // From authMiddleware

    // Verify course belongs to tutor
    const courseResult = await pool.query('SELECT * FROM PoatAD WHERE id = $1 AND tutor_id = $2', [courseId, tutorId]);
    
    if (courseResult.rows.length === 0) {
      return res.status(404).json({ message: 'Course not found or unauthorized' });
    }

    // Delete enrollments for this course first due to foreign key constraints
    await pool.query('DELETE FROM enrollments WHERE class_id = $1', [courseId]);
    await pool.query('DELETE FROM reviews WHERE course_id = $1', [courseId]);
    await pool.query('DELETE FROM PoatAD WHERE id = $1', [courseId]);

    res.json({ message: 'Course deleted successfully' });
  } catch (err) {
    next(err);
  }
};

// GET /api/courses/:id
const getCourseById = async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT * FROM PoatAD WHERE id = $1',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const course = result.rows[0];

    const enrolled = await pool.query(
      "SELECT COUNT(*) FROM enrollments WHERE class_id = $1 AND status IN ('approved','active')",
      [course.id]
    );

    res.json({
      ...course,
      enrolledCount: parseInt(enrolled.rows[0].count),
    });
  } catch (err) {
    next(err);
  }
};

// GET reviews
const getCourseReviews = async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT * FROM reviews WHERE course_id = $1 ORDER BY "createdAt" DESC',
      [req.params.id]
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
};

// POST review
const addReview = async (req, res, next) => {
  try {
    const { rating, comment } = req.body;
    const courseId = Number(req.params.id);

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be 1-5' });
    }

    const exists = await pool.query(
      'SELECT * FROM enrollments WHERE student_id = $1 AND class_id = $2 AND status IN ($3,$4)',
      [req.user.id, courseId, 'approved', 'active']
    );

    if (exists.rows.length === 0) {
      return res.status(403).json({ message: 'Must be enrolled' });
    }

    const inserted = await pool.query(
      `INSERT INTO reviews (student_id, course_id, rating, comment, "createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,NOW(),NOW()) RETURNING *`,
      [req.user.id, courseId, rating, comment]
    );

    res.status(201).json(inserted.rows[0]);
  } catch (err) {
    next(err);
  }
};

// PUT /api/courses/:id (Tutor only)
const updateCourse = async (req, res, next) => {
  try {
    const courseId = req.params.id;
    const tutorId = req.user.id;
    const { title, subject, description, fee, schedule, medium, mode, location, max_students, image, grade } = req.body;

    // Verify course belongs to tutor
    const check = await pool.query('SELECT * FROM PoatAD WHERE id = $1 AND tutor_id = $2', [courseId, tutorId]);
    if (check.rows.length === 0) {
      return res.status(404).json({ message: 'Course not found or unauthorized' });
    }

    const result = await pool.query(
      `UPDATE PoatAD 
       SET title = $1, subject = $2, description = $3, fee = $4, schedule = $5, 
           medium = $6, mode = $7, location = $8, max_students = $9, image = $10, 
           grade = $11, "updatedAt" = NOW()
       WHERE id = $12 AND tutor_id = $13 RETURNING *`,
      [title, subject, description, fee, schedule, medium, mode, location, max_students, image, grade, courseId, tutorId]
    );

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getCourses,
  getCourseById,
  getCourseReviews,
  addReview,
  createCourse,
  deleteCourse,
  updateCourse,
};
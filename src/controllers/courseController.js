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

    const minRatingNum = Number(minRating);
    const maxFeeNum = Number(maxFee);
    const pageNum = Number(page);
    const limitNum = Number(limit);

    let where = [];
    let params = [];
    let index = 1;

    if (q) {
      where.push(`c.title ILIKE $${index++}`);
      params.push(`%${q}%`);
    }

    if (subject) {
      where.push(`c.subject = $${index++}`);
      params.push(subject);
    }

    if (mode) {
      where.push(`c.mode = $${index++}`);
      params.push(mode);
    }

    if (location) {
      where.push(`c.location = $${index++}`);
      params.push(location);
    }

    if (minRatingNum > 0) {
      where.push(`c.average_rating >= $${index++}`);
      params.push(minRatingNum);
    }

    if (maxFeeNum < 99999) {
      where.push(`c.fee <= $${index++}`);
      params.push(maxFeeNum);
    }

    where.push(`c.status = $${index++}`);
    params.push('active');

    if (where.length === 0) {
      where.push("1=1");
    }

    const orderMap = {
      rating: 'average_rating DESC',
      fee_asc: 'fee ASC',
      fee_desc: 'fee DESC',
      reviews: 'review_count DESC',
    };

    const orderBy = orderMap[sortBy] || orderMap.rating;
    const offset = (pageNum - 1) * limitNum;

    // Count
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM poatad c WHERE ${where.join(' AND ')}`,
      params
    );

    const total = parseInt(countResult.rows[0].count);

    // Courses with tutor info
    const coursesResult = await pool.query(
      `SELECT c.*, t.full_name as tutor_name 
       FROM poatad c
       LEFT JOIN tutor_profiles t ON c.tutor_id = t.user_id
       WHERE ${where.join(' AND ')}
       ORDER BY c.${orderBy}
       LIMIT $${index} OFFSET $${index + 1}`,
      [...params, limitNum, offset]
    );

    res.json({
      courses: coursesResult.rows,
      total,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
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
    if (!title || !subject || fee === undefined || fee === null || fee === '') {
      return res.status(400).json({ message: 'Title, subject, and fee are required' });
    }

    const tutorId = req.user.id; // From authMiddleware

    // 1. Create advertisement in 'pending' status
    const result = await pool.query(
      `INSERT INTO poatad 
       (tutor_id, title, subject, description, fee, schedule, mode, location, max_students, status, image, grade, medium, "createdAt", "updatedAt") 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW()) RETURNING *`,
      [tutorId, title, subject, description, fee, schedule, mode || 'both', location || 'Remote', max_students || 50, 'pending', image || '', grade || '', medium || '']
    );

    const newAd = result.rows[0];

    // 2. Create Payment Record
    const amount = parseFloat(process.env.POST_AD_FEE || '500').toFixed(2);
    const currency = process.env.CURRENCY || 'LKR';
    const merchantId = process.env.PAYHERE_MERCHANT_ID;
    const merchantSecret = process.env.PAYHERE_SECRET;
    const orderId = `ORDER_${Date.now()}_${tutorId}_${newAd.id}`;

    await pool.query(
      `INSERT INTO tutor_payments (tutor_id, ad_id, order_id, amount, currency, status, "createdAt", "updatedAt") 
       VALUES ($1, $2, $3, $4, $5, 'PENDING', NOW(), NOW())`,
      [tutorId, newAd.id, orderId, amount, currency]
    );

    // 3. Generate PayHere Hash
    const crypto = require('crypto');
    const hashedSecret = crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase();
    const hashString = merchantId + orderId + amount + currency + hashedSecret;
    const hash = crypto.createHash('md5').update(hashString).digest('hex').toUpperCase();

    // Fetch tutor details for PayHere required fields
    const userRes = await pool.query('SELECT email FROM users WHERE id = $1', [tutorId]);
    const profileRes = await pool.query('SELECT full_name, phone, city FROM tutor_profiles WHERE user_id = $1', [tutorId]);
    
    const tutorEmail = userRes.rows[0]?.email || 'tutor@example.com';
    const fullName = profileRes.rows[0]?.full_name || 'Tutor Name';
    const nameParts = fullName.split(' ');
    const firstName = nameParts[0] || 'Tutor';
    const lastName = nameParts.slice(1).join(' ') || 'Name';
    const phone = profileRes.rows[0]?.phone || '0771234567';
    const city = profileRes.rows[0]?.city || 'Colombo';

    // 4. Return both the ad and payment configuration
    res.status(201).json({
      course: newAd,
      payment: {
        sandbox: true,
        merchant_id: merchantId,
        return_url: 'http://localhost:3000/dashboard/tutor/my-classes',
        cancel_url: 'http://localhost:3000/dashboard/tutor/post-ad',
        notify_url: 'http://localhost:5000/api/payments/payhere/notify',
        order_id: orderId,
        items: `Post Ad: ${title}`,
        amount: amount,
        currency: currency,
        hash: hash,
        // PayHere requires customer details
        first_name: firstName,
        last_name: lastName,
        email: tutorEmail,
        phone: phone,
        address: city,
        city: city,
        country: 'Sri Lanka'
      }
    });
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
    const courseResult = await pool.query('SELECT * FROM poatad WHERE id = $1 AND tutor_id = $2', [courseId, tutorId]);
    
    if (courseResult.rows.length === 0) {
      return res.status(404).json({ message: 'Course not found or unauthorized' });
    }

    // Delete enrollments for this course first due to foreign key constraints
    await pool.query('DELETE FROM enrollments WHERE class_id = $1', [courseId]);
    await pool.query('DELETE FROM reviews WHERE course_id = $1', [courseId]);
    await pool.query('DELETE FROM poatad WHERE id = $1', [courseId]);

    res.json({ message: 'Course deleted successfully' });
  } catch (err) {
    next(err);
  }
};

// GET /api/courses/:id
const getCourseById = async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT * FROM poatad WHERE id = $1',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const course = result.rows[0];

    const tutorResult = await pool.query(
      'SELECT * FROM tutor_profiles WHERE user_id = $1',
      [course.tutor_id]
    );

    const tutor = tutorResult.rows[0] || null;

    const enrolledResult = await pool.query(
      `SELECT COUNT(*) FROM enrollments 
       WHERE class_id = $1 AND status IN ('approved','active')`,
      [course.id]
    );

    res.json({
      id:             course.id,
      tutor_id:       course.tutor_id,
      title:          course.title,
      subject:        course.subject,
      description:    course.description,
      fee:            course.fee,
      mode:           course.mode,
      location:       course.location,
      schedule:       course.schedule,
      what_you_learn: course.what_you_learn,
      max_students:   course.max_students,
      status:         course.status,
      average_rating: course.average_rating,
      review_count:   course.review_count,
      badge:          course.badge,
      image:          course.image,
      enrolledCount:  parseInt(enrolledResult.rows[0].count),
      tutor_name:           tutor?.full_name           || 'Unknown Tutor',
      tutor_avatar:         tutor?.profile_picture_url || null,
      tutor_bio:            tutor?.description         || '',
      tutor_qualifications: tutor?.degree_title        || '',
      tutor_university:     tutor?.university          || '',
      tutor_experience:     tutor?.experience          || '',
      tutor_medium:         tutor?.medium              || '',
      tutor_subjects:       tutor?.subjects            || [],
      tutor_city:           tutor?.city                || '',
      tutor_is_verified:    tutor?.status === 'active',
      tutor_average_rating: Number(course.average_rating) || 0,
      tutor_total_students: 0,
    });
  } catch (err) {
    console.error('getCourseById error:', err.message);
    next(err);
  }
};

// GET reviews
const getCourseReviews = async (req, res, next) => {
  try {
    // First get the tutor_id for this course
    const courseResult = await pool.query(
      'SELECT tutor_id FROM poatad WHERE id = $1',
      [req.params.id]
    );

    if (courseResult.rows.length === 0) {
      return res.json([]);
    }

    const tutorId = courseResult.rows[0].tutor_id;

    // Get reviews for this tutor
    const result = await pool.query(
      `SELECT 
        r.*,
        sp.full_name AS student_name
       FROM reviews r
       LEFT JOIN student_profiles sp ON r.student_id = sp.user_id
       WHERE r.tutor_id = $1
       ORDER BY r."createdAt" DESC`,
      [tutorId]
    );

    const reviews = result.rows.map(r => ({
      ...r,
      student: { name: r.student_name || 'Student' },
    }));

    res.json(reviews);
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

    // Get tutor_id from course
    const courseResult = await pool.query(
      'SELECT tutor_id FROM poatad WHERE id = $1',
      [courseId]
    );

    if (courseResult.rows.length === 0) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const tutorId = courseResult.rows[0].tutor_id;

    const exists = await pool.query(
      'SELECT * FROM enrollments WHERE student_id = $1 AND class_id = $2 AND status IN ($3,$4)',
      [req.user.id, courseId, 'approved', 'active']
    );

    if (exists.rows.length === 0) {
      return res.status(403).json({ message: 'Must be enrolled' });
    }

    const inserted = await pool.query(
      `INSERT INTO reviews (student_id, tutor_id, rating, comment, "createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,NOW(),NOW()) RETURNING *`,
      [req.user.id, tutorId, rating, comment]
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
    const check = await pool.query('SELECT * FROM poatad WHERE id = $1 AND tutor_id = $2', [courseId, tutorId]);
    if (check.rows.length === 0) {
      return res.status(404).json({ message: 'Course not found or unauthorized' });
    }

    const result = await pool.query(
      `UPDATE poatad 
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

// GET /api/courses/stats
const getPlatformStats = async (req, res, next) => {
  try {
    const courseCount = await pool.query('SELECT COUNT(*) FROM poatad');
    const tutorCount = await pool.query('SELECT COUNT(*) FROM tutor_profiles');
    const studentCount = await pool.query('SELECT COUNT(*) FROM users WHERE role = $1', ['student']);
    const reviewCount = await pool.query('SELECT COUNT(*) FROM reviews');

    res.json({
      totalCourses: parseInt(courseCount.rows[0].count),
      totalTutors: parseInt(tutorCount.rows[0].count),
      totalStudents: parseInt(studentCount.rows[0].count),
      totalReviews: parseInt(reviewCount.rows[0].count),
      activeLearners: '5k+',
      successRate: '98%'
    });
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
  getPlatformStats,
};
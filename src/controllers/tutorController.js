const { pool } = require('../config/db');
const { uploadToCloudinary } = require('../utils/cloudinaryUpload');

// schedule is stored as jsonb, e.g. {"Friday": ["5:00 PM","7:00 PM"]} — never render it
// directly as a React child on the frontend, always summarize it into a string first.
const formatScheduleSummary = (schedule) => {
  if (!schedule || typeof schedule !== 'object') return 'TBD';
  const days = Object.keys(schedule);
  if (days.length === 0) return 'TBD';
  const firstDay = days[0];
  const times = Array.isArray(schedule[firstDay]) ? schedule[firstDay] : [];
  const timeStr = times.length > 0 ? times[0] : '';
  const daysStr = days.length > 1 ? `${firstDay} +${days.length - 1} more` : firstDay;
  return timeStr ? `${daysStr}, ${timeStr}` : daysStr;
};

const getDashboardData = async (req, res, next) => {
  try {
    // req.user.id is set by authMiddleware
    const userId = req.user.id;

    // Get tutor's courses with enrolled student count
    const coursesResult = await pool.query(`
      SELECT
        c.id, c.title, c.subject, c.location, c.mode, c.fee,
        c.average_rating as rating, c.status, c.max_students as "totalSlots",
        c.schedule, c.image,
        (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = c.id AND e.status IN ('active', 'approved'))::int as "studentsEnrolled"
      FROM courses c
      WHERE c.tutor_id = $1
      ORDER BY c."createdAt" DESC
    `, [userId]);

    const classes = coursesResult.rows.map(c => ({
      ...c,
      nextSession: formatScheduleSummary(c.schedule),
    }));

    // Get recent requests
    const requestsResult = await pool.query(`
      SELECT 
        e.id, e.full_name as name, c.subject, e."createdAt"
      FROM enrollments e
      JOIN courses c ON e.class_id = c.id
      WHERE c.tutor_id = $1 AND e.status = 'pending'
      ORDER BY e."createdAt" DESC
      LIMIT 5
    `, [userId]);

    const recentRequests = requestsResult.rows.map(req => {
      // Calculate time ago
      const diffMs = new Date() - new Date(req.createdAt);
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);
      let timeStr = 'just now';
      if (diffDays > 0) timeStr = `${diffDays} days ago`;
      else if (diffHours > 0) timeStr = `${diffHours} hours ago`;
      else if (diffMins > 0) timeStr = `${diffMins} mins ago`;

      const colors = ['#8B5CF6', '#F59E0B', '#10B981', '#3B82F6', '#EF4444'];
      const color = colors[req.id % colors.length];

      return {
        id: req.id,
        name: req.name,
        subject: req.subject,
        time: timeStr,
        avatar: req.name ? req.name.charAt(0).toUpperCase() : 'U',
        color: color
      };
    });

    // Upcoming sessions
    const upcomingSessions = classes
      .filter(c => c.status === 'active' && c.studentsEnrolled > 0)
      .slice(0, 3)
      .map((c, i) => {
        const colors = ['#8B5CF6', '#F59E0B', '#10B981', '#3B82F6', '#EF4444'];
        return {
          id: c.id,
          subject: c.subject,
          students: c.studentsEnrolled,
          time: c.nextSession || 'TBD',
          color: colors[i % colors.length]
        };
      });

    res.json({
      classes,
      recentRequests,
      upcomingSessions
    });

  } catch (err) {
    next(err);
  }
};

const getTutorRequests = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const requestsResult = await pool.query(`
      SELECT 
        e.id, e.full_name as name, c.subject, c.title as class, 
        e."createdAt" as date, e.message, e.status,
        e.email, e.phone, e.school, e.grade, e.preferred_mode,
        e.selected_day, e.selected_time
      FROM enrollments e
      JOIN courses c ON e.class_id = c.id
      WHERE c.tutor_id = $1
      ORDER BY e."createdAt" DESC
    `, [userId]);

    const requests = requestsResult.rows.map(req => {
      // Calculate time ago
      const diffMs = new Date() - new Date(req.date);
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);
      let timeStr = 'just now';
      if (diffDays > 0) timeStr = `${diffDays} days ago`;
      else if (diffHours > 0) timeStr = `${diffHours} hours ago`;
      else if (diffMins > 0) timeStr = `${diffMins} mins ago`;

      const colors = ['#8B5CF6', '#F59E0B', '#10B981', '#3B82F6', '#EC4899'];
      const color = colors[req.id % colors.length];

      return {
        id: req.id,
        name: req.name,
        subject: req.subject,
        class: req.class,
        date: new Date(req.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
        time: timeStr,
        message: req.message || 'I would like to join this class.',
        status: req.status === 'requested' ? 'pending' : req.status, // Map 'requested' to 'pending' for UI
        avatar: req.name ? req.name.charAt(0).toUpperCase() : 'U',
        color: color,
        // Added details
        email: req.email,
        phone: req.phone,
        school: req.school,
        grade: req.grade,
        preferredMode: req.preferred_mode,
        selectedDay: req.selected_day,
        selectedTime: req.selected_time
      };
    });

    res.json(requests);

  } catch (err) {
    next(err);
  }
};

const getAllTutors = (req, res) => {
  res.json({ message: 'Get all tutors' });
};

// GET /api/tutors/revenue-analytics (tutor only)
//
// Revenue is fully manual — the tutor logs their own income/outcome
// (expense) entries in `tutor_transactions` (a general ledger, not tied to
// any specific class) via the endpoints below, and this just aggregates
// those entries. Nothing here is derived from enrollments/course fees.
const getRevenueAnalytics = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const months = Math.min(Math.max(parseInt(req.query.months, 10) || 6, 1), 12);

    const chartResult = await pool.query(`
      SELECT
        to_char(m.month, 'Mon') AS month,
        EXTRACT(YEAR FROM m.month)::int AS year,
        COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'income'), 0)::float AS income,
        COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'outcome'), 0)::float AS outcome
      FROM generate_series(
             date_trunc('month', NOW()) - ($2 - 1) * interval '1 month',
             date_trunc('month', NOW()),
             interval '1 month'
           ) AS m(month)
      LEFT JOIN tutor_transactions t
        ON t.tutor_id = $1 AND date_trunc('month', t.entry_date) = m.month
      GROUP BY m.month
      ORDER BY m.month
    `, [userId, months]);

    const monthlyChart = chartResult.rows.map(r => ({
      month: r.month,
      year: r.year,
      income: Number(r.income),
      outcome: Number(r.outcome),
    }));

    const currentMonthIncome = monthlyChart.length > 0 ? monthlyChart[monthlyChart.length - 1].income : 0;
    const previousMonthIncome = monthlyChart.length > 1 ? monthlyChart[monthlyChart.length - 2].income : 0;
    const revenueGrowthPercent = previousMonthIncome > 0
      ? ((currentMonthIncome - previousMonthIncome) / previousMonthIncome) * 100
      : (currentMonthIncome > 0 ? 100 : 0);

    const totalsResult = await pool.query(`
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE type = 'income'), 0)::float AS "totalRevenue",
        COALESCE(SUM(amount) FILTER (WHERE type = 'outcome'), 0)::float AS "totalOutcome"
      FROM tutor_transactions
      WHERE tutor_id = $1
    `, [userId]);
    const { totalRevenue, totalOutcome } = totalsResult.rows[0];

    const transactionsResult = await pool.query(`
      SELECT id, type, amount::float AS amount, description, entry_date AS date
      FROM tutor_transactions
      WHERE tutor_id = $1
      ORDER BY entry_date DESC, id DESC
      LIMIT 100
    `, [userId]);

    res.json({
      totalRevenue,
      totalOutcome,
      netProfit: totalRevenue - totalOutcome,
      monthlyRevenue: currentMonthIncome,
      revenueGrowthPercent,
      monthlyChart,
      transactions: transactionsResult.rows,
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/tutors/transactions (tutor only) — add one manual income or
// outcome (expense) entry to the tutor's ledger.
const addTransaction = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { type, amount, description, date } = req.body;

    if (type !== 'income' && type !== 'outcome') {
      return res.status(400).json({ message: "Type must be 'income' or 'outcome'" });
    }
    if (amount === undefined || amount === null || isNaN(Number(amount)) || Number(amount) < 0) {
      return res.status(400).json({ message: 'Amount must be a non-negative number' });
    }

    const result = await pool.query(
      `INSERT INTO tutor_transactions (tutor_id, type, amount, description, entry_date, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, COALESCE($5, CURRENT_DATE), NOW(), NOW())
       RETURNING id, type, amount::float AS amount, description, entry_date AS date`,
      [userId, type, Number(amount), description || null, date || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/tutors/transactions/:id (tutor only)
const deleteTransaction = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM tutor_transactions WHERE id = $1 AND tutor_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    res.json({ message: 'Transaction deleted' });
  } catch (err) {
    next(err);
  }
};


// Get tutor profile data
const getProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Fetch profile data joining users and tutor_profiles (using LEFT JOIN in case profile doesn't exist yet)
    const result = await pool.query(`
      SELECT
        u.email,
        u.role,
        COALESCE(tp.full_name, '') as name,
        COALESCE(tp.city, '') as location,
        COALESCE(tp.experience, '') as experience,
        COALESCE(tp.university, '') as university,
        COALESCE(tp.degree_title, '') as degree,
        COALESCE(tp.description, '') as bio,
        COALESCE(tp.subject, '') as subject,
        COALESCE(tp.phone, '') as phone,
        COALESCE(tp.fee, '') as fee,
        tp.profile_picture_url,
        tp.status as verification_status
      FROM users u
      LEFT JOIN tutor_profiles tp ON u.id = tp.user_id
      WHERE u.id = $1
    `, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const profile = result.rows[0];

    // Real teaching stats for the profile page's summary cards — replaces the
    // hardcoded "5 classes / 60 students / 4.8★" placeholders that used to be
    // shown for every tutor regardless of actual data.
    const statsResult = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM courses WHERE tutor_id = $1)::int AS "classesCount",
        (SELECT COUNT(*) FROM courses WHERE tutor_id = $1 AND status = 'active')::int AS "activeClassesCount",
        (SELECT COALESCE(AVG(average_rating), 0) FROM courses WHERE tutor_id = $1 AND status = 'active')::float AS "avgRating",
        (SELECT COUNT(*) FROM enrollments e JOIN courses c ON e.class_id = c.id
          WHERE c.tutor_id = $1 AND e.status IN ('active', 'approved'))::int AS "totalStudents",
        (SELECT COUNT(*) FROM enrollments e JOIN courses c ON e.class_id = c.id
          WHERE c.tutor_id = $1 AND e.status = 'requested')::int AS "pendingRequests"
    `, [userId]);

    const stats = statsResult.rows[0];

    res.json({
      name: profile.name || '',
      email: profile.email,
      phone: profile.phone || '',
      subject: profile.subject || '',
      location: profile.location || '',
      experience: profile.experience || '',
      education: profile.university || '',
      bio: profile.bio || '',
      fee: profile.fee || '',
      profilePictureUrl: profile.profile_picture_url || null,
      verified: profile.verification_status === 'active',
      stats: {
        classesCount: stats.classesCount,
        activeClassesCount: stats.activeClassesCount,
        avgRating: Number(stats.avgRating) || 0,
        totalStudents: stats.totalStudents,
        pendingRequests: stats.pendingRequests,
      },
    });
  } catch (err) {
    console.error('Error in getProfile:', err);
    next(err);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { name, phone, subject, location, experience, education, bio, fee } = req.body;

    // Check if profile exists
    const checkProfile = await pool.query('SELECT id FROM tutor_profiles WHERE user_id = $1', [userId]);

    if (checkProfile.rows.length > 0) {
      // Update existing
      await pool.query(`
        UPDATE tutor_profiles 
        SET 
          full_name = $1,
          city = $2,
          experience = $3,
          description = $4,
          subject = $5,
          phone = $6,
          fee = $7,
          university = $8
        WHERE user_id = $9
      `, [name, location, experience, bio, subject, phone, fee, education, userId]);
    } else {
      // Create new
      await pool.query(`
        INSERT INTO tutor_profiles (user_id, full_name, city, experience, description, subject, phone, fee, university)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [userId, name, location, experience, bio, subject, phone, fee, education]);
    }

    res.json({ message: 'Profile updated successfully' });
  } catch (err) {
    console.error('Error in updateProfile:', err);
    next(err);
  }
};

// POST /api/tutors/profile-picture (tutor only) — same Cloudinary pattern
// already used for the tutor-registration profile picture and class ad
// banners: upload the file buffer to Cloudinary, then save the returned
// secure_url on tutor_profiles.profile_picture_url so it displays wherever
// that column is already read (this profile page, course detail pages, etc).
const updateProfilePicture = async (req, res, next) => {
  try {
    const userId = req.user.id;

    if (!req.file) {
      return res.status(400).json({ message: 'No image file provided' });
    }

    const imageUrl = await uploadToCloudinary(req.file.buffer, 'mentora/profiles', req.file.originalname);

    const checkProfile = await pool.query('SELECT id FROM tutor_profiles WHERE user_id = $1', [userId]);

    if (checkProfile.rows.length > 0) {
      await pool.query(
        'UPDATE tutor_profiles SET profile_picture_url = $1 WHERE user_id = $2',
        [imageUrl, userId]
      );
    } else {
      await pool.query(
        'INSERT INTO tutor_profiles (user_id, profile_picture_url) VALUES ($1, $2)',
        [userId, imageUrl]
      );
    }

    res.json({ profilePictureUrl: imageUrl });
  } catch (err) {
    console.error('Error in updateProfilePicture:', err);
    next(err);
  }
};

// GET /api/tutors/todos (tutor only) — the Profile page's "To Do List" tab.
// Each row is a task the tutor is tracking for themselves (not tied to a
// class or student): what to do, when it's due, how long it'll take.
const getTodos = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `SELECT id, task, finish_time AS "finishTime", duration_minutes AS "durationMinutes", status
       FROM tutor_todos
       WHERE tutor_id = $1
       ORDER BY (status = 'completed') ASC, finish_time ASC NULLS LAST, id DESC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
};

// POST /api/tutors/todos (tutor only)
const addTodo = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { task, finishTime, durationMinutes } = req.body;

    if (!task || !task.trim()) {
      return res.status(400).json({ message: 'Task description is required' });
    }
    if (durationMinutes !== undefined && durationMinutes !== null && durationMinutes !== '' &&
        (isNaN(Number(durationMinutes)) || Number(durationMinutes) < 0)) {
      return res.status(400).json({ message: 'Duration must be a non-negative number of minutes' });
    }

    const result = await pool.query(
      `INSERT INTO tutor_todos (tutor_id, task, finish_time, duration_minutes, status, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 'pending', NOW(), NOW())
       RETURNING id, task, finish_time AS "finishTime", duration_minutes AS "durationMinutes", status`,
      [
        userId,
        task.trim(),
        finishTime || null,
        durationMinutes !== undefined && durationMinutes !== null && durationMinutes !== '' ? Number(durationMinutes) : null,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
};

// PATCH /api/tutors/todos/:id (tutor only) — toggles between pending/completed.
const updateTodoStatus = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { status } = req.body;

    if (status !== 'pending' && status !== 'completed') {
      return res.status(400).json({ message: "Status must be 'pending' or 'completed'" });
    }

    const result = await pool.query(
      `UPDATE tutor_todos SET status = $1, "updatedAt" = NOW()
       WHERE id = $2 AND tutor_id = $3
       RETURNING id, task, finish_time AS "finishTime", duration_minutes AS "durationMinutes", status`,
      [status, id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Task not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/tutors/todos/:id (tutor only)
const deleteTodo = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM tutor_todos WHERE id = $1 AND tutor_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Task not found' });
    }

    res.json({ message: 'Task deleted' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAllTutors,
  getDashboardData,
  getTutorRequests,
  getProfile,
  updateProfile,
  updateProfilePicture,
  getRevenueAnalytics,
  addTransaction,
  deleteTransaction,
  getTodos,
  addTodo,
  updateTodoStatus,
  deleteTodo,
};


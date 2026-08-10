const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const tutorRoutes = require('./routes/tutorRoutes');
const courseRoutes = require('./routes/courseRoutes');
const enrollmentRoutes = require('./routes/enrollmentRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const adminRoutes = require('./routes/adminRoutes');
const studentCommunityRoutes = require('./routes/studentCommunityRoutes');

const app = express();

// Middleware
app.use(cors({
    origin: true, // Reflects the request origin
    credentials: true
}));
app.use(express.json()); // Parses incoming JSON requests
app.use(express.urlencoded({ extended: true }));
app.use(express.text()); // Parse text responses

// Request logging middleware
app.use((req, res, next) => {
  console.log(`\n📍 ${req.method} ${req.path}`);
  console.log('  Headers:', Object.keys(req.headers));
  console.log('  Authorization:', req.headers.authorization ? 'YES' : 'NO');
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/tutors', tutorRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/enrollments', enrollmentRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/tutor', require('./routes/tutorCommunityRoutes'));

// Community Module
app.use('/api/student', studentCommunityRoutes);

// Recommendation Module
app.use('/api/recommendations', require('./routes/recommendationRoutes'));

const db = require('./config/db');

// TEMPORARY: Debug route to check user account status
app.get('/api/debug/check-user/:email', async (req, res) => {
    try {
        const result = await db.query('SELECT id, email, role, password_hash, created_at FROM users WHERE email = $1', [req.params.email]);
        if (result.rows.length === 0) {
            return res.json({ found: false, message: 'No user found with this email' });
        }
        const user = result.rows[0];
        res.json({
            found: true,
            id: user.id,
            email: user.email,
            role: user.role,
            hasPasswordHash: !!user.password_hash,
            passwordHashLength: user.password_hash ? user.password_hash.length : 0,
            passwordHashPrefix: user.password_hash ? user.password_hash.substring(0, 7) : null,
            createdAt: user.created_at,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Database Health Check Route
app.get('/api/db-status', async (req, res) => {
    try {
        // Run a simple query to get the current time from PostgreSQL
        const result = await db.query('SELECT NOW()');
        res.status(200).json({
            status: 'success',
            message: 'Database is connected!',
            serverTime: result.rows[0].now
        });
    } catch (error) {
        console.error('Database connection failed:', error);
        res.status(500).json({
            status: 'error',
            message: 'Database connection failed',
            error: error.message
        });
    }
});

// Health Check
app.get('/', (req, res) => {
    res.send('Mentora API is running...');
});

// Global Error Handler (catch-all for unhandled errors)
app.use((err, req, res, next) => {
    console.error('Unhandled Error:', err);
    
    // Don't expose error stack in production
    const isDevelopment = process.env.NODE_ENV !== 'production';
    
    res.status(err.status || 500).json({
        status: 'error',
        message: err.message || 'Internal Server Error',
        ...(isDevelopment && { stack: err.stack })
    });
});

// 404 Handler
app.use((req, res) => {
    console.log(`❌ 404 - Route not found: ${req.method} ${req.originalUrl}`);
    console.log(`   Looking for: ${req.path}`);
    console.log(`   Available routes start with: /api/auth, /api/users, /api/tutors, /api/courses, /api/tutor, /api/student`);
    res.status(404).json({
        status: 'error',
        message: 'Route not found',
        attempted: `${req.method} ${req.originalUrl}`
    });
});

module.exports = app;
const express = require('express');
const cors = require('cors');
//!import route files(but not activated)
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const tutorRoutes = require('./routes/tutorRoutes');
const courseRoutes = require('./routes/courseRoutes');
const enrollmentRoutes = require('./routes/enrollmentRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const adminRoutes = require('./routes/adminRoutes');
const studentCommunityRoutes = require('./routes/studentCommunityRoutes');

const app = express();

//! configure Middleware
app.use(cors());
app.use(express.json()); // Parses incoming JSON requests
app.use(express.urlencoded({ extended: true }));

//! Activate and use these routes
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

// Health Check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Server is running',
        timestamp: new Date().toISOString()
    });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

module.exports = app;

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
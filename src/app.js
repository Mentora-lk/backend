const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const tutorRoutes = require('./routes/tutorRoutes');
const courseRoutes = require('./routes/courseRoutes');
const enrollmentRoutes = require('./routes/enrollmentRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json()); // Parses incoming JSON requests
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/tutors', tutorRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/enrollments', enrollmentRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);

// Health Check
app.get('/', (req, res) => {
    res.send('Mentora API is running...');
});

module.exports = app;

const db = require('./config/db');

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
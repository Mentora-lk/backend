// User Controller
const userModel = require('../models/userModel');
const { uploadToCloudinary } = require('../utils/cloudinaryUpload');
const { pool } = require('../config/db');

const getProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const profile = await userModel.getStudentProfile(userId);
        if (!profile) {
            return res.status(404).json({ message: 'Profile not found' });
        }

        // Get live stats for class counts
        const enrollmentsResult = await pool.query(
            'SELECT COUNT(*) FROM enrollments WHERE student_id = $1',
            [userId]
        );
        const enrolledCount = parseInt(enrollmentsResult.rows[0].count);

        res.json({
            ...profile,
            stats: {
                enrolledCount
            }
        });
    } catch (error) {
        console.error('[getProfile] Error:', error.message);
        res.status(500).json({ message: 'Server error' });
    }
};

const updateProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const { fullName, school, age, language, gradeLevel, address, phone, bio } = req.body;
        
        let profilePictureUrl = null;
        if (req.file) {
            try {
                profilePictureUrl = await uploadToCloudinary(req.file.buffer, 'mentora/profiles');
            } catch (uploadErr) {
                console.warn('[updateProfile] Profile picture upload failed:', uploadErr.message);
            }
        }

        const data = {
            fullName: fullName || null,
            school: school || null,
            age: age ? parseInt(age) : null,
            language: language || null,
            gradeLevel: gradeLevel || null,
            address: address || null,
            phone: phone || null,
            bio: bio || null,
            profilePictureUrl
        };

        const updatedProfile = await userModel.updateStudentProfile(userId, data);
        res.json({
            message: 'Profile updated successfully',
            profile: updatedProfile
        });
    } catch (error) {
        console.error('[updateProfile] Error:', error.message);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = {
  getAllUsers: (req, res) => {
    res.json({ message: 'Get all users' });
  },
  getProfile,
  updateProfile
};

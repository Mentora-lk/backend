// User Controller
const userModel = require('../models/userModel');
const { uploadToCloudinary } = require('../utils/cloudinaryUpload');
const { pool } = require('../config/db');

const getProfile = async (req, res) => {
    try {
        const userId = req.user.id;

        if (req.user.role === 'tutor') {
            const profile = await userModel.getTutorProfile(userId);
            if (!profile) {
                return res.status(404).json({ message: 'Profile not found' });
            }
            return res.json(profile);
        }

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

        let profilePictureUrl = null;
        if (req.file) {
            try {
                profilePictureUrl = await uploadToCloudinary(req.file.buffer, 'mentora/profiles');
            } catch (uploadErr) {
                console.warn('[updateProfile] Profile picture upload failed:', uploadErr.message);
            }
        }

        if (req.user.role === 'tutor') {
            const {
                fullName, dob, gender, city, address, phone, university, degreeTitle,
                graduationYear, experience, subject, gradeRange, level, medium,
                classType, description
            } = req.body;

            const data = {
                fullName: fullName || null,
                dob: dob || null,
                gender: gender || null,
                city: city || null,
                address: address || null,
                phone: phone || null,
                university: university || null,
                degreeTitle: degreeTitle || null,
                graduationYear: graduationYear ? parseInt(graduationYear) : null,
                experience: experience || null,
                subject: subject || null,
                gradeRange: gradeRange || null,
                level: level || null,
                medium: medium || null,
                classType: classType || null,
                description: description || null,
                profilePictureUrl
            };

            const updatedProfile = await userModel.updateTutorProfile(userId, data);
            return res.json({
                message: 'Profile updated successfully',
                profile: updatedProfile
            });
        }

        const { fullName, school, age, language, gradeLevel, address, phone, bio } = req.body;

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

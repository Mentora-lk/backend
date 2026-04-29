const bcrypt = require('bcryptjs');
const userModel = require('../models/userModel');
const { generateToken } = require('../utils/jwtHelper');
const { uploadToCloudinary } = require('../utils/cloudinaryUpload');

const registerStudent = async (req, res) => {
    try {
        const { email, password, fullName, school, age, language, gradeLevel, address } = req.body;

        const existingUser = await userModel.findUserByEmail(email);
        if (existingUser) return res.status(400).json({ message: 'Email already exists' });

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // Transaction simulation (Ideally use BEGIN/COMMIT via pg client)
        const user = await userModel.createUserAccount(email, passwordHash, 'student');
        const profile = await userModel.createStudentProfile(user.id, { fullName, school, age, language, gradeLevel, address });

        res.status(201).json({
            token: generateToken(user.id, user.role),
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
            },
            profile,
        });
    } catch (error) {
        console.error('[registerStudent] Error:', error.message);
        console.error(error.stack);
        res.status(500).json({ message: error.message || 'Server error' });
    }
};

const registerTutor = async (req, res) => {
    try {
        const { 
            email, password, fullName, dob, gender, city, address, 
            university, degreeTitle, graduationYear, experience, subjects, 
            gradeRange, level, medium, classType, description 
        } = req.body;

        // Validate required fields
        if (!email || !password || !fullName) {
            return res.status(400).json({ message: 'Email, password and full name are required' });
        }

        const existingUser = await userModel.findUserByEmail(email);
        if (existingUser) return res.status(400).json({ message: 'Email already exists' });

        let profilePictureUrl = null;
        let bannerUrl = null;

        if (req.files && req.files.profilePicture && req.files.profilePicture[0]) {
            try {
                profilePictureUrl = await uploadToCloudinary(req.files.profilePicture[0].buffer, 'mentora/profiles');
            } catch (uploadErr) {
                console.warn('[registerTutor] Profile picture upload failed:', uploadErr.message);
            }
        }

        if (req.files && req.files.banner && req.files.banner[0]) {
            try {
                bannerUrl = await uploadToCloudinary(req.files.banner[0].buffer, 'mentora/banners');
            } catch (uploadErr) {
                console.warn('[registerTutor] Banner upload failed:', uploadErr.message);
            }
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // Convert subjects string to PostgreSQL array format if needed
        let subjectsValue = subjects || null;
        if (typeof subjects === 'string' && subjects.trim()) {
            // Convert comma-separated string like "Mathematics, Physics" to a PG array literal "{Mathematics,Physics}"
            const subjectArray = subjects.split(',').map(s => s.trim()).filter(Boolean);
            subjectsValue = `{${subjectArray.join(',')}}`;
        }

        const user = await userModel.createUserAccount(email, passwordHash, 'tutor');
        const profile = await userModel.createTutorProfile(user.id, { 
            fullName, dob: dob || null, gender: gender || null, city: city || null, 
            email, address: address || null, profilePictureUrl, bannerUrl, 
            university: university || null, degreeTitle: degreeTitle || null, 
            graduationYear: graduationYear || null, experience: experience || null, 
            subjects: subjectsValue, 
            gradeRange: gradeRange || null, level: level || null, 
            medium: medium || null, classType: classType || null, 
            description: description || null 
        });

        res.status(201).json({
            token: generateToken(user.id, user.role),
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
            },
            profile,
        });
    } catch (error) {
        console.error('[registerTutor] Error:', error.message);
        console.error(error.stack);
        res.status(500).json({ message: error.message || 'Server error' });
    }
};

const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        console.log('[loginUser] Attempting login for email:', email);

        const user = await userModel.findUserByEmail(email);
        if (!user) {
            console.log('[loginUser] No user found with email:', email);
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        console.log('[loginUser] User found, id:', user.id, 'role:', user.role);
        console.log('[loginUser] Stored hash:', user.password_hash);
        console.log('[loginUser] Provided password length:', password ? password.length : 'NO PASSWORD');

        const isMatch = await bcrypt.compare(password, user.password_hash);
        console.log('[loginUser] Password match result:', isMatch);

        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        res.json({
            token: generateToken(user.id, user.role),
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
            },
        });
    } catch (error) {
        console.error('[loginUser] Error:', error.message);
        res.status(500).json({ message: error.message || 'Server error' });
    }
};

module.exports = { registerStudent, registerTutor, loginUser };
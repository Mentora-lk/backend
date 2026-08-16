const bcrypt = require('bcryptjs');
const userModel = require('../models/userModel');
const { generateToken } = require('../utils/jwtHelper');
const { uploadToCloudinary } = require('../utils/cloudinaryUpload');
const crypto = require('crypto');
const sendEmail = require('../utils/sendEmail');
const { loginWithGoogleIdToken, GoogleAccountNotFoundError, InvalidRoleError } = require('../services/googleAuthService');

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

        const user = await userModel.createUserAccount(email, passwordHash, 'tutor');
        const profile = await userModel.createTutorProfile(user.id, { 
            fullName, dob: dob || null, gender: gender || null, city: city || null, 
            email, address: address || null, profilePictureUrl, bannerUrl, 
            university: university || null, degreeTitle: degreeTitle || null, 
            graduationYear: graduationYear || null, experience: experience || null, 
            subjects: subjects || null, 
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

        const fullName = await userModel.findFullNameByUser(user.id, user.role);

        res.json({
            token: generateToken(user.id, user.role),
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                fullName,
            },
        });
    } catch (error) {
        console.error('[loginUser] Error:', error.message);
        res.status(500).json({ message: error.message || 'Server error' });
    }
};

// Google Sign-In: logs in an existing user whose email matches the verified
// Google account. If no account exists and `role` ('student'|'tutor') is
// provided, a new account + minimal profile is created automatically —
// see googleAuthService.js.
const loginWithGoogle = async (req, res) => {
    try {
        const { idToken, role } = req.body;

        if (!idToken) {
            return res.status(400).json({ message: 'Google ID token is required' });
        }

        const result = await loginWithGoogleIdToken(idToken, role);
        res.json(result);
    } catch (error) {
        if (error instanceof GoogleAccountNotFoundError) {
            return res.status(404).json({ message: error.message });
        }
        if (error instanceof InvalidRoleError) {
            return res.status(400).json({ message: error.message });
        }
        console.error('[loginWithGoogle] Error:', error.message);
        res.status(401).json({ message: 'Google authentication failed' });
    }
};

// Deletes the logged-in user's own account. `req.user` comes from the
// `protect` middleware (decoded JWT payload: { id, role }).
const deleteAccount = async (req, res) => {
    try {
        const deleted = await userModel.deleteUserAccount(req.user.id, req.user.role);
        if (!deleted) {
            return res.status(404).json({ message: 'Account not found' });
        }
        res.status(200).json({ message: 'Account deleted successfully' });
    } catch (error) {
        console.error('[deleteAccount] Error:', error.message);
        res.status(500).json({ message: 'Server error' });
    }
};

const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await userModel.findUserByEmail(email);

        if (!user) {
            return res.status(404).json({ message: 'User with this email does not exist' });
        }

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');

        // Hash token and set expiration
        const resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        
        // Expiration: 10 minutes from now
        const resetPasswordExpires = new Date(Date.now() + 10 * 60 * 1000);

        // Save to database
        await userModel.savePasswordResetToken(email, resetPasswordToken, resetPasswordExpires);

        // Create reset URL
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const resetUrl = `${frontendUrl}/auth/reset-password/${resetToken}`;

        console.log(`\n\n=== PASSWORD RESET URL ===\n${resetUrl}\n==========================\n\n`);

        const message = `You are receiving this email because you (or someone else) has requested the reset of your password. Please navigate to the following link to complete the process:\n\n${resetUrl}`;

        try {
            await sendEmail({
                email: user.email,
                subject: 'Password Reset Token',
                message
            });

            res.status(200).json({ message: 'Email sent' });
        } catch (error) {
            console.error('[forgotPassword] Error sending email:', error.message);
            await userModel.savePasswordResetToken(email, null, null);
            return res.status(500).json({ message: 'Email could not be sent' });
        }

    } catch (error) {
        console.error('[forgotPassword] Error:', error.message);
        res.status(500).json({ message: 'Server error' });
    }
};

const resetPassword = async (req, res) => {
    try {
        const { token } = req.params;
        const { newPassword } = req.body;

        if (!newPassword || newPassword.length < 8) {
            return res.status(400).json({ message: 'Password must be at least 8 characters long' });
        }

        // Hash token to compare with DB
        const resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');

        const user = await userModel.findUserByResetToken(resetPasswordToken);

        if (!user) {
            return res.status(400).json({ message: 'Invalid or expired password reset token' });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(newPassword, salt);

        // Update password and clear token
        await userModel.updatePassword(user.id, passwordHash);

        res.status(200).json({ message: 'Password reset successfully' });
    } catch (error) {
        console.error('[resetPassword] Error:', error.message);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = { registerStudent, registerTutor, loginUser, loginWithGoogle, deleteAccount, forgotPassword, resetPassword };

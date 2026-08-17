const bcrypt = require('bcryptjs');
const userModel = require('../models/userModel');
const { generateToken } = require('../utils/jwtHelper');
const { uploadToCloudinary } = require('../utils/cloudinaryUpload');
const crypto = require('crypto');
const sendOtpEmail = require('../utils/sendOtpEmail');
const emailVerificationModel = require('../models/emailVerificationModel');
const { loginWithGoogleIdToken, GoogleAccountNotFoundError, InvalidRoleError } = require('../services/googleAuthService');

const registerStudent = async (req, res) => {
    try {
        const { email, password, fullName, school, age, language, gradeLevel, address } = req.body;

        const existingUser = await userModel.findUserByEmail(email);
        if (existingUser) return res.status(400).json({ message: 'Email already exists' });

        const verification = await emailVerificationModel.isEmailCurrentlyVerified(email);
        if (!verification) {
            return res.status(400).json({ message: 'Please verify your email address before completing registration.' });
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // Transaction simulation (Ideally use BEGIN/COMMIT via pg client)
        const user = await userModel.createUserAccount(email, passwordHash, 'student');
        const profile = await userModel.createStudentProfile(user.id, { fullName, school, age, language, gradeLevel, address });

        // Best-effort cleanup — don't fail a successful registration over this.
        emailVerificationModel.clearEmailVerification(email).catch((err) =>
            console.warn('[registerStudent] Failed to clear email_verifications row:', err.message)
        );

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

        const verification = await emailVerificationModel.isEmailCurrentlyVerified(email);
        if (!verification) {
            return res.status(400).json({ message: 'Please verify your email address before completing registration.' });
        }

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

        // Best-effort cleanup — don't fail a successful registration over this.
        emailVerificationModel.clearEmailVerification(email).catch((err) =>
            console.warn('[registerTutor] Failed to clear email_verifications row:', err.message)
        );

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

        const isMatch = await bcrypt.compare(password, user.password_hash);

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

        // Always answer the same way whether or not the address is registered —
        // a 404 here would let anyone enumerate which emails have accounts.
        const genericResponse = { message: 'If an account exists for that email, a verification code has been sent.' };

        if (!user) {
            // The response stays deliberately uninformative, but the server log
            // tells the truth so this isn't a silent no-op while developing.
            console.log('[forgotPassword] no account for:', email);
            return res.status(200).json(genericResponse);
        }

        // Generate a 6-digit OTP
        const otp = crypto.randomInt(0, 1000000).toString().padStart(6, '0');

        // Hash OTP and set expiration
        const resetPasswordToken = crypto.createHash('sha256').update(otp).digest('hex');

        // Expiration: 10 minutes from now
        const resetPasswordExpires = new Date(Date.now() + 10 * 60 * 1000);

        // Save to database
        await userModel.savePasswordResetToken(email, resetPasswordToken, resetPasswordExpires);

        try {
            await sendOtpEmail(user.email, otp);
            res.status(200).json(genericResponse);
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
        const { email, otp, newPassword } = req.body;

        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }

        if (!otp) {
            return res.status(400).json({ message: 'Verification code is required' });
        }

        if (!newPassword || newPassword.length < 8) {
            return res.status(400).json({ message: 'Password must be at least 8 characters long' });
        }

        // Hash OTP to compare with DB
        const resetPasswordToken = crypto.createHash('sha256').update(otp).digest('hex');

        const user = await userModel.findUserByEmailAndResetToken(email, resetPasswordToken);

        if (!user) {
            // Distinguish an aged-out code from a wrong one. A correct-but-expired
            // code isn't a guessing attempt, so it must not count against the
            // attempt limit — otherwise a slow user burns their own valid code.
            const expired = await userModel.findUserByEmailAndResetTokenIgnoringExpiry(email, resetPasswordToken);
            if (expired) {
                return res.status(400).json({ message: 'That code has expired. Request a new one and try again.' });
            }

            // Count the miss so a wrong code can't be guessed repeatedly; once
            // the limit is hit the model clears the code outright.
            await userModel.incrementResetAttempts(email);
            return res.status(400).json({
                message: 'That is not the current code. Use the code from the most recent email, or request a new one.',
            });
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

const sendEmailVerification = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: 'Email is required' });

        // Unlike forgotPassword, no anti-enumeration reason to hide this —
        // registerStudent/registerTutor already reveal "Email already exists"
        // at submit time, so surfacing it here too isn't a new leak.
        const existingUser = await userModel.findUserByEmail(email);
        if (existingUser) {
            return res.status(400).json({ message: 'An account with this email already exists.' });
        }

        const otp = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
        const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

        await emailVerificationModel.saveEmailVerificationOtp(email, otpHash, otpExpires);

        try {
            await sendOtpEmail(email, otp, 'verify-email');
            return res.status(200).json({ message: 'Verification code sent to your email.' });
        } catch (error) {
            console.error('[sendEmailVerification] Error sending email:', error.message);
            await emailVerificationModel.saveEmailVerificationOtp(email, null, null);
            return res.status(500).json({ message: 'Email could not be sent' });
        }
    } catch (error) {
        console.error('[sendEmailVerification] Error:', error.message);
        res.status(500).json({ message: 'Server error' });
    }
};

const verifyEmailCode = async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email) return res.status(400).json({ message: 'Email is required' });
        if (!otp) return res.status(400).json({ message: 'Verification code is required' });

        const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
        const record = await emailVerificationModel.findVerificationByEmailAndOtp(email, otpHash);

        if (!record) {
            const expired = await emailVerificationModel.findVerificationByEmailAndOtpIgnoringExpiry(email, otpHash);
            if (expired) {
                return res.status(400).json({ message: 'That code has expired. Request a new one and try again.' });
            }

            await emailVerificationModel.incrementVerificationAttempts(email);
            return res.status(400).json({
                message: 'That is not the current code. Use the code from the most recent email, or request a new one.',
            });
        }

        await emailVerificationModel.markEmailVerified(email);
        res.status(200).json({ message: 'Email verified.', verified: true });
    } catch (error) {
        console.error('[verifyEmailCode] Error:', error.message);
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = { registerStudent, registerTutor, loginUser, loginWithGoogle, deleteAccount, forgotPassword, resetPassword, sendEmailVerification, verifyEmailCode };

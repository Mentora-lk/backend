const { OAuth2Client } = require('google-auth-library');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');
const { generateToken } = require('../utils/jwtHelper');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const VALID_SIGNUP_ROLES = ['student', 'tutor'];
const SIGNUP_TICKET_TTL = '15m';

/**
 * Thrown when a valid Google ID token is presented, no Mentora account
 * exists for that email, and no role was supplied to create one. The
 * controller maps this to a 404 so the frontend can prompt for a role
 * and retry.
 */
class GoogleAccountNotFoundError extends Error {}

/** Thrown when a role is supplied but isn't 'student' or 'tutor'. */
class InvalidRoleError extends Error {}

/**
 * Thrown by verifyGoogleEmailForSignup when the Google-verified email
 * already has a Mentora account — the frontend should point the user at
 * /auth/login instead of continuing the signup form.
 */
class GoogleAccountExistsError extends Error {}

const verifyGoogleToken = async (idToken) => {
    const ticket = await client.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    if (!payload || !payload.email || !payload.email_verified) {
        throw new Error('Google account email is missing or unverified');
    }
    return payload;
};

/**
 * Verifies a Google ID token for the SIGNUP flow — identity check only,
 * creates nothing. Used by the "Sign up with Google" button on the
 * student/tutor detail forms: the account is only actually created when
 * the user finishes filling in and submits that form (see
 * authController.registerStudent/registerTutor's googleSignupToken
 * handling), not here.
 *
 * Returns a short-lived signed "signup ticket" (googleSignupToken) that
 * proves this email was Google-verified recently, without needing to
 * re-contact Google or re-parse the original ID token at final submission.
 */
const verifyGoogleEmailForSignup = async (idToken, role) => {
    if (!VALID_SIGNUP_ROLES.includes(role)) {
        throw new InvalidRoleError('Role must be "student" or "tutor"');
    }

    const payload = await verifyGoogleToken(idToken);

    const existingUser = await userModel.findUserByEmail(payload.email);
    if (existingUser) {
        throw new GoogleAccountExistsError('An account already exists for this email. Please log in instead.');
    }

    const googleSignupToken = jwt.sign(
        { email: payload.email, name: payload.name, role, purpose: 'google_signup' },
        process.env.JWT_SECRET,
        { expiresIn: SIGNUP_TICKET_TTL }
    );

    return {
        email: payload.email,
        name: payload.name || null,
        picture: payload.picture || null,
        googleSignupToken,
    };
};

/**
 * Creates a new user + minimal profile for a first-time Google sign-in.
 * Google-only accounts never use a password to log in, so we store a
 * random unguessable hash purely to satisfy users.password_hash NOT NULL.
 */
const createUserFromGoogle = async (payload, role) => {
    const randomPassword = crypto.randomBytes(32).toString('hex');
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(randomPassword, salt);

    const user = await userModel.createUserAccount(payload.email, passwordHash, role);
    const fullName = payload.name || payload.email;

    if (role === 'student') {
        await userModel.createStudentProfile(user.id, {
            fullName,
            school: null,
            age: null,
            language: null,
            gradeLevel: null,
            address: null,
        });
    } else if (role === 'tutor') {
        await userModel.createTutorProfile(user.id, {
            fullName,
            dob: null,
            gender: null,
            city: null,
            email: payload.email,
            address: null,
            profilePictureUrl: payload.picture || null,
            bannerUrl: null,
            university: null,
            degreeTitle: null,
            graduationYear: null,
            experience: null,
            subjects: null,
            gradeRange: null,
            level: null,
            medium: null,
            classType: null,
            description: null,
        });
    }

    return user;
};

/**
 * Verifies a Google ID token and either logs in the matching existing
 * user, or — if `role` ('student' | 'tutor') is supplied and no account
 * exists yet — creates a new account + minimal profile and logs that in.
 *
 * Called with no `role`: login-only, throws GoogleAccountNotFoundError if
 * the email has no account (used for the plain "Sign in with Google"
 * click). Called with a `role`: also creates the account if missing (used
 * once the frontend has asked a first-time user which role they are).
 */
const loginWithGoogleIdToken = async (idToken, role) => {
    const payload = await verifyGoogleToken(idToken);

    let user = await userModel.findUserByEmail(payload.email);
    let isNewUser = false;

    if (!user) {
        if (!role) {
            throw new GoogleAccountNotFoundError('No account found for this Google email. Please sign up first.');
        }
        if (!VALID_SIGNUP_ROLES.includes(role)) {
            throw new InvalidRoleError('Role must be "student" or "tutor"');
        }
        user = await createUserFromGoogle(payload, role);
        isNewUser = true;
    }

    return {
        token: generateToken(user.id, user.role),
        user: {
            id: user.id,
            email: user.email,
            role: user.role,
        },
        isNewUser,
    };
};

module.exports = {
    loginWithGoogleIdToken,
    verifyGoogleEmailForSignup,
    GoogleAccountNotFoundError,
    GoogleAccountExistsError,
    InvalidRoleError,
};

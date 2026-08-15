const { OAuth2Client } = require('google-auth-library');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const userModel = require('../models/userModel');
const { generateToken } = require('../utils/jwtHelper');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const VALID_SIGNUP_ROLES = ['student', 'tutor'];

/**
 * Thrown when a valid Google ID token is presented, no Mentora account
 * exists for that email, and no role was supplied to create one. The
 * controller maps this to a 404 so the frontend can prompt for a role
 * and retry.
 */
class GoogleAccountNotFoundError extends Error {}

/** Thrown when a role is supplied but isn't 'student' or 'tutor'. */
class InvalidRoleError extends Error {}

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
    GoogleAccountNotFoundError,
    InvalidRoleError,
};

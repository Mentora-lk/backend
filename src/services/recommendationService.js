// Recommendation Service — matches students to tutors/courses using a
// weighted rule-based score, then generates a personalized explanation via
// Gemini (if GEMINI_API_KEY is set) or a deterministic template otherwise.
const { pool } = require('../config/db');

const SUBJECT_ALIASES = { maths: 'mathematics', math: 'mathematics' };
const DAY_MAP = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

// courses.schedule is documented as {day: [times]}, but at least one row in
// the live data holds a plain string instead — pass through only genuine
// plain objects so a malformed row can't crash a frontend doing
// Object.entries(schedule).map(([day, times]) => times.join(...)).
function normalizeSchedule(schedule) {
  if (schedule && typeof schedule === 'object' && !Array.isArray(schedule)) {
    return schedule;
  }
  return {};
}

function normalizeSubject(s) {
  const lower = (s || '').trim().toLowerCase();
  return SUBJECT_ALIASES[lower] || lower;
}

function subjectMatches(courseSubject, selectedSubjects) {
  if (!selectedSubjects || selectedSubjects.length === 0) return true;
  const courseNorm = normalizeSubject(courseSubject);
  if (!courseNorm) return false;
  return selectedSubjects.some((sel) => {
    const selNorm = normalizeSubject(sel);
    return selNorm && (courseNorm.includes(selNorm) || selNorm.includes(courseNorm));
  });
}

function scoreCourse(course, prefs) {
  let score = 30; // subject already hard-filtered (or no preference) — full credit

  // Mode & location — 25
  const courseMode = (course.mode || '').toLowerCase();
  if (prefs.mode === 'Online') {
    if (courseMode === 'online' || courseMode === 'both') score += 25;
  } else if (prefs.mode === 'Physical') {
    const modeOk = courseMode === 'offline' || courseMode === 'both';
    if (modeOk) {
      const studentCity = (prefs.city || '').trim().toLowerCase();
      const tutorCity = (course.tutor_city || '').trim().toLowerCase();
      const courseLocation = (course.location || '').trim().toLowerCase();
      const cityMatch = studentCity && (tutorCity === studentCity || courseLocation === studentCity);
      score += cityMatch ? 25 : 10;
    }
  } else {
    score += 25; // 'Both' or unspecified — no mode preference to violate
  }

  // Budget — 20
  const fee = parseFloat(course.fee);
  const budget = Number(prefs.budget);
  if (!isNaN(fee) && !isNaN(budget) && budget > 0) {
    if (fee <= budget) score += 20;
    else if (fee <= budget * 1.2) score += 8;
  } else if (isNaN(fee)) {
    score += 10; // missing fee data — neutral, don't penalize
  }

  // Weekly schedule overlap — 15
  const days = Array.isArray(prefs.availableDays) ? prefs.availableDays : [];
  if (days.length && course.schedule && typeof course.schedule === 'object') {
    const fullDays = days.map((d) => DAY_MAP[d] || d);
    const courseDays = Object.keys(course.schedule);
    if (fullDays.some((d) => courseDays.includes(d))) score += 15;
  } else if (!days.length) {
    score += 7; // no day preference expressed — neutral
  }

  // Grade level — 10
  const grade = (course.grade || '').trim();
  if (!grade) {
    score += 5; // most courses don't have this set — don't punish unlabeled data
  } else if (prefs.level && grade === prefs.level) {
    score += 10;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

function templateInsight(course, prefs) {
  const subjectLabel = course.subject || 'this subject';
  const level = prefs.level || 'your level';
  let text = `A strong option for ${level} ${subjectLabel}`;
  if (course.full_name) text += `, taught by ${course.full_name}`;

  const fee = parseFloat(course.fee);
  const budget = Number(prefs.budget);
  if (!isNaN(fee) && !isNaN(budget)) {
    text += fee <= budget ? ', fitting comfortably within your budget' : ', slightly above your budget but close';
  }

  const days = Array.isArray(prefs.availableDays) ? prefs.availableDays : [];
  if (days.length && course.schedule) {
    const fullDays = days.map((d) => DAY_MAP[d] || d);
    const courseDays = Object.keys(course.schedule || {});
    const overlap = fullDays.filter((d) => courseDays.includes(d));
    if (overlap.length) text += `, with sessions available on your preferred ${overlap.join(', ')}`;
  }

  return text + '.';
}

// One batched call covering every candidate, so we pay Gemini's latency once
// per request instead of once per course. Returns null (triggering the
// template fallback for everything) on any failure — missing key, network
// error, bad JSON — so a Gemini outage never breaks recommendations.
async function callGeminiForInsights(scoredCourses, prefs) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || scoredCourses.length === 0) return null;

  try {
    const summary = scoredCourses.map((c) => ({
      id: c.id,
      subject: c.subject,
      title: c.title,
      tutor: c.full_name,
      experience: c.experience,
      fee: c.fee,
      mode: c.mode,
      location: c.location,
      matchScore: c.matchScore,
    }));

    const prompt = `You are matching a student to tutors on a Sri Lankan tutoring platform.
Student preferences: subjects=${JSON.stringify(prefs.subjects)}, level=${prefs.level}, mode=${prefs.mode}, availableDays=${JSON.stringify(prefs.availableDays)}, budget=LKR ${prefs.budget}, goal=${prefs.goal}, city=${prefs.city}.
Candidate courses (already scored 0-100 by a rule-based matcher): ${JSON.stringify(summary)}.
For each course id, write a short, specific, encouraging 2-3 sentence explanation of why this tutor/course fits the student's stated goal and preferences, referencing concrete details (subject, budget fit, schedule, experience) rather than generic praise.
Return ONLY a JSON array like [{"id": 1, "aiInsight": "..."}], one entry per candidate, no extra text.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    });

    if (!response.ok) {
      console.warn('[recommendationService] Gemini API returned', response.status);
      return null;
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    const parsed = JSON.parse(text);
    const map = {};
    for (const item of parsed) {
      if (item && item.id != null && item.aiInsight) {
        map[item.id] = item.aiInsight;
      }
    }
    return map;
  } catch (err) {
    console.warn('[recommendationService] Gemini call failed, using template fallback:', err.message);
    return null;
  }
}

const getRecommendedCourses = async (preferences = {}) => {
  const prefs = {
    subjects: Array.isArray(preferences.subjects) ? preferences.subjects : [],
    level: preferences.level || null,
    mode: preferences.mode || 'Both',
    availableDays: Array.isArray(preferences.availableDays) ? preferences.availableDays : [],
    budget: Number(preferences.budget) || null,
    goal: preferences.goal || null,
    city: preferences.city || null,
  };
//!to get active courses
  const result = await pool.query(
    `SELECT c.*, tp.full_name, tp.university, tp.degree_title, tp.city AS tutor_city,
            tp.profile_picture_url, tp.experience
     FROM courses c
     LEFT JOIN tutor_profiles tp ON c.tutor_id = tp.user_id
     WHERE c.status = 'active'`
  );

  const candidates = result.rows.filter((c) => subjectMatches(c.subject, prefs.subjects));

  const scored = candidates
    .map((c) => ({ ...c, matchScore: scoreCourse(c, prefs) }))
    .sort((a, b) => b.matchScore - a.matchScore);

  const geminiInsights = await callGeminiForInsights(scored, prefs);

  return scored.map((c) => ({
    id: c.id,
    tutor_id: c.tutor_id,
    title: c.title,
    subject: c.subject,
    fee: c.fee,
    mode: c.mode,
    location: c.location,
    image: c.image,
    rating: Number(c.average_rating) || 0,
    reviews: c.review_count || 0,
    badge: c.badge || undefined,
    what_you_learn: c.what_you_learn || [],
    schedule: normalizeSchedule(c.schedule),
    tutor: {
      name: c.full_name || 'Tutor',
      experience: c.experience || undefined,
      university: c.university || undefined,
      degree: c.degree_title || undefined,
      city: c.tutor_city || undefined,
      profile_picture: c.profile_picture_url || '',
    },
    matchScore: c.matchScore,
    aiInsight: (geminiInsights && geminiInsights[c.id]) || templateInsight(c, prefs),
  }));
};

module.exports = { getRecommendedCourses };

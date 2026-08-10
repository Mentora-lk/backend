const { pool } = require('../config/db');

// Map short day names to full day names
const DAY_MAP = {
  'Mon': 'Monday',
  'Tue': 'Tuesday',
  'Wed': 'Wednesday',
  'Thu': 'Thursday',
  'Fri': 'Friday',
  'Sat': 'Saturday',
  'Sun': 'Sunday'
};

/**
 * Generate a high-quality fallback explanation when Gemini API is not configured
 */
const generateFallbackInsight = (course, preferences) => {
  const tutorName = course.tutor_full_name || course.tutor_name || 'Our Expert Tutor';
  const subject = course.subject;
  const budget = Number(preferences.budget);
  const fee = Number(course.fee);
  const city = preferences.city || 'your city';
  const goal = preferences.goal || 'Grade Enhancement';
  
  let modeText = '';
  if (course.mode === 'online') {
    modeText = 'convenient online classes';
  } else if (course.mode === 'offline') {
    modeText = `physical classes in ${course.location || city}`;
  } else {
    modeText = `hybrid (both online and physical) sessions in ${course.location || city}`;
  }

  const matchesBudget = fee <= budget 
    ? `comfortably within your budget of LKR ${budget.toLocaleString()} (fee: LKR ${fee.toLocaleString()})`
    : `slightly above your budget, but offers premium value for money (fee: LKR ${fee.toLocaleString()})`;

  const experienceText = course.tutor_experience 
    ? ` With ${course.tutor_experience.toLowerCase()}, they are highly qualified to help you.` 
    : '';

  return `Highly recommended to support your goal of '${goal}'! ${tutorName} specializes in ${subject} and offers ${modeText} which fits your preferences. The rate is ${matchesBudget}.${experienceText} This is a great choice to accelerate your learning.`;
};

/**
 * Call the Gemini API to write personalized match summaries
 */
const getGeminiRecommendations = async (matchedCourses, preferences) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const prompt = `
You are an expert AI academic advisor matching a student with their ideal tutors.
Student Profile & Preferences:
- Subjects: ${preferences.subjects.join(', ')}
- Grade Level: ${preferences.level}
- Preferred Mode: ${preferences.mode}
- Available Days: ${preferences.availableDays.join(', ')}
- Budget: LKR ${preferences.budget}
- Academic Goal: ${preferences.goal}
- City: ${preferences.city}

Here are the top tutor matches found by our database filters:
${matchedCourses.map((c, idx) => `
Match #${idx + 1}:
- Tutor Name: ${c.tutor_full_name || c.tutor_name}
- Title: ${c.title}
- Subject: ${c.subject}
- Class Fee: LKR ${Number(c.fee).toLocaleString()}
- Class Mode: ${c.mode}
- Tutor Location: ${c.location || c.tutor_city || 'Not specified'}
- Tutor Experience: ${c.tutor_experience || 'Experienced tutor'}
- Tutor Education: ${c.tutor_university ? `${c.tutor_degree_title} from ${c.tutor_university}` : 'Highly qualified'}
- What you will learn: ${Array.isArray(c.what_you_learn) ? c.what_you_learn.join(', ') : 'Curriculum aligned lessons'}
- Rating: ${c.average_rating || 4.5}/5 (${c.review_count || 0} reviews)
- Calculated Match Score: ${c.matchScore}%
`).join('\n')}

For each of the matched tutors, write a highly personalized, encouraging, and punchy "aiInsight" (max 3 sentences) explaining EXACTLY why this tutor is a perfect match for the student's specific preferences, available days, and academic goal ("${preferences.goal}"). Explain how their class mode/location aligns and how their fee fits their budget.
Also, review the "matchScore" out of 100 and output a finalized "matchScore" integer based on how well the tutor matches the student's profile.

Return ONLY a valid JSON array of objects, with each object corresponding to the tutor matching the index (order should match the input order). Do not include markdown formatting like \`\`\`json or backticks in the response. Return strictly the raw JSON array.
Response Format:
[
  {
    "id": <course_id>,
    "aiInsight": "...",
    "matchScore": <integer_score>
  },
  ...
]
`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      })
    });

    if (!response.ok) {
      console.error('Gemini API returned error:', response.statusText);
      return null;
    }

    const data = await response.json();
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!responseText) {
      return null;
    }

    // Strip out any markdown code block formatting if present
    const cleanText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanText);
  } catch (err) {
    console.error('Failed to get Gemini recommendations:', err);
    return null;
  }
};

module.exports = {
  getRecommendations: async (preferences) => {
    const {
      subjects = [],
      level = '',
      mode = 'Both',
      availableDays = [],
      budget = 99999,
      goal = 'Improve',
      city = ''
    } = preferences;

    // 1. Fetch active courses and join with tutor profiles
    const query = `
      SELECT 
        c.*, 
        tp.full_name as tutor_full_name, 
        tp.name as tutor_name, 
        tp.email as tutor_email, 
        tp.city as tutor_city, 
        tp.experience as tutor_experience, 
        tp.level as tutor_level, 
        tp.medium as tutor_medium, 
        tp.university as tutor_university, 
        tp.degree_title as tutor_degree_title, 
        tp.profile_picture_url as tutor_profile_picture_url
      FROM courses c
      JOIN tutor_profiles tp ON c.tutor_id = tp.id
      WHERE c.status = 'active' OR c.status IS NULL
    `;

    const result = await pool.query(query);
    const courses = result.rows;

    const matchedResults = [];

    // 2. Perform matching and scoring in JS
    for (const course of courses) {
      let score = 0;
      let subjectMatch = false;
      let levelMatch = false;
      let modeMatch = false;
      let budgetMatch = false;
      let dayMatch = false;

      // Subject match (30 points)
      if (subjects.length > 0) {
        subjectMatch = subjects.some(sub => 
          course.subject?.toLowerCase() === sub.toLowerCase() ||
          course.title?.toLowerCase().includes(sub.toLowerCase())
        );
        if (subjectMatch) {
          score += 30;
        }
      } else {
        score += 30; // default if no filter
      }

      // Level match (10 points)
      if (level) {
        const lvlLower = level.toLowerCase();
        const tutorLvl = (course.tutor_level || '').toLowerCase();
        const courseTitle = (course.title || '').toLowerCase();
        
        if (lvlLower.includes('a/l') || lvlLower.includes('al') || lvlLower.includes('advanced')) {
          levelMatch = tutorLvl.includes('al') || tutorLvl.includes('a/l') || tutorLvl.includes('advanced') || courseTitle.includes('a/l') || courseTitle.includes('advanced');
        } else if (lvlLower.includes('o/l') || lvlLower.includes('ol') || lvlLower.includes('ordinary')) {
          levelMatch = tutorLvl.includes('ol') || tutorLvl.includes('o/l') || tutorLvl.includes('ordinary') || courseTitle.includes('o/l') || courseTitle.includes('ordinary');
        } else if (lvlLower.includes('undergrad') || lvlLower.includes('university') || lvlLower.includes('degree')) {
          levelMatch = tutorLvl.includes('undergrad') || tutorLvl.includes('university') || tutorLvl.includes('degree') || tutorLvl.includes('bsc') || courseTitle.includes('university') || courseTitle.includes('degree');
        } else {
          levelMatch = true; // match anyway for generic levels
        }

        if (levelMatch) {
          score += 10;
        }
      } else {
        score += 10;
      }

      // Mode & City match (25 points)
      const courseMode = (course.mode || '').toLowerCase();
      const prefMode = mode.toLowerCase();
      
      if (prefMode === 'online') {
        if (courseMode === 'online' || courseMode === 'both') {
          modeMatch = true;
          score += 25;
        }
      } else if (prefMode === 'physical') {
        if (courseMode === 'offline' || courseMode === 'both') {
          const tutorCity = (course.tutor_city || '').toLowerCase();
          const courseLoc = (course.location || '').toLowerCase();
          const targetCity = city.toLowerCase();
          
          if (targetCity && (tutorCity.includes(targetCity) || courseLoc.includes(targetCity))) {
            modeMatch = true;
            score += 25; // matched both mode and city
          } else {
            // mode matches but city doesn't
            score += 10;
          }
        }
      } else {
        // Both or unspecified
        modeMatch = true;
        score += 25;
      }

      // Budget match (20 points)
      const courseFee = Number(course.fee) || 0;
      const budgetNum = Number(budget);
      if (courseFee <= budgetNum) {
        budgetMatch = true;
        score += 20;
      } else if (courseFee <= budgetNum * 1.2) {
        // within 20% limit
        score += 8;
      }

      // Availability match (15 points)
      if (availableDays.length > 0 && course.schedule) {
        let scheduleObj = {};
        try {
          scheduleObj = typeof course.schedule === 'string' ? JSON.parse(course.schedule) : course.schedule;
        } catch (e) {
          scheduleObj = {};
        }

        // Get full day names from available short names
        const requestedFullDays = availableDays.map(d => DAY_MAP[d]).filter(Boolean);
        const scheduleDays = Object.keys(scheduleObj);

        const hasOverlap = requestedFullDays.some(day => 
          scheduleDays.some(sDay => sDay.toLowerCase() === day.toLowerCase())
        );

        if (hasOverlap) {
          dayMatch = true;
          score += 15;
        }
      } else {
        score += 15;
      }

      // Include in results if there's a basic subject match or score is reasonably high
      if (subjectMatch || score >= 40) {
        matchedResults.push({
          ...course,
          matchScore: score,
          subjectMatch,
          levelMatch,
          modeMatch,
          budgetMatch,
          dayMatch
        });
      }
    }

    // Sort by Match Score descending, and sub-sort by average rating
    matchedResults.sort((a, b) => {
      if (b.matchScore !== a.matchScore) {
        return b.matchScore - a.matchScore;
      }
      return (b.average_rating || 0) - (a.average_rating || 0);
    });

    // Take top 4 recommendations
    const topRecommendations = matchedResults.slice(0, 4);

    // 3. Inject AI insights (Gemini or Template Fallback)
    const geminiInsights = await getGeminiRecommendations(topRecommendations, preferences);

    const finalRecommendations = topRecommendations.map(course => {
      let aiInsight = '';
      let finalizedScore = course.matchScore;

      if (geminiInsights && Array.isArray(geminiInsights)) {
        const matchingInsight = geminiInsights.find(g => g.id === course.id);
        if (matchingInsight) {
          aiInsight = matchingInsight.aiInsight;
          finalizedScore = matchingInsight.matchScore ?? course.matchScore;
        }
      }

      // Fallback if Gemini failed or wasn't run
      if (!aiInsight) {
        aiInsight = generateFallbackInsight(course, preferences);
      }

      return {
        id: course.id,
        tutor_id: course.tutor_id,
        title: course.title,
        subject: course.subject,
        fee: course.fee,
        mode: course.mode,
        location: course.location,
        image: course.image || 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=400&q=80',
        rating: course.average_rating || 4.5,
        reviews: course.review_count || 0,
        badge: course.badge,
        what_you_learn: course.what_you_learn,
        schedule: course.schedule,
        tutor: {
          name: course.tutor_full_name || course.tutor_name || 'Expert Tutor',
          experience: course.tutor_experience,
          university: course.tutor_university,
          degree: course.tutor_degree_title,
          city: course.tutor_city,
          profile_picture: course.tutor_profile_picture_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&q=80'
        },
        matchScore: Math.min(100, Math.max(0, finalizedScore)),
        aiInsight
      };
    });

    return finalRecommendations;
  }
};

const { getRecommendedCourses } = require('../services/recommendationService');

const getRecommendations = async (req, res, next) => {
  try {
    const data = await getRecommendedCourses(req.body || {});
    res.json({ data });
  } catch (err) {
    next(err);
  }
};

module.exports = { getRecommendations };

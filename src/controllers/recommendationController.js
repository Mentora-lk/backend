const recommendationService = require('../services/recommendationService');

/**
 * Handle POST request for smart tutor recommendations
 */
const getRecommendations = async (req, res, next) => {
  try {
    const preferences = req.body;
    
    if (!preferences || typeof preferences !== 'object') {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid preferences payload provided.'
      });
    }

    const recommendations = await recommendationService.getRecommendations(preferences);
    
    res.json({
      status: 'success',
      count: recommendations.length,
      data: recommendations
    });
  } catch (err) {
    console.error('Error in getRecommendations controller:', err);
    next(err);
  }
};

module.exports = {
  getRecommendations
};

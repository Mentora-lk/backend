// Admin Controller
const { sendWeeklySessionReminders } = require('../jobs/weeklyReminderJob');

module.exports = {
  getDashboard: (req, res) => {
    res.json({ message: 'Admin dashboard' });
  },

  triggerWeeklyReminders: async (req, res, next) => {
    try {
      const summary = await sendWeeklySessionReminders();
      res.json({ message: 'Weekly reminder run complete', ...summary });
    } catch (err) {
      next(err);
    }
  },
};

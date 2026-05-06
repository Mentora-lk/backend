require('dotenv').config();
const http = require('http');
const app = require('./app');
const initSocket = require('./socket');

const PORT = process.env.PORT || 5000;

// Create a native HTTP server so that Socket.io and Express share the same port
const httpServer = http.createServer(app);

// Initialise Socket.io — attaches io to app.locals.io for use in controllers
initSocket(httpServer, app);

httpServer.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Socket.io is ready on ws://localhost:${PORT}`);
});

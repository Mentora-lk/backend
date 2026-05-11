require('dotenv').config();
const { connectDatabase } = require('./config/db');
const http = require('http');
const app = require('./app');
const initSocket = require('./socket');

const PORT = process.env.PORT || 5000;

// Create a native HTTP server so that Socket.io and Express share the same port
const httpServer = http.createServer(app);

// Initialise Socket.io — attaches io to app.locals.io for use in controllers
initSocket(httpServer, app);


const startServer = async () => {
    try {
        await connectDatabase();
        httpServer.listen(PORT, () => {
            console.log(`✓ Server running on http://localhost:${PORT}`);
            console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`✓ Health check: http://localhost:${PORT}/api/health`);
            console.log(`✓ Socket.io is ready on ws://localhost:${PORT}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

startServer();
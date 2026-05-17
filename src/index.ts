import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import groovyRoutes from './routes/groovy';
import authRoutes from './routes/auth';
import eventsRoutes from './routes/events';
import aggregatesRoutes from './routes/aggregates';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: '*', // Allow all origins for now (extension + web)
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/groovy', groovyRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/aggregates', aggregatesRoutes);
app.use('/auth', authRoutes);

// Health check
app.get('/', (req, res) => {
  res.json({
    name: 'Groovy Spotify Backend',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      groovy: '/api/groovy/:trackId',
      events_ingest: 'POST /api/events/batch',
      aggregates: 'GET /api/aggregates',
      aggregates_refresh: 'POST /api/aggregates/refresh',
      auth: '/auth/login',
      health: '/auth/health'
    }
  });
});

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
🚀 Groovy Spotify Backend is running!
📡 Port: ${PORT}
🌍 Environment: ${process.env.NODE_ENV || 'development'}
🔗 Health Check: http://localhost:${PORT}/
🎵 API Endpoints:
   - GET  /api/groovy/:trackId  - Get groovy data
   - POST /api/groovy           - Save groovy data
   - GET  /auth/login           - Spotify OAuth
   - GET  /auth/callback        - OAuth callback
   - GET  /auth/health          - Check config
  `);
});

export default app;

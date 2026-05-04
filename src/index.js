const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const authRoutes = require('./routes/auth.routes');
const profileRoutes = require('./routes/profile.routes');
const { authenticate } = require('./middleware/auth.middleware');
const { requireApiVersion } = require('./middleware/apiVersion.middleware');
const { authLimiter, apiLimiter } = require('./middleware/rateLimiter.middleware');
const cookieParser = require('cookie-parser');
const ingestRoutes = require('./routes/ingest.routes');

const app = express();
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors());
app.use(express.json());

// Logging
app.use(morgan('[:date[clf]] :method :url :status :response-time ms'));

// Public routes
app.use('/auth', authLimiter, authRoutes);

// Protected routes
app.use('/api/profiles', apiLimiter, authenticate, requireApiVersion, profileRoutes);

// Add after profile routes
app.use('/api/ingest', apiLimiter, ingestRoutes);

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'success', message: 'Insighta API is running' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Cookie parser
app.use(cookieParser());
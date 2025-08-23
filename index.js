const express = require('express');
var serveIndex = require('serve-index')
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const clientsRouter = require('./routers/clients');
const accountsRouter = require('./routers/account');
const branchesRouter = require('./routers/branches');
const categoriesRouter = require('./routers/categories');
const servicesRouter = require('./routers/services');
const servicesProductsRouter = require('./routers/servicesProducts');
const otcProductsRouter = require('./routers/otcProducts');
const transactionRouter = require('./routers/transaction');
const expensesRouter = require('./routers/expenses');
const discountRouter = require('./routers/discount');
const paymentMethodsRouter = require('./routers/paymentMethods');
const bookingRouter = require('./routers/booking');
const timeSlotRouter = require('./routers/timeSlot');
const requireAuthHeader = require('./authMiddleware');
const verifyToken = require('./verifyToken');

const app = express();

// Configure CORS with specific options for file uploads
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Disposition']
}));

// Configure body-parser with proper limits and error handling
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Handle multipart form data more gracefully
app.use((req, res, next) => {
  // Skip body parsing for multipart forms (let multer handle it)
  if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
    return next();
  }
  next();
});

app.use('/ftp', express.static('images'), serveIndex('images', {'icons': true, 'view': 'details'}))

// Serve static images
// app.use('/images', express.static(path.join(__dir name, 'images')));

// Global error handler for multipart form errors
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  
  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large' });
  }
  if (error.message && error.message.includes('Unexpected end of form')) {
    return res.status(400).json({ error: 'Invalid form data or incomplete upload' });
  }
  if (error.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: 'Unexpected file field in form' });
  }
  if (error.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({ error: 'Too many files uploaded' });
  }
  if (error.code === 'LIMIT_FIELD_KEY') {
    return res.status(400).json({ error: 'Field name too long' });
  }
  if (error.code === 'LIMIT_FIELD_VALUE') {
    return res.status(400).json({ error: 'Field value too long' });
  }
  if (error.code === 'LIMIT_FIELD_COUNT') {
    return res.status(400).json({ error: 'Too many fields in form' });
  }
  
  // Generic error response
  res.status(500).json({ error: 'Internal server error' });
});

app.get('/', (req, res) => {
  res.send('Hello World');
});


// Add verifyToken endpoint
app.post('/api/verifyToken', verifyToken);
// Apply Authorization header middleware globally
app.use('/api',requireAuthHeader);

// Use the clients router for all /clients routes
app.use('/api/clients', clientsRouter);
// Use the accounts router for all /accounts routes
app.use('/api/accounts', accountsRouter);
app.use('/api/branches', branchesRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/services', servicesRouter);
app.use('/api/services-products', servicesProductsRouter);
app.use('/api/otc-products', otcProductsRouter);
app.use('/api/transactions', transactionRouter);
app.use('/api/expenses', expensesRouter);
app.use('/api/discounts', discountRouter);
app.use('/api/payment-methods', paymentMethodsRouter);
app.use('/api/bookings', bookingRouter);
app.use('/api/time-slots', timeSlotRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

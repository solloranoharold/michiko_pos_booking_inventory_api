const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const clientsRouter = require('./routers/clients');
const accountsRouter = require('./routers/account');
const branchesRouter = require('./routers/branches');
const servicesRouter = require('./routers/services');
const servicesProductsRouter = require('./routers/servicesProducts');
const otcProductsRouter = require('./routers/otcProducts');
const transactionRouter = require('./routers/transaction');
const expensesRouter = require('./routers/expenses');
const requireAuthHeader = require('./authMiddleware');
const verifyToken = require('./verifyToken');

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.send('Hello World');
});

// Add verifyToken endpoint
app.post('/api/verifyToken', verifyToken);
// Apply Authorization header middleware globally
app.use(requireAuthHeader);

// Use the clients router for all /clients routes
app.use('/api/clients', clientsRouter);
// Use the accounts router for all /accounts routes
app.use('/api/accounts', accountsRouter);
app.use('/api/branches', branchesRouter);
app.use('/api/services', servicesRouter);
app.use('/api/services-products', servicesProductsRouter);
app.use('/api/otc-products', otcProductsRouter);
app.use('/api/transactions', transactionRouter);
app.use('/api/expenses', expensesRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
}); 
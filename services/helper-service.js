const moment = require('moment');

// Helper functions
function getCurrentDate() {
  return moment().format('YYYY-MM-DD HH:mm:ss');
}

function generateInvoiceId() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  return `INV-${timestamp}-${random}`;
}

function calculateCommission(amount, commissionRate = 0.10) {
  return parseFloat((amount * commissionRate).toFixed(2));
}
// create a function to convert search to ProperCase 
function convertToProperCase(search) {
  return search.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}
module.exports = {
  getCurrentDate,
  generateInvoiceId,
  calculateCommission,
  convertToProperCase
};

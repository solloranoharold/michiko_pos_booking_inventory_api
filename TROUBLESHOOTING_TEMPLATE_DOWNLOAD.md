# Troubleshooting Template Download Issues

## 🚨 **Problem: Downloading as CSV instead of Excel**

If you're experiencing issues where the template downloads as a CSV file instead of an Excel file with dropdowns, follow this troubleshooting guide.

## 🔍 **Root Causes & Solutions**

### 1. **Wrong Endpoint Called**

**Problem:** Frontend is calling the wrong endpoint.

**❌ Incorrect (old behavior - might default to CSV):**
```javascript
const response = await fetch(`/api/servicesProducts/downloadTemplate?branch_id=${branchId}&format=csv`);
```

**✅ Correct (new default - guaranteed Excel):**
```javascript
const response = await fetch(`/api/servicesProducts/downloadTemplate?branch_id=${branchId}`);
```

**✅ Alternative (explicit Excel):**
```javascript
const response = await fetch(`/api/servicesProducts/downloadExcelTemplate?branchId=${branchId}`);
```

### 2. **Format Parameter No Longer Needed**

**Problem:** The `/downloadTemplate` endpoint now **only generates Excel files** by default.

**❌ Old way (no longer needed):**
```javascript
const response = await fetch(`/api/servicesProducts/downloadTemplate?branch_id=${branchId}&format=excel`);
```

**✅ New way (simplified):**
```javascript
const response = await fetch(`/api/servicesProducts/downloadTemplate?branch_id=${branchId}`);
```

### 3. **Browser MIME Type Detection**

**Problem:** Browser might be interpreting the response incorrectly.

**Solution:** The endpoint now always sets proper Excel MIME type headers.

## 🚀 **Recommended Solutions**

### **Option 1: Use Main Template Endpoint (Recommended)**

```javascript
// Frontend code - guaranteed Excel with dropdowns
const downloadExcelTemplate = async (branchId) => {
  try {
    const response = await fetch(`/api/servicesProducts/downloadTemplate?branch_id=${branchId}`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `services_products_template_${branchId}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
  } catch (error) {
    console.error('Error downloading template:', error);
    alert('Failed to download template. Please try again.');
  }
};
```

### **Option 2: Use Dedicated Excel Endpoint**

```javascript
// Frontend code - explicit Excel endpoint
const downloadExcelTemplate = async (branchId) => {
  try {
    const response = await fetch(`/api/servicesProducts/downloadExcelTemplate?branch_id=${branchId}`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `services_products_template_${branchId}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
  } catch (error) {
    console.error('Error downloading template:', error);
    alert('Failed to download template. Please try again.');
  }
};
```

### **Option 3: Use Template Endpoint with Format (Legacy)**

```javascript
// Frontend code - legacy approach (not recommended)
const downloadTemplate = async (branchId, format = 'excel') => {
  try {
    const response = await fetch(`/api/servicesProducts/downloadTemplate?branch_id=${branchId}&format=${format}`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `services_products_template_${branchId}.${format === 'excel' ? 'xlsx' : 'csv'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
  } catch (error) {
    console.error('Error downloading template:', error);
    alert('Failed to download template. Please try again.');
  }
};
```

## 🧪 **Testing & Debugging**

### **Test Excel Generation**

Use the test endpoint to verify Excel generation works:

```bash
GET /api/servicesProducts/testExcel
```

This should download a simple Excel file named `test.xlsx`.

### **Check Response Headers**

In browser DevTools, check the Network tab:

1. **Expected Excel Headers:**
   ```
   Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
   Content-Disposition: attachment; filename="services_products_template_branch123.xlsx"
   ```

2. **Expected CSV Headers:**
   ```
   Content-Type: text/csv
   Content-Disposition: attachment; filename="services_products_template_branch123.csv"
   ```

### **Console Logging**

Check server console for format detection logs:

```
Template download requested - branch_id: branch123, format: excel
Generating Excel template with dropdowns...
Excel template generated successfully, sending response...
```

## 🔧 **Backend Debugging**

### **Check Server Logs**

Look for these log messages:

- ✅ `Generating Excel template with dropdowns...`
- ✅ `Excel template generated successfully, sending response...`
- ❌ `Generating CSV template...` (if you want Excel)

### **Verify ExcelJS Installation**

```bash
npm list exceljs
```

Should show ExcelJS version.

### **Test Excel Generation Manually**

```bash
node -e "
const ExcelJS = require('exceljs');
const workbook = new ExcelJS.Workbook();
const worksheet = workbook.addWorksheet('Test');
worksheet.addRow(['Test']);
workbook.xlsx.writeFile('test.xlsx').then(() => console.log('Excel file created successfully'));
"
```

## 📱 **Frontend Debugging**

### **Check Network Tab**

1. Open browser DevTools
2. Go to Network tab
3. Download template
4. Check the request URL and response headers

### **Verify Blob Type**

```javascript
const response = await fetch(`/api/servicesProducts/downloadExcelTemplate?branch_id=${branchId}`);
const blob = await response.blob();

console.log('Blob type:', blob.type);
console.log('Blob size:', blob.size);

// Should show:
// Blob type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
// Blob size: [some number > 0]
```

## 🎯 **Common Issues & Fixes**

### **Issue: "Failed to fetch" error**

**Cause:** CORS or network issue
**Fix:** Check CORS configuration and network connectivity

### **Issue: "Invalid file" error**

**Cause:** File corruption or wrong format
**Fix:** Verify ExcelJS is working and response is complete

### **Issue: File downloads as "download" without extension**

**Cause:** Missing Content-Disposition header
**Fix:** Ensure proper headers are set in backend

### **Issue: Excel file opens as corrupted**

**Cause:** Incomplete response or wrong MIME type
**Fix:** Check response completion and MIME type headers

## 📋 **Quick Checklist**

- [ ] Using correct endpoint (`/downloadExcelTemplate`)
- [ ] Passing `branch_id` parameter
- [ ] Checking browser Network tab for correct headers
- [ ] Verifying ExcelJS is installed
- [ ] Testing with `/testExcel` endpoint
- [ ] Checking server console logs
- [ ] Verifying blob type and size

## 🆘 **Still Having Issues?**

If the problem persists:

1. **Check server logs** for error messages
2. **Test with `/testExcel`** endpoint
3. **Verify ExcelJS installation**
4. **Check browser console** for errors
5. **Verify network response** in DevTools

## 📞 **Support**

For additional help, check:
- Server console logs
- Browser DevTools Network tab
- ExcelJS documentation
- API endpoint documentation 
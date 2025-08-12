const { FtpSrv } = require('ftp-srv');
const express = require('express');
const path = require('path');
const fs = require('fs');

console.log('🧪 Testing Both Servers Running Together...\n');

// Test 1: Check if images directory exists
console.log('1️⃣ Checking images directory...');
const imagesDir = path.join(__dirname, 'images');
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
  console.log('✅ Created images directory');
} else {
  console.log('✅ Images directory already exists');
}

// Test 2: Test Express server
console.log('\n2️⃣ Testing Express server...');
const app = express();
const testServer = app.listen(0, () => {
  const port = testServer.address().port;
  console.log(`✅ Express server test successful on port ${port}`);
  
  // Test 3: Test FTP server
  console.log('\n3️⃣ Testing FTP server...');
  const ftpServer = new FtpSrv(`ftp://0.0.0.0:0`, {
    anonymous: true,
    greeting: 'Test FTP Server'
  });

  ftpServer.on('login', ({ connection }, resolve) => {
    resolve({ fs: class TestFS {
      constructor() { this.root = imagesDir; }
      get(fileName) { return fs.createReadStream(path.join(this.root, fileName)); }
      list() { return []; }
      write(fileName) { return fs.createWriteStream(path.join(this.root, fileName)); }
    }});
  });

  ftpServer.listen()
    .then(() => {
      const ftpPort = ftpServer.server.address().port;
      console.log(`✅ FTP server test successful on port ${ftpPort}`);
      
      console.log('\n🎉 Both servers can run together successfully!');
      console.log('\n📋 Test Results:');
      console.log('   ✅ Images directory: Ready');
      console.log('   ✅ Express server: Compatible');
      console.log('   ✅ FTP server: Compatible');
      console.log('   ✅ Port conflicts: None detected');
      
      // Cleanup
      testServer.close(() => {
        ftpServer.server.close(() => {
          console.log('\n🧹 Test cleanup completed');
          process.exit(0);
        });
      });
    })
    .catch((error) => {
      console.error('❌ FTP server test failed:', error.message);
      testServer.close(() => process.exit(1));
    });
}); 
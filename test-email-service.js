require("dotenv").config();
const { emailService } = require('./services/email-service.js');

async function testEmailService() {
    console.log('🧪 Testing Email Service...\n');

    try {
        // Test 1: Initialize email service
        console.log('1️⃣ Testing email service initialization...');
        const initialized = await emailService.initialize();
        console.log(`   ✅ Initialization: ${initialized ? 'SUCCESS' : 'FAILED'}\n`);

        if (!initialized) {
            console.log('❌ Email service failed to initialize. Check your credentials and Gmail API setup.');
            return;
        }

        // Test 2: Get accounts by role and branch
        console.log('2️⃣ Testing account discovery...');
        const accounts = await emailService.getAccountsByRoleAndBranch();
        console.log(`   ✅ Found ${accounts.length} total accounts`);
        
        // Group accounts by role
        const accountsByRole = accounts.reduce((acc, account) => {
            if (!acc[account.role]) acc[account.role] = 0;
            acc[acc.role]++;
            return acc;
        }, {});
        
        Object.keys(accountsByRole).forEach(role => {
            console.log(`   📧 ${role}: ${accountsByRole[role]} accounts`);
        });
        console.log('');

        // Test 3: Test email content creation
        console.log('3️⃣ Testing email content creation...');
        const testData = {
            booking_id: 'TEST-' + Date.now(),
            date: '2024-01-15',
            time: '14:00:00',
            status: 'scheduled',
            notes: 'This is a test email notification',
            clientName: 'Test Client',
            clientEmail: 'test@example.com',
            clientPhone: '+1234567890',
            clientAddress: '123 Test Street, Test City',
            branchName: 'Test Branch',
            branchAddress: '456 Test Avenue, Test City',
            branchPhone: '+0987654321',
            services: [
                { name: 'Test Service 1', category: 'Test Category', price: 100.00 },
                { name: 'Test Service 2', category: 'Test Category', price: 150.00 }
            ],
            totalCost: 250.00,
            created_at: new Date().toISOString()
        };

        // Test different email types to show branch names in subjects
        const emailTypes = ['booking_created', 'booking_updated', 'booking_status_changed'];
        emailTypes.forEach(emailType => {
            const emailContent = emailService.createEmailContent(emailType, testData);
            console.log(`   ✅ ${emailType}: ${emailContent.subject}`);
        });
        console.log(`   ✅ Email HTML length: ${emailService.createEmailContent('booking_created', testData).html.length} characters`);
        console.log('');

        // Test 4: Test sending to a single email (if you want to test actual sending)
        console.log('4️⃣ Testing single email sending...');
        console.log('   ⚠️  This will send a real email if Gmail API is properly configured');
        console.log('   💡 Set TEST_EMAIL environment variable to test with a real email address');
        
        const testEmail = process.env.TEST_EMAIL;
        if (testEmail) {
            console.log(`   📧 Testing with email: ${testEmail}`);
            const singleEmailResult = await emailService.sendEmail(
                testEmail, 
                emailContent.subject, 
                emailContent.html
            );
            console.log(`   ✅ Single email result: ${singleEmailResult.success ? 'SUCCESS' : 'FAILED'}`);
            if (!singleEmailResult.success) {
                console.log(`   ❌ Error: ${singleEmailResult.error}`);
            }
        } else {
            console.log('   ⏭️  Skipping single email test (set TEST_EMAIL env var to test)');
        }
        console.log('');

        // Test 5: Test notification system (without actually sending)
        console.log('5️⃣ Testing notification system...');
        console.log('   📋 This would send notifications to all relevant accounts');
        console.log('   💡 Use the API endpoints to test actual sending');
        console.log('');

        // Test 6: Check service status
        console.log('6️⃣ Service status summary...');
        console.log(`   🔧 Email service initialized: ${initialized}`);
        console.log(`   👥 Total accounts available: ${accounts.length}`);
        console.log(`   🎯 Roles supported: ${Object.keys(accountsByRole).join(', ')}`);
        console.log(`   📧 Gmail API ready: ${initialized}`);
        console.log('');

        console.log('🎉 Email service test completed successfully!');
        console.log('');
        console.log('📚 Next steps:');
        console.log('   1. Test the API endpoints:');
        console.log('      GET  /api/bookings/test-email-service');
        console.log('      GET  /api/bookings/email-service-status');
        console.log('      POST /api/bookings/send-email-notifications');
        console.log('');
        console.log('   2. Create a test booking to trigger automatic notifications');
        console.log('   3. Monitor email delivery in your Gmail account');
        console.log('   4. Check server logs for detailed results');

    } catch (error) {
        console.error('❌ Email service test failed:', error.message);
        console.log('');
        console.log('🔧 Troubleshooting tips:');
        console.log('   1. Check your Google service account credentials');
        console.log('   2. Ensure Gmail API is enabled in Google Cloud Console');
        console.log('   3. Verify environment variables are set correctly');
        console.log('   4. Check network connectivity to Google APIs');
        console.log('');
        console.log('📖 See EMAIL_NOTIFICATION_SYSTEM_README.md for detailed setup instructions');
    }
}

// Run the test if this file is executed directly
if (require.main === module) {
    testEmailService();
}

module.exports = { testEmailService }; 
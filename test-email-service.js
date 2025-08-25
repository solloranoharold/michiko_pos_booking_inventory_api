require("dotenv").config();
const emailService = require('./emailService.js');

async function testEmailService() {
    console.log('🧪 Testing Email Service...\n');

    // Test 1: Check environment variables
    console.log('📋 Environment Variables Check:');
    console.log(`EMAIL_HOST: ${process.env.EMAIL_HOST ? '✅ Set' : '❌ Missing'}`);
    console.log(`EMAIL_USER: ${process.env.EMAIL_USER ? '✅ Set' : '❌ Missing'}`);
    console.log(`EMAIL_PASS: ${process.env.EMAIL_PASS ? '✅ Set' : '❌ Missing'}`);
    console.log(`EMAIL_PORT: ${process.env.EMAIL_PORT || '587 (default)'}`);
    console.log(`EMAIL_SECURE: ${process.env.EMAIL_SECURE || 'false (default)'}`);
    console.log(`FRONTEND_URL: ${process.env.FRONTEND_URL ? '✅ Set' : '❌ Missing'}\n`);

    // Test 2: Test connection
    console.log('🔌 Testing Email Connection:');
    try {
        const connectionTest = await emailService.testConnection();
        if (connectionTest.success) {
            console.log('✅ Email connection successful:', connectionTest.message);
        } else {
            console.log('❌ Email connection failed:', connectionTest.error);
            console.log('💡 Please check your email credentials and server settings\n');
            return;
        }
    } catch (error) {
        console.log('❌ Connection test error:', error.message);
        return;
    }

    // Test 3: Test email sending (if test email is provided)
    const testEmail = process.env.TEST_EMAIL;
    if (testEmail) {
        console.log(`📧 Testing Email Sending to: ${testEmail}`);
        
        const testBookingData = {
            booking_id: 'test-booking-123',
            date: '2024-12-25',
            time: '14:00:00',
            status: 'scheduled',
            notes: 'This is a test booking for email service verification.',
            estimated_total_cost: 1500.00
        };

        const testClientDetails = {
            name: 'Test Client',
            email: testEmail,
            phone: '+63 912 345 6789',
            address: '123 Test Street, Test City'
        };

        const testBranchDetails = {
            name: 'Test Branch',
            address: '456 Test Avenue, Test City',
            phone: '+63 998 765 4321',
            email: 'test@branch.com'
        };

        const testServicesDetails = {
            services: [
                { name: 'Test Service 1', category: 'Test Category', price: 750.00 },
                { name: 'Test Service 2', category: 'Test Category', price: 750.00 }
            ],
            totalCost: 1500.00
        };

        try {
            const emailResult = await emailService.sendBookingConfirmation(
                testBookingData,
                testClientDetails,
                testBranchDetails,
                testServicesDetails
            );

            if (emailResult.success) {
                console.log('✅ Test email sent successfully!');
                console.log(`   Message ID: ${emailResult.messageId}`);
                console.log(`   Sent at: ${emailResult.sent_at}`);
                console.log('📧 Check your email inbox (and spam folder) for the test email');
            } else {
                console.log('❌ Test email failed:', emailResult.error);
            }
        } catch (error) {
            console.log('❌ Email sending error:', error.message);
        }
    } else {
        console.log('💡 To test email sending, set TEST_EMAIL environment variable');
        console.log('   Example: TEST_EMAIL=your-email@example.com');
    }

    console.log('\n🎯 Email Service Test Complete!');
    console.log('\n📚 Next Steps:');
    console.log('1. Check your email inbox for test emails');
    console.log('2. Verify accept/decline links work correctly');
    console.log('3. Test with your actual frontend application');
    console.log('4. Monitor email delivery and client responses');
}

// Run the test
testEmailService().catch(error => {
    console.error('❌ Test failed with error:', error);
    process.exit(1);
}); 
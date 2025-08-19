const moment = require('moment-timezone');

console.log('=== DEBUGGING DATE SHIFT ISSUE ===\n');

// Test with the actual input that's causing the problem
const testDate = '2025-08-20';
const testTime = '09:30';

console.log('INPUT:');
console.log('Date:', testDate);
console.log('Time:', testTime);
console.log();

console.log('CURRENT SYSTEM INFO:');
console.log('System timezone:', Intl.DateTimeFormat().resolvedOptions().timeZone);
console.log('System current time:', new Date().toString());
console.log('Manila current time:', moment.tz('Asia/Manila').format('YYYY-MM-DD HH:mm:ss Z'));
console.log();

// Test different parsing methods
console.log('=== PARSING METHODS COMPARISON ===');

// Method 1: Space separator with explicit format
const dateTimeString = `${testDate} ${testTime}`;
console.log('1. Space separator method:');
console.log('   Input string:', dateTimeString);

let method1 = moment.tz(dateTimeString, 'YYYY-MM-DD HH:mm:ss', 'Asia/Manila');
if (!method1.isValid()) {
    method1 = moment.tz(dateTimeString, 'YYYY-MM-DD HH:mm', 'Asia/Manila');
}

console.log('   Result:', method1.format('YYYY-MM-DD HH:mm:ss'));
console.log('   RFC3339:', method1.format('YYYY-MM-DDTHH:mm:ss+08:00'));
console.log('   Is valid:', method1.isValid());
console.log();

// Method 2: T separator
const tSeparatorString = `${testDate}T${testTime}`;
console.log('2. T separator method:');
console.log('   Input string:', tSeparatorString);

const method2 = moment.tz(tSeparatorString, 'Asia/Manila');
console.log('   Result:', method2.format('YYYY-MM-DD HH:mm:ss'));
console.log('   RFC3339:', method2.format('YYYY-MM-DDTHH:mm:ss+08:00'));
console.log('   Is valid:', method2.isValid());
console.log();

// Method 3: More explicit parsing
console.log('3. Most explicit method:');
const method3 = moment.tz({
    year: 2025,
    month: 7, // August (0-indexed)
    day: 20,
    hour: 9,
    minute: 30,
    second: 0
}, 'Asia/Manila');

console.log('   Result:', method3.format('YYYY-MM-DD HH:mm:ss'));
console.log('   RFC3339:', method3.format('YYYY-MM-DDTHH:mm:ss+08:00'));
console.log('   Is valid:', method3.isValid());
console.log();

// Method 4: Parse in UTC first, then convert
console.log('4. Parse as UTC first, then convert:');
const utcDateTime = moment.utc(`${testDate}T${testTime}:00`);
const method4 = utcDateTime.tz('Asia/Manila');
console.log('   UTC parsed:', utcDateTime.format('YYYY-MM-DD HH:mm:ss'));
console.log('   Manila converted:', method4.format('YYYY-MM-DD HH:mm:ss'));
console.log('   RFC3339:', method4.format('YYYY-MM-DDTHH:mm:ss+08:00'));
console.log();

// Method 5: Direct creation in Manila timezone
console.log('5. Direct creation with timezone:');
const method5 = moment.tz(`${testDate} ${testTime}`, 'YYYY-MM-DD HH:mm', 'Asia/Manila');
console.log('   Result:', method5.format('YYYY-MM-DD HH:mm:ss'));
console.log('   RFC3339:', method5.format('YYYY-MM-DDTHH:mm:ss+08:00'));
console.log('   Is valid:', method5.isValid());
console.log();

console.log('=== ANALYSIS ===');
console.log('Expected date: 2025-08-20');
console.log('Expected time: 09:30');
console.log();

const methods = [method1, method2, method3, method4, method5];
methods.forEach((method, index) => {
    if (method.isValid()) {
        const dateCorrect = method.format('YYYY-MM-DD') === testDate;
        const timeCorrect = method.format('HH:mm') === testTime;
        
        console.log(`Method ${index + 1}: Date ${dateCorrect ? '✓' : '✗'}, Time ${timeCorrect ? '✓' : '✗'}`);
        
        if (!dateCorrect) {
            console.log(`   Expected date: ${testDate}, Got: ${method.format('YYYY-MM-DD')}`);
        }
        if (!timeCorrect) {
            console.log(`   Expected time: ${testTime}, Got: ${method.format('HH:mm')}`);
        }
    } else {
        console.log(`Method ${index + 1}: Invalid`);
    }
}); 
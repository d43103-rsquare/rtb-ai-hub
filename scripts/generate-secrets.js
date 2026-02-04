#!/usr/bin/env node

const crypto = require('crypto');

console.log('🔐 Generating Security Keys for RTB AI Hub\n');

const encryptionKey = crypto.randomBytes(32).toString('hex');
const jwtSecret = crypto.randomBytes(64).toString('base64');

console.log('Copy these values to your .env file:\n');
console.log(`CREDENTIAL_ENCRYPTION_KEY=${encryptionKey}`);
console.log(`JWT_SECRET=${jwtSecret}`);
console.log('\n✅ Keys generated successfully!');
console.log('\n⚠️  Keep these keys secret and never commit them to version control.');

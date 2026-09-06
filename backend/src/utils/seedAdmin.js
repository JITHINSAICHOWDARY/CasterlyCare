require('dotenv').config();
const bcrypt = require('bcryptjs');
const sequelize = require('../config/db');
const { User } = require('../models');

async function seed() {
  await sequelize.sync();

  const email = process.env.ADMIN_EMAIL || 'admin@lannistercare.com';
  const password = process.env.ADMIN_PASSWORD || 'ChangeMe123!';

  const existing = await User.findOne({ where: { email } });
  if (existing) {
    console.log(`Admin account already exists for ${email}. Nothing to do.`);
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await User.create({
    role: 'admin',
    email,
    passwordHash,
    name: process.env.ADMIN_NAME || 'Administrator',
  });

  console.log('-----------------------------------------------------');
  console.log('Hidden admin account created:');
  console.log(`  email:    ${email}`);
  console.log(`  password: ${password}`);
  console.log('This is a normal login on the same page as everyone else.');
  console.log('Change ADMIN_EMAIL / ADMIN_PASSWORD in .env before deploying.');
  console.log('-----------------------------------------------------');
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});

const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config();

let sequelize;

if (process.env.DATABASE_URL) {
  // Production: Postgres (Render/Railway/Supabase etc. supply this URL)
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    protocol: 'postgres',
    logging: false,
    dialectOptions: {
      ssl: process.env.PG_SSL === 'false' ? false : {
        require: true,
        rejectUnauthorized: false,
      },
    },
  });
} else {
  // Local development / demo: file-based SQLite, zero setup required
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: path.join(__dirname, '..', '..', 'data', 'lannister_care.sqlite'),
    logging: false,
  });
}

module.exports = sequelize;

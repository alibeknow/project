module.exports = {
  development: {
    username: process.env.DB_USERNAME || '**********',
    password: process.env.DB_PASSWORD || '**********',
    database: process.env.DB_NAME ||  'bs',
    host: process.env.DB_HOSTNAME || 'localhost',
    dialect: process.env.DB_DIALECT || 'postgres',
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
  },
  production: {
    username: process.env.DB_USERNAME || '**********',
    password: process.env.DB_PASSWORD || '**********',
    database: process.env.DB_NAME ||  'bs',
    host: process.env.DB_HOSTNAME || 'localhost',
    dialect: process.env.DB_DIALECT || 'postgres',
    logging: false,
    pool: {
      max: 50,
      min: 1,
      acquire: 30000,
      idle: 10000
    }
  },

};

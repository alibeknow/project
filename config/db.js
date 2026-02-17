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

  test: {
    username: process.env.DB_USERNAME || 'bs_test_user',
    password: process.env.DB_PASSWORD || 'bs_test_pass',
    database: process.env.DB_NAME     || 'bs_test',
    host:     process.env.DB_HOSTNAME || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432', 10),
    dialect:  'postgres',
    logging:  false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  },

};

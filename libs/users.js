const bcrypt = require('bcrypt');
const config = require('../config/app');

const expire = 3600000;


async function createLoginKey(email) {
  const now = new Date().getTime();

  const keyToHash = email + '|' + now + '|' + config.secret_key;
  const hashedKey = await bcrypt.hash(keyToHash, 10);

  return now + '|' + hashedKey;
}

async function checkLoginKey(email, key) {
  const now = new Date().getTime();

  const [ time, hash ] = key.split('|');

  const text = email + '|' + time + '|' + config.secret_key;
  const match = await bcrypt.compare(text, hash);
  if (match) {
    const time_diff = now - (+time);
    if (time_diff > expire) return false;

    return true;
  }

  return false;
}

module.exports.createLoginKey = createLoginKey;
module.exports.checkLoginKey  = checkLoginKey;

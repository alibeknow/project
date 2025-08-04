const fs = require('fs');
const util = require('util');
const path = require('path');
const filenamify = require('filenamify');
const fsWriteFileAsync = util.promisify(fs.writeFile);
const fsReadFileAsync  = util.promisify(fs.readFile);
const fsStatAsync      = util.promisify(fs.stat);

const getCacheFileByKey = (key) => {
  const cacheFileName = filenamify(key);
  const cacheFile = path.dirname(__filename) + '/../cache/' + cacheFileName + '.cache';
  return cacheFile;
}

const get = async (key, expire = 3600000) => {
  if (!key) return false;
  const cacheFile = getCacheFileByKey(key);

  let content;

  try {
    const stats = await fsStatAsync(cacheFile);

    const mtime = stats.mtime.getTime();
    const now = new Date().getTime();
    const time_diff = now - mtime;

    if (time_diff > expire) return false;

    content = await fsReadFileAsync(cacheFile);
  } catch (err) {
    //console.error(err);
    return false;
  }

  return content.toString();
};

const set = async (key, content = '') => {
  if (!key) return false;
  const cacheFile = getCacheFileByKey(key);

  try {
    await fsWriteFileAsync(cacheFile, content);
  } catch (err) {
    //console.error(err);
    return false;
  }

  return true;
};

module.exports.get = get;
module.exports.set = set;

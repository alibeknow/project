const iconv = require('iconv-lite');

const fs = require('fs');
const util = require('util');
const fsWriteFileAsync = util.promisify(fs.writeFile);
const fsReadFileAsync = util.promisify(fs.readFile);

async function convertFileEncoding(fromFilePath, fromEncoding, toFilePath, toEncoding) {
  let content = await fsReadFileAsync(fromFilePath);
  content = iconv.decode(content, fromEncoding);
  content = iconv.encode(content, toEncoding);
  await fsWriteFileAsync(toFilePath, content);
}

module.exports.convertFileEncoding = convertFileEncoding;

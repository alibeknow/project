const nodemailer = require('nodemailer');
const config = require('../config/app');


const fs = require('fs');
const util = require('util');
const path = require('path');
const fsWriteAsync = util.promisify(fs.write);
const fsReadFileAsync = util.promisify(fs.readFile);
//const dataUriToBuffer = require('data-uri-to-buffer');

//const puppeteer = require('puppeteer');
const hb = require('handlebars');
const env = process.env.NODE_ENV || 'development';


async function send(params) {
  let transporter = nodemailer.createTransport(config.mailer);

  if (env == 'development') params.to = 'dev@bestsender.kz';
  let info = await transporter.sendMail(params);

  //console.log("Message:", params);
  console.log("Email: %s", params.to);
  console.log("Message ID sent: %s", info.messageId);
}

async function sendFromTemplate({ message, template, data }) {

  const processTemplate = async (templateFileName, data) => {
    const templatePath = path.resolve(path.dirname(__filename) + `/../config/email_templates/${config.type}/${templateFileName}`);
    const templateContent = await fsReadFileAsync(templatePath, 'utf8');
    const template = hb.compile(templateContent, { strict: true });
    const res = template(data);

    return res;
  }

  message.text = await processTemplate(template + '.txt', data);
  message.html = await processTemplate(template + '.html', data);

  await send(message);
}

module.exports.send = send;
module.exports.sendFromTemplate = sendFromTemplate;

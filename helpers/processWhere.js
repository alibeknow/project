const Sequelize = require('sequelize');

const processWhere = where => {
  var obj = {};
  for (let field in where) {
    let op_val = where[field];
    let [op, val] = Object.entries(op_val)[0];
    let sym = Sequelize.Op[op];
    let e = { [sym]: val };
    obj[field] = e;
  }
  return obj;
}

module.exports = processWhere;

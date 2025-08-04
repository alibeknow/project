const Sequelize = require('sequelize');
const JSON5 = require('json5');
const models = require('../models');

const removeQuotes = (str) => {
  return str.replace('"', '');
}

const escapeStr = (str) => {
  return str.replace("'", "''");
}

const processListQuery = (modelName, { where, order, limit, offset }) => {
  where = where ? JSON5.parse(where) : {};
  order = order ? JSON5.parse(order) : [];
  limit = limit ? parseInt(limit, 10) : 10000;
  offset = offset ? parseInt(offset, 10) : 0;

  const obj = {
    where: {},
    order: [],
    limit,
    offset,
  };

  for (let complex_field in where) {
    let [entity, field_subfield] = complex_field.split('.');
    if (!field_subfield) {
      field_subfield = entity;
      entity = modelName;
    }
    let [field, subfield] = field_subfield.split(':');

    //console.log(entity, field, subfield);

    let op_val = where[complex_field];
    let [op, val] = Object.entries(op_val)[0];
    let sym = Sequelize.Op[op];

    let e;
    if (!subfield) {
      e = { [sym]: val };
    } else {
      e = { [subfield]: { [sym]: val } };
    }

    if (!obj['where'][entity]) obj['where'][entity] = {};
    obj['where'][entity][field] = e;
  }

  order.forEach((arr) => {
    let [complex_field, sort_type] = arr;

    let [entity, field_subfield] = complex_field.split('.');
    if (!field_subfield) {
      field_subfield = entity;
      entity = modelName;
    }
    let [field, subfield] = field_subfield.split(':');

    let e;
    if (modelName == entity) {
      if (!subfield) {
        e = [field, sort_type];
      } else {
        modelName = removeQuotes(modelName);
        field = removeQuotes(field);
        subfield = escapeStr(subfield);
        e = [Sequelize.literal(`"${modelName}"."${field}"#>>'{${subfield}}'`), sort_type]; // TODO: find alternative to using literal
      }
    } else {
      let entityObj = null;
      let alias = entity;
      if (entity.indexOf('@') > -1) {
        [ alias, entity ] = entity.split('@');
      }
      if (models[entity]) entityObj = models[entity];
      if (!subfield) {
        if (!obj['where'][entity]) {
          e = [ { model: entityObj, as: alias }, field, sort_type ];
        } else {
          alias = removeQuotes(alias);
          field = removeQuotes(field);
          e = [Sequelize.literal(`"${alias}.${field}"`), sort_type]; // TODO: find alternative to using literal
        }
      } else {
        alias = removeQuotes(alias);
        field = removeQuotes(field);
        subfield = escapeStr(subfield);
        e = [Sequelize.literal(`"${alias}"."${field}"#>>'{${subfield}}'`), sort_type]; // TODO: find alternative to using literal
      }
    }
    obj['order'].push(e);
  })

  return obj;
}

module.exports = processListQuery;

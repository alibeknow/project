const createError = require('http-errors');
const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const cookieSession = require('cookie-session');
const useragent = require('express-useragent');
const logger = require('morgan');

const config = require('./config/app.js');


const { createJSONError, createJSONResult } = require('./helpers/jsonResponce');

const indexRouter = require('./routes/index');
const dashboardRouter = require('./routes/dashboard');
const accessLogRouter = require('./routes/access_log');
const aclRouter = require('./routes/acl');
const configRouter = require('./routes/config');
const messagesRouter = require('./routes/messages');
const messageTemplatesRouter = require('./routes/message_templates');
const pagesRouter = require('./routes/pages');
const newsRouter = require('./routes/news');
const addressesRouter = require('./routes/addresses');
const usersRouter = require('./routes/users');
const groupsRouter = require('./routes/groups');
const groupDiscountsRouter = require('./routes/group_discounts');
const ordersRouter = require('./routes/orders');
const companiesRouter = require('./routes/companies');
const carriersRouter = require('./routes/carriers');
const additionalServicesRouter = require('./routes/additional_services');
const countriesRouter = require('./routes/countries');
const regionsRouter = require('./routes/regions');
const zonesRouter = require('./routes/zones');
const ratesRouter = require('./routes/rates');
const rateParamsRouter = require('./routes/rate_params');
const packageTypesRouter = require('./routes/package_types');
const rateTypesRouter = require('./routes/rate_types');
const paymentNotificationsRouter = require('./routes/payment_notifications');
const reportsRouter = require('./routes/reports');
const tagsRouter = require('./routes/tags');
const salesClientsRouter = require('./routes/sales_clients');
const salesUsersRouter = require('./routes/sales_users');
const geoDataRouter = require('./routes/geo_data');
const yandexRouter = require('./routes/yandex');
const testRouter = require('./routes/test');

const env = process.env.NODE_ENV || 'development';


const app = express();

app.use(cors());
app.use(useragent.express());

app.set('trust proxy', true);

app.use(logger(env === 'development' ? 'dev' : 'combined'));
app.use(express.json({ limit: config.req_size_limit }));
//app.use(express.urlencoded({ extended: false, limit: config.req_size_limit })); // disabled for cloudpayments
app.use(cookieParser(config.secret_key));

app.use('/', indexRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/access_log', accessLogRouter);
app.use('/api/acl', aclRouter);
app.use('/api/config', configRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/message_templates', messageTemplatesRouter);
app.use('/api/news', newsRouter);
app.use('/api/pages', pagesRouter);
app.use('/api/addresses', addressesRouter);
app.use('/api/users', usersRouter);
app.use('/api/groups', groupsRouter);
app.use('/api/group_discounts', groupDiscountsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/companies', companiesRouter);
app.use('/api/carriers', carriersRouter);
app.use('/api/additional_services', additionalServicesRouter);
app.use('/api/countries', countriesRouter);
app.use('/api/regions', regionsRouter);
app.use('/api/zones', zonesRouter);
app.use('/api/rates', ratesRouter);
app.use('/api/rate_params', rateParamsRouter);
app.use('/api/package_types', packageTypesRouter);
app.use('/api/rate_types', rateTypesRouter);
app.use('/api/payment_notifications', paymentNotificationsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/tags', tagsRouter);
app.use('/api/sales_clients', salesClientsRouter);
app.use('/api/sales_users', salesUsersRouter);
app.use('/api/geo_data', geoDataRouter);
app.use('/api/yandex', yandexRouter);
app.use('/api/test', testRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  console.error(err);

  if (req.app.get('env') !== 'development') {
    delete err.stack;
  }

  res.status(err.status || 500);
  res.json(createJSONError(err));
});

module.exports = app;

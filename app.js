const dotenv = require('dotenv').config();
const cors = require('cors');
var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const bodyParser = require('body-parser');
var multer = require('multer');
var fs = require('fs');
let mongoose = require("mongoose");
var expressLayouts = require('express-ejs-layouts');
const mongoConnection = require('./utilities/connections');
const constants = require('./utilities/constants');
const helper = require('./utilities/helper');
const subscribeModel = require('./models/users/subscribe.model');
const cron = require('node-cron');
const async = require('async');
var app = express();
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(expressLayouts);
app.set('layout', 'layouts/layout');
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());
mongoose.set('runValidators', true);
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});
mongoose.connection.once('open', () => {
  console.log("Well done! , connected with mongoDB database");
}).on('error', error => {
  console.log("Oops! database connection error:" + error);
});

const adminpaths = [
  {pathUrl: '/login', routerFile: 'login'},
  {pathUrl: '/dashboard', routerFile: 'dashboard'},
  {pathUrl: '/staff', routerFile: 'staff'},
  {pathUrl: '/symptomMaster', routerFile: 'symptomMaster'},
  {pathUrl: '/symptoms', routerFile: 'symptoms'},
  {pathUrl: '/products', routerFile: 'product'},
  {pathUrl: '/order', routerFile: 'order'},
  {pathUrl: '/storyMaster', routerFile: 'storyMaster'},
  {pathUrl: '/stories', routerFile: 'story'},
  {pathUrl: '/sizeMaster', routerFile: 'sizeMaster'},
  {pathUrl: '/reminderMaster', routerFile: 'reminderMaster'},
  {pathUrl: '/plan', routerFile: 'plan'},
  {pathUrl: '/invoicesettings', routerFile: 'invoicesettings'},
  {pathUrl: '/settings', routerFile: 'settings'},
  {pathUrl: '/user', routerFile: 'userAnalysis'},
  {pathUrl: '/subscribe', routerFile: 'subscribe'},
];
adminpaths.forEach((path) => {
  app.use('/admin'+path.pathUrl, require('./routes/admin/'+path.routerFile));
});

const userpaths = [
  { pathUrl: '/login', routerFile: 'login' },
  { pathUrl: '/account', routerFile: 'account' },
  { pathUrl: '/address', routerFile: 'address' },
  { pathUrl: '/profile', routerFile: 'profile' },
  { pathUrl: '/mycycle', routerFile: 'mycycle' },
  { pathUrl: '/calendar', routerFile: 'calendar' },
  { pathUrl: '/userSymptoms', routerFile: 'userSymptoms' },
  { pathUrl: '/symptoms', routerFile: 'symptoms' },
  { pathUrl: '/history', routerFile: 'history' },
  { pathUrl: '/stories', routerFile: 'story' },
  { pathUrl: '/products', routerFile: 'product' },
  { pathUrl: '/cart', routerFile: 'cart' },
  { pathUrl: '/order', routerFile: 'order' },
  { pathUrl: '/review', routerFile: 'review' },
  { pathUrl: '/reminder', routerFile: 'reminder' },
  { pathUrl: '/subscribe', routerFile: 'subscribe' },
];
userpaths.forEach((path) => {
  app.use('/user' + path.pathUrl, require('./routes/users/' + path.routerFile));
});

const staffpaths = [
  { pathUrl: '/login', routerFile: 'login' },
  { pathUrl: '/dashboard', routerFile: 'dashboard' },
  { pathUrl: '/shipped', routerFile: 'shipped' },
];
staffpaths.forEach((path) => {
  app.use('/staff' + path.pathUrl, require('./routes/staff/' + path.routerFile));
})

app.use(function(err, req, res, next) {
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};
  res.status(err.status || 500);
  res.render('error');
});

// cron.schedule('5 * * * * *' , async () => {
//   let currentDate = new Date();
//   let nextDateTimeStamp = currentDate.setDate(currentDate.getDate() + 9);
//   let nextDateObj = new Date(nextDateTimeStamp);
//   let nextDateStartObj = new Date(nextDateObj.getFullYear() , nextDateObj.getMonth() , nextDateObj.getDate() , 0 , 0 , 0);
//   let nextDateStartTimestamp = parseInt(nextDateStartObj.getTime() + 19800000);
//   let nextDateStart = new Date(nextDateStartTimestamp);
//   console.log('nextDateStart :',nextDateStart);
//   console.log('nextDateStartTimestamp :',nextDateStartTimestamp);
//   let nextDateEndObj = new Date(nextDateStart.getFullYear() , nextDateStart.getMonth() , nextDateStart.getDate() , 23 , 59 , 59);
//   let nextDateEndTimestamp = parseInt(nextDateEndObj.getTime() + 19800000);
//   let nextDateEnd = new Date(nextDateEndTimestamp);
//   console.log('nextDateEnd :',nextDateEnd);
//   console.log('nextDateEndTimestamp :',nextDateEndTimestamp);
//   let primary = mongoConnection.useDb(constants.DEFAULT_DB);
//   // let subscriptionOrders = await primary.model(constants.MODELS.subscribes, subscribeModel).find({active: true , 'delivery_dates.delivery_timestamp': {$elemMatch: {$gte: nextDateStartTimestamp , $lt: nextDateEndTimestamp}}});
//   let subscriptionOrders = await primary.model(constants.MODELS.subscribes, subscribeModel).find({active: true , $and: [{ 'delivery_dates.delivery_timestamp': {$gte: nextDateStartTimestamp} } , { 'delivery_dates.delivery_timestamp': {$lte: nextDateEndTimestamp}}]});
//   console.log('subscriptionOrders :',subscriptionOrders);
//   async.forEachSeries(subscriptionOrders, (subscriptionOrder , next_subscriptionOrder) => {
//     console.log('subscriptionOrder :',subscriptionOrder);
//     next_subscriptionOrder();
//   }, () => {
//     console.log('All order placed successfully...!');
//   })
// });

// Please do not remove following two line of code...
// console.log(helper.addDaysToTimestamp(1683504000000 , 28-1));
// console.log(helper.addDaysToTimestamp(1703246340000 , 5-1));

// parent user
// let token = helper.generateAccessToken({_id: '658d501d1584632fa7587d05'});
// console.log('parent user token :',token);

//child user
// let token = helper.generateAccessToken({_id: '658d5cb9b443cb6471c87ba5'});
// console.log('child user token :',token);

// let dateObj = new Date(1705190400000);
// console.log(dateObj);

// let newDateObj =  new Date(dateObj.getFullYear() , dateObj.getMonth() , 18 , 0 , 0);
// let newDateTimestamp = parseInt(newDateObj.getTime() + 19800000);
// let newDate = new Date(newDateTimestamp);
// console.log(newDate);

module.exports = app;
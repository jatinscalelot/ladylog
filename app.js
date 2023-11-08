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
const helper = require('./utilities/helper');
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
  {pathUrl: '/symptoms', routerFile: 'symptoms'},
  {pathUrl: '/products', routerFile: 'product'},
  {pathUrl: '/stories', routerFile: 'story'},
];
adminpaths.forEach((path) => {
  app.use('/admin'+path.pathUrl, require('./routes/admin/'+path.routerFile));
});

const userpaths = [
  { pathUrl: '/login', routerFile: 'login' },
  { pathUrl: '/upload', routerFile: 'profilePic' },
  { pathUrl: '/profile', routerFile: 'profile' },
  { pathUrl: '/mycycle', routerFile: 'mycycle' },
  { pathUrl: '/symptoms', routerFile: 'AddandGetUserSymptoms' },
  { pathUrl: '/getSymptoms', routerFile: 'getSymptoms' },
  { pathUrl: '/history', routerFile: 'history' },
  { pathUrl: '/products', routerFile: 'product' },
];
userpaths.forEach((path) => {
  app.use('/user' + path.pathUrl, require('./routes/users/' + path.routerFile));
});

app.use(function(err, req, res, next) {
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};
  res.status(err.status || 500);
  res.render('error');
});

// Please do not remove following two line of code...
// console.log(helper.addDaysToTimestamp(1683504000000 , 28-1));
// console.log(helper.addDaysToTimestamp(1703246340000 , 5-1));

module.exports = app;
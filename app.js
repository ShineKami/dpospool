//Init modules
const express = require('express');
const exphbs  = require('express-handlebars');
const pool = require('./libs/pool.js');

//Routes
var home = require('./pages/home');
var pstat = require('./pages/pstat');
var vstat = require('./pages/vstat');
var charts = require('./pages/charts');
var app = express();

//Set render source path
app.set('views', './public/tpl');
app.engine('.hbs', exphbs({
	extname: '.hbs',
	defaultLayout: 'main',
	layoutsDir: './public/tpl/layouts'
}));
app.set('view engine', '.hbs');
app.use('/static', express.static('./public/assets'));

//Use routes(pages)
app.use('/', home);
app.use('/pool-stats', pstat);
app.use('/voter-stats', vstat);
app.use('/charts', charts);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  pool.loger("ERR", err.message);
  res.status(err.status || 500);
  res.render('error', data);
});

module.exports = app;
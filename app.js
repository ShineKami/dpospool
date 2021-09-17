//Init modules
const express = require('express');
const exphbs  = require('express-handlebars');
const pool = require('./libs/pool.js');

//Routes
const home = require('./pages/home');
const pstat = require('./pages/pstat');
const vstat = require('./pages/vstat');
const charts = require('./pages/charts');
const app = express();

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
	const err = new Error('Not Found');
	err.status = 404;
	next(err);
});

// error handler
app.use(function(err, req, res, next) {
	// set locals, only providing error in development
	res.locals.error = req.app.get('env') === 'development' ? err : {};

	const data = {
		"message": err.message
	}

	// render the error page
	pool.loger("ERR", err.message);
	res.status(err.status || 500);
	res.render('error', data);
});

module.exports = app;
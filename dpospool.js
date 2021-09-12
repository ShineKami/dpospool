#!/usr/bin/env node

/**
 * Module dependencies.
 */
const config = require('./config.json');
const app = require('./app');
const debug = require('debug')('dpospool:server');
const http = require('http');
const port = normalizePort(config.pool.port || '3000');

//Set port in express
app.set('port', port);

//Create HTTP server.
const server = http.createServer(app);

//Listen on provided port, on all network interfaces.
server.listen(port);
server.on('error', onError);
server.on('listening', onListening);

//Normalize a port into a number, string, or false.
function normalizePort(val) {
	const port = parseInt(val, 10);

	if (isNaN(port)) {
		return val;
	}

	if (port >= 0) {
		return port;
	}

	return false;
}

//Event listener for HTTP server "error" event.
function onError(error) {
	if (error.syscall !== 'listen') {
		throw error;
	}

	var bind = typeof port === 'string'
	? 'Pipe ' + port
	: 'Port ' + port;

	// handle specific listen errors with friendly messages
	switch (error.code) {
		case 'EACCES':
			console.error(bind + ' requires elevated privileges');
			process.exit(1);
		break;

		case 'EADDRINUSE':
			console.error(bind + ' is already in use');
			process.exit(1);
		break;

		default:
			throw error;
	}
}

//Event listener for HTTP server "listening" event.
function onListening() {
	const addr = server.address();
	const bind = typeof addr === 'string'
		? 'pipe ' + addr
		: 'port ' + addr.port;
			
	debug('Listening on ' + bind);
}
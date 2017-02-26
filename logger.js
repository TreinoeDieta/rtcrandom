var winston = require('winston');

function Logger(environment) {  
  var path =  __dirname;
  if (environment === 'local' || environment === 'production') {
	  path = path + '/';
  } else if (environment === 'test') {
	  path = path + '/public/';
  }
  
  return new(winston.Logger)({
	transports: [
	new(winston.transports.Console)({
		json: false,
		timestamp: true
	}), new winston.transports.File({
		filename: path + 'debug.log',
		json: false
	})],
	exceptionHandlers: [
	new(winston.transports.Console)({
		json: false,
		timestamp: true
	}), new winston.transports.File({
		filename: path + 'exceptions.log',
		json: false
	})],
	exitOnError: false
	});

}

module.exports = Logger;
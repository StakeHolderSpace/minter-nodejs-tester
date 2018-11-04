/**
 * Module dependencies.
 */
const winston = require('winston');
const path = require('path');
const ENV = process.env.NODE_ENV;

//winston.emitErrs = true;
function getLogger(module) {
	//var modulePath = module.filename.split('/').slice(-2).join('/'); //-> for Nix OS
	let modulePath = module.filename.split('\\').slice(-2).join('/');

	return winston.createLogger({
		transports : [
			/*
		new winston.transports.File({
			level          : ENV === 'development' ? 'debug' : 'error',
			filename       : path.join(__dirname, '/../../logs/app.log'),
			handleException: true,
			json           : true,
			maxSize        : 5242880, //5mb
			maxFiles       : 2,
			colorize       : false
		}),
		*/
			new winston.transports.Console({
				level      : ENV === 'development' ? 'debug' : 'info',
				prettyPrint: true,
				label      : modulePath,
				format     : winston.format.combine(
						winston.format.timestamp({format: 'YYYY-MM-DD HH:mm:ss'}),
						winston.format.colorize(),
						winston.format.align(),
						winston.format.simple()
				)
			})
		],
		exitOnError: false
	});
}

exports = module.exports = getLogger;

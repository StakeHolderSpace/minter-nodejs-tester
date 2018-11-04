'use strict';

const fs = require('fs');
const clear = require('clear');
const chalk = require('chalk');
const figlet = require('figlet');

/**
 * Normalize a port into a number, string, or false.
 */
const normalizePort = (val) => {
	let port = parseInt(val, 10);

	if (isNaN(port)) {
		// named pipe
		return val;
	}

	if (port >= 0) {
		// port number
		return port;
	}

	return false;
};

/**
 *
 * @param filePath
 * @returns {*}
 */
const fileExists = (filePath) => {
	try {
		return fs.statSync(filePath).isFile();
	}
	catch (err) {
		return false;
	}
};

/**
 *
 * @returns {*|string}
 */
const getCurrentDirectoryBase = () => {
	return path.basename(process.cwd());
};

/**
 *
 * @param filePath
 * @returns {*}
 */
const directoryExists = (filePath) => {
	try {
		return fs.statSync(filePath).isDirectory();
	}
	catch (err) {
		return false;
	}
};

/**
 *
 * @param promise
 * @returns {Promise<T | {payload: any, resolved: boolean}>}
 */
const fnReflect = promise => promise.
		then(result => ({payload: result, resolved: true})).
		catch(error => ({payload: error, resolved: false}));

/**
 *
 * @private
 */
const _clear = () => {
	process.stdout.write('\x1Bc');
};

/**
 *
 */
const showAppCliTitle = () => {
	clear();
	console.log(
			chalk.yellow(
					figlet.textSync('StakeHolder Tests Tool', {horizontalLayout: 'full'})
			)
	);
};

exports = module.exports = {
	normalizePort  : normalizePort,
	fs             : {
		getCurrentDirectoryBase: getCurrentDirectoryBase,
		directoryExists        : directoryExists,
		fileExists             : fileExists
	},
	fnReflect      : fnReflect,
	showAppCliTitle: showAppCliTitle,
	clear          : _clear
};
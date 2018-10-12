const oFs           = require('fs');

/**
 * Normalize a port into a number, string, or false.
 */
function normalizePort(val) {
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
}

/**
 *
 * @param filePath
 * @returns {*}
 */
function fileExists(filePath) {
	try {
		return oFs.statSync(filePath).isFile();
	}
	catch (err) {
		return false;
	}
}

exports = module.exports = {
	normalizePort: normalizePort,
	fileExists   : fileExists
};
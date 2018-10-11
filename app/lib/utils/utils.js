/**
 * Normalize a port into a number, string, or false.
 */
function normalizePort(val) {
	var port = parseInt(val, 10);

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

function fileExists(filePath) {
	try {
		return fs.statSync(filePath).isFile();
	}
	catch (err) {
		return false;
	}
}

exports = module.exports = {
	normalizePort: normalizePort,
	fileExists   : fileExists
};
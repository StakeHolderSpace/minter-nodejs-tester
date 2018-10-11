let
		oFs    = require('fs'),
		oNconf = require('nconf'),
		oPath  = require('path');

oNconf.argv().env().file({
	file: __dirname + '/../../config/app.cfg.json'
});

exports = module.exports = oNconf;
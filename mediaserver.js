var http = require("http");
var sys = require('sys');
var url = require('url');
var path = require('path');

var direttoUtil = require("./lib/diretto/util");
var cradle = require('./lib/dep/cradle');
var Auth = require('./lib/diretto/auth').Auth;
var FileHandler = require('./lib/diretto/filehandler').FileHandler;
var Signer = require('./lib/diretto/signer').Signer;

var SERVER = 'DirettoMediaNode/0.1';

var config = direttoUtil.readConfigFile("./conf/servers.json");
var connection = new (cradle.Connection)(config.couchdb.host, config.couchdb.port, {
	cache : false,
	raw : false
});
var auth = new Auth(connection);
var fileHandler = new FileHandler(config.mediaserver.rootpath, config.mediaserver.upload.maxsize);
var signer = new Signer(config.security.key);

http.createServer(function(req, res) {
	switch (req.method) {
		case 'GET':
			handleGet(req, res);
			break;
		case 'HEAD':
			handleHead(req, res);
			break;
		case 'PUT':
			handlePut(req, res);
			break;
		case 'DELETE':
			handleDelete(req, res);
			break;
		default:
			res.writeHead(405, {
				'Server' : SERVER
			});
			res.end();
			break;

	}
}).listen(config.mediaserver.port, config.mediaserver.ip);

var handleGet = function(req, res, isHead) {
	var filePath = fileHandler.sanitizePath(url.parse(req.url).pathname);
	if (filePath) {
		fileHandler.fileExists(filePath, function() {
			res.writeHead(404, {
				'Server' : SERVER
			});
			res.end();
		}, function(stat) {
			if (isHead) {
				fileHandler.streamHeader(filePath, {
					'Server' : SERVER
				}, stat, req, res);
			}
			else {
				fileHandler.streamFile(filePath, {
					'Server' : SERVER
				}, stat, req, res);
			}
		});
	}
	else {
		res.writeHead(403, {
			'Server' : SERVER
		});
		res.end();
	}

};

var handleHead = function(req, res) {
	handleGet(req, res, true);
};

var handlePut = function(req, res) {
	auth.authenticate(req, function(code) {
		res.writeHead(code, {
			'Server' : SERVER
		});
		res.end();
	}, function(user) {
		var filePath = fileHandler.sanitizePath(url.parse(req.url).pathname);
		if (filePath) {
			fileHandler.fileExists(filePath, function() {
				var expectedLength, contentType;
				if (req.headers['content-length']) {
					expectedLength = req.headers['content-length'];
				}
				else {
					res.writeHead(411, {
						'Server' : SERVER
					});
					res.end();
					return;
				}
				if (req.headers['content-type']) {
					contentType = req.headers['content-type'];
				}
				else {
					res.writeHead(415, {
						'Server' : SERVER
					});
					res.end();
					return;
				}

				var requrl = url.parse(req.url, true);
				var query = requrl.query;

				var expectedKey = signer.signRequest('PUT', user, requrl.pathname, expectedLength, contentType);

				if (!requrl.query || !requrl.query.key || requrl.query.key != expectedKey) {
					sys.log(expectedKey + " vs " + requrl.query.key + " !");
					res.writeHead(403, {
						'Server' : SERVER
					});
					res.end();
					return;
				}

				fileHandler.createPath(path.dirname(filePath), function() {
					sys.log("err");
				}, function() {
					sys.log("upload...");
					fileHandler.uploadFile(filePath, req, res, user, expectedLength, function(code, headers, body) {
						headers['Server'] = SERVER;
						res.writeHead(code, headers);
						res.write(body);
						res.end();
						return;
					}, function() {
						res.writeHead(201, {
							'Server' : SERVER,
							'Content-Type' : 'application/json',
							'Connection' : 'close'
						});
						var acceptedKey = signer.signResponse('201', user, requrl.pathname);
						res.write('{"key":"' + acceptedKey + '"}');
						res.end();
						return;
					});
				});

			}, function(stat) {
				res.writeHead(409, {
					'Server' : SERVER
				});
				res.end();
			});
		}
		else {
			res.writeHead(403, {
				'Server' : SERVER
			});
			res.end();
		}
	});
};

var handleDelete = function(req, res) {
	auth.authenticate(req, function(code) {
		res.writeHead(code, {
			'Server' : SERVER
		});
		res.end();
	}, function() {
		var filePath = fileHandler.sanitizePath(url.parse(req.url).pathname);
		if (filePath) {
			fileHandler.fileExists(filePath, function() {
				res.writeHead(404, {
					'Server' : SERVER
				});
				res.end();
			}, function(stat) {
				// TODO: Delete must be implemented...
					res.writeHead(405, {
						'Server' : SERVER
					});
					res.end();
				});
		}
		else {
			res.writeHead(403, {
				'Server' : SERVER
			});
			res.end();
		}
	});
};

process.on('uncaughtException', function (err) {
	sys.log('Caught exception: ' + err);
});
var fs = require("fs");
var path = require("path");
var sys = require("sys");
var Buffer = require('buffer').Buffer;
var url = require("url");

var mime = require('../dep/mime');

/**
 * @class
 * 
 * Creates a new file handler object.
 * 
 * @param p
 *            root path
 * @param maxSize
 *            maximal file size to accept
 * @return
 */
var FileHandler = exports.FileHandler = function(p, maxSize) {
	this.rootPath = p;
	this.maxSize = maxSize;
};

/**
 * Returns the root path.
 * 
 * @return
 */
FileHandler.prototype.getRootPath = function() {
	return this.rootPath;
};

/**
 * Checks if the given path is valid.
 * 
 * @param relativePath
 * @return
 */
FileHandler.prototype.isValidPath = function(relativePath) {
	return !!(this.sanitizePath(relativePath) != null);
};

/**
 * Creates a solid local path out of a given relative path from the request.
 * This method normalizes all ".." and returns null, if the path is outside the
 * root path.
 * 
 * @param relativePath
 * @return Normalized local path or null (when path is invalid)
 */
FileHandler.prototype.sanitizePath = function(relativePath) {
	var localPath = path.normalize(path.join(this.rootPath, relativePath));

	// Path outside root directory?
	if (localPath.substr(0, this.rootPath.length) != path.normalize(this.rootPath)) {
		return null;
	}
	else {
		return localPath;
	}
};

/**
 * Creates a (deep) directory structure.
 * 
 * @param dir
 * @param failureCallback
 * @param successCallback
 * @return
 */
FileHandler.prototype.createPath = function(dir, failureCallback, successCallback) {
	sys.log("rp:" + this.rootPath);
	sys.log("dir:" + dir);
	var parts = dir.substring(this.rootPath.length + 1, dir.length).split('/');
	this._createPath(parts, this.rootPath, failureCallback, successCallback);
};

/**
 * Internal recursive method for creating a deep directory structure.
 * 
 * @param parts
 * @param currentPath
 * @param failureCallback
 * @param successCallback
 * @return
 */
FileHandler.prototype._createPath = function(parts, currentPath, failureCallback, successCallback) {
	sys.log(parts);
	sys.log(currentPath);

	// base case
	if (parts.length == 0) {
		successCallback();
	}
	else {
		var fh = this;

		sys.log("Parts to do: " + parts.length);
		var currentPath = path.join(currentPath, parts.shift());
		sys.log("Targeting path" + currentPath);
		path.exists(currentPath, function(dirExists) {
			if (!dirExists) {
				sys.log("not existing:" + currentPath);
				fs.mkdir(currentPath, 0777, function(err) {
					if (err) {
						sys.log("1");
						sys.log(err);
						failureCallback();
					}
					else {
						fh._createPath(parts, currentPath, failureCallback, successCallback);
					}
				});
			}
			else {
				fs.stat(currentPath, function(err, stat) {
					if ((err || !stat.isDirectory())) {
						sys.log("2");

						failureCallback();
					}
					else {
						sys.log("rec. descent");
						fh._createPath(parts, currentPath, failureCallback, successCallback);
					}
				});
			}
		});
	}
};

/**
 * Checks whether a given file exists or not.
 * 
 * @param file
 * @param notExistCallback
 * @param existCallback
 * @return
 */
FileHandler.prototype.fileExists = function(file, notExistCallback, existCallback) {
	fs.stat(file, function(err, stat) {
		if ((err || !stat.isFile())) {
			notExistCallback();
		}
		else {
			existCallback(stat);
		}
	});
};

/**
 * Checks whether a given directory exists or not.
 * 
 * @param dir
 * @param notExistCallback
 * @param existCallback
 * @return
 */
FileHandler.prototype.dirExists = function(dir, notExistCallback, existCallback) {
	fs.stat(dir, function(err, stat) {
		if ((err || !stat.isDirectory())) {
			notExistCallback();
		}
		else {
			existCallback(stat);
		}
	});
};

/**
 * Answers a request for a file by responding it as entity. Supports caching via
 * E-Tags and file stats.
 * 
 * @param file
 * @param headerFields
 * @param stat
 * @param req
 * @param res
 * @return
 */
FileHandler.prototype.streamFile = function(file, headerFields, stat, req, res) {
	var statCode = this._streamFileHeaderData(file, headerFields, stat, req, res);
	if (statCode === 304) {
		res.end();
	}
	else {
		this._streamFileBuffered(file, headerFields, stat, req, res);
	}
};

/**
 * Sends the header information as response to a file request. Useful for HEAD
 * requests.
 * 
 * @param file
 * @param headerFields
 * @param stat
 * @param req
 * @param res
 * @return
 */
FileHandler.prototype.streamHeader = function(file, headerFields, stat, req, res) {
	this._streamFileHeaderData(file, headerFields, stat, req, res);
	res.end();
};

/**
 * Write header information into the response.
 * 
 * @param file
 * @param headerFields
 * @param stat
 * @param req
 * @param res
 * @return
 */
FileHandler.prototype._streamFileHeaderData = function(file, headerFields, stat, req, res) {
	var contentType = mime.lookup(file);
	var charset = mime.charsets.lookup(contentType);

	if (charset) {
		contentType += '; charset: ' + charset;
	}

	headerFields['Content-Type'] = contentType;

	etag = '"' + stat.ino + '-' + stat.size + '-' + Date.parse(stat.mtime) + '"';
	headerFields['ETag'] = etag;

	var statCode;
	if (req.headers['if-none-match'] == etag) {
		statCode = 304;
		headerFields['Content-Length'] = 0;
		res.writeHead(statCode, headerFields);
		return statCode;
	}
	else {
		headerFields['Content-Length'] = stat.size;
		statCode = 200;
		if (headerFields['Expires'] != undefined) {
			var expires = new Date;
			expires.setTime(expires.getTime() + headerFields['Expires']);
			headerFields['Expires'] = expires.toUTCString();
		}
	}

	res.writeHead(statCode, headerFields);
	return statCode;
};

/**
 * Write the file content into the response stream as entity.
 * 
 * @param file
 * @param headerFields
 * @param stat
 * @param req
 * @param res
 * @return
 */
FileHandler.prototype._streamFileBuffered = function(file, headerFields, stat, req, res) {

	// TODO: Switch to sendfile(2) as soon as available for node.js!
	sys.pump(fs.createReadStream(file), res, function() {
	});

};

/**
 * Takes a request entity and saves it as file at the given path.
 * 
 * @param filePath
 * @param req
 * @param res
 * @param user
 * @param expectedLength
 * @param failureCallback
 * @param successCallback
 * @return
 */
FileHandler.prototype.uploadFile = function(filePath, req, res, user, expectedLength, failureCallback, successCallback) {

	//	 //TODO: Buggy stuff...
	//	 if(req.httpVersion == "1.1" && req.headers.expect)
	//	 {
	//	 if(req.headers.expect.toLowerCase().indexOf("100-continue") != -1)
	//	 {
	//	 sys.log("100!");
	//	 res._send("HTTP/1.1 100 Continue\r\n\r\n");
	//	 }
	//	 }

	var maximumSize = this.maxSize;
	// req.setEncoding("binary");
	var fileStream = fs.createWriteStream(filePath);
	var size = 0;

	req.on("data", function(chunk) {
		sys.log("got data: " + chunk.length);
		size = size + chunk.length;
		// this should never happen...
			if (maximumSize < size) {
				fileStream.end();

				failureCallback(400, {}, '');
				return;

			}
			else {
				req.pause();
				fileStream.write(chunk, 'binary');
			}
		});

	fileStream.on("error", function(err) {
		sys.log("error while uploading" + err);
		failureCallback(500, {}, '');
		return;
	});

	fileStream.on("drain", function() {
		sys.log("drain");
		try {
			req.resume();
		}
		catch (e) {
			sys.log(e);
		}

	});

	req.on("end", function() {
		sys.log("req.end");
		fileStream.removeAllListeners("drain");
		fileStream.on("drain", function() {
			fileStream.end();
			successCallback();
		});
	});

};
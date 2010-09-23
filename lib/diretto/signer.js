var crypto = require('crypto');
var sys = require('sys');

var DELIMITER = ":";

/**
 * @class
 * 
 * Creates a new signer instance.
 * 
 * @param key
 * @return
 */
var Signer = exports.Signer = function(key) {
	this.key = key;
};

/**
 * Returns a hash for signing a request.
 * 
 * @param method
 * @param username
 * @param path
 * @param length
 * @param mimetype
 * @return
 */
Signer.prototype.signRequest = function(method, username, path, length, mimetype) {

	var s = method + DELIMITER + username + DELIMITER + path + DELIMITER + length + DELIMITER + mimetype;
	var hmac = crypto.createHmac("sha1", this.key);
	hmac.update(s);
	return hmac.digest('hex');
};

/**
 * Returns a hash for signing a response.
 * 
 * @param statuscode
 * @param username
 * @param path
 * @return
 */
Signer.prototype.signResponse = function(statuscode, username, path) {
	var hmac = crypto.createHmac("sha1", this.key);
	hmac.update(statuscode + DELIMITER + username + DELIMITER + path);
	return hmac.digest('hex');
};
var sys = require('sys');

var Cache = require('./cache').Cache;

var AUTH_CACHE_SIZE = 1000;
var AUTH_CACHE_EXPIRE_TIME = 120 * 1000; // ms
var AUTH_COUCHDB_TABLE = 'users';

/**
 * @class
 * 
 * Creates a new Auth instance using the given database connection.
 * 
 * @param cradleConnection
 * @return
 */
var Auth = exports.Auth = function(cradleConnection) {
	if (null == cradleConnection) {
		throw new Error("cradle connection must not be null!");
	}
	this.connection = cradleConnection;
	this.db = cradleConnection.database(AUTH_COUCHDB_TABLE);
	this.cache = new Cache(AUTH_CACHE_SIZE, AUTH_CACHE_EXPIRE_TIME);
};

/**
 * Authenticate a request against this authentication instance.
 * 
 * @param request
 * @param failureCallback
 * @param successCallback
 * @return
 */
Auth.prototype.authenticate = function(request, failureCallback, successCallback) {
	var requestUsername = "";
	var requestPassword = "";
	if (!request.headers['authorization']) {
		failureCallback(401);
	}
	else {
		var auth = this._decodeBase64(request.headers['authorization']);
		if (auth) {
			requestUsername = auth.username;
			requestPassword = auth.password;
		}
		else {
			failureCallback(401);
		}
	}

	var cacheResult = this.cache.get(requestUsername);
	if (cacheResult == null) {
		// Miss
		// sys.print("Auth: miss");
		this._fetchFromDb(requestUsername, requestPassword, failureCallback, successCallback);
	}
	else {
		// Hit
		// sys.print("Auth: hit");
		if (cacheResult.username == requestUsername && cacheResult.password == requestPassword) {
			successCallback(requestUsername);
		}
		else {
			// Cached credentials mismatch, so fetching up-to-date credentials
			// from db
			this._fetchFromDb(requestUsername, requestPassword, failureCallback, successCallback);
		}
	}

};

/**
 * Internal method for fetching user data from the remote database.
 * 
 * @param requestUsername
 * @param requestPassword
 * @param failureCallback
 * @param successCallback
 * @return
 */
Auth.prototype._fetchFromDb = function(requestUsername, requestPassword, failureCallback, successCallback) {
	var c = this.cache;
	this.db.get(requestUsername, function(err, doc) {
		if (err) {
			if (err.error === "not_found") {
				failureCallback(401);
			}
			else {
				failureCallback(500);
			}
		}
		else {
			if (doc._id == requestUsername && doc.password == requestPassword) {
				c.put(doc._id, {
					username : doc._id,
					password : doc.password
				});
				successCallback(requestUsername);
				return;
			}
			else {
				failureCallback(401);
			}
		}
	});
};

/**
 * Internal method for extracting username and password out of a Basic
 * Authentication header field.
 * 
 * @param headerValue
 * @return
 */
Auth.prototype._decodeBase64 = function(headerValue) {
	var value;
	if (value = headerValue.match("^Basic\\s([A-Za-z0-9+/=]+)$")) {
		var auth = (new Buffer(value[1] || "", "base64")).toString("ascii");
		return {
			username : auth.slice(0, auth.indexOf(':')),
			password : auth.slice(auth.indexOf(':') + 1, auth.length)
		};
	}
	else {
		return null;
	}

};

var sys = require("sys");
var fs = require("fs");

/**
 * Converts a CouchDB style UUID into RFC-style UUID.
 * 
 * @param s UUID
 */
exports.toUUID = function(s) {
	if (s.length === 32) {
		return s.substr(0, 8) + "-" + s.substr(8, 4) + "-" + s.substr(12, 4) + "-" + s.substr(16, 4) + "-" + s.substr(20, 12);
	}
	else {
		return s;
	}

};

/**
 * Reads in a JSON config file sync. and returns it as a java script object literal. 
 * 
 * @param filePath 
 */
exports.readConfigFile = function(filePath) {
	try {

		var confRaw = fs.readFileSync(filePath, 'utf8');

		config = JSON.parse(confRaw);

		return config;
	}
	catch (e) {
		sys.log(e);
		return {};
	}
};

exports.mixin = function(target) {
	var args = Array.prototype.slice.call(arguments, 1);

	args.forEach(function(a) {
		var keys = Object.keys(a);
		for ( var i = 0; i < keys.length; i++) {
			target[keys[i]] = a[keys[i]];
		}
	});
	return target;
};

/**
 * @class
 * 
 * Creates a new barrier for the given amount of parties. 
 * @param parties
 * @param barrierCallback
 * @param abortCallback
 * @return
 */
var Barrier = exports.Barrier = function(parties, barrierCallback, abortCallback) {
	this.parties = parties;
	this.barrierCallback = barrierCallback;
	this.abortCallback = abortCallback;

	this.running = true;
	this.count = 0;
};

/**
 * Signals a completion of one of the parties.
 * @return
 */
Barrier.prototype.submit = function() {
	if (++this.count == this.parties && this.running) {
		this.barrierCallback();
	}
};

/**
 * Signals an abort by one of the parties. If not callback is passed, the default abort callback will be executed.
 * @param customAbortCallback Optional callback that should be executed due to the abort.
 * @return
 */
Barrier.prototype.abort = function(customAbortCallback) {
	if (this.running && customAbortCallback) {
		customAbortCallback();
	}
	else if (this.running && this.abortCallback) {
		this.abortCallback();
	}
	this.running = false;
};

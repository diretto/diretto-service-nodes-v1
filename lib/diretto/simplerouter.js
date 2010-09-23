var http = require("http");
var sys = require('sys');
var url = require('url');
var path = require('path');
var querystring = require('querystring');
var parseURL = require('url').parse;

/**
 * @class
 * 
 * Creates a simple router
 * 
 * @param urls
 *            an array of url patterns.
 * @param server
 * @return
 */
var SimpleRouter = exports.SimpleRouter = function(urls, server) {
	this.server = server;
	this.urls = urls;
	this.running = false;
};

/**
 * Binds the server to the given endpoint.
 * 
 * @param port
 * @param host
 * @return
 */
SimpleRouter.prototype.listen = function(port, host) {
	if (!this.running) {
		var that = this;
		var promise = http.createServer(function(req, res) {
			that._route(req, res);
		});
		process.nextTick(function() {
			promise.listen(port, host || "127.0.0.1");
		});
		this.running = true;
		return promise;

	}
};

/**
 * Internal route method for mapping a request to a matching route.
 * 
 * @param req
 * @param res
 * @return
 */
SimpleRouter.prototype._route = function(req, res) {
	var urls = this.urls;
	var that = this;
	var matched = false;
	for ( var i = 0; i < urls.length && !matched; i++) {

		var args = new RegExp(urls[i][1]).exec(parseURL(req.url).pathname);
		if (args !== null && urls[i][0] === req.method) {
			args.shift();
			args.unshift(req, res);
			args.push(querystring.parse(parseURL(req.url).query) || {});
			urls[i][2].apply(this, args);
			matched = true;
		}
	}
	if (!matched) {
		res.writeHead(404, {
			'Server' : that.server.alias,
			'Content-Type' : 'text/plain'
		});
		res.end('Not found\n');
	}
};
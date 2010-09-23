var http = require("http");
var sys = require("sys");
var url = require('url');
var path = require('path');
var querystring = require('querystring');

require('./lib/dep/date');
var direttoUtil = require("./lib/diretto/util");
var cradle = require('./lib/dep/cradle');

var Auth = require('./lib/diretto/auth').Auth;
var Signer = require('./lib/diretto/signer').Signer;
var SimpleRouter = require('./lib/diretto/simplerouter').SimpleRouter;
var FeedHandler = require('./lib/diretto/feedhandler').FeedHandler;

var SERVER = {
	name : "DirettoFeedNode",
	version : "0.1.0",
	alias : "DirettoFeedNode/0.1.0"
};

var config = direttoUtil.readConfigFile("./conf/servers.json");
var cachingConnection = new (cradle.Connection)(config.couchdb.host, config.couchdb.port, {
	cache : true,
	raw : false
});

var feedHandler = new FeedHandler(config, SERVER);

var pushing = (process.argv.indexOf("--nopush") === -1);

var urls = [ [ 'GET', '^\/feeds\/documents(?:\/cursor\/([a-zA-Z0-9-]+))?$', function(request, response, cursor) {
	feedHandler.getDocumentPage(request, response, cursor);

} ], [ 'GET', '^\/geo\/kml(?:\/cursor\/([a-zA-Z0-9-]+))?$', function(request, response, cursor) {
	feedHandler.getKmlFeed(request, response);

} ], [ 'GET', '^\/feeds\/attachments(?:\/cursor\/([a-zA-Z0-9-]+))?$', function(request, response, cursor) {
	feedHandler.getAttachmentPage(request, response, cursor);

} ], [ 'POST', '^/bla/(.+)$', function(request, response, bla, q) {
	response.writeHead(200, {
		'Content-Type' : 'text/plain'
	});
	if (q.foo) {
		response.write(q.foo);
	}
	response.end(bla + 'World\n');

} ], [ 'GET', '^\/([a-zA-Z0-9-]+)?$', function(request, response, bla) {
	response.writeHead(200, {});
	response.end(bla);

} ] ];

var router = new SimpleRouter(urls, SERVER);
router.listen(config.feedserver.port, config.feedserver.ip);

if (pushing) {
	feedHandler.startChangeHandler();
}

process.on('uncaughtException', function (err) {
	sys.log('Caught exception: ' + err);
});
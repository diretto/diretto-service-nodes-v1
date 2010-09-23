var http = require("http");
var sys = require("sys");

var url = require('url');
var path = require('path');
var querystring = require('querystring');

var FeedGenerator = require('./feedgenerator').FeedGenerator;
var ChangeListener = require('./changelistener').ChangeListener;
var ConnectionPool = require('./connectionpool').ConnectionPool;

var util = require('./util');

var CONSTANTS = require('./constants');

/**
 * Enum for database document typing.
 */
var ENTRY = CONSTANTS.ENTRY;

/**
 * Database names.
 */
var DATABASE = CONSTANTS.DATABASE;

var PAGINATION_SIZE = 10;

var FeedHandler = exports.FeedHandler = function(config, server) {
	this.config = config;

	this.server = server;
	this.fg = new FeedGenerator(config.feedserver.templatepath);

	var connections = {
		'entries' : {
			'table' : "entries",
			'connections' : 1,
			'options' : {
				cache : true,
				raw : false
			}
		}
	};

	this.pool = new ConnectionPool(config.couchdb.host, config.couchdb.port, connections);

};

FeedHandler.prototype.getDocumentPage = function(request, response, cursor) {
	var data = {
		title : this.config.deployment.title,
		website : this.config.deployment.website,
		hub : this.config.feedserver.hub,
		server : this.server.alias,
		serverver : this.server.version,
		id : config.feedserver.uri + "feeds/documents",
		entries : []
	};
	var rowHandler = function(row) {
		data.entries.push( {
			date : row.key[0],
			id : row.value.id,
			category : row.doc.mediatype,
			user : row.doc.owner,
			useruri : config.apiserver.uri + "v1/users/" + row.doc.owner,
			docuri : config.apiserver.uri + "v1/documents/" + row.value.id
		});
	};
	this._sendFeedPage("entries/docsByUploadDate", "feeds/documents.xml", "feeds/documents", response, cursor, data, rowHandler, ENTRY.DOCUMENT.PREFIX);
};

FeedHandler.prototype.getAttachmentPage = function(request, response, cursor) {
	var data = {
		title : this.config.deployment.title,
		website : this.config.deployment.website,
		hub : this.config.feedserver.hub,
		server : this.server.alias,
		serverver : this.server.version,
		id : config.feedserver.uri + "feeds/attachments",
		entries : []
	};
	var rowHandler = function(row) {
		data.entries.push( {
			date : (row.key[0] === null ? "" : row.key[0]),
			id : row.value.id,
			mime : row.doc.mime,
			length : row.doc.size,
			location : row.doc.location,
			user : row.doc.uploader,
			useruri : config.apiserver.uri + "v1/users/" + row.doc.uploader,
			docuri : config.apiserver.uri + "v1/documents/" + row.doc.doc_id + "/attachments/" + row.value.id
		});
	};
	this._sendFeedPage("entries/attachmentsByDate", "feeds/attachments.xml", "feeds/attachments", response, cursor, data, rowHandler, ENTRY.ATTACHMENT.PREFIX);
};

FeedHandler.prototype._sendFeedPage = function(viewName, templateName, uriPath, response, cursor, data, rowHandler, prefix) {
	var that = this;

	var b = new (util.Barrier)((!!cursor ? 2 : 1), function() {
		response.writeHead(200, {
			'Content-Type' : 'application/atom+xml'
		});
		that.fg.renderChunked(templateName, data, function() {
			response.end();
		}, function(chunk) {
			response.write(chunk);
		}, function() {
			response.end();
		});
	}, function() {
		response.writeHead(500);
		response.end();
	});

	var fetchPage = function(cursorkey) {
		var view1Param = {
			descending : true,
			limit : PAGINATION_SIZE + 1,
			include_docs : true
		};
		if (cursor) {
			view1Param['startkey'] = cursorkey;
		}
		that.pool.db('entries').view(viewName, view1Param, function(err, dbRes) {
			if (err) {
				b.abort();
			}
			else {
				var i = 0;
				for (; dbRes.rows && i < PAGINATION_SIZE && i < dbRes.rows.length; i++) {
					var row = dbRes.rows[i];
					rowHandler(row);

				}
				if (dbRes.rows && i == PAGINATION_SIZE && dbRes.rows[i]) {
					data['next'] = config.feedserver.uri + uriPath + "/cursor/" + dbRes.rows[i].id.substr(2);
					data['hasNext'] = true;
				}
				if (dbRes.rows[0]) {
					data.updated = dbRes.rows[0].key[0];
					data.self = config.feedserver.uri + uriPath + "/cursor/" + dbRes.rows[0].value.id;
				}
				b.submit();
			}
		});
	};

	if (cursor) {
		that.pool.db('entries').get(prefix + "-" + cursor, function(err, doc) {
			if (err) {
				if (err == 'not_found') {
					response.writeHead(404);
					response.end();
				}
				else {
					response.writeHead(500);
					response.end();
				}
			}
			else {
				fetchPage( [ doc.uploaded, doc._id ]);

				var view2Param = {
					descending : false,
					startkey : [ doc.uploaded, doc._id ],
					limit : PAGINATION_SIZE + 1
				};
				that.pool.db('entries').view(viewName, view2Param, function(err, dbRes) {
					if (err) {
						b.abort();
					}
					else {
						if (dbRes.rows.length > 1) {
							data['previous'] = config.feedserver.uri + uriPath + "/cursor/" + dbRes.rows[dbRes.rows.length - 1].id.substr(2);
							data['hasPrevious'] = true;
						}
						b.submit();
					}

				});
			}
		});

	}
	else {
		fetchPage();
	}
};

FeedHandler.prototype.getKmlFeed = function(request, response) {
	var data = {
		title : this.config.deployment.title,
		website : this.config.deployment.website,
		hub : this.config.feedserver.hub,
		server : this.server.alias,
		serverver : this.server.version,
		id : config.feedserver.uri + "feeds/attachments",
		entries : []
	};

	var that = this;
	this.pool.db('entries').view("entries/spatialdebug", {}, function(err, dbRes) {
		if (err) {
			response.writeHead(500, {});
			response.end();
		}
		else {
			var pre = {};
			for ( var i = 0; dbRes.rows && i < dbRes.rows.length; i++) {
				var row = dbRes.rows[i];
				if (!pre[row.key[0]]) {
					pre[row.key[0]] = {};
					pre[row.key[0]].id = row.key[0];
					pre[row.key[0]].attachments = [];
				}

				if (row.key[1] === 0) {
					pre[row.key[0]].owner = row.value.owner;
					pre[row.key[0]].mediatype = row.value.mediatype;
					pre[row.key[0]].doc_uploaded = row.value.uploaded;
				}
				else if (row.key[1] === 1) {
					if (row.key[0] === row.key[2]) {
						pre[row.key[0]].location = row.value.location;
					}
				}
				else if (row.key[1] === 2) {
					pre[row.key[0]].lat = row.value[0];
					pre[row.key[0]].lon = row.value[1];

				}
			}
			for ( var key in pre) {
				var entryText = "<br/>Document " + pre[key].id + " (mediatype " + pre[key].mediatype + ") uploaded by " + pre[key].owner + " on " + pre[key].doc_uploaded + ".";
				if (pre[key].mediatype === 'image') {
					entryText = entryText + "<br/><img src='" + pre[key].location + "' width='240'/>";
				}
				data.entries.push( {
					id : pre[key].id,
					lat : pre[key].lat,
					lon : pre[key].lon,
					text : entryText,
					type : (pre[key].mediatype === 'image' ? 'image' : 'other')
				});
			}
			//<br/><table border="0"><tr><td>Submitted by</td>{{id}}<td></td></tr><tr><td>Uploaded </td><td>{{doc_uploaded}}</td></tr><tr><td>Owner</td><td>{{owner}}</td></tr><tr><td>Type</td>{{mediatype}}<td></td></tr><tr><td>Position</td>{{lat}} - {{lon}}<td></td></tr></table><br/><img src='{{location}}' width='240'>

			response.writeHead(200, {
				'Content-Type' : 'application/vnd.google-earth.kml+xml',
				'ETag' : Math.random() * 100000
			});

			that.fg.renderChunked("geo/kml.xml", data, function() {
				response.end();
			}, function(chunk) {
				response.write(chunk);
			}, function() {
				response.end();
			});
		}
	});

};

FeedHandler.prototype.startChangeHandler = function() {
	var hubUri = url.parse(this.config.feedserver.hub);
	var feedUri = this.config.feedserver.uri + "feeds/documents";
	var body = querystring.stringify( {
		'hub.mode' : "publish",
		"hub.url" : feedUri
	});

	var client = http.createClient(hubUri.port || 80, hubUri.hostname);

	var changeListener = new ChangeListener("http://" + this.config.couchdb.host + ":" + this.config.couchdb.port + "/" + DATABASE.ENTRIES, {
		feed : "continuous",
		filter : "entries/documentUploaded"
	}, function(obj) {
		var client = http.createClient(hubUri.port || 80, hubUri.hostname);
		var request = client.request('POST', "/", {
			'Host' : hubUri.hostname,
			"Content-Length" : body.length,
			"Content-Type" : "application/x-www-form-urlencoded"
		});
		request.write(body);
		request.end();
		sys.log("sending update to hub!");
		request.on('error', function(err) {
			sys.puts('request error: ' + err);
		});
		client.on('error', function(err) {
			sys.puts('client error: ' + err);
			sys.log(sys.inspect(err));
		});

		// sys.log(sys.inspect(request));
		});
};

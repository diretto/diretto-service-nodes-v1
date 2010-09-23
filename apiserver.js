var http = require("http");
var sys = require('sys');
var url = require('url');
var crypto = require('crypto');

var journey = require('./lib/dep/journey');
require('./lib/dep/underscore');

var direttoUtil = require("./lib/diretto/util");
var cradle = require('./lib/dep/cradle');
var Auth = require('./lib/diretto/auth').Auth;
var ApiHandler = require('./lib/diretto/apihandler').ApiHandler;
var Signer = require('./lib/diretto/signer').Signer;

var CONSTANTS = require('./lib/diretto/constants');
var ENTRY = CONSTANTS.ENTRY;

var SERVER = 'DirettoApiNode/0.1';
var API_VERSION = 1;

var config = direttoUtil.readConfigFile("./conf/servers.json");

var mediaTypes = direttoUtil.readConfigFile("./conf/mediatypes.json");

var connection = new (cradle.Connection)(config.couchdb.host, config.couchdb.port, {
	cache : false,
	raw : false
});
var cachingConnection = new (cradle.Connection)(config.couchdb.host, config.couchdb.port, {
	cache : true,
	raw : false
});
var auth = new Auth(connection);

var apiHandler = new ApiHandler(config.apiserver.uri + 'v' + API_VERSION + '/', config, mediaTypes);

var signer = new Signer(config.security.key);

// object for mandatory authentication. does not check auth, assures only
// presence of auth header. Authentication must be validated later.
var authRequired = {
	assert : function(req) {
		// TODO: will cause unauth'ed requests to return a 404 instead of 401
		// return req.headers['authorization'];
		return true;
	}
};

var API_PREFIX = "v" + API_VERSION;

var router = new (journey.Router)(function(map) {
	/* GET */
	map.root.bind(function(res) {
		res.send(303, {
			Location : config.apiserver.uri + "v" + API_VERSION
		}, "");
	});

	map.path("/" + API_PREFIX, function() {
		this.get().bind(function(res) {
			apiHandler.getServiceInfo(res);

		});

		this.path("/attachments", function() {
			this.get(new RegExp("\/(ascending|descending)(?:\/cursor\/([a-zA-Z0-9-]+))?$"), authRequired).bind(function(res, order, cursor) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					if (cursor) {
						apiHandler.getAttachmentsByCursor(res, order, cursor);
					}
					else {
						apiHandler.getAttachments(res, order);
					}
				});
			});
			this.get(new RegExp("\/([a-zA-Z0-9-]+)$"), authRequired).bind(function(res, attachid) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {

					apiHandler.unaliasAttachment(res, attachid);

				});
			});
		});

		this.path("/users", function() {
			this.post().bind(function(res, data) {
				sys.log(sys.inspect(data));
				if (config.deployment.allownewusers !== true) {
					res.send(403, {}, {
						error : "Registration for new users has been disabled"
					});
				}
				else if (data.email && data.password && data.username) {
					apiHandler.createUser(res, data);
				}
				else {
					res.send(400, {}, {
						error : "Invalid user data"
					});
				}
			});

			this.get(authRequired).bind(function(res) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.getUsers(res);
				});
			});

			this.get(new RegExp("\/([a-zA-Z0-9]+)$"), authRequired).bind(function(res, id) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.getUser(res, id);
				});
			});

			this.get(new RegExp("\/([a-zA-Z0-9]+)\/comments$"), authRequired).bind(function(res, id) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.getCommentsByUser(res, id);
				});
			});

			this.del(new RegExp("\/([a-zA-Z0-9]+)$"), authRequired).bind(function(res, id) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					if (id == user) {
						apiHandler.deleteUser(res, id);
					}
					else {
						res.send(403);
					}
				});
			});

			this.put(new RegExp("\/([a-zA-Z0-9]+)$"), authRequired).bind(function(res, id, data) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					if (id == user) {
						apiHandler.changeUser(res, id, data);
					}
					else {
						res.send(403);
					}
				});
			});

			this.get(new RegExp("\/cursor\/([a-zA-Z0-9]+)$"), authRequired).bind(function(res, cursor) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.getUsersByCursor(res, cursor);
				});
			});
		});

		this.path("/documents", function() {
			this.get(new RegExp("\/(ascending|descending)(?:\/cursor\/([a-zA-Z0-9-]+))?$"), authRequired).bind(function(res, order, cursor) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					if (cursor) {
						apiHandler.getDocumentsByCursor(res, order, cursor);
					}
					else {
						apiHandler.getDocuments(res, order);
					}
				});
			});

			this.get(new RegExp("\/(before|after)\/([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}.[0-9]{3}Z)$"), authRequired).bind(function(res, order, date) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.getDocumentsByUploadDate(res, order, date);
				});
			});

			this.put(new RegExp("\/([a-zA-Z0-9-]+)$"), authRequired).bind(function(res, docid, data) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.createDocument(res, docid, data, user);
				});
			});

			this.post(new RegExp("\/([a-zA-Z0-9-]+)\/attachments$"), authRequired).bind(function(res, docid, data) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.createAttachment(res, docid, data, user);
				});
			});

			this.del(new RegExp("\/([a-zA-Z0-9-]+)\/attachments\/([a-zA-Z0-9-]+)\/lock\/([a-zA-Z0-9-]+)$"), authRequired).bind(function(res, docid, attachid, acceptkey) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.publishAttachment(res, docid, attachid, acceptkey, user);
				});
			});

			this.get(new RegExp("\/([a-zA-Z0-9-]+)$"), authRequired).bind(function(res, docid) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.getDocument(res, docid);
				});
			});

			this.get(new RegExp("\/([a-zA-Z0-9-]+)\/attachments$"), authRequired).bind(function(res, docid) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.getDocumentAttachmentIds(res, docid);
				});
			});

			this.get(new RegExp("\/([a-zA-Z0-9-]+)\/positions$"), authRequired).bind(function(res, docid) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.getPositionsByDocumentId(res, docid);
				});
			});
			
			this.post(new RegExp("\/([a-zA-Z0-9-]+)\/positions$"), authRequired).bind(function(res, docid, data) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.addPositionForDocument(res, user, docid, data);
				});
			});

			this.get(new RegExp("\/([a-zA-Z0-9-]+)\/position\/([a-zA-Z0-9-]+)$"), authRequired).bind(function(res, docid, posid) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.getPositionById(res, posid);
				});
			});

			this.get(new RegExp("\/([a-zA-Z0-9-]+)\/position\/([a-zA-Z0-9-]+)\/votes$"), authRequired).bind(function(res, docid, posid) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.listVotes(res, user, ENTRY.SPATIAL, posid);
				});
			});

			this.put(new RegExp("\/([a-zA-Z0-9-]+)\/position\/([a-zA-Z0-9-]+)\/vote\/(up|down)$"), authRequired).bind(function(res, docid, posid, vote) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.doVote(res, user, ENTRY.SPATIAL, posid, vote === "up" ? 1 : -1);
				});
			});

			this.del(new RegExp("\/([a-zA-Z0-9-]+)\/position\/([a-zA-Z0-9-]+)\/vote$"), authRequired).bind(function(res, docid, posid) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.deleteVote(res, user, ENTRY.SPATIAL, posid);
				});
			});

			this.get(new RegExp("\/([a-zA-Z0-9-]+)\/times"), authRequired).bind(function(res, docid) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.getTimesByDocumentId(res, docid);
				});
			});

			this.post(new RegExp("\/([a-zA-Z0-9-]+)\/times"), authRequired).bind(function(res, docid, data) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.addTimeForDocument(res, user, docid, data);
				});
			});

			this.get(new RegExp("\/([a-zA-Z0-9-]+)\/times\/([a-zA-Z0-9-]+)$"), authRequired).bind(function(res, docid, timeid) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.getTimeById(res, timeid);
				});
			});

			this.get(new RegExp("\/([a-zA-Z0-9-]+)\/times\/([a-zA-Z0-9-]+)\/votes$"), authRequired).bind(function(res, docid, timeid) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.listVotes(res, user, ENTRY.TEMPORAL, timeid);
				});
			});

			this.put(new RegExp("\/([a-zA-Z0-9-]+)\/times\/([a-zA-Z0-9-]+)\/vote\/(up|down)$"), authRequired).bind(function(res, docid, timeid, vote) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.doVote(res, user, ENTRY.TEMPORAL, timeid, vote === "up" ? 1 : -1);
				});
			});

			this.del(new RegExp("\/([a-zA-Z0-9-]+)\/times\/([a-zA-Z0-9-]+)\/vote$"), authRequired).bind(function(res, docid, timeid) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.deleteVote(res, user, ENTRY.TEMPORAL, timeid);
				});
			});

			this.get(new RegExp("\/([a-zA-Z0-9-]+)\/attachments\/([a-zA-Z0-9-]+)$"), authRequired).bind(function(res, docid, attachid) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.getAttachment(res, docid, attachid);
				});
			});

			this.get(new RegExp("\/([a-zA-Z0-9-]+)\/links\/(inbound|outbound)$"), authRequired).bind(function(res, docid, type) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					if (type === "inbound") {
						apiHandler.getInboundLinksByDoc(res, docid);
					}
					else if (type === "outbound") {
						apiHandler.getOutboundLinksByDoc(res, docid);
					}
					else {
						res.send(400);
					}
				});
			});

			this.get(new RegExp("\/([a-zA-Z0-9-]+)\/attachments\/([a-zA-Z0-9-]+)\/votes$"), authRequired).bind(function(res, docid, attachid) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.listVotes(res, user, ENTRY.ATTACHMENT, attachid);
				});
			});

			this.put(new RegExp("\/([a-zA-Z0-9-]+)\/attachments\/([a-zA-Z0-9-]+)\/vote\/(up|down)$"), authRequired).bind(function(res, docid, attachid, vote) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.doVote(res, user, ENTRY.ATTACHMENT, attachid, vote === "up" ? 1 : -1);
				});
			});

			this.del(new RegExp("\/([a-zA-Z0-9-]+)\/attachments\/([a-zA-Z0-9-]+)\/vote$"), authRequired).bind(function(res, docid, attachid) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.deleteVote(res, user, ENTRY.ATTACHMENT, attachid);
				});
			});

			this.get(new RegExp("\/([a-zA-Z0-9-]+)\/attachments\/([a-zA-Z0-9-]+)\/comments$"), authRequired).bind(function(res, docid, attachid) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.getCommentsByAttachmentId(res, docid, attachid);
				});
			});

			this.post(new RegExp("\/([a-zA-Z0-9-]+)\/attachments\/([a-zA-Z0-9-]+)\/comments$"), authRequired).bind(function(res, docid, attachid, data) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.createAttachmentComment(res, docid, attachid, data, user);
				});
			});

			this.get(new RegExp("\/([a-zA-Z0-9-]+)\/attachments\/([a-zA-Z0-9-]+)\/comments\/([a-zA-Z0-9-]+)$"), authRequired).bind(function(res, docid, attachid, commentid) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.getAttachmentCommentById(res, commentid);
				});
			});

			this.get(new RegExp("\/([a-zA-Z0-9-]+)\/attachments\/([a-zA-Z0-9-]+)\/comments\/([a-zA-Z0-9-]+)\/votes$"), authRequired).bind(function(res, docid, attachid, commentid) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.listVotes(res, user, ENTRY.COMMENT, commentid);
				});
			});

			this.put(new RegExp("\/([a-zA-Z0-9-]+)\/attachments\/([a-zA-Z0-9-]+)\/comments\/([a-zA-Z0-9-]+)\/vote\/(up|down)$"), authRequired).bind(function(res, docid, attachid, commentid, vote) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.doVote(res, user, ENTRY.COMMENT, commentid, vote === "up" ? 1 : -1);
				});
			});

			this.del(new RegExp("\/([a-zA-Z0-9-]+)\/attachments\/([a-zA-Z0-9-]+)\/comments\/([a-zA-Z0-9-]+)\/vote$"), authRequired).bind(function(res, docid, attachid, commentid) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.deleteVote(res, user, ENTRY.COMMENT, commentid);
				});
			});

			this.get(new RegExp("\/([a-zA-Z0-9-]+)\/attachments\/([a-zA-Z0-9-]+)\/tags$"), authRequired).bind(function(res, docid, attachid) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.getTagsByAttachment(res, docid, attachid);
				});
			});

			this.get(new RegExp("\/([a-zA-Z0-9-]+)\/attachments\/([a-zA-Z0-9-]+)\/tags\/([a-zA-Z0-9-]+)$"), authRequired).bind(function(res, docid, attachid, tagid) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.getAttachmentTagById(res, docid, attachid, tagid);
				});
			});

			this.post(new RegExp("\/([a-zA-Z0-9-]+)\/attachments\/([a-zA-Z0-9-]+)\/tags$"), authRequired).bind(function(res, docid, attachid, data) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.createAttachmentTag(res, user, docid, attachid, data);
				});
			});

			this.get(new RegExp("\/([a-zA-Z0-9-]+)\/attachments\/([a-zA-Z0-9-]+)\/tags\/([a-zA-Z0-9-]+)\/votes$"), authRequired).bind(function(res, docid, attachid, tagid) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.listVotes(res, user, ENTRY.TAG, tagid);
				});
			});

			this.put(new RegExp("\/([a-zA-Z0-9-]+)\/attachments\/([a-zA-Z0-9-]+)\/tags\/([a-zA-Z0-9-]+)\/vote\/(up|down)$"), authRequired).bind(function(res, docid, attachid, tagid, vote) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.doVote(res, user, ENTRY.TAG, tagid, vote === "up" ? 1 : -1);
				});
			});

			this.del(new RegExp("\/([a-zA-Z0-9-]+)\/attachments\/([a-zA-Z0-9-]+)\/tags\/([a-zA-Z0-9-]+)\/vote$"), authRequired).bind(function(res, docid, attachid, tagid) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.deleteVote(res, user, ENTRY.TAG, tagid);
				});
			});

			this.get(new RegExp("\/([a-zA-Z0-9-]+)\/attachments\/([a-zA-Z0-9-]+)\/values$"), authRequired).bind(function(res, docid, attachid) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.listAttachmentValues(res, docid, attachid);
				});
			});

			this.post(new RegExp("\/([a-zA-Z0-9-]+)\/attachments\/([a-zA-Z0-9-]+)\/values$"), authRequired).bind(function(res, docid, attachid, data) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.createAttachmentValue(res, user, docid, attachid, data);
				});
			});

			this.get(new RegExp("\/([a-zA-Z0-9-]+)\/attachments\/([a-zA-Z0-9-]+)\/values\/user\/([a-zA-Z0-9-]+)\/key\/([a-zA-Z0-9-]+)$"), authRequired).bind(
					function(res, docid, attachid, userid, key) {
						auth.authenticate(this.request, function(code) {
							apiHandler.answerUnauth(res, code);
						}, function(user) {
							apiHandler.getAttachmentValue(res, docid, attachid, userid, key);
						});
					});

			this.put(new RegExp("\/([a-zA-Z0-9-]+)\/attachments\/([a-zA-Z0-9-]+)\/values\/user\/([a-zA-Z0-9-]+)\/key\/([a-zA-Z0-9-]+)$"), authRequired).bind(
					function(res, docid, attachid, userid, key, data) {
						auth.authenticate(this.request, function(code) {
							apiHandler.answerUnauth(res, code);
						}, function(autheduser) {
							apiHandler.updateAttachmentValue(res, autheduser, docid, attachid, userid, key, data);
						});
					});

			this.del(new RegExp("\/([a-zA-Z0-9-]+)\/attachments\/([a-zA-Z0-9-]+)\/values\/user\/([a-zA-Z0-9-]+)\/key\/([a-zA-Z0-9-]+)$"), authRequired).bind(
					function(res, docid, attachid, userid, key) {
						auth.authenticate(this.request, function(code) {
							apiHandler.answerUnauth(res, code);
						}, function(autheduser) {
							apiHandler.deleteAttachmentValue(res, autheduser, docid, attachid, userid, key);
						});
					});

		});

		this.path("/links", function() {

			this.get(new RegExp("\/([a-zA-Z0-9-]+)$"), authRequired).bind(function(res, linkid) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.getLink(res, linkid);
				});
			});
			this.post(authRequired).bind(function(res, data) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.createLink(res, data, user);
				});
			});

			this.get(new RegExp("\/([a-zA-Z0-9-]+)\/comments$"), authRequired).bind(function(res, linkid) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.getCommentsByLinkId(res, linkid);
				});
			});

			this.post(new RegExp("\/([a-zA-Z0-9-]+)\/comments$"), authRequired).bind(function(res, linkid, data) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.createLinkComment(res, linkid, data, user);
				});
			});

			this.get(new RegExp("\/([a-zA-Z0-9-]+)\/comments\/([a-zA-Z0-9-]+)"), authRequired).bind(function(res, linkid, commentId) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.getLinkCommentById(res, commentId);
				});
			});

			this.get(new RegExp("\/([a-zA-Z0-9-]+)\/votes$"), authRequired).bind(function(res, linkid) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.listVotes(res, user, ENTRY.LINK, linkid);
				});
			});

			this.put(new RegExp("\/([a-zA-Z0-9-]+)\/vote\/(up|down)$"), authRequired).bind(function(res, linkid, vote) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.doVote(res, user, ENTRY.LINK, linkid, vote === "up" ? 1 : -1);
				});
			});

			this.del(new RegExp("\/([a-zA-Z0-9-]+)\/vote$"), authRequired).bind(function(res, linkid) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.deleteVote(res, user, ENTRY.LINK, linkid);
				});
			});

			this.get(new RegExp("\/([a-zA-Z0-9-]+)\/comments\/([a-zA-Z0-9-]+)\/votes$"), authRequired).bind(function(res, linkid, commentid) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.listVotes(res, user, ENTRY.COMMENT, commentid);
				});
			});

			this.put(new RegExp("\/([a-zA-Z0-9-]+)\/comments\/([a-zA-Z0-9-]+)\/vote\/(up|down)$"), authRequired).bind(function(res, linkid, commentid, vote) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.doVote(res, user, ENTRY.COMMENT, commentid, vote === "up" ? 1 : -1);
				});
			});

			this.del(new RegExp("\/([a-zA-Z0-9-]+)\/comments\/([a-zA-Z0-9-]+)\/vote$"), authRequired).bind(function(res, linkid, commentid) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.deleteVote(res, user, ENTRY.COMMENT, commentid);
				});
			});

			this.get(new RegExp("\/([a-zA-Z0-9-]+)\/tags$"), authRequired).bind(function(res, linkid) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.getTagsByLink(res, linkid);
				});
			});

			this.get(new RegExp("\/([a-zA-Z0-9-]+)\/tags\/([a-zA-Z0-9-]+)$"), authRequired).bind(function(res, linkid, tagid) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.getLinkTagById(res, linkid, tagid);
				});
			});

			this.post(new RegExp("\/([a-zA-Z0-9-]+)\/tags$"), authRequired).bind(function(res, linkid, data) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.createLinkTag(res, user, linkid, data);
				});
			});

			this.get(new RegExp("\/([a-zA-Z0-9-]+)\/tags\/([a-zA-Z0-9-]+)\/votes$"), authRequired).bind(function(res, linkid, tagid) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.listVotes(res, user, ENTRY.TAG, tagid);
				});
			});

			this.put(new RegExp("\/([a-zA-Z0-9-]+)\/tags\/([a-zA-Z0-9-]+)\/vote\/(up|down)$"), authRequired).bind(function(res, linkid, tagid, vote) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.doVote(res, user, ENTRY.TAG, tagid, vote === "up" ? 1 : -1);
				});
			});

			this.del(new RegExp("\/([a-zA-Z0-9-]+)\/tags\/([a-zA-Z0-9-]+)\/vote$"), authRequired).bind(function(res, linkid, tagid) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.deleteVote(res, user, ENTRY.TAG, tagid);
				});
			});

			this.get(new RegExp("\/([a-zA-Z0-9-]+)\/values$"), authRequired).bind(function(res, linkid) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.listLinkValues(res, linkid);
				});
			});

			this.post(new RegExp("\/([a-zA-Z0-9-]+)\/values$"), authRequired).bind(function(res, linkid, data) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.createLinkValue(res, user, linkid, data);
				});
			});

			this.get(new RegExp("\/([a-zA-Z0-9-]+)\/values\/user\/([a-zA-Z0-9-]+)\/key\/([a-zA-Z0-9-]+)$"), authRequired).bind(function(res, linkid, userid, key) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.getLinkValue(res, linkid, userid, key);
				});
			});

			this.put(new RegExp("\/([a-zA-Z0-9-]+)\/values\/user\/([a-zA-Z0-9-]+)\/key\/([a-zA-Z0-9-]+)$"), authRequired).bind(function(res, linkid, userid, key, data) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(autheduser) {
					apiHandler.updateLinkValue(res, autheduser, linkid, userid, key, data);
				});
			});

			this.del(new RegExp("\/([a-zA-Z0-9-]+)\/values\/user\/([a-zA-Z0-9-]+)\/key\/([a-zA-Z0-9-]+)$"), authRequired).bind(function(res, linkid, userid, key) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(autheduser) {
					apiHandler.deleteLinkValue(res, autheduser, linkid, userid, key);
				});
			});

		});

		this.path("/positions", function() {

			this.get(new RegExp("\/inside\/([-+]?[0-9]*\.?[0-9]+)\/([-+]?[0-9]*\.?[0-9]+)\/([-+]?[0-9]*\.?[0-9]+)\/([-+]?[0-9]*\.?[0-9]+)$"), authRequired).bind(function(res, lat1, lon1, lat2, lon2) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.getDocumentIdsByBbox(res, lat1, lon1, lat2, lon2);
				});
			});
			this.get(new RegExp("\/([a-zA-Z0-9-]+)$"), authRequired).bind(function(res, posId) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.unaliasPosition(res, posId);
				});
			});

		});

		this.path("/times", function() {

			this.get(new RegExp("\/between\/([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}.[0-9]{3}Z)\/([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}.[0-9]{3}Z)$"), authRequired)
					.bind(function(res, after, before) {
						auth.authenticate(this.request, function(code) {
							apiHandler.answerUnauth(res, code);
						}, function(user) {
							apiHandler.getDocumentIdsByTime(res, after, before);
						});
					});

			this.get(new RegExp("\/([a-zA-Z0-9-]+)$"), authRequired).bind(function(res, timeId) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.unaliasTime(res, timeId);
				});
			});
		});

		this.path("/tags", function() {

			this.get(new RegExp("\/([a-zA-Z0-9-]+)$"), authRequired).bind(function(res, tagid) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.unaliasTag(res, tagid);
				});
			});
		});

		this.path("/comments", function() {

			this.get(new RegExp("\/([a-zA-Z0-9-]+)$"), authRequired).bind(function(res, commentId) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					apiHandler.unaliasComment(res, commentId);
				});
			});
		});

		this.path("/service", function() {
			this.get("supportedformats", authRequired).bind(function(res) {
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					res.send(mediaTypes);
				});

			});
			this.get("info", authRequired).bind(function(res) {
				var r = this.request;
				auth.authenticate(this.request, function(code) {
					apiHandler.answerUnauth(res, code);
				}, function(user) {
					var stats = {};
					stats['node'] = {
						version : process.version
					};
					stats['plattorm'] = process.platform;
					// stats['memory'] = process.memoryUsage();
						res.send(stats);
					});

			});
		});

	});

}, true);

http.createServer(function(request, response) {
	var body = "";
	var inrequest = request;

	request.on('data', function(chunk) {
		body += chunk;
	});
	request.on('end', function() {
		router.route(request, body, function(result) {
			result.headers['Server'] = SERVER;

			// Caching
				if (request.headers['if-none-match'] && result.headers['ETag'] && request.headers['if-none-match'].indexOf(result.headers['ETag']) !== -1) {
					// RFC 2616 (section 4.3)
				if (result.headers['Content-Length']) {
					delete result.headers['Content-Length'];
				}
				result.status = 304;
				result.body = "";
			}

			response.writeHead(result.status, result.headers);
			response.end(result.body);

			sys.log("[" + request.connection.remoteAddress + "] " + request.method + " " + request.url.href + ":" + result.status);

		});
	});
}).listen(config.apiserver.port || 80, config.apiserver.ip);

process.on('uncaughtException', function(err) {
	sys.log('Caught exception: ' + err);
});
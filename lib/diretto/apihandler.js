var crypto = require('crypto');
var sys = require('sys');

var util = require('./util');
var Signer = require('./signer').Signer;
var ConnectionPool = require('./connectionpool').ConnectionPool;

var CONSTANTS = require('./constants');

/**
 * Enum for database document typing.
 */
var ENTRY = CONSTANTS.ENTRY;

/**
 * Database names.
 */
var DATABASE = CONSTANTS.DATABASE;

/**
 * Size of items per page for pagination.
 */
var PAGINATION_SIZE = 100;

/**
 * @class
 * 
 * Constructor for {@link ApiHandler} object.
 * 
 * @param cradleConnection
 * @param basePath
 * @param config
 * @param mediaTypes
 * @return
 */
var ApiHandler = exports.ApiHandler = function(basePath, config, mediaTypes) {
	var connections = {
		'users' : {
			'table' : "users",
			'connections' : 1,
			'options' : {
				cache : true,
				raw : false,
				connections : 1
			}
		},
		'entries' : {
			'table' : "entries",
			'connections' : 1,
			'options' : {
				cache : true,
				raw : false,
				connections : 1
			}
		}
	};

	this.pool = new ConnectionPool(config.couchdb.host, config.couchdb.port, connections);

	// this.connection = cradleConnection;
	// this.db = {};
	// this.db['users'] = cradleConnection.database(DATABASE.USERS);
	// this.db['entries'] = cradleConnection.database(DATABASE.ENTRIES);

	this.basePath = basePath;

	this.config = config;

	this.mediaTypes = mediaTypes;

	this.signer = new Signer(config.security.key);

};

/**
 * Returns a redirect for the a user listing page containing a cursor.
 * 
 * @param res
 * @return
 */
ApiHandler.prototype.getUsers = function(res) {
	var that = this;
	this.pool.db('users').view('users/byId', {
		limit : 1
	}, function(err, dbRes) {
		if (err) {
			res.send(500);
		}
		else {
			res.send(303, {
				'Location' : that.basePath + 'users/cursor/' + dbRes.rows[0].id
			}, null);

		}
	});

};

/**
 * Utility method for paginated views.
 * 
 * @param viewName
 * @param res
 * @param cursor
 * @return
 */
ApiHandler.prototype._paginateView = function(viewName, res, cursor) {
	var result = {};

	var b = new (util.Barrier)(2, function() {
		res.send(200, {}, result);
	}, function() {
		res.send(500);
	});

	this.pool.db('users').view(viewName, {
		limit : PAGINATION_SIZE + 1,
		startkey : cursor
	}, function(err, dbRes) {
		// sys.log(sys.inspect(dbRes));
			if (err) {
				b.abort();
			}
			else {
				var userlist = [];
				var i = 0;
				for (; i < PAGINATION_SIZE && i < dbRes.rows.length; i++) {
					userlist.push( {
						id : dbRes.rows[i].id,
						username : dbRes.rows[i].value
					});
				}
				result['users'] = userlist;
				if (i == PAGINATION_SIZE && dbRes.rows[i]) {
					result['next'] = dbRes.rows[i].id;
				}
				result['total'] = dbRes.total_rows;
				b.submit();
			}
		});
	this.pool.db('users').view(viewName, {
		limit : PAGINATION_SIZE + 1,
		startkey : cursor,
		descending : true
	}, function(err, dbRes) {
		if (err) {
			b.abort();
		}
		else {
			if (dbRes.rows.length > 1) {
				result['previous'] = dbRes.rows[dbRes.rows.length - 1].id;
			}
			b.submit();
		}

	});
};

/**
 * Method for querying a user list using a cursor.
 * 
 * @param res
 * @param cursor
 * @return
 */
ApiHandler.prototype.getUsersByCursor = function(res, cursor) {
	this._paginateView("users/byId", res, cursor);

};

/**
 * Method returns user data of the given user by its id.
 * 
 * @param res
 * @param id
 * @return
 */
ApiHandler.prototype.getUser = function(res, id) {
	this.pool.db('users').get(id, function(err, doc) {
		if (err) {
			if (err.error === 'not_found') {
				res.send(404);

			}
			else {
				res.send(500);

			}
		}
		else {
			res.send(200, {
				ETag : '"' + doc._rev.substr(doc._rev.indexOf("-") + 1) + '"'
			}, {
				email : doc.email,
				username : doc.username
			});
		}
	});
};

/**
 * Removes a user.
 * 
 * @param res
 * @param id
 * @return
 */
ApiHandler.prototype.deleteUser = function(res, id) {
	var that = this;

	var db = this.pool.db('users');

	db.get(id, function(err, doc) {
		if (err) {
			res.send(500);
		}
		else {

			db.remove(id, function(err, dbRes) {
				if (err) {
					res.send(500);
				}
				else {

					res.send(204);

				}
			});
		}
	});
};

/**
 * Changes the user data of a given user.
 * 
 * @param res
 * @param userData
 * @return
 */
ApiHandler.prototype.changeUser = function(res, userId, userData) {
	var that = this;

	var db = this.pool.db('users');

	if (!userData.password || !userData.username) {
		res.send(400);
		return;
	}

	db.get(userId, function(err, doc) {
		if (err) {

			res.send(500);

		}
		else {

			db.save(userId, {

				password : userData.password,
				username : userData.username
			}, function(err, dbRes) {
				if (err) {
					sys.log(err);
					res.send(500);
				}
				else {

					res.send(202);

				}
			});
		}
	});

};

/**
 * Create a new user account.
 * 
 * @param res
 * @param userData
 * @return
 */
ApiHandler.prototype.createUser = function(res, userData) {
	var hash = crypto.createHash('md5');
	hash.update(userData.email);
	userData.id = hash.digest('hex');
	var that = this;
	this.pool.db('users').insert(userData.id, {
		email : userData.email,
		password : userData.password,
		username : userData.username
	}, function(err, dbRes) {
		if (err) {
			if (err.error === 'conflict') {
				res.send(409);
			}
			else {
				res.send(500);
			}
		}
		else {

			res.send(201, {
				'Location' : that.basePath + 'users/' + userData.id
			}, {
				id : userData.id
			});

		}
	});

};

/**
 * Returns a list of comments the user has created.
 * 
 * @param res
 * @param id
 * @return
 */
ApiHandler.prototype.getCommentsByUser = function(res, id) {
	var that = this;

	var result = {};

	var dbUsers = this.pool.db('users');
	var dbEntries = this.pool.db('entries');

	dbUsers.get(id, function(err, doc) {
		if (err && err.error == 'not_found') {
			res.send(404);
		}
		else if (err) {
			sys.log("oops");
			res.send(500);
		}
		else {

			dbEntries.view("entries/commentsByUser", {
				startkey : [ id ],
				endkey : [ id, {} ],
				include_docs : true
			}, function(err, dbRes) {
				if (err) {
					res.send(500);
					sys.log(sys.inspect(err));
				}
				else {
					var commentList = [];
					for (i = 0; i < PAGINATION_SIZE && i < dbRes.rows.length; i++) {
						commentList.push( {
							comment_id : dbRes.rows[i].doc._id.substring(2),
							doc_id : dbRes.rows[i].doc.doc_id,
							attachment_id : dbRes.rows[i].doc.attachmentId,
							user : dbRes.rows[i].doc.user,
							comment : dbRes.rows[i].doc.comment,
							created : dbRes.rows[i].doc.created
						});
					}
					result['comments'] = commentList;

					result['total'] = dbRes.total_rows;

					res.send(200, {}, result);
				}
			});

		}
	});
};

/**
 * Returns a list of tags the user has used.
 * 
 * @param res
 * @param id
 * @return
 */
ApiHandler.prototype.getTagsByUser = function(res, id) {
	// TODO: implement
	res.send(500, {
		'error' : 'not yet implemented'
	}, null);
};

/**
 * Returns a list of documents the user has generated.
 * 
 * @param res
 * @param id
 * @return
 */
ApiHandler.prototype.getDocumentsByUser = function(res, id) {
	// TODO: implement
	res.send(500, {
		'error' : 'not yet implemented'
	}, null);
};

/**
 * Create a new document.
 * 
 * @param res
 * @param docid
 * @param data
 * @param user
 * @return
 */
ApiHandler.prototype.createDocument = function(res, docid, data, user) {
	var that = this;

	if (!data.attachment || !data.attachment.contentType || !data.attachment.contentLength || !data.document) {
		res.send(400, {}, {
			"error" : "Incomplete meta data"
		});
		return;
	}

	if (!this.mediaTypes.mimetypes[data.attachment.contentType]) {
		res.send(415, {}, {
			"error" : "Unsupported content type"
		});
		return;
	}
	else {
		data.document.type = this.mediaTypes.mimetypes[data.attachment.contentType].type;
	}

	that.pool.db('entries').insert(ENTRY.DOCUMENT.PREFIX + "-" + docid, {
		type : ENTRY.DOCUMENT.TYPE,
		published : false,
		mediatype : data.document.type,
		owner : user,
		uploaded : new Date()
	}, function(err, doc) {
		if (err) {
			if (err.error === 'conflict') {
				res.send(409);
			}
			else {
				res.send(500);
			}
		}
		else {
			that._createUpload(res, docid, docid, data, user);
		}
	});

	if (data.document.location.position) {

		that.pool.db('entries').insert(ENTRY.SPATIAL.PREFIX + "-" + docid, {
			type : ENTRY.SPATIAL.TYPE,
			doc_id : docid,
			lon : data.document.location.position.coordinates[0] || 0,
			lat : data.document.location.position.coordinates[1] || 0,
			variance : data.document.location.variance || 0,
			by_user : user,
			submitted : new Date()
		}, function(err, doc) {
			// Ignore callback here. Only the _createUpload() creates a HTTP
				// response.
			});
	}

	if (data.document.date) {
		that.pool.db('entries').insert(ENTRY.TEMPORAL.PREFIX + "-" + docid, {
			type : ENTRY.TEMPORAL.TYPE,
			doc_id : docid,
			after : data.document.date.after || new Date(),
			before : data.document.date.before || new Date(),
			by_user : user,
			submitted : new Date()
		}, function(err, doc) {
		});
	}
};

/**
 * Create a new attachment.
 * 
 * @param res
 * @param docid
 * @param data
 * @param user
 * @return
 */
ApiHandler.prototype.createAttachment = function(res, docid, data, user) {

	var attachid;
	var that = this;

	if (!data.attachment || !data.attachment.contentType || !data.attachment.contentLength) {
		res.send(400, {}, {
			"error" : "Incomplete meta data"
		});
		return;
	}

	var b = new (util.Barrier)(2, function() {
		that._createUpload(res, docid, attachid, data, user);
	}, function() {
		res.send(500);
	});

	// Get UUID for attachment
	this.pool.conn('entries').uuids(1, function(err, doc) {
		if (err) {
			b.abort(function() {
				res.send(500);
			});
		}
		else {
			attachid = util.toUUID(doc.pop());
			b.submit();
		}
	});

	// Check whether document exists...
	this.pool.db('entries').get(ENTRY.DOCUMENT.PREFIX + "-" + docid, function(err, doc) {
		if (err) {
			if (err.error == 'not_found') {
				b.abort(function() {
					res.send(404);
				});

			}
			else {
				b.abort(function() {
					res.send(500);
				});

			}
		}
		else {
			b.submit();
		}
	});

};

/**
 * Utility method for executing the initial server-side step of an upload
 * procedure.
 * 
 * @param res
 * @param docid
 * @param attachid
 * @param data
 * @param user
 * @return
 */
ApiHandler.prototype._createUpload = function(res, docid, attachid, data, user) {

	if (!data.attachment.contentType || data.attachment.contentLength < 0) {
		res.send(400);
		return;
	}
	if (!this.mediaTypes.mimetypes[data.attachment.contentType]) {
		res.send(415);
		return;
	}
	else {
		data.attachment.extension = this.mediaTypes.mimetypes[data.attachment.contentType].extension;
	}

	if (data.attachment.contentLength > this.mediaTypes.mimetypes[data.attachment.contentType].maxsize) {
		res.send(413);
		return;
	}

	var path = docid + '/' + attachid + data.attachment.extension;
	var that = this;

	this.pool.db('entries').insert(ENTRY.ATTACHMENT.PREFIX + "-" + attachid, {
		type : ENTRY.ATTACHMENT.TYPE,
		mime : data.attachment.contentType,
		size : data.attachment.contentLength,
		doc_id : docid,
		uploader : user,
		uploaded : new Date()
	}, function(err, dbRes) {
		if (err && err.error === 'conflict') {
			res.send(409);
		}
		else {
			var key = that.signer.signRequest('PUT', user, '/' + path, data.attachment.contentLength, data.attachment.contentType);
			var location = that.config.mediaserver.uri + path;
			var uri = location + "?key=" + key;

			var response = {
				'upload' : {
					'key' : key,
					'location' : location,
					'uri' : uri
				}
			};
			res.send(202, {}, response);
		}
	});

};

/**
 * Returns static server information.
 * 
 * @param res
 * @return
 */
ApiHandler.prototype.getServiceInfo = function(res) {
	var result = {};
	result.version = "v1";
	result.deployment = {};
	result.service = {};
	result.mediaserver = {};
	result.deployment.title = this.config.deployment.title;
	result.deployment.contact = this.config.deployment.contact;
	result.deployment.website = this.config.deployment.website;
	result.service.uri = this.config.apiserver.uri;
	result.mediaserver.uri = this.config.mediaserver.uri;
	res.send(200, {}, result);

	// var db = this.pool.db('entries');
	//
	// db.spatial("entries/docsByLoc", [ 10, 10, 90, 90 ], {
	// count : true
	// }, function(err, dbRes) {
	// // dbRes.forEach(function (row) {
	// // sys.puts(row.id + " is at " +
	// // row.bbox + ".");
	// // });
	// sys.log(dbRes.count);
	// res.send(200, {}, dbRes);
	// });
};

/**
 * Publishes an attachment after successful upload.
 * 
 * @param res
 * @param docid
 * @param attachid
 * @param acceptKey
 * @param user
 * @return
 */
ApiHandler.prototype.publishAttachment = function(res, docid, attachid, acceptKey, user) {
	var that = this;

	var db = this.pool.db('entries');

	db.get(ENTRY.ATTACHMENT.PREFIX + "-" + attachid, function(err, doc) {
		if (err) {
			if (err.error == 'not_found') {
				res.send(404);

			}
			else {
				res.send(500);

			}
		}
		else {
			if (doc.uploader !== user) {
				res.send(403);
			}
			else {

				var extension = that.mediaTypes.mimetypes[doc.mime].extension;
				var path = docid + "/" + attachid + extension;

				var expectedKey = that.signer.signResponse(201, user, "/" + path);
				if (!!(acceptKey === expectedKey)) {
					db.save(ENTRY.ATTACHMENT.PREFIX + "-" + attachid, {
						location : that.config.mediaserver.uri + path
					}, function(err, dbRes) {
						if (err) {
							res.send(500);
							return;
						}
						else {
							if (docid === attachid) {
								db.get(ENTRY.DOCUMENT.PREFIX + "-" + docid, function(err, doc) {
									if (err) {
										res.send(500);
									}
									else {
										db.save(ENTRY.DOCUMENT.PREFIX + "-" + docid, {
											published : true
										}, function(err, dbRes) {
											if (err) {
												res.send(500);
											}
											else {
												res.send(204);
											}
										});
									}
								});

							}
							else {
								res.send(204);
							}
						}
					});
				}
				else {
					res.send(403);
					return;
				}
			}
		}
	});
};

/**
 * Creates a link between documents
 * 
 * @param res
 * @param linkData
 * @param user
 * @return
 */
ApiHandler.prototype.createLink = function(res, linkData, user) {
	var that = this;
	sys.log(sys.inspect(linkData));
	if (linkData.src && linkData.dest && linkData.desc && linkData.title && (linkData.src !== linkData.dest)) {
		if (linkData.title.length < 6 || linkData.title.length > 256) {
			res.send(400);
		}
		else if (linkData.title.desc > 1024) {
			res.send(400);
		}
		else {
			var linkId = "";
			var b = new (util.Barrier)(3, function() {
				that.pool.db('entries').insert(ENTRY.LINK.PREFIX + "-" + linkId, {
					type : ENTRY.LINK.TYPE,
					src : linkData.src,
					dest : linkData.dest,
					title : linkData.title,
					desc : linkData.desc,
					'user' : user,
					created : new Date()
				}, function(err, dbRes) {
					if (err) {
						res.send(500);
					}
					else {
						res.send(201, {
							'Location' : that.basePath + 'links/' + linkId
						}, null);

					}
				});
			}, function() {
				res.send(500);
			});
			var ids = [ linkData.src, linkData.dest ];
			ids.forEach(function(a) {
				that.pool.db('entries').get(ENTRY.DOCUMENT.PREFIX + "-" + a, function(err, doc) {
					if (err) {
						if (err.error == 'not_found') {
							b.abort(function() {
								res.send(404);
							});

						}
						else {
							b.abort(function() {
								res.send(500);
							});

						}
					}
					else {
						b.submit();
					}
				});
			});
			that.pool.conn('entries').uuids(1, function(err, doc) {
				if (err) {
					b.abort(function() {
						res.send(500);
					});
				}
				else {
					linkId = util.toUUID(doc.pop());
					b.submit();
				}
			});

		}
	}
	else {
		sys.log("oops");
		res.send(400);
	}
};

/**
 * Returns a link by id
 * 
 * @param res
 * @param linkId
 * @return
 */
ApiHandler.prototype.getLink = function(res, linkId) {
	var that = this;
	that.pool.db('entries').get(ENTRY.LINK.PREFIX + "-" + linkId, function(err, doc) {
		if (err) {
			if (err.error == 'not_found') {

				res.send(404);
			}
			else {
				res.send(500, {}, err);
			}
		}
		else {
			res.send(200, {}, {
				id : linkId,
				src : doc.src,
				dest : doc.dest,
				title : doc.title,
				desc : doc.desc,
				created : doc.created,
				user : doc.user
			});
		}
	});
};

// ApiHandler.prototype.removeLink = function(res, linkId, user)
// {
// var that = this;
// };

/**
 * Returns a list of inbound links by document id
 * 
 * @param res
 * @param docId
 * @return
 */
ApiHandler.prototype.getInboundLinksByDoc = function(res, docId) {
	this._getBoundLinksByDoc(res, docId, "in");
};

/**
 * Returns a list of outbound links by document id
 * 
 * @param res
 * @param docId
 * @return
 */
ApiHandler.prototype.getOutboundLinksByDoc = function(res, docId) {
	this._getBoundLinksByDoc(res, docId, "out");
};

/**
 * Queries a view for in-/outbound links per document
 * 
 * @param res
 * @param docId
 * @return
 */
ApiHandler.prototype._getBoundLinksByDoc = function(res, docId, type) {
	var that = this;
	this.pool.db('entries').view('entries/docsById', {
		startkey : [ docId, (type === 'in') ? 4 : 5 ],
		endkey : [ docId, (type === 'in') ? 4 : 5, {} ],
		include_docs : true
	}, function(err, dbRes) {
		if (err) {
			res.send(500);
		}
		else {
			var result = [];
			dbRes.forEach(function(row) {
				var doc = row.doc;
				doc.id = doc._id.substring(2);
				delete doc._id;
				delete doc._rev;
				delete doc.type;
				result.push(doc);
			});
			if (result.length > 0) {
				res.send(200, {}, {
					links : result
				});
			}
			else {
				// Nothing found! => check if document exists at all
			that.pool.db('entries').get(ENTRY.DOCUMENT.PREFIX + "-" + docId, function(err, doc) {
				if (err) {
					if (err.error == 'not_found') {
						res.send(404);
					}
					else {
						res.send(500);
					}
				}
				else {
					res.send(200, {}, {
						links : []
					});
				}
			});
		}
	}
}	);
};

ApiHandler.prototype.getDocumentsByCursor = function(res, order, cursor) {
	var result = {};

	var db = this.pool.db('entries');

	var desc = (order === "descending") ? true : false;

	db.get(ENTRY.DOCUMENT.PREFIX + "-" + cursor, function(err, doc) {
		if (err) {
			if (err.error == 'not_found') {
				res.send(404);

			}
			else {
				res.send(500);

			}
		}
		else {
			var key = [ doc.uploaded, ENTRY.DOCUMENT.PREFIX + "-" + cursor ];
			var b = new (util.Barrier)(2, function() {
				res.send(200, {}, result);
			}, function() {
				res.send(500);
			});

			db.view("entries/docsByUploadDate", {
				limit : PAGINATION_SIZE + 1,
				startkey : key,
				include_docs : true,
				descending : desc
			}, function(err, dbRes) {
				if (err) {
					b.abort();
				}
				else {
					var documentList = [];
					var i = 0;
					for (; i < PAGINATION_SIZE && i < dbRes.rows.length; i++) {
						documentList.push( {
							id : dbRes.rows[i].value.id,
							type : dbRes.rows[i].doc.mediatype
						});
					}
					result['documents'] = documentList;
					if (i == PAGINATION_SIZE && dbRes.rows[i]) {
						result['next'] = dbRes.rows[i].value.id;
					}
					result['total'] = dbRes.total_rows;
					b.submit();
				}
			});
			db.view("entries/docsByUploadDate", {
				limit : PAGINATION_SIZE + 1,
				startkey : key,
				descending : !desc
			}, function(err, dbRes) {
				if (err) {
					b.abort();
				}
				else {
					if (dbRes.rows.length > 1) {
						result['previous'] = dbRes.rows[dbRes.rows.length - 1].value.id;
					}
					b.submit();
				}

			});
		}
	});

};

ApiHandler.prototype.getDocuments = function(res, order) {
	var desc = (order === "descending") ? true : false;
	var that = this;
	this.pool.db('entries').view('entries/docsByUploadDate', {
		limit : 1,
		descending : desc
	}, function(err, dbRes) {
		if (err) {
			res.send(500);
		}
		else {
			res.send(303, {
				'Location' : that.basePath + 'documents/' + order + '/cursor/' + dbRes.rows[0].id.substr(2)
			}, null);

		}
	});

};

ApiHandler.prototype.getAttachmentsByCursor = function(res, order, cursor) {
	var result = {};

	var db = this.pool.db('entries');

	var desc = (order === "descending") ? true : false;

	db.get(ENTRY.ATTACHMENT.PREFIX + "-" + cursor, function(err, doc) {
		if (err) {
			if (err.error === 'not_found') {
				res.send(404);

			}
			else {
				res.send(500);

			}
		}
		else {
			var key = [ doc.uploaded, ENTRY.ATTACHMENT.PREFIX + "-" + cursor ];
			var b = new (util.Barrier)(2, function() {
				res.send(200, {}, result);
			}, function() {
				res.send(500);
			});

			db.view("entries/attachmentsByDate", {
				limit : PAGINATION_SIZE + 1,
				startkey : key,
				include_docs : true,
				descending : desc
			}, function(err, dbRes) {
				if (err) {
					b.abort();
				}
				else {
					var attachList = [];
					var i = 0;
					for (; i < PAGINATION_SIZE && i < dbRes.rows.length; i++) {
						attachList.push( {
							id : dbRes.rows[i].value.id,
							mimetype : dbRes.rows[i].doc.mimetype
						});
					}
					result['attachments'] = attachList;
					if (i == PAGINATION_SIZE && dbRes.rows[i]) {
						result['next'] = dbRes.rows[i].value.id;
					}
					result['total'] = dbRes.total_rows;
					b.submit();
				}
			});
			db.view("entries/attachmentsByDate", {
				limit : PAGINATION_SIZE + 1,
				startkey : key,
				descending : !desc
			}, function(err, dbRes) {
				if (err) {
					b.abort();
				}
				else {
					if (dbRes.rows.length > 1) {
						result['previous'] = dbRes.rows[dbRes.rows.length - 1].value.id;
					}
					b.submit();
				}

			});
		}
	});

};

ApiHandler.prototype.getAttachments = function(res, order) {
	var desc = (order === "descending") ? true : false;
	var that = this;
	this.pool.db('entries').view('entries/attachmentsByDate', {
		limit : 1,
		descending : desc
	}, function(err, dbRes) {
		if (err) {
			res.send(500);
		}
		else {
			res.send(303, {
				'Location' : that.basePath + 'attachments/' + order + '/cursor/' + dbRes.rows[0].id.substr(2)
			}, null);

		}
	});

};

ApiHandler.prototype.unaliasAttachment = function(res, attachid) {
	var that = this;
	this.pool.db('entries').get(ENTRY.ATTACHMENT.PREFIX + "-" + attachid, function(err, doc) {
		if (err) {
			if (err.error === 'not_found') {
				res.send(404);

			}
			else {
				res.send(500);

			}
		}
		else {
			res.send(303, {
				'Location' : that.basePath + 'documents/' + doc.doc_id + '/attachments/' + doc._id.substr(2)
			}, null);
		}
	});
};

ApiHandler.prototype.unaliasPosition = function(res, posid) {
	var that = this;
	this.pool.db('entries').get(ENTRY.SPATIAL.PREFIX + "-" + posid, function(err, doc) {
		if (err) {
			if (err.error === 'not_found') {
				res.send(404);

			}
			else {
				res.send(500);

			}
		}
		else {
			res.send(303, {
				'Location' : that.basePath + 'documents/' + doc.doc_id + '/position/' + doc._id.substr(2)
			}, null);
		}
	});
};

ApiHandler.prototype.unaliasComment = function(res, commentId) {
	var that = this;
	this.pool.db('entries').get(ENTRY.COMMENT.PREFIX + "-" + commentId, function(err, doc) {
		if (err) {
			if (err.error === 'not_found') {
				res.send(404);

			}
			else {
				res.send(500);

			}
		}
		else {
			if (doc.commentType === ENTRY.ATTACHMENT.TYPE) {
				res.send(303, {
					'Location' : that.basePath + 'documents/' + doc.doc_id + '/attachments/' + doc.attachmentId + '/comments/' + commentId
				}, null);
			}
			else if (doc.commentType === ENTRY.LINK.TYPE) {
				sys.log(sys.inspect(doc));
				res.send(303, {
					'Location' : that.basePath + 'links/' + doc.link_id + '/comments/' + commentId
				}, null);
			}
			else {
				res.send(500);
			}
		}
	});
};

ApiHandler.prototype.unaliasTag = function(res, tagid) {
	var that = this;
	this.pool.db('entries').get(ENTRY.TAG.PREFIX + "-" + tagid, function(err, doc) {
		if (err) {
			if (err.error === 'not_found') {
				res.send(404);

			}
			else {
				res.send(500);

			}
		}
		else {
			if (doc.tagType === ENTRY.ATTACHMENT.TYPE) {
				res.send(303, {
					'Location' : that.basePath + 'documents/' + doc.doc_id + '/attachments/' + doc.attachmentId + '/tags/' + tagid
				}, null);
			}
			else if (doc.tagType === ENTRY.LINK.TYPE) {
				sys.log(sys.inspect(doc));
				res.send(303, {
					'Location' : that.basePath + 'links/' + doc.link_id + '/tags/' + tagid
				}, null);
			}
			else {
				res.send(500);
			}
		}
	});
};

ApiHandler.prototype.unaliasTime = function(res, timeId) {
	var that = this;
	this.pool.db('entries').get(ENTRY.TEMPORAL.PREFIX + "-" + timeId, function(err, doc) {
		if (err) {
			if (err.error === 'not_found') {
				res.send(404);

			}
			else {
				res.send(500);

			}
		}
		else {
			res.send(303, {
				'Location' : that.basePath + 'documents/' + doc.doc_id + '/times/' + doc._id.substr(2)
			}, null);
		}
	});
};

ApiHandler.prototype.getPositionsByDocumentId = function(res, docId) {
	var that = this;
	that.pool.db('entries').get(ENTRY.DOCUMENT.PREFIX + "-" + docId, function(err, doc) {
		if (err) {
			if (err.error === 'not_found') {
				res.send(404);

			}
			else {
				res.send(500);

			}
		}
		else {
			that.pool.db('entries').view('entries/posByDoc', {
				startkey : [ docId ],
				endkey : [ docId, {} ],
				include_docs : true
			}, function(err, dbRes) {
				if (err) {
					res.send(500);
				}
				else {
					if (dbRes.rows.length === 0) {
						res.send(204);
					}
					else {
						var posList = [];

						for ( var i = 0; i < dbRes.rows.length; i++) {
							sys.log(sys.inspect(dbRes.rows[i]));
							posList.push( {
								id : dbRes.rows[i].key[1],
								"location" : {
									"position" : {
										"type" : "Point",
										"coordinates" : [ dbRes.rows[i].doc.lon || 0, dbRes.rows[i].doc.lat || 0, ]
									},
									"variance" : dbRes.rows[i].doc.variance || 0
								}

							});
						}

						res.send(200, {}, {
							positions : posList
						});
					}

				}
			});
		}
	});

};

ApiHandler.prototype.getDocumentsByUploadDate = function(res, order, date) {
	var desc = (order === "before") ? true : false;
	var that = this;
	this.pool.db('entries').view('entries/docsByUploadDate', {
		limit : 1,
		descending : desc,
		startkey : [ date ]
	}, function(err, dbRes) {
		if (err) {
			res.send(500);
		}
		else {
			if (dbRes.rows.length === 0) {
				res.send(204);
			}
			else {
				res.send(303, {
					'Location' : that.basePath + 'documents/' + (desc === true ? 'descending' : 'ascending') + '/cursor/' + dbRes.rows[0].id.substr(2)
				}, null);
			}

		}
	});

};

ApiHandler.prototype.getDocument = function(res, docid) {
	this.pool.db('entries').get(ENTRY.DOCUMENT.PREFIX + "-" + docid, function(err, doc) {
		if (err) {
			if (err.error === 'not_found') {
				res.send(404);

			}
			else {
				res.send(500);

			}
		}
		else {
			if (doc.published) {
				res.send( {
					id : docid,
					mediatype : doc.mediatype,
					owner : doc.owner,
					uploaded : doc.uploaded
				});
			}
			else {
				res.send(202, {
					id : docid,
					mediatype : doc.mediatype,
					owner : doc.owner,
					uploaded : doc.uploaded
				});
			}
		}
	});
};

ApiHandler.prototype.getDocumentAttachmentIds = function(res, docid) {
	var db = this.pool.db('entries');
	this.pool.db('entries').get(ENTRY.DOCUMENT.PREFIX + "-" + docid, function(err, doc) {
		if (err) {
			if (err.error === 'not_found') {
				res.send(404);

			}
			else {
				res.send(500);

			}
		}
		else {

			db.view("entries/docsById", {
				startkey : [ docid, 1 ],
				endkey : [ docid, 1, {} ]
			}, function(err, dbRes) {
				if (err) {
					res.send(500);
				}
				else {
					var result = {
						documentId : docid
					};
					var attachmentIds = [];
					sys.log(dbRes.rows.length);
					for ( var i = 0; i < dbRes.rows.length; i++) {
						attachmentIds.push(dbRes.rows[i].id.substring(2));
					}
					result['attachmentIds'] = attachmentIds;
					res.send(result);
				}
			});
		}

	});
};

ApiHandler.prototype.getAttachment = function(res, docid, attachid) {
	this.pool.db('entries').get(ENTRY.ATTACHMENT.PREFIX + "-" + attachid, function(err, doc) {
		if (err) {
			if (err.error === 'not_found') {
				res.send(404);

			}
			else {
				res.send(500);

			}
		}
		else {
			if (doc.location) {
				res.send( {
					attachmentId : doc._id.substring(2),
					docId : doc.doc_id,
					mimetype : doc.mime,
					size : doc.size,
					uploader : doc.uploader,
					uploaded : doc.uploaded,
					location : doc.location
				});
			}
			else {
				res.send(202, {
					attachmentId : doc._id.substring(2),
					docId : doc.doc_id,
					mimetype : doc.mime,
					size : doc.size,
					uploader : doc.uploader,
					uploaded : doc.uploaded,
					location : ""
				});
			}
		}
	});
};

/**
 * Returns a position by id
 * 
 * @param res
 * @param posId
 * @return
 */
ApiHandler.prototype.getPositionById = function(res, posId) {
	var that = this;
	that.pool.db('entries').get(ENTRY.SPATIAL.PREFIX + "-" + posId, function(err, doc) {
		if (err) {
			if (err.error === 'not_found') {

				res.send(404);
			}
			else {
				res.send(500, {}, err);
			}
		}
		else {
			res.send(200, {}, {
				id : posId,
				docId : doc.doc_id,
				submitted : doc.submitted || "",
				user : doc.by_user,
				"location" : {
					"position" : {
						"type" : "Point",
						"coordinates" : [ doc.lon || 0, doc.lat || 0, ]
					},
					"variance" : doc.variance || 0
				}

			});
		}
	});
};

/**
 * Returns a position by id
 * 
 * @param res
 * @param posId
 * @return
 */
ApiHandler.prototype.getAttachmentCommentById = function(res, commentId) {
	var that = this;
	that.pool.db('entries').get(ENTRY.COMMENT.PREFIX + "-" + commentId, function(err, doc) {
		if (err) {
			if (err.error === 'not_found') {

				res.send(404);
			}
			else {
				res.send(500, {}, err);
			}
		}
		else {
			res.send(200, {}, {
				comment_id : commentId,
				doc_id : doc.doc_id,
				attachment_id : doc.attachmentId,
				created : doc.created || "",
				type : doc.type || "text/plain",
				user : doc.user,
				comment : doc.comment
			});
		}
	});
};

ApiHandler.prototype.getLinkCommentById = function(res, commentId) {
	var that = this;
	that.pool.db('entries').get(ENTRY.COMMENT.PREFIX + "-" + commentId, function(err, doc) {
		if (err) {
			if (err.error === 'not_found') {

				res.send(404);
			}
			else {
				res.send(500, {}, err);
			}
		}
		else {
			res.send(200, {}, {
				comment_id : commentId,
				link_id : doc.link_id,
				created : doc.created || "",
				type : doc.type || "text/plain",
				user : doc.user,
				comment : doc.comment
			});
		}
	});
};

ApiHandler.prototype.getCommentsByAttachmentId = function(res, docid, attachId) {

	var result = {};

	var dbEntries = this.pool.db('entries');

	var that = this;

	var b = new (util.Barrier)(2, function() {

		dbEntries.view("entries/commentsByAttachment", {
			startkey : [ docid, attachId ],
			endkey : [ docid, attachId, {} ],
			include_docs : true
		}, function(err, dbRes) {
			if (err) {
				res.send(500);
				sys.log(sys.inspect(err));
			}
			else {
				var commentList = [];
				for (i = 0; i < PAGINATION_SIZE && i < dbRes.rows.length; i++) {
					commentList.push( {
						comment_id : dbRes.rows[i].doc._id.substring(2),
						doc_id : dbRes.rows[i].doc.doc_id,
						attachment_id : dbRes.rows[i].doc.attachmentId,
						user : dbRes.rows[i].doc.user,
						comment : dbRes.rows[i].doc.comment,
						created : dbRes.rows[i].doc.created
					});
				}
				result['comments'] = commentList;

				result['total'] = dbRes.total_rows;

				res.send(200, {}, result);
			}
		});
	}, function() {
		res.send(500);
	});

	// Check if document ID exists
	that.pool.db('entries').get(ENTRY.DOCUMENT.PREFIX + "-" + docid, function(err, doc) {
		if (err && err.error === 'not_found') {
			b.abort(function() {
				res.send(404);
			});
		}
		else if (err) {
			b.abort();

		}
		else {
			b.submit();
		}

	});

	// Check if attachment ID exists
	that.pool.db('entries').get(ENTRY.ATTACHMENT.PREFIX + "-" + attachId, function(err, doc) {
		if (err && err.error === 'not_found') {
			b.abort(function() {
				res.send(404);
			});
		}
		else if (err) {
			b.abort();

		}
		else {
			b.submit();
		}
	});

};

ApiHandler.prototype.getCommentsByLinkId = function(res, linkId) {

	var result = {};

	var dbEntries = this.pool.db('entries');

	var that = this;

	var b = new (util.Barrier)(1, function() {

		dbEntries.view("entries/commentsByLink", {
			startkey : [ linkId ],
			endkey : [ linkId, {} ],
			include_docs : true
		}, function(err, dbRes) {
			if (err) {
				res.send(500);
				sys.log(sys.inspect(err));
			}
			else {
				var commentList = [];
				for (i = 0; i < PAGINATION_SIZE && i < dbRes.rows.length; i++) {
					commentList.push( {
						comment_id : dbRes.rows[i].doc._id.substring(2),
						link_id : dbRes.rows[i].doc.link_id,
						user : dbRes.rows[i].doc.user,
						comment : dbRes.rows[i].doc.comment,
						created : dbRes.rows[i].doc.created
					});
				}
				result['comments'] = commentList;

				result['total'] = dbRes.total_rows;

				res.send(200, {}, result);
			}
		});
	}, function() {
		res.send(500);
	});

	// Check if document ID exists
	that.pool.db('entries').get(ENTRY.LINK.PREFIX + "-" + linkId, function(err, doc) {
		if (err && err.error === 'not_found') {
			b.abort(function() {
				res.send(404);
			});
		}
		else if (err) {
			b.abort();

		}
		else {
			b.submit();
		}

	});
};

ApiHandler.prototype.createAttachmentComment = function(res, docid, attachid, data, user) {

	sys.log(sys.inspect(data));

	var that = this;

	// Check if provided data are correct
	if (!data.comment || data.comment.length < 3) {
		res.send(400, {}, {
			error : "invalid comment"
		});
		return;
	}
	else if (data.comment.length > 1000) {
		res.send(400, {}, {
			error : "comment too long"
		});
		return;
	}

	var db = this.pool.db('entries');

	var commentid = "";

	var b = new (util.Barrier)(3, function() {

		that.pool.db('entries').insert(ENTRY.COMMENT.PREFIX + "-" + commentid, {
			type : ENTRY.COMMENT.TYPE,
			doc_id : docid,
			attachmentId : attachid,
			comment : data.comment,
			type : "text/plain",
			'user' : user,
			created : new Date(),
			commentType : ENTRY.ATTACHMENT.TYPE
		}, function(err, dbRes) {
			if (err) {
				res.send(500);
			}
			else {
				res.send(201, {
					'Location' : that.basePath + 'comments/' + commentid
				}, null);

			}
		});

	}, function() {
		res.send(500);
	});

	// Get UUID for comment
	that.pool.conn('entries').uuids(1, function(err, doc) {
		if (err) {
			b.abort(function() {
				res.send(500);
			});
		}
		else {
			commentid = util.toUUID(doc.pop());
			b.submit();
		}
	});

	// Check if document ID exists
	that.pool.db('entries').get(ENTRY.DOCUMENT.PREFIX + "-" + docid, function(err, doc) {
		if (err) {
			b.abort();
		}
		else {
			b.submit();
		}
	});

	// Check if attachment ID exists
	that.pool.db('entries').get(ENTRY.ATTACHMENT.PREFIX + "-" + attachid, function(err, doc) {
		if (err) {
			b.abort();
		}
		else {
			b.submit();
		}
	});

};

ApiHandler.prototype.createLinkComment = function(res, linkid, data, user) {

	sys.log(sys.inspect(data));

	var that = this;

	// Check if provided data are correct
	if (!data.comment || data.comment.length < 3) {
		res.send(400, {}, {
			error : "invalid comment"
		});
		return;
	}
	else if (data.comment.length > 1000) {
		res.send(400, {}, {
			error : "comment too long"
		});
		return;
	}

	var db = this.pool.db('entries');

	var commentid = "";

	var b = new (util.Barrier)(2, function() {

		that.pool.db('entries').insert(ENTRY.COMMENT.PREFIX + "-" + commentid, {
			type : ENTRY.COMMENT.TYPE,
			link_id : linkid,
			comment : data.comment,
			type : "text/plain",
			'user' : user,
			created : new Date(),
			commentType : ENTRY.LINK.TYPE
		}, function(err, dbRes) {
			if (err) {
				res.send(500);
			}
			else {
				res.send(201, {
					'Location' : that.basePath + 'comments/' + commentid
				}, null);

			}
		});

	}, function() {
		res.send(500);
	});

	// Get UUID for comment
	that.pool.conn('entries').uuids(1, function(err, doc) {
		if (err) {
			b.abort(function() {
				res.send(500);
			});
		}
		else {
			commentid = util.toUUID(doc.pop());
			b.submit();
		}
	});

	// Check if link ID exists
	that.pool.db('entries').get(ENTRY.LINK.PREFIX + "-" + linkid, function(err, doc) {
		if (err && err.error === 'not_found') {
			b.abort(function() {
				res.send(404);
			});
		}
		else if (err) {
			b.abort(function() {
				res.send(500);
			});
		}
		else {
			b.submit();
		}
	});

};

ApiHandler.prototype.getDocumentIdsByBbox = function(res, lat1, lon1, lat2, lon2) {

	var that = this;

	that.pool.db('entries').spatial('entries/docsByLoc', [ lon1, lat1, lon2, lat2 ], function(err, dbRes) {
		if (err) {
			res.send(500);
		}
		else {
			var posList = [];
			dbRes.forEach(function(row) {
				posList.push( {
					doc_id : row.value.id,
					position_id : row.id.substring(2),
					"location" : {
						"position" : {
							"type" : "Point",
							"coordinates" : [ row.value.lon || 0, row.value.lat || 0, ]
						},
						"variance" : row.value.variance || 0
					}
				});
			});
			res.send(200, {}, {
				"positions" : posList
			});
		}
	});

};

ApiHandler.prototype.getDocumentIdsByTime = function(res, after, before) {
	var that = this;

	var begin = Math.round(new Date(after).getTime() / 1000);
	var end = Math.round(new Date(before).getTime() / 1000);

	that.pool.db('entries').spatial('entries/docsByTime', [ 0, begin, 0, end ], function(err, dbRes) {
		if (err) {
			res.send(500);
		}
		else {
			var timeList = [];
			dbRes.forEach(function(row) {
				timeList.push( {
					doc_id : row.value.id,
					time_id : row.id.substring(2),
					"date" : {
						"after" : row.value.after,
						"before" : row.value.before
					}
				});
			});
			res.send(200, {}, {
				"times" : timeList
			});
		}
	});
};

ApiHandler.prototype.getTimeById = function(res, timeId) {
	var that = this;
	that.pool.db('entries').get(ENTRY.TEMPORAL.PREFIX + "-" + timeId, function(err, doc) {
		if (err) {
			if (err.error === 'not_found') {

				res.send(404);
			}
			else {
				res.send(500, {}, err);
			}
		}
		else {
			res.send(200, {}, {
				time_id : timeId,
				doc_id : doc.doc_id,
				submitted : doc.submitted || "",
				user : doc.by_user,
				"date" : {
					"after" : doc.after,
					"before" : doc.before
				}

			});
		}
	});
};

ApiHandler.prototype.getTimesByDocumentId = function(res, docId) {
	var that = this;
	that.pool.db('entries').get(ENTRY.DOCUMENT.PREFIX + "-" + docId, function(err, doc) {
		if (err) {
			if (err.error === 'not_found') {
				res.send(404);

			}
			else {
				res.send(500);

			}
		}
		else {
			that.pool.db('entries').view('entries/timesByDoc', {
				startkey : [ docId ],
				endkey : [ docId, {} ],
				include_docs : true
			}, function(err, dbRes) {
				if (err) {
					res.send(500);
				}
				else {
					if (dbRes.rows.length === 0) {
						res.send(204);
					}
					else {
						var timesList = [];

						for ( var i = 0; i < dbRes.rows.length; i++) {
							sys.log(sys.inspect(dbRes.rows[i]));
							timesList.push( {
								time_id : dbRes.rows[i].key[1],
								submitted : dbRes.rows[i].doc.submitted || "",
								user : dbRes.rows[i].doc.by_user,
								"date" : {
									"after" : dbRes.rows[i].doc.after,
									"before" : dbRes.rows[i].doc.before
								}

							});
						}

						res.send(200, {}, {
							times : timesList
						});
					}

				}
			});
		}
	});

};

ApiHandler.prototype.doVote = function(res, userId, entityType, entityId, vote) {

	var that = this;

	var voteKey = ENTRY.VOTE.PREFIX + "-" + userId + "--" + entityType.PREFIX + "-" + entityId;

	var voteValue = vote || 0;
	voteValue = voteValue > 0 ? 1 : voteValue;
	voteValue = voteValue < 0 ? -1 : voteValue;

	that.pool.db('entries').get(voteKey, function(err, doc) {
		if (err) {
			that.pool.db('entries').insert(voteKey, {
				type : ENTRY.VOTE.TYPE,
				submitted : new Date(),
				user : userId,
				entity_id : entityType.PREFIX + "-" + entityId,
				vote : voteValue
			}, function(err, dbRes) {
				if (err) {
					res.send(500);
				}
				else {
					res.send(201);
				}
			});
		}
		else {
			that.pool.db('entries').save(voteKey, {
				type : ENTRY.VOTE.TYPE,
				submitted : new Date(),
				user : userId,
				entity_id : entityType.PREFIX + "-" + entityId,
				vote : voteValue
			}, function(err, dbRes) {
				if (err) {
					res.send(500);
				}
				else {
					res.send(202);
				}
			});
		}
	});
};

ApiHandler.prototype.deleteVote = function(res, userId, entityType, entityId) {
	var that = this;

	var voteKey = ENTRY.VOTE.PREFIX + "-" + userId + "--" + entityType.PREFIX + "-" + entityId;

	that.pool.db('entries').get(voteKey, function(err, doc) {
		if (err) {
			if (err.error === 'not_found') {
				res.send(404);

			}
			else {
				res.send(500);

			}
		}
		else {

			that.pool.db('entries').remove(voteKey, function(err, dbRes) {
				if (err) {
					res.send(500);
				}
				else {

					res.send(204);

				}
			});
		}
	});
};

ApiHandler.prototype.listVotes = function(res, userId, entityType, entityId) {
	var that = this;

	var key = entityType.PREFIX + "-" + entityId;

	var userVoteKey = ENTRY.VOTE.PREFIX + "-" + userId + "--" + entityType.PREFIX + "-" + entityId;

	var result = {
		'votes' : {
			'user' : 0,
			'up' : 0,
			'down' : 0
		}
	};

	var b = new (util.Barrier)(2, function() {

		res.send(200, {}, result);

	}, function() {
		res.send(500);
	});

	that.pool.db('entries').view('entries/votes', {
		startkey : [ key ],
		endkey : [ key, {} ],
		group_level : 2
	}, function(err, dbRes) {
		if (err) {
			sys.log(err);
			b.abort();
		}
		else {

			if (dbRes.rows.length === 0) {

				b.submit();
			}
			else {
				dbRes.forEach(function(row) {
					sys.log(sys.inspect(row));
					if (row.key && row.key[1] === "up") {
						result['votes']['up'] = row.value;
					}
					else if (row.key && row.key[1] === "down") {
						result['votes']['down'] = row.value;
					}
				});
				b.submit();
			}
		}
	});

	that.pool.db('entries').get(userVoteKey, function(err, doc) {
		if (err) {
			if (err.error == 'not_found') {
				result['votes']['user'] = 0;
				b.submit();
			}
			else {
				b.abort();

			}
		}
		else {
			result['votes']['user'] = doc.vote > 0 ? 1 : doc.vote;
			result['votes']['user'] = doc.vote < 0 ? -1 : doc.vote;
			b.submit();
		}
	});

};

ApiHandler.prototype.getTagsByAttachment = function(res, docid, attachid) {
	var result = {};

	var dbEntries = this.pool.db('entries');

	var that = this;

	var b = new (util.Barrier)(2, function() {

		dbEntries.view("entries/tagsByAttachment", {
			startkey : [ docid, attachid ],
			endkey : [ docid, attachid, {} ],
			include_docs : true
		}, function(err, dbRes) {
			if (err) {
				res.send(500);
				sys.log(sys.inspect(err));
			}
			else {
				var tagList = [];
				for (i = 0; i < PAGINATION_SIZE && i < dbRes.rows.length; i++) {
					tagList.push( {
						tag_id : dbRes.rows[i].doc._id.substring(2),
						tag : dbRes.rows[i].doc.tag
					});
				}
				result['tags'] = tagList;

				result['total'] = dbRes.total_rows;

				res.send(200, {}, result);
			}
		});
	}, function() {
		res.send(500);
	});

	// Check if document ID exists
	that.pool.db('entries').get(ENTRY.DOCUMENT.PREFIX + "-" + docid, function(err, doc) {
		if (err && err.error === 'not_found') {
			b.abort(function() {
				res.send(404);
			});
		}
		else if (err) {
			b.abort();

		}
		else {
			b.submit();
		}

	});

	// Check if attachment ID exists
	that.pool.db('entries').get(ENTRY.ATTACHMENT.PREFIX + "-" + attachid, function(err, doc) {
		if (err && err.error === 'not_found') {
			b.abort(function() {
				res.send(404);
			});
		}
		else if (err) {
			b.abort();

		}
		else {
			b.submit();
		}
	});
};

ApiHandler.prototype.getAttachmentTagById = function(res, docid, attachid, tagid) {
	var that = this;
	that.pool.db('entries').get(ENTRY.TAG.PREFIX + "-" + tagid, function(err, doc) {
		if (err) {
			if (err.error === 'not_found') {

				res.send(404);
			}
			else {
				res.send(500, {}, err);
			}
		}
		else {
			res.send(200, {}, {
				tag_id : tagid,
				doc_id : doc.doc_id,
				attachment_id : doc.attachmentId,
				created : doc.created || "",
				user : doc.user,
				tag : doc.tag
			});
		}
	});
};

ApiHandler.prototype.createAttachmentTag = function(res, user, docid, attachid, data) {
	sys.log(sys.inspect(data));

	var that = this;

	// Check if provided data are correct
	if (!data.tag || data.tag.length < 3) {
		res.send(400, {}, {
			error : "invalid tag"
		});
		return;
	}
	else if (data.tag.length > 100) {
		res.send(400, {}, {
			error : "tag too long"
		});
		return;
	}
	else if (typeof data.tag !== 'string') {
		res.send(400, {}, {
			error : "non-string tag"
		});
		return;
	}

	var hasher = crypto.createHash('md5');
	hasher.update(data.tag);
	var tagid = hasher.digest('hex');

	var tagKey = tagid + "--" + ENTRY.ATTACHMENT.PREFIX + "-" + attachid;

	var db = this.pool.db('entries');

	var b = new (util.Barrier)(2, function() {

		that.pool.db('entries').insert(ENTRY.TAG.PREFIX + "-" + tagKey, {
			type : ENTRY.TAG.TYPE,
			doc_id : docid,
			attachmentId : attachid,
			tag : data.tag,
			'user' : user,
			created : new Date(),
			tagType : ENTRY.ATTACHMENT.TYPE
		}, function(err, dbRes) {
			if (err) {
				if (err.error === 'conflict') {
					res.send(202, {
						'Location' : that.basePath + 'tags/' + tagKey
					}, null);
				}
				else {
					res.send(500);
				}
			}
			else {
				res.send(201, {
					'Location' : that.basePath + 'tags/' + tagKey
				}, null);

			}
		});

	}, function() {
		res.send(500);
	});

	// Check if document ID exists
	that.pool.db('entries').get(ENTRY.DOCUMENT.PREFIX + "-" + docid, function(err, doc) {
		if (err) {
			b.abort();
		}
		else {
			b.submit();
		}
	});

	// Check if attachment ID exists
	that.pool.db('entries').get(ENTRY.ATTACHMENT.PREFIX + "-" + attachid, function(err, doc) {
		if (err) {
			b.abort();
		}
		else {
			b.submit();
		}
	});
};

ApiHandler.prototype.getTagsByLink = function(res, linkid) {
	var result = {};

	var dbEntries = this.pool.db('entries');

	var that = this;

	var b = new (util.Barrier)(1, function() {

		dbEntries.view("entries/tagsByLink", {
			startkey : [ linkid ],
			endkey : [ linkid, {} ],
			include_docs : true
		}, function(err, dbRes) {
			if (err) {
				res.send(500);
				sys.log(sys.inspect(err));
			}
			else {
				var tagList = [];
				for (i = 0; i < PAGINATION_SIZE && i < dbRes.rows.length; i++) {
					tagList.push( {
						tag_id : dbRes.rows[i].doc._id.substring(2),
						tag : dbRes.rows[i].doc.tag
					});
				}
				result['tags'] = tagList;

				result['total'] = dbRes.total_rows;

				res.send(200, {}, result);
			}
		});
	}, function() {
		res.send(500);
	});

	that.pool.db('entries').get(ENTRY.LINK.PREFIX + "-" + linkid, function(err, doc) {
		if (err && err.error === 'not_found') {
			b.abort(function() {
				res.send(404);
			});
		}
		else if (err) {
			b.abort();

		}
		else {
			b.submit();
		}

	});
};

ApiHandler.prototype.getLinkTagById = function(res, linkid, tagid) {
	var that = this;
	that.pool.db('entries').get(ENTRY.TAG.PREFIX + "-" + tagid, function(err, doc) {
		if (err) {
			if (err.error === 'not_found') {

				res.send(404);
			}
			else {
				res.send(500, {}, err);
			}
		}
		else {
			res.send(200, {}, {
				tag_id : tagid,
				link_id : doc.link_id,
				created : doc.created || "",
				user : doc.user,
				tag : doc.tag
			});
		}
	});
};

ApiHandler.prototype.createLinkTag = function(res, user, linkid, data) {
	sys.log(sys.inspect(data));

	var that = this;

	// Check if provided data are correct
	if (!data.tag || data.tag.length < 3) {
		res.send(400, {}, {
			error : "invalid tag"
		});
		return;
	}
	else if (data.tag.length > 100) {
		res.send(400, {}, {
			error : "tag too long"
		});
		return;
	}
	else if (typeof data.tag !== 'string') {
		res.send(400, {}, {
			error : "non-string tag"
		});
		return;
	}

	var hasher = crypto.createHash('md5');
	hasher.update(data.tag);
	var tagid = hasher.digest('hex');

	var tagKey = tagid + "--" + ENTRY.LINK.PREFIX + "-" + linkid;

	var db = this.pool.db('entries');

	var b = new (util.Barrier)(1, function() {

		that.pool.db('entries').insert(ENTRY.TAG.PREFIX + "-" + tagKey, {
			type : ENTRY.TAG.TYPE,
			link_id : linkid,
			tag : data.tag,
			'user' : user,
			created : new Date(),
			tagType : ENTRY.LINK.TYPE
		}, function(err, dbRes) {
			if (err) {
				if (err.error === 'conflict') {
					res.send(202, {
						'Location' : that.basePath + 'tags/' + tagKey
					}, null);
				}
				else {
					res.send(500);
				}
			}
			else {
				res.send(201, {
					'Location' : that.basePath + 'tags/' + tagKey
				}, null);

			}
		});

	}, function() {
		res.send(500);
	});

	// Check if link ID exists
	that.pool.db('entries').get(ENTRY.LINK.PREFIX + "-" + linkid, function(err, doc) {
		if (err) {
			b.abort();
		}
		else {
			b.submit();
		}
	});

};

ApiHandler.prototype.listAttachmentValues = function(res, docid, attachid) {
	var that = this;
	
	var result = {};
	
	var dbEntries = this.pool.db('entries');
	
	var b = new (util.Barrier)(2, function() {

		dbEntries.view("entries/valuesByAttachment", {
			startkey : [ docid, attachid ],
			endkey : [ docid, attachid, {} ],
			include_docs : true
		}, function(err, dbRes) {
			if (err) {
				res.send(500);
				sys.log(sys.inspect(err));
			}
			else {
				var valueList = [];
				for (i = 0; i < PAGINATION_SIZE && i < dbRes.rows.length; i++) {
					valueList.push( {
						key : dbRes.rows[i].doc.key,
						user : dbRes.rows[i].doc.user,
						value : dbRes.rows[i].doc.value
					});
				}
				result['values'] = valueList;

				result['total'] = dbRes.total_rows;

				res.send(200, {}, result);
			}
		});
	}, function() {
		res.send(500);
	});

	// Check if document ID exists
	that.pool.db('entries').get(ENTRY.DOCUMENT.PREFIX + "-" + docid, function(err, doc) {
		if (err) {
			b.abort();
		}
		else {
			b.submit();
		}
	});

	// Check if attachment ID exists
	that.pool.db('entries').get(ENTRY.ATTACHMENT.PREFIX + "-" + attachid, function(err, doc) {
		if (err) {
			b.abort();
		}
		else {
			b.submit();
		}
	});
};

ApiHandler.prototype.createAttachmentValue = function(res, user, docid, attachid, data) {
	sys.log(sys.inspect(data));

	var that = this;

	if (!data.key || data.key.length < 3 || data.key.length > 128) {
		res.send(400, {}, {
			error : "invalid comment"
		});
		return;
	}
	if (!data.value || data.value.length > 1024) {
		res.send(400, {}, {
			error : "invalid comment"
		});
		return;
	}

	var hasher = crypto.createHash('md5');
	hasher.update(data.key);
	var hash = hasher.digest('hex');

	var key = hash + "--u-" + user + "--" + ENTRY.ATTACHMENT.PREFIX + "-" + attachid;

	var db = this.pool.db('entries');

	var b = new (util.Barrier)(2, function() {

		that.pool.db('entries').insert(ENTRY.KEYVALUE.PREFIX + "-" + key, {
			type : ENTRY.KEYVALUE.TYPE,
			doc_id : docid,
			attachmentId : attachid,
			key : data.key,
			value : data.value,
			'user' : user,
			submitted : new Date(),
			valueType : ENTRY.ATTACHMENT.TYPE
		}, function(err, dbRes) {
			if (err) {
				if (err.error === 'conflict') {
					res.send(409);
				}
				else {
					res.send(500);
				}
			}
			else {
				res.send(201, {
					'Location' : that.basePath + 'documents/' + docid + '/attachments/' + attachid + '/values/user/' + user + "/key/" + hash
				}, null);

			}
		});

	}, function() {
		res.send(500);
	});

	// Check if document ID exists
	that.pool.db('entries').get(ENTRY.DOCUMENT.PREFIX + "-" + docid, function(err, doc) {
		if (err) {
			b.abort();
		}
		else {
			b.submit();
		}
	});

	// Check if attachment ID exists
	that.pool.db('entries').get(ENTRY.ATTACHMENT.PREFIX + "-" + attachid, function(err, doc) {
		if (err) {
			b.abort();
		}
		else {
			b.submit();
		}
	});
};

ApiHandler.prototype.getAttachmentValue = function(res, docid, attachid, user, key) {
	var result = {};

	var dbEntries = this.pool.db('entries');

	var that = this;

	// var hasher = crypto.createHash('md5');
	// hasher.update(key);
	// var hash = hasher.digest('hex');

	var key = key + "--u-" + user + "--" + ENTRY.ATTACHMENT.PREFIX + "-" + attachid;

	sys.log(key);

	var b = new (util.Barrier)(2, function() {

		that.pool.db('entries').get(ENTRY.KEYVALUE.PREFIX + "-" + key, function(err, doc) {
			if (err) {
				if (err.error === 'not_found') {
					sys.log("nf");
					res.send(404);
				}
				else {
					res.send(500, {}, err);
				}
			}
			else {
				res.send(200, {}, {
					user : doc.user,
					key : doc.key,
					value : doc.value || "",
					submitted : doc.submitted,
					valueType : doc.valueType,
					doc_id : doc.doc_id,
					attachmentId : doc.attachmentId

				});
			}
		});
	}

	, function() {
		res.send(500);
	});

	// Check if document ID exists
	that.pool.db('entries').get(ENTRY.DOCUMENT.PREFIX + "-" + docid, function(err, doc) {
		if (err && err.error === 'not_found') {
			b.abort(function() {
				res.send(404);
			});
		}
		else if (err) {
			b.abort();

		}
		else {
			b.submit();
		}

	});

	// Check if attachment ID exists
	that.pool.db('entries').get(ENTRY.ATTACHMENT.PREFIX + "-" + attachid, function(err, doc) {
		if (err && err.error === 'not_found') {
			b.abort(function() {
				res.send(404);
			});
		}
		else if (err) {
			b.abort();

		}
		else {
			b.submit();
		}
	});
};

ApiHandler.prototype.updateAttachmentValue = function(res, autheduser, docid, attachid, user, key, data) {
	if (user !== autheduser) {
		res.send(403);
		return;
	}

	if (!data.key || data.key.length < 3 || data.key.length > 128) {
		res.send(400, {}, {
			error : "invalid key"
		});
		return;
	}
	if (!data.value || data.value.length > 1024) {
		res.send(400, {}, {
			error : "invalid tag"
		});
		return;
	}
	
	sys.log("hit");

	var hasher = crypto.createHash('md5');
	hasher.update(data.key);
	var hash = hasher.digest('hex');

	if (hash !== key) {
		res.send(400, {}, {
			error : "invalid hash"
		});
		return;
	}

	var that = this;
	var dbEntries = this.pool.db('entries');

	var entryKey = key + "--u-" + user + "--" + ENTRY.ATTACHMENT.PREFIX + "-" + attachid;

	dbEntries.get(ENTRY.KEYVALUE.PREFIX + "-" + entryKey, function(err, doc) {
		if (err) {
			res.send(500);
		}
		else {

			dbEntries.save(ENTRY.KEYVALUE.PREFIX + "-" + entryKey, {
				type : ENTRY.KEYVALUE.TYPE,
				doc_id : doc_id,
				attachmentId : attachid,			
				key : data.key,
				value : data.value,
				'user' : user,
				submitted : new Date(),
				valueType : ENTRY.ATTACHMENT.TYPE
			}, function(err, dbRes) {
				if (err) {
					res.send(500);
				}
				else {

					res.send(202);

				}
			});
		}
	});
};

ApiHandler.prototype.deleteAttachmentValue = function(res, autheduser, docid, attachid, user, key) {
	if (user !== autheduser) {
		res.send(403);
		return;
	}

	var that = this;
	var dbEntries = this.pool.db('entries');

	var entryKey = key + "--u-" + user + "--" + ENTRY.ATTACHMENT.PREFIX + "-" + attachid;

	dbEntries.get(ENTRY.KEYVALUE.PREFIX + "-" + entryKey, function(err, doc) {
		if (err) {
			res.send(500);
		}
		else {

			dbEntries.remove(ENTRY.KEYVALUE.PREFIX + "-" + entryKey, function(err, dbRes) {
				if (err) {
					res.send(500);
				}
				else {

					res.send(204);

				}
			});
		}
	});
};

ApiHandler.prototype.listLinkValues = function(res, linkid) {
	
	var that = this;
	
	var result = {};
	
	var dbEntries = this.pool.db('entries');
	
	var b = new (util.Barrier)(1, function() {

		dbEntries.view("entries/valuesByLink", {
			startkey : [ linkid ],
			endkey : [ linkid, {} ],
			include_docs : true
		}, function(err, dbRes) {
			if (err) {
				res.send(500);
				sys.log(sys.inspect(err));
			}
			else {
				var valueList = [];
				for (i = 0; i < PAGINATION_SIZE && i < dbRes.rows.length; i++) {
					valueList.push( {
						key : dbRes.rows[i].doc.key,
						user : dbRes.rows[i].doc.user,
						value : dbRes.rows[i].doc.value
					});
				}
				result['values'] = valueList;

				result['total'] = dbRes.total_rows;

				res.send(200, {}, result);
			}
		});
	}, function() {
		res.send(500);
	});

	that.pool.db('entries').get(ENTRY.LINK.PREFIX + "-" + linkid, function(err, doc) {
		if (err) {
			b.abort();
		}
		else {
			b.submit();
		}
	});
};

ApiHandler.prototype.createLinkValue = function(res, user, linkid, data) {
	sys.log(sys.inspect(data));

	var that = this;

	if (!data.key || data.key.length < 3 || data.key.length > 128) {
		res.send(400, {}, {
			error : "invalid comment"
		});
		return;
	}
	if (!data.value || data.value.length > 1024) {
		res.send(400, {}, {
			error : "invalid comment"
		});
		return;
	}

	var hasher = crypto.createHash('md5');
	hasher.update(data.key);
	var hash = hasher.digest('hex');

	var key = hash + "--u-" + user + "--" + ENTRY.LINK.PREFIX + "-" + linkid;

	var db = this.pool.db('entries');

	var b = new (util.Barrier)(1, function() {

		that.pool.db('entries').insert(ENTRY.KEYVALUE.PREFIX + "-" + key, {
			type : ENTRY.KEYVALUE.TYPE,
			link_id : linkid,
			key : data.key,
			value : data.value,
			'user' : user,
			submitted : new Date(),
			valueType : ENTRY.LINK.TYPE
		}, function(err, dbRes) {
			if (err) {
				if (err.error === 'conflict') {
					res.send(409);
				}
				else {
					res.send(500);
				}
			}
			else {
				res.send(201, {
					'Location' : that.basePath + 'links/' + linkid + '/values/user/' + user + "/key/" + hash
				}, null);

			}
		});

	}, function() {
		res.send(500);
	});

	that.pool.db('entries').get(ENTRY.LINK.PREFIX + "-" + linkid, function(err, doc) {
		if (err) {
			b.abort();
		}
		else {
			b.submit();
		}
	});

};

ApiHandler.prototype.getLinkValue = function(res, linkid, user, key) {
	var result = {};

	var dbEntries = this.pool.db('entries');

	var that = this;

	var entryKey = key + "--u-" + user + "--" + ENTRY.LINK.PREFIX + "-" + linkid;

	sys.log(key);

	var b = new (util.Barrier)(1, function() {

		that.pool.db('entries').get(ENTRY.KEYVALUE.PREFIX + "-" + entryKey, function(err, doc) {
			if (err) {
				if (err.error === 'not_found') {
					sys.log("nf");
					res.send(404);
				}
				else {
					res.send(500, {}, err);
				}
			}
			else {
				res.send(200, {}, {
					user : doc.user,
					key : doc.key,
					value : doc.value || "",
					submitted : doc.submitted,
					valueType : doc.valueType,
					link_id : doc.link_id

				});
			}
		});
	}

	, function() {
		res.send(500);
	});

	that.pool.db('entries').get(ENTRY.LINK.PREFIX + "-" + linkid, function(err, doc) {
		if (err && err.error === 'not_found') {
			b.abort(function() {
				res.send(404);
			});
		}
		else if (err) {
			b.abort();

		}
		else {
			b.submit();
		}
	});
};

ApiHandler.prototype.updateLinkValue = function(res, autheduser, linkid, user, key, data) {
	if (user !== autheduser) {
		res.send(403);
		return;
	}

	if (!data.key || data.key.length < 3 || data.key.length > 128) {
		res.send(400, {}, {
			error : "invalid key"
		});
		return;
	}
	if (!data.value || data.value.length > 1024) {
		res.send(400, {}, {
			error : "invalid tag"
		});
		return;
	}
	
	sys.log("hit");

	var hasher = crypto.createHash('md5');
	hasher.update(data.key);
	var hash = hasher.digest('hex');

	if (hash !== key) {
		res.send(400, {}, {
			error : "invalid hash"
		});
		return;
	}

	var that = this;
	var dbEntries = this.pool.db('entries');

	var entryKey = key + "--u-" + user + "--" + ENTRY.LINK.PREFIX + "-" + linkid;

	dbEntries.get(ENTRY.KEYVALUE.PREFIX + "-" + entryKey, function(err, doc) {
		if (err) {
			res.send(500);
		}
		else {

			dbEntries.save(ENTRY.KEYVALUE.PREFIX + "-" + entryKey, {
				type : ENTRY.KEYVALUE.TYPE,
				link_id : linkid,
				key : data.key,
				value : data.value,
				'user' : user,
				submitted : new Date(),
				valueType : ENTRY.LINK.TYPE
			}, function(err, dbRes) {
				if (err) {
					res.send(500);
				}
				else {

					res.send(202);

				}
			});
		}
	});
};

ApiHandler.prototype.deleteLinkValue = function(res, autheduser, linkid, user, key) {
	if (user !== autheduser) {
		res.send(403);
		return;
	}

	var that = this;
	var dbEntries = this.pool.db('entries');

	var entryKey = key + "--u-" + user + "--" + ENTRY.LINK.PREFIX + "-" + linkid;

	dbEntries.get(ENTRY.KEYVALUE.PREFIX + "-" + entryKey, function(err, doc) {
		if (err) {
			res.send(500);
		}
		else {

			dbEntries.remove(ENTRY.KEYVALUE.PREFIX + "-" + entryKey, function(err, dbRes) {
				if (err) {
					res.send(500);
				}
				else {

					res.send(204);

				}
			});
		}
	});
};

ApiHandler.prototype.addPositionForDocument = function(res, user, docid, data) {
	
	var that = this;

	if(!(data.location && data.location.position &&  data.location.position.coordinates)) 
	{	
		res.send(400,{},{'error':'incorrect position given'});
		return;
	}
	
	var uuid = "";
	
	
	var b = new (util.Barrier)(2, function() {
		that.pool.db('entries').insert(ENTRY.SPATIAL.PREFIX + "-" + uuid, {
			type : ENTRY.SPATIAL.TYPE,
			doc_id : docid,
			lon : data.location.position.coordinates[0] || 0,
			lat : data.location.position.coordinates[1] || 0,
			variance : data.location.variance || 0,
			by_user : user,
			submitted : new Date()
		}, function(err, dbRes) {
			if (err) {
				sys.log(err);
				res.send(500);
			}
			else {
				res.send(201, {
					'Location' : that.basePath + 'documents/'+ docid + '/position/' + uuid
				}, null);

			}
			});
	}, function() {
		res.send(500);
	});
		
	// Check if document ID exists
	that.pool.db('entries').get(ENTRY.DOCUMENT.PREFIX + "-" + docid, function(err, doc) {
		if (err && err.error === 'not_found') {
			b.abort(function() {
				res.send(404);
			});
		}
		else if (err) {
			b.abort();

		}
		else {
			b.submit();
		}

	});
		
	// Get UUID
	that.pool.conn('entries').uuids(1, function(err, doc) {
		if (err) {
			b.abort(function() {
				res.send(500);
			});
		}
		else {
			uuid = util.toUUID(doc.pop());
			b.submit();
		}
	});

};

ApiHandler.prototype.addTimeForDocument = function(res, user, docid, data) {
	var that = this;

	if(!(data.date && data.date.before &&  data.date.after)) 
	{	
		res.send(400,{},{'error':'incorrect time given'});
		return;
	}
	
	var uuid = "";
		
	var b = new (util.Barrier)(2, function() {
		that.pool.db('entries').insert(ENTRY.TEMPORAL.PREFIX + "-" + uuid, {
			type : ENTRY.TEMPORAL.TYPE,
			doc_id : docid,
			after : data.date.after || new Date(),
			before : data.date.before || new Date(),
			by_user : user,
			submitted : new Date()
		}, function(err, dbRes) {
			if (err) {
				sys.log(err);
				res.send(500);
			}
			else {
				res.send(201, {
					'Location' : that.basePath + 'documents/'+ docid + '/times/' + uuid
				}, null);

			}
			});
	}, function() {
		res.send(500);
	});
		
	// Check if document ID exists
	that.pool.db('entries').get(ENTRY.DOCUMENT.PREFIX + "-" + docid, function(err, doc) {
		if (err && err.error === 'not_found') {
			b.abort(function() {
				res.send(404);
			});
		}
		else if (err) {
			b.abort();

		}
		else {
			b.submit();
		}

	});
		
	// Get UUID
	that.pool.conn('entries').uuids(1, function(err, doc) {
		if (err) {
			b.abort(function() {
				res.send(500);
			});
		}
		else {
			uuid = util.toUUID(doc.pop());
			b.submit();
		}
	});
	

};



ApiHandler.prototype.answerUnauth = function(res, code) {
	if (code === 401) {
		res.send(401, {
			'WWW-Authenticate' : 'Basic realm="' + this.config.deployment.title + '"'
		}, "");
	}
	else {
		res.send(code);
	}
};

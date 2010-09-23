var sys = require("sys");
var cradle = require('../dep/cradle');

/**
 * 
 * @param dbs
 * @return
 * 
 * @class
 */
var ConnectionPool = exports.ConnectionPool = function(hostname, port, dbs) {
	this.pool = {};
	if (dbs) {
		for ( var i in dbs) {
			this.pool[i] = {
				connections : [],
				databases : [],
				x : -1,
				size : dbs[i].connections
			};
			for ( var j = 0; j < dbs[i].connections; j++) {
				var conn = new (cradle.Connection)(hostname, port, dbs[i].options);
				var db = conn.database(dbs[i].table);
				this.pool[i].connections.push(conn);
				this.pool[i].databases.push(db);
			}
		}
	}
};

ConnectionPool.prototype.db = function(connectionAlias) {
	if (this.pool[connectionAlias]) {
		this.pool[connectionAlias].x = (this.pool[connectionAlias].x + 1) % this.pool[connectionAlias].size;
		return this.pool[connectionAlias].databases[this.pool[connectionAlias].x];
	}
	else {
		return null;
	}
};

ConnectionPool.prototype.conn = function(connectionAlias) {
	if (this.pool[connectionAlias]) {
		this.pool[connectionAlias].x = (this.pool[connectionAlias].x + 1) % this.pool[connectionAlias].size;
		return this.pool[connectionAlias].connections[this.pool[connectionAlias].x];
	}
	else {
		return null;
	}
};
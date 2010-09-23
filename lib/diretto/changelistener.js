var Changes = require('../dep/couchlistener').Changes;

var ChangeListener = exports.ChangeListener = function(feed, options, callback) {
	this.changes = new Changes(feed, options);
	this.changes.on('change', function(obj) {
		callback(obj);
	});
};
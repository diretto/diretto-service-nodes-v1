var Mu = require('../dep/mu');

/**
 * @class
 * 
 * Creates a new feed generator.
 * @param templateRoot
 * @return
 */
var FeedGenerator = exports.FeedGenerator = function(templateRoot) {
	this.mu = Mu;
	this.mu.templateRoot = templateRoot;
};

/**
 * Returns the template root.
 * @return
 */
FeedGenerator.prototype.getTemplateRoot = function() {
	return this.mu.templateRoot;
};

/**
 * Renders data using a template file into a buffer and finally pass it to a callback.  
 * @param file
 * @param data
 * @param errorCallback
 * @param renderCallback
 * @return
 */
FeedGenerator.prototype.render = function(file, data, errorCallback, renderCallback) {
	this.mu.render(file, data, {}, function(err, output) {
		if (err) {
			errorCallback(err);
		}

		var buffer = '';

		output.on('data', function(c) {
			buffer += c;
		}).on('end', function() {
			renderCallback(buffer);
		});
	});
};

/**
 * Renders data using a template file into chunks that are passed to a callback.
 * @param file
 * @param data
 * @param errorCallback
 * @param chunkCallback
 * @param finishCallback
 * @return
 */
FeedGenerator.prototype.renderChunked = function(file, data, errorCallback, chunkCallback, finishCallback) {
	this.mu.render(file, data, {}, function(err, output) {
		if (err) {
			errorCallback(err);
		}

		output.on('data', function(c) {
			chunkCallback(c);
		}).on('end', function() {
			finishCallback();
		});
	});
};
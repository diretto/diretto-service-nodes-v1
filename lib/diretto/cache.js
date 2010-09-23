/**
 * A simple lease-based cache in javascript used for node.js
 * 
 * This cache allows to insert key-value pairs that will be automatically removed after a distinct lease time.
 * A cache object has a capacity. If the capacity limit is hit, it will automatically remove the oldest entries.
 * Entries can't be removed from the cache. However, they can be overwritten.
 * 
 * Note that this is not exactly the same than a LRU cache, although it works similar. It has been used for caching
 * authentication data. Only after lookups fail, the data will be caught from the database. The additional time-out
 * prevents the usage of too old entries and allows some efficient caching between distributed nodes sharing 
 * authentication data.   
 * 
 * @author Benjamin Erb | http://www.benjamin-erb.de
 *  
 */

/**
 * @class
 * 
 * Creates a new Cache object.
 * 
 * @param capacity The 
 * @param expireTime
 * @return
 */
var Cache = exports.Cache = function(capacity, expireTime) {
	this.items = 0;
	this.internalCache = {};
	this.expireTime = expireTime;
	this.capacity = capacity;
};

/**
 * Insert a new key/value pair.
 * @param k
 * @param v
 * @return
 */
Cache.prototype.put = function(k, v) {
	if (k != null && v != null) {
		if (this.internalCache[k]) {
			this._remove(k);
		}

		var value = new ValueWrapper(k, v);
		this.internalCache[k] = value;

		var cache = this;
		var timer = this.expireTime;

		var timeoutId = setTimeout(function() {
			cache._remove(k);
		}, this.expireTime);

		value.setTimeoutId(timeoutId);
		if (++this.items > this.capacity) {
			this._purge();
		}

	}
};

/**
 * Checks if the given key is present in the cache.
 * @param k
 * @return
 */
Cache.prototype.contains = function(k) {
	return !!(this.internalCache[k]);
};

/**
 * Internal method for removing an entry.
 * @param k
 * @return
 */
Cache.prototype._remove = function(k) {
	if (this.internalCache[k]) {
		this.internalCache[k].unregisterTimeout();
		delete this.internalCache[k];
		this.items--;
	}
};

/**
 * Returns the value of a given key in the cache.
 * @param k
 * @return
 */
Cache.prototype.get = function(k) {

	if (k != null && this.internalCache[k]) {
		return this.internalCache[k].getValue();
	}
};

/**
 * Removes all entries from this cache.
 * @return
 */
Cache.prototype.clear = function() {
	for ( var k in this.internalCache) {
		this._remove(k);
	}
};

/**
 * Returns the number of elements that are currently in the cache.
 * @return
 */
Cache.prototype.size = function() {
	return this.items;
};

/**
 * Purges the cache by removing the oldest entries if the cache is full.
 * @return
 */
Cache.prototype._purge = function() {
	var keylist = [];
	for ( var k in this.internalCache) {
		keylist.push(this.internalCache[k]);
	}
	keylist.sort(function(k1, k2) {
		return k2.getTimeCreated() - k1.getTimeCreated();
	});
	while (this.items > this.capacity) {
		var k = keylist.pop();
		this._remove(k.getKey());
	}
};

/**
 * Returns a list of all key items.
 * @return
 */
Cache.prototype.keySet = function() {
	var keylist = [];
	for ( var k in this.internalCache) {
		keylist.push(k);
	}
	return keylist;
};

/**
 * @class
 * 
 * Creates a wrapper object for a key/value pair, that internally handles the time created. 
 * @param k
 * @param v
 * @return
 */
ValueWrapper = function ValueWrapper(k, v) {
	this.key = k;
	this.value = v;
	this.time = new Date().getTime();
	this.timeoutId = null;
};
/**
 * Returns the value of this wrapper object.
 * @return
 */
ValueWrapper.prototype.getValue = function() {
	return this.value;
};

/**
 * Returns the key of this wrapper object.
 * @return
 */
ValueWrapper.prototype.getKey = function() {
	return this.key;
};

/**
 * Sets the timeout id associated with this wrapper object. 
 * @param id
 * @return
 */
ValueWrapper.prototype.setTimeoutId = function(id) {
	this.timeoutId = id;
};

/**
 * Unregisters the timeout of this entry.
 * @return
 */
ValueWrapper.prototype.unregisterTimeout = function() {
	clearTimeout(this.timeoutId);
};

/**
 * Returns the time this wrapper object has been created.
 * @return
 */
ValueWrapper.prototype.getTimeCreated = function() {
	return this.time;
};

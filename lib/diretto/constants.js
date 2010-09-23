/**
 * Used databases.
 */
exports.DATABASE = {
	'USERS' : 'users',
	'ENTRIES' : 'entries'
};

/**
 * Document types in the entry database.
 */
exports.ENTRY = {
	ATTACHMENT : {
		TYPE : 'attachment',
		PREFIX : 'a'
	},
	DOCUMENT : {
		TYPE : 'document',
		PREFIX : 'd'
	},
	TAG : {
		TYPE : 'tag',
		PREFIX : 't'
	},
	SPATIAL : {
		TYPE : 'spatial',
		PREFIX : 's'
	},
	LINK : {
		TYPE : 'link',
		PREFIX : 'l'
	},
	COMMENT : {
		TYPE : 'comment',
		PREFIX : 'c'
	},
	VOTE : {
		TYPE : 'vote',
		PREFIX : 'v'
	},
	TEMPORAL : {
		TYPE : 'temporal',
		PREFIX : 'z'
	},
	KEYVALUE : {
		TYPE : 'keyvalue',
		PREFIX : 'k'
	}

};
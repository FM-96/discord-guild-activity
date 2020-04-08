const mongoose = require('mongoose');

const schema = mongoose.Schema({
	messageId: String,
	guildId: String,
	channelId: String,
	userId: String,
	day: Number,
	minute: Number,
});

module.exports = mongoose.model('Message', schema, 'messages');

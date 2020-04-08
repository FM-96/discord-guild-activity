const mongoose = require('mongoose');

const schema = mongoose.Schema({
	channelId: String,
	lastScannedMessage: String,
});

module.exports = mongoose.model('ChannelScan', schema, 'channelscans');

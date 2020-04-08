require('dotenv').config({path: `${process.argv[2] || ''}.env`});

const Discord = require('discord.js');
const mongoose = require('mongoose');

const Message = require('./Message.js');

const client = new Discord.Client();

client.once('ready', async () => {
	const CUR_TIME = Date.now();
	const CUR_DAY = toDay(CUR_TIME);
	const SCAN_START = fromDay(CUR_DAY - process.env.DAYS) - 1;
	const MAX_MINUTES = process.env.DAYS * 1440;

	const guild = client.guilds.get(process.env.GUILD_ID);
	const me = await guild.fetchMember(client.user);

	console.log(`Logged in as ${client.user.tag}`);
	console.log(`Scanning messages in guild "${guild.name}"`);

	const scannableChannels = guild.channels.array().filter(e => e.type === 'text' && e.permissionsFor(me).has(Discord.Permissions.FLAGS.VIEW_CHANNEL | Discord.Permissions.FLAGS.READ_MESSAGE_HISTORY));

	// scan channels for new messages
	const messages = [];
	for (const channel of scannableChannels) {
		console.log(`scanning ${channel.name}`);
		let channelHistory;
		while (!channelHistory) {
			try {
				channelHistory = await getChannelHistory(channel, SCAN_START);
			} catch (err) {
				console.log(`ERR ${channel.name}: ${err.message}`);
			}
		}
		console.log(`${channel.name}: ${channelHistory.length} messages`);
		for (const message of channelHistory) {
			messages.push(message);
		}
	}
	console.log(`${messages.length} messages in total`);

	// save scanned messages in database
	const dbOps = [];
	for (const message of messages) {
		if (message.author.bot) {
			continue;
		}

		dbOps.push(Message.findOneAndUpdate({messageId: message.id}, {
			messageId: message.id,
			guildId: message.guild.id,
			channelId: message.channel.id,
			userId: message.author.id,
			day: toDay(message.createdTimestamp),
			minute: toMinute(message.createdTimestamp),
		}, {upsert: true}));
	}
	await Promise.all(dbOps);
	console.log('Saved to database');

	// query database for activity level
	const dbActivityResult = await Message.aggregate([
		{$match: {guildId: process.env.GUILD_ID, day: {$lt: CUR_DAY, $gte: CUR_DAY - process.env.DAYS}}},
		{$group: {_id: {userId: '$userId', minute: '$minute'}}},
		{$group: {_id: '$_id.userId', activeMinutes: {$sum: 1}}},
	]).exec();

	dbActivityResult.sort((a, b) => b.activeMinutes - a.activeMinutes);

	const highScore = dbActivityResult.slice(0, process.env.TOP_LIMIT);

	let index = 0;
	for (const entry of highScore) {
		index++;
		let user;
		try {
			user = await client.fetchUser(entry._id);
		} catch (err) {
			user = {tag: 'Unknown User#0000', id: entry._id};
		}
		const activityPercentage = Math.floor((entry.activeMinutes / MAX_MINUTES) * 10000) / 100;
		console.log(`${index}. ${user.tag} (${user.id}): ${entry.activeMinutes} minutes (${activityPercentage}%)`);
	}

	process.exit(0);
});

mongoose.connect(process.env.MONGODB, {
	useFindAndModify: false,
	useNewUrlParser: true,
	useUnifiedTopology: true,
}).then(() => client.login(process.env.BOT_TOKEN)).catch(err => {
	console.error('Error logging in:');
	console.error(err);
	process.exit(1);
});

async function getChannelHistory(channel, scanStart) {
	const result = [];
	let lastMessage = Discord.SnowflakeUtil.generate(scanStart);
	let done = false;

	do {
		const options = {limit: 100};
		options.after = lastMessage;

		const messages = await channel.fetchMessages(options);
		if (messages.size) {
			result.push(...messages.values());
			lastMessage = messages.firstKey();
		} else {
			done = true;
		}
	} while (!done);

	return result;
}

function fromDay(day) {
	return day * 86400000;
}

function toDay(time) {
	return Math.floor(time / 86400000);
}

function toMinute(time) {
	return Math.floor(time / 60000);
}
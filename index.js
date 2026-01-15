require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const DATA_FILE = path.join(__dirname, 'database.json');

// --- AUTO-INITIALIZE DATABASE ---
// This creates the file on Render's disk immediately so Zapier doesn't see "No DB"
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({}), 'utf8');
    console.log("📁 Created a fresh database.json on the server!");
}

// Initialize Discord Bot
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMembers, 
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent 
    ] 
});

app.use(express.json());

// Health Check for UptimeRobot
app.get('/', (req, res) => {
    res.status(200).send('Bot is Online and Awake! 🚀');
});

function saveUser(discordId, email) {
    let data = {};
    if (fs.existsSync(DATA_FILE)) {
        try {
            data = JSON.parse(fs.readFileSync(DATA_FILE));
        } catch (e) {
            data = {};
        }
    }
    data[email.toLowerCase()] = discordId;
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Welcome Message
client.on('guildMemberAdd', async (member) => {
    try {
        await member.send(
            `👋 Welcome! Sync your account by typing this in the server:\n` +
            `\`/link email:your-nasio-email@example.com\``
        );
    } catch (error) {
        console.error(`Could not DM ${member.user.tag}`);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === 'link') {
        const email = interaction.options.getString('email');
        saveUser(interaction.user.id, email);
        await interaction.reply({ content: `✅ Linked to **${email}**!`, ephemeral: true });
    }
});

app.post('/nas-webhook', async (req, res) => {
    const { email } = req.body;
    console.log(`Received kick signal for: ${email}`);

    // Check if DB exists (it should now, because of the auto-init above)
    if (!fs.existsSync(DATA_FILE)) {
        return res.status(404).send('No DB.');
    }

    const data = JSON.parse(fs.readFileSync(DATA_FILE));
    const discordId = data[email?.toLowerCase()];

    if (!discordId) {
        console.log(`User with email ${email} not found in database.`);
        return res.status(404).send('User not found.');
    }

    try {
        const guild = await client.guilds.fetch(process.env.GUILD_ID);
        const member = await guild.members.fetch(discordId);
        await member.kick('Subscription ended on Nas.io');
        console.log(`Successfully kicked: ${discordId}`);
        res.status(200).send('Kicked.');
    } catch (error) {
        console.error('Error during kick:', error);
        res.status(500).send('Error during kick.');
    }
});

client.once('ready', () => { 
    console.log(`Logged in as ${client.user.tag}!`); 
});

client.login(process.env.DISCORD_TOKEN);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { 
    console.log(`🚀 Webhook server listening on port ${PORT}`); 
});
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');
const fs = require('fs');

const app = express();
const DATA_FILE = './database.json';

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

// --- THE FIX FOR UPTIMEROBOT 404 ---
// This gives your bot a "Front Door." 
// When UptimeRobot visits, it gets a 200 OK instead of a 404.
app.get('/', (req, res) => {
    res.status(200).send('Bot is Online and Awake! 🚀');
});
// ------------------------------------

// Helper Function: Save user mapping
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

// Slash Command Interaction
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === 'link') {
        const email = interaction.options.getString('email');
        saveUser(interaction.user.id, email);
        await interaction.reply({ content: `✅ Linked to **${email}**!`, ephemeral: true });
    }
});

// THE KICK LOGIC: Webhook Listener for Nas.io
app.post('/nas-webhook', async (req, res) => {
    const { email } = req.body;
    console.log(`Received kick signal for: ${email}`);

    if (!fs.existsSync(DATA_FILE)) return res.status(404).send('No DB.');

    const data = JSON.parse(fs.readFileSync(DATA_FILE));
    const discordId = data[email?.toLowerCase()];

    if (!discordId) return res.status(404).send('User not found.');

    try {
        const guild = await client.guilds.fetch(process.env.GUILD_ID);
        const member = await guild.members.fetch(discordId);
        await member.kick('Subscription ended on Nas.io');
        console.log(`Successfully kicked: ${discordId}`);
        res.status(200).send('Kicked.');
    } catch (error) {
        res.status(500).send('Error during kick.');
    }
});

client.once('ready', () => { console.log(`Logged in as ${client.user.tag}!`); });
client.login(process.env.DISCORD_TOKEN);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(`🚀 Port ${PORT}`); });
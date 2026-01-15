require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');
const fs = require('fs');

const app = express();
const DATA_FILE = './database.json';

// 1. Initialize Discord Bot with necessary permissions
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMembers, 
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent // Added to ensure compatibility with message-based events
    ] 
});

app.use(express.json());

// Helper Function: Save user mapping to a local JSON file
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

// NEW: Welcome Message Feature
// This event triggers whenever someone joins the server
client.on('guildMemberAdd', async (member) => {
    try {
        await member.send(
            `👋 Welcome to the server, **${member.user.username}**!\n\n` +
            `To keep your access, please sync your account by typing this command in the server:\n` +
            `\`/link email:your-nasio-email@example.com\``
        );
        console.log(`Sent welcome DM to ${member.user.tag}`);
    } catch (error) {
        console.error(`Could not send DM to ${member.user.tag}. (DMs might be closed)`);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'link') {
        const email = interaction.options.getString('email');
        
        saveUser(interaction.user.id, email);
        
        await interaction.reply({ 
            content: `✅ Success! Your Discord account is now linked to **${email}**.`, 
            ephemeral: true 
        });
    }
});

// 3. Webhook Listener: Receives "Unsubscribe" signal from Nas.io (via Zapier)
app.post('/nas-webhook', async (req, res) => {
    const { email } = req.body;
    console.log(`Received webhook for email: ${email}`);

    if (!fs.existsSync(DATA_FILE)) {
        return res.status(404).send('Database file not found.');
    }

    const data = JSON.parse(fs.readFileSync(DATA_FILE));
    const discordId = data[email?.toLowerCase()];

    if (!discordId) {
        console.log(`User with email ${email} is not linked in the database.`);
        return res.status(404).send('User not found in mapping.');
    }

    try {
        const guild = await client.guilds.fetch(process.env.GUILD_ID);
        const member = await guild.members.fetch(discordId);
        
        await member.kick('Subscription ended on Nas.io');
        
        console.log(`Successfully kicked Discord ID: ${discordId}`);
        res.status(200).send('Member kicked successfully.');
    } catch (error) {
        console.error('Error attempting to kick member:', error.message);
        res.status(500).send('Internal Server Error during kick process.');
    }
});

// 4. Start the Bot and the Webhook Server
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.login(process.env.DISCORD_TOKEN);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Webhook server listening on port ${PORT}`);
});
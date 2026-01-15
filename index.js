require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');

const app = express();

// --- THE NUCLEAR FIX: INLINE MEMORY DATABASE ---
// We use a variable instead of a file so Render/Zapier never see "No DB" again.
let memoryDb = {
    "rebkheicarpio@gmail.com": "850523727099199529",
    "asdw@gmail.com": "850523727099199529",
    "wdas@gmail.com": "850523727099199529",
    "joel+38247924793@nas.io": "850523727099199529" // Added the Zapier test email
};

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

// Link Command Logic (Now saves to memory)
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === 'link') {
        const email = interaction.options.getString('email').toLowerCase();
        memoryDb[email] = interaction.user.id; // Save to variable
        console.log(`Linked ${email} to ${interaction.user.id}`);
        await interaction.reply({ content: `✅ Linked to **${email}**!`, ephemeral: true });
    }
});

// Webhook for Nas.io / Zapier
app.post('/nas-webhook', async (req, res) => {
    const { email } = req.body;
    console.log(`Received kick signal for: ${email}`);

    // Check the variable instead of a file
    const discordId = memoryDb[email?.toLowerCase()];

    if (!discordId) {
        console.log(`User not found for email: ${email}`);
        return res.status(404).send('User not found in memory.');
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
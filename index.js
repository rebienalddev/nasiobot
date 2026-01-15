require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const express = require('express');
const fs = require('fs');

const app = express();
app.use(express.json());

const DB_FILE = './database.json';

// Helper: Safely load database
const getDb = () => {
    try {
        if (!fs.existsSync(DB_FILE)) {
            fs.writeFileSync(DB_FILE, '{}');
            return {};
        }
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data || '{}');
    } catch (e) {
        console.error("Database Read Error:", e);
        return {};
    }
};

// Helper: Safely save database
const saveDb = (data) => {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
};

app.get('/', (req, res) => {
    res.status(200).send('Bot is Online and Awake! 🚀');
});

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] 
});

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    const commands = [
        new SlashCommandBuilder()
            .setName('link')
            .setDescription('Link your email to your Discord account')
            .addStringOption(option => 
                option.setName('email')
                    .setDescription('The email you used for your subscription')
                    .setRequired(true))
    ].map(command => command.toJSON());

    try {
        await rest.put(
            Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
            { body: commands },
        );
        console.log('Successfully reloaded (/) commands.');
    } catch (error) {
        console.error('Registration Error:', error);
    }
});

// --- WEBHOOK FOR KICKING ---
app.post('/nas-webhook', async (req, res) => {
    try {
        const rawEmail = req.body.email || req.body.data?.email; 
        const email = rawEmail?.toLowerCase().trim();
        if (!email) return res.status(200).send('Error: No email provided.');

        const db = getDb();
        const discordId = db[email];

        if (!discordId) {
            return res.status(200).send(`Error: Email ${email} not found in database.`);
        }

        const guild = await client.guilds.fetch(process.env.GUILD_ID);
        const member = await guild.members.fetch(discordId).catch(() => null);

        if (!member) {
            return res.status(200).send('Error: User not in the server.');
        }

        // Check Role Hierarchy - Bot must be ABOVE the member to kick
        if (!member.kickable) {
            return res.status(200).send('Error: Bot role is too low to kick this user.');
        }

        try {
            await member.send("⚠️ Your subscription has expired, and you have been removed from the server.");
        } catch (e) { console.log("DMs closed."); }

        await member.kick('Subscription expired on Nas.io');
        
        // Remove from DB after successful kick
        delete db[email];
        saveDb(db);
        
        return res.status(200).send('Success: Member Kicked.');

    } catch (error) {
        console.error('Webhook Error:', error);
        res.status(500).send(`Internal Error: ${error.message}`);
    }
});

// --- COMMAND INTERACTION ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    
    if (interaction.commandName === 'link') {
        try {
            const email = interaction.options.getString('email').toLowerCase().trim();
            const db = getDb();
            
            db[email] = interaction.user.id;
            saveDb(db);

            await interaction.reply({ 
                content: `✅ Success! Your Discord is now linked to **${email}**.`, 
                ephemeral: true 
            });
        } catch (error) {
            console.error("Link Command Error:", error);
            await interaction.reply({ content: "❌ Failed to save your link.", ephemeral: true });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const express = require('express');

const app = express();

// --- INLINE MEMORY DATABASE ---
let memoryDb = {
    "rebkheicarpio@gmail.com": "850523727099199529"
};

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] 
});

// --- COMMAND REGISTRATION LOGIC ---
const commands = [
    new SlashCommandBuilder()
        .setName('link')
        .setDescription('Link your email to your Discord account')
        .addStringOption(option => 
            option.setName('email')
                .setDescription('The email you used for your subscription')
                .setRequired(true))
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(
            Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
            { body: commands },
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
});

// --- REST OF YOUR LOGIC ---
app.use(express.json());

// Webhook for Nas.io / Zapier
app.post('/nas-webhook', async (req, res) => {
    const rawEmail = req.body.email || req.body.data?.email; 
    const email = rawEmail?.toLowerCase().trim();
    if (!email) return res.status(400).send('No email provided.');

    const discordId = memoryDb[email];
    if (!discordId) return res.status(404).send('User not found.');

    try {
        const guild = await client.guilds.fetch(process.env.GUILD_ID);
        const member = await guild.members.fetch(discordId);

        if (member) {
            try {
                await member.send("⚠️ You have been kicked because your subscription has expired.");
            } catch (e) { console.log("DMs closed for user."); }

            await member.kick('Subscription expired on Nas.io');
            delete memoryDb[email];
            return res.status(200).send('Kicked.');
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Failed.');
    }
});

// Handling the Link Command
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'link') {
        const email = interaction.options.getString('email').toLowerCase().trim();
        memoryDb[email] = interaction.user.id;
        
        console.log(`Linked ${email} to ${interaction.user.id}`);
        await interaction.reply({ 
            content: `✅ Success! Your Discord is now linked to **${email}**.`, 
            ephemeral: true 
        });
    }
});

client.login(process.env.DISCORD_TOKEN);
app.listen(process.env.PORT || 3000);
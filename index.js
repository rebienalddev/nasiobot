require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const express = require('express');

const app = express();
app.use(express.json());

app.get('/', (req, res) => {
    res.status(200).send('Bot is Online and Awake! 🚀');
});

let memoryDb = {
    "rebkheicarpio@gmail.com": "850523727099199529"
};

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] 
});

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
    const rawEmail = req.body.email || req.body.data?.email; 
    const email = rawEmail?.toLowerCase().trim();
    if (!email) return res.status(400).send('No email provided.');

    const discordId = memoryDb[email];
    if (!discordId) return res.status(404).send('User not found.');

    try {
        const guild = await client.guilds.fetch(process.env.GUILD_ID);
        const member = await guild.members.fetch(discordId);

        if (member) {
            const isProtected = member.permissions.has(PermissionFlagsBits.Administrator) || 
                                member.permissions.has(PermissionFlagsBits.ManageGuild) || 
                                member.permissions.has(PermissionFlagsBits.ManageRoles) || 
                                member.permissions.has(PermissionFlagsBits.ManageChannels);

            if (isProtected) {
                console.log(`Skipped kick for protected user: ${member.user.tag}`);
                return res.status(200).send('Skipped: User has management roles.');
            }

            try {
                await member.send("⚠️ You have been kicked because your subscription has expired.");
            } catch (e) { console.log("DMs closed."); }

            await member.kick('Subscription expired on Nas.io');
            delete memoryDb[email];
            return res.status(200).send('Kicked.');
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Failed.');
    }
});

// --- COMMAND INTERACTION ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === 'link') {
        const email = interaction.options.getString('email').toLowerCase().trim();
        memoryDb[email] = interaction.user.id;
        await interaction.reply({ 
            content: `✅ Success! Your Discord is now linked to **${email}**.`, 
            ephemeral: true 
        });
    }
});

client.login(process.env.DISCORD_TOKEN);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
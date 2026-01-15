require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const express = require('express');
const mongoose = require('mongoose'); // Using MongoDB instead of fs

const app = express();
app.use(express.json());

// --- MONGODB CONNECTION ---
// This connects your bot to a remote database in the cloud
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Connected to Remote MongoDB! ✅'))
    .catch(err => console.error('MongoDB Connection Error:', err));

// Define a Schema (This is the structure of your data)
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    discordId: { type: String, required: true }
});
const User = mongoose.model('User', userSchema);

app.get('/', (req, res) => {
    res.status(200).send('Bot is Online and Connected to Cloud DB! 🚀');
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
            .setDescription('Link your email to your Discord account permanently')
            .addStringOption(option => 
                option.setName('email')
                    .setDescription('The email used for subscription')
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

        // Search the Cloud Database instead of the local file
        const userData = await User.findOne({ email: email });

        if (!userData) {
            return res.status(200).send(`Error: Email ${email} not found in Remote DB.`);
        }

        const guild = await client.guilds.fetch(process.env.GUILD_ID);
        const member = await guild.members.fetch(userData.discordId).catch(() => null);

        if (!member) {
            return res.status(200).send('Error: User not in server.');
        }

        // Permission Check
        if (!member.kickable) {
            return res.status(200).send('Error: Bot role is too low in the hierarchy.');
        }

        try {
            await member.send("⚠️ Your subscription has expired. You have been removed from the server.");
        } catch (e) { console.log("DMs closed."); }

        await member.kick('Subscription expired on Nas.io');
        
        // Remove from Cloud Database after successful kick
        await User.deleteOne({ email: email });
        
        return res.status(200).send('Success: Member Kicked and Data Removed.');

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
            
            // Upsert: Create if new, update if exists in MongoDB
            await User.findOneAndUpdate(
                { email: email },
                { discordId: interaction.user.id },
                { upsert: true, new: true }
            );

            await interaction.reply({ 
                content: `✅ Success! Linked to **${email}** in the Cloud Database. Data is now permanent.`, 
                ephemeral: true 
            });
        } catch (error) {
            console.error("Link Command Error:", error);
            await interaction.reply({ content: "❌ Failed to save to Remote DB.", ephemeral: true });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
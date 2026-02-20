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
                    .setRequired(true)),
        new SlashCommandBuilder()
            .setName('members')
            .setDescription('View real-time subscriber list'),
        new SlashCommandBuilder()
            .setName('prune-unsubscribed')
            .setDescription('Automatically kick users who are not subscribed')
            .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
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
    } else if (interaction.commandName === 'members') {
        await interaction.deferReply({ ephemeral: true });
        try {
            const users = await User.find({});
            const count = users.length;
            
            // Fetch usernames to display real names instead of mentions
            const userLines = await Promise.all(users.map(async (u) => {
                try {
                    const discordUser = await client.users.fetch(u.discordId);
                    return `• **${discordUser.username}** (${u.email})`;
                } catch (e) {
                    return `• <@${u.discordId}> (${u.email})`;
                }
            }));

            let userList = userLines.join('\n');
            if (userList.length > 1900) {
                userList = userList.substring(0, 1900) + '\n... (list truncated)';
            }

            await interaction.editReply({ 
                content: `**Total Subscribers: ${count}**\n\n${userList || 'No subscribers yet.'}`
            });
        } catch (error) {
            console.error("Members Command Error:", error);
            await interaction.editReply({ content: "❌ Error fetching members list." });
        }
    } else if (interaction.commandName === 'prune-unsubscribed') {
        await interaction.deferReply({ ephemeral: true });
        try {
            const guild = interaction.guild;
            const allMembers = await guild.members.fetch(); // Fetch all current server members
            const dbUsers = await User.find({}); // Fetch all subscribed users from DB
            const subscribedIds = new Set(dbUsers.map(u => u.discordId));

            let kickedCount = 0;
            let failCount = 0;

            for (const [id, member] of allMembers) {
                // Safety: Don't kick bots, the owner, or Admins
                if (member.user.bot || id === guild.ownerId || member.permissions.has(PermissionFlagsBits.Administrator)) continue;

                if (!subscribedIds.has(id)) {
                    if (member.kickable) {
                        await member.kick('Not found in subscriber database');
                        kickedCount++;
                    } else {
                        failCount++;
                    }
                }
            }
            await interaction.editReply(`✅ **Prune Complete**\nRemoved: ${kickedCount} users.\nFailed to remove (permission issues): ${failCount} users.`);
        } catch (error) {
            console.error("Prune Command Error:", error);
            await interaction.editReply("❌ An error occurred while pruning users.");
        }
    }
});

client.login(process.env.DISCORD_TOKEN);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

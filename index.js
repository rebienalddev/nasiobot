require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const express = require('express');
const mongoose = require('mongoose'); // Using MongoDB instead of fs

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Fix: Handle Zapier form data

// --- MONGODB CONNECTION ---
// This connects your bot to a remote database in the cloud
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Connected to Remote MongoDB! ✅'))
    .catch(err => console.error('MongoDB Connection Error:', err));

// Define a Schema (This is the structure of your data)
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    discordId: { type: String, default: null }
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

// --- WEBHOOK FOR NEW SUBSCRIBERS (ADD TO WHITELIST) ---
// Connect Zapier "New Member" trigger to this URL: /nas-signup
app.post('/nas-signup', async (req, res) => {
    console.log('🔹 Signup Webhook Received:', JSON.stringify(req.body, null, 2));
    console.log('🔹 Query Params:', JSON.stringify(req.query, null, 2)); // Debug: Check URL params
    try {
        // Check body, nested data, or query parameters
        const rawEmail = req.body.email || req.body.data?.email || req.body.payload?.email || req.query.email;
        const email = rawEmail?.toLowerCase().trim();
        if (!email) return res.status(400).json({ error: 'No email provided. Please map "email" in Zapier Data fields.' });

        // Add to DB (Whitelist) so they can link later
        await User.findOneAndUpdate(
            { email: email },
            { email: email }, // Ensure email is set, keep existing discordId if any
            { upsert: true, new: true }
        );
        
        console.log(`✅ Added/Updated Subscriber in Whitelist: ${email}`);
        res.status(200).send('Success: Subscriber Added to Whitelist.');
    } catch (error) {
        console.error('Signup Webhook Error:', error);
        res.status(500).send(error.message);
    }
});

// --- WEBHOOK FOR KICKING ---
// Only connect the "Membership Ended" trigger from Zapier to this endpoint.
// If you connect "New Member", it might kick users who just joined!
app.post('/nas-webhook', async (req, res) => {
    console.log('🔹 Webhook Received:', JSON.stringify(req.body, null, 2)); // Fix: Debugging Log

    try {
        // Check body, nested data, or query parameters
        const rawEmail = req.body.email || req.body.data?.email || req.body.payload?.email || req.query.email; 
        const email = rawEmail?.toLowerCase().trim();
        if (!email) return res.status(400).json({ error: 'No email provided. Please map "email" in Zapier Data fields.' });

        // Search the Cloud Database instead of the local file
        const userData = await User.findOne({ email: email });

        if (!userData) {
            console.log(`⚠️ Email ${email} not found in database. Skipping kick.`);
            return res.status(200).send(`Error: Email ${email} not found in Remote DB.`);
        }

        // 1. Always remove from DB first (so they are no longer "subscribed")
        await User.deleteOne({ email: email });
        console.log(`✅ Removed ${email} from Database.`);

        // 2. Try to kick from Discord
        if (!client.isReady()) {
            console.log('⚠️ Bot not ready to kick user, but removed from DB.');
            return res.status(200).send('Removed from DB, Bot not ready for kick.');
        }

        try {
            const guild = await client.guilds.fetch(process.env.GUILD_ID);
            const member = await guild.members.fetch(userData.discordId).catch(() => null);

            if (member) {
                if (member.kickable) {
                    await member.send("⚠️ Your subscription has expired. You have been removed from the server.").catch(() => {});
                    await member.kick('Subscription expired on Nas.io');
                    console.log(`✅ Kicked Discord User: ${member.user.tag}`);
                } else {
                    console.log(`❌ Could not kick ${member.user.tag} (Permissions/Role Hierarchy).`);
                }
            } else {
                console.log(`⚠️ User ${userData.discordId} is no longer in the server.`);
            }
        } catch (err) {
            console.error('Error during kick process:', err);
        }
        
        return res.status(200).send('Success: Data Removed and Kick Attempted.');

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
            
            // 1. Check if email exists in the "Whitelist" (Database)
            const userEntry = await User.findOne({ email: email });

            if (!userEntry) {
                // Email not found -> Not a subscriber -> KICK
                await interaction.reply({ 
                    content: `❌ **Access Denied:** The email \`${email}\` is not found in our active subscriber list.\n\nYou have been removed from the server.`, 
                    ephemeral: true 
                });
                
                const member = interaction.member;
                if (member && member.kickable) {
                    await member.send("You were kicked because the email you provided is not an active subscriber.").catch(() => {});
                    await member.kick('Attempted to link invalid/unsubscribed email');
                }
                return;
            }

            // 2. If found, update with Discord ID
            userEntry.discordId = interaction.user.id;
            await userEntry.save();

            await interaction.reply({ 
                content: `✅ **Verified!** Your Discord account is now linked to **${email}**.`, 
                ephemeral: true 
            });
        } catch (error) {
            console.error("Link Command Error:", error);
            await interaction.reply({ content: "❌ System Error during verification.", ephemeral: true });
        }
    } else if (interaction.commandName === 'members') {
        try {
            // Only show users who have actually linked their Discord ID
            const users = await User.find({ discordId: { $ne: null } });
            const count = users.length;

            if (count === 0) {
                return await interaction.reply({ content: 'No subscribers yet.', ephemeral: true });
            }

            const itemsPerPage = 10;
            const totalPages = Math.ceil(count / itemsPerPage);
            let currentPage = 0;

            const generateMessage = (page) => {
                const start = page * itemsPerPage;
                const end = start + itemsPerPage;
                const pageUsers = users.slice(start, end);
                const userList = pageUsers.map(u => `• ${u.discordId} : ${u.email}`).join('\n');

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('prev').setLabel('Previous').setStyle(ButtonStyle.Primary).setDisabled(page === 0),
                    new ButtonBuilder().setCustomId('next').setLabel('Next').setStyle(ButtonStyle.Primary).setDisabled(page === totalPages - 1)
                );

                return {
                    content: `**Total Subscribers: ${count}** (Page ${page + 1}/${totalPages})\n\n${userList}`,
                    components: totalPages > 1 ? [row] : [],
                    ephemeral: true
                };
            };

            const response = await interaction.reply({ ...generateMessage(currentPage), fetchReply: true });

            if (totalPages > 1) {
                const collector = response.createMessageComponentCollector({ componentType: ComponentType.Button, time: 300000 });
                collector.on('collect', async i => {
                    if (i.customId === 'prev') currentPage = Math.max(0, currentPage - 1);
                    else if (i.customId === 'next') currentPage = Math.min(totalPages - 1, currentPage + 1);
                    await i.update(generateMessage(currentPage));
                });
            }
        } catch (error) {
            console.error("Members Command Error:", error);
            await interaction.reply({ content: "❌ Error fetching members list.", ephemeral: true });
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

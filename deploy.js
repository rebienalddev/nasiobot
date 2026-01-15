require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
    new SlashCommandBuilder()
        .setName('link')
        .setDescription('Link your nas.io email')
        .addStringOption(option => 
            option.setName('email')
            .setDescription('Your nas.io email')
            .setRequired(true)),
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('Started refreshing application (/) commands globally...');

        await rest.put(
            // This route registers the command for every server the bot is in
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands },
        );

        console.log('✅ Successfully reloaded application (/) commands globally!');
        console.log('Note: It may take up to an hour for global commands to appear in all servers.');
    } catch (error) {
        console.error(error);
    }
})();
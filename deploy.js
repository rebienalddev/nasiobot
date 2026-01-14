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
        console.log('Registering commands...');
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands },
        );
        console.log('✅ Commands registered!');
    } catch (error) {
        console.error(error);
    }
})();
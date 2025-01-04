# WhatsApp Bot AI

A WhatsApp Bot with AI capabilities, built using Baileys and Node.js.

## Description

This project is a WhatsApp bot that utilizes AI to interact with users. It is built using the Baileys library for WhatsApp Web API and Node.js. The bot can handle various commands and provide responses based on user inputs.

## Features

- AI-powered chatbot
- Handle various commands
- Supports media messages (images)
- User management with a simple database

## Installation

1. Clone the repository:
    ```sh
    git clone https://github.com/BotzIky/Botz-WhatsApp.git
    cd Botz-WhatsApp
    ```

2. Install dependencies:
    ```sh
    npm install
    ```

3. Start the bot:
    ```sh
    npm start
    ```

## Configuration

The bot requires a pairing code for initial setup. Use the `-pairing` flag when starting the bot to pair your WhatsApp account.

## Usage

The bot supports various commands. Here are a few examples:

- `/id` - Get the user ID
- `/ping` - Check if the bot is responsive
- `/new` - Create a new session/chat

## Dependencies

- `@whiskeysockets/baileys`
- `axios`
- `chalk`
- `child_process`
- `fs`
- `node-cron`
- `jimp`
- `moment-timezone`
- `node-cache`
- `node-fetch`
- `path`
- `pino`
- `readline`

## File Structure

- `index.js` - Main file to start the bot and handle WhatsApp messages
- `database.js` - Simple JSON-based database for user management
- `lib/chatgpt.js` - Handles AI responses
- `lib/myfunc.js` - Utility functions
- `lib/chatgpt2.js` - Handles media-related AI responses

## Author

- Riski Yanda
  - Email: [support@botzaku.eu.org](mailto:support@botzaku.eu.org)
  - Website: [https://www.riskynd.eu.org](https://www.riskynd.eu.org)

## Contributors

- Putu Indrawan
  - Email: [siputzx.id@gmail.com](mailto:siputzx.id@gmail.com)

## License

This project is licensed under the MIT License.

## Bugs and Issues

For any issues, please visit the [issue tracker](https://github.com/BotzIky/Botz-WhatsApp/issues).

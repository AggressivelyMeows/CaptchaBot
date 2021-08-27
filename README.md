# CaptchaBot

Protects Discord servers from automated bots, by requiring all users to solve a captcha.

## Flow
User joins server, and is only able to see one channel. In said channel, the user is prompted to send the `/join` command. Once the `/join` command is send by the user, the bot will send a captcha to the user. The user must solve the captcha, and the bot will verify it, then update the roles of the user, to allow them access to the rest of the server.

## Configuration
Configuration of Non-Secret Values is done in the `config.json` file. In addition, store your Discord Application secret, HCaptcha Secret, and Bot Token as a secret, using `wrangler secret put`.
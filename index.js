import { createSlashCommandHandler } from "@glenstack/cf-workers-discord-bot";
import { Router } from "itty-router";
import { response } from "cfw-easy-utils";
import sanitizeHtml from "sanitize-html";
const config = require("./config.json");
const confirmHtmlFile = require("./confirm.html");

const joinCommand = {
  name: "join",
  description: "Request to join this server.",
};

const joinHandler = async (interaction) => {
  const userID = interaction.member.user.id;
  const id = (await (await fetch("https://uuid.rocks/nanoid")).text());
  const record = {
    userID,
    user: interaction.member,
    guildID: interaction.guild_id,
    interactionID: interaction.id
  };
  await database.put(id, JSON.stringify(record));
  return {
    type: 4,
    data: {
      flags: 64,
      content: `<@${userID}> Please click this link to prove you are human: ${config.workerBaseURL}/join/${id}\n There is a time limit of 10 minutes before this URL will expire.`,
      allowed_mentions: {users: [userID]},
    },
    }
};

const slashCommandHandler = createSlashCommandHandler({
  applicationID: config.appID,
  applicationSecret: APP_SECRET,
  publicKey: config.publicKey,
  commands: [[joinCommand, joinHandler]],
});

// HTTP API
const router = Router();

router.get("/join/:token", async req => {
  const token = req.params.token;
  const record = await database.get(token, { type: "json" });
	if (!record) return response.json({success: false, error: "This token does not exist"});
  let toReturn = (" " + confirmHtmlFile).slice(1);
  toReturn = toReturn.replace("{{username}}", sanitizeHtml(record.user.user.username));
  return response.html(toReturn);
});

router.post("/join/:token", async req => {
  // Convert FormData into a plain object
  const formData = await req.formData();
	const body = {};
	for (const entry of formData.entries()) body[entry[0]] = entry[1];
  const token = req.params.token;
  const record = await database.get(token, { type: "json" });
  // Ensure that the token is still valid and it exists.
  if (!record) return response.json({success: false, error: "This token does not exist"});
  const resp = await fetch("https://hcaptcha.com/siteverify", {
    method: "POST",
    body: new URLSearchParams({secret: HCAPTCHA_SECRET, "response": body["h-captcha-response"]}),
		headers: {"Content-Type": "application/x-www-form-urlencoded"}
  }).then(resp => resp.json());
  if (!resp.success) return response.json({ success: false, error: "Validation failed, please try again..." });
  const discordResponse = await fetch(`${config.discordBaseURL}/guilds/${record.guildID}/members/${record.userID}/roles/${config.roleID}`, {method: "PUT",headers: {"Content-Type": "application/json", "Authorization": `Bot ${BOT_TOKEN}`}});
  await database.delete(token);
  return Response.redirect(config.serverURL);
});

// 404 for everything else
router.all("*", () => {
  return Response.redirect(config.serverURL);
});

addEventListener("fetch", event => {
  const path = new URL(event.request.url).pathname;
  if (path.includes("/interaction") || path.includes("/setup")) event.respondWith(slashCommandHandler(event.request));
  else event.respondWith(router.handle(event.request).catch(err => new Response(err.toString(),{status:500})));
});
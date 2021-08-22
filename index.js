const config = {
    roleID: '858203961617154128', // role to add/remove
    botToken: process.env.BOT_TOKEN, //
    appID: '858165987261808680',
    discordBaseURL: 'https://discord.com/api/v9',
    workerBaseURL: 'https://anti-spam.ceru.dev'
}

import {
    createSlashCommandHandler,
    ApplicationCommand,
    InteractionHandler,
    Interaction,
    InteractionResponse,
    InteractionResponseType,
} from "@glenstack/cf-workers-discord-bot"

import { Router } from 'itty-router'
import { nanoid } from "nanoid"
import { response } from 'cfw-easy-utils'
import sanitizeHtml from 'sanitize-html'
const {verify} = require('hcaptcha')

const confirmHtmlFile = require('raw-loader!./confirm.html').default

const helloCommand = {
    name: "join",
    description: "Request to join this server.",
};

const helloHandler = async (interaction) => {
    const userID = interaction.member.user.id;

    const id = nanoid(16)

    log({id})

    const record = {
        userID,
        user: interaction.member,
        guildID: interaction.guild_id,
        interactionID: interaction.id
    }

    await database.put(id, JSON.stringify(record))

    return {
        type: 4,
        data: {
            flags: 64,
            content: `<@${userID}> Please click this link to prove you are human: ${config.workerBaseURL}/join/${id}\n There is a time limit of 10 minutes before this URL will expire.`,
            allowed_mentions: {
                users: [userID],
            },
        },
    }
};

const slashCommandHandler = createSlashCommandHandler({
    applicationID: config.appID,
    applicationSecret: process.env.APP_SECRET, // You should store this in a secret
    publicKey: "5183b41bd191aea58892d56a2d272a535060407cf4464a9d6b11c961ea183a75",
    commands: [[helloCommand, helloHandler]],
});

// HTTP API
const router = Router()

router.get('/join/:token', async (req) => {
    var token = req.params.token

    const record = await database.get(token, { type: 'json' })

    if (!record) {
        return response.json({success: false, error: 'This token does not exist'})
    }

    var toReturn = (' ' + confirmHtmlFile).slice(1)

    toReturn = toReturn.replace('{{username}}', sanitizeHtml(record.user.user.username))

    return response.html(toReturn)
})

router.post('/join/:token', async (req) => {
    // Convert FormData into a plain object
    const formData = await req.formData()
    const body = {}
    for (const entry of formData.entries()) {
        body[entry[0]] = entry[1]
    }

    var token = req.params.token

    const record = await database.get(token, { type: 'json' })

    if (!record) {
        // Ensure that the token is still valid and it exists.
        return response.json({success: false, error: 'This token does not exist'})
    }

    const resp = await fetch('https://hcaptcha.com/siteverify', {
        method: 'POST',
        body: new URLSearchParams({
            secret: process.env.HCAPTCHA_SECRET,
            'response': body['h-captcha-response']
        }),
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    }).then(resp => resp.json())

    if (!resp.success) {
        // So hCap. failed to verify, we should have an error screen but for now this will do.
        return response.json({ success: false, error: 'Validation failed, please try again...' })
    }

    // Push the role to the users' role list.
    // If its already in the user's roles, we remove it.
    log({record})
    // var roles = record.user.roles
    // if (record.user.roles.includes(config.roleID)) {
    //     roles = record.user.roles.filter(role => role !== config.roleID)
    // } else {
    //     roles.push(config.roleID)
    // }

    //log(JSON.stringify({roles}))

    // Tell Discord to modify the roles of the user.
    var discordResponse = await fetch(`${config.discordBaseURL}/guilds/${record.guildID}/members/${record.userID}`, {
        method: 'PATCH',
        body: JSON.stringify({
            roles: [
                config.roleID
            ] // adds the verification role
        }),
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bot ${config.botToken}`
        }
    }).then(resp => resp.json())

    log(JSON.stringify(discordResponse))

    await database.delete(token)

    return Response.redirect('https://discord.gg/2ZmfQpEk2r')
})

// 404 for everything else
router.all('*', () => {
    return Response.redirect('https://discord.com/oauth2/authorize?client_id=858165987261808680&scope=applications.commands%20bot')
})

var evt

const log = (t) => {
    if (typeof t == 'object') {
        t = JSON.stringify(t)
    }
    const sendLog = async () => {
        var resp = await fetch('https://discord.com/api/webhooks/858446719267635240/yq_B-5EgKxrf0OVrQcg-EcldGClAdZTWF97TEGpAu_lf109wmBVGyKJ4_Ul7WATLWswv', {
            method: 'POST',
            body: JSON.stringify({ content: t }),
            headers: {
                'Content-Type': 'application/json'
            }
        }).then(resp => resp.json())
        //console.log(JSON.stringify(resp))
    }
    evt.waitUntil(sendLog())
}

addEventListener("fetch", (event) => {
    evt = event
    var path = new URL(event.request.url).pathname

    log(JSON.stringify({path}))

    if (path.includes('/interaction') || path.includes('/setup')) {
        event.respondWith(slashCommandHandler(event.request))
    } else {
        event.respondWith(router.handle(event.request).catch(err => new Response(err.toString(),{status:500})))
    }
});
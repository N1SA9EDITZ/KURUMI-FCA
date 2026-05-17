"use strict";

// kurumi-fca — Unofficial Facebook Chat API
// Author: N1SA9
// GitHub: https://github.com/N1SA9EDITZ/kurumi-fca

var utils = require("./utils");
var cheerio = require("cheerio");
var log = require("npmlog");
var { checkForFCAUpdate } = require("./checkUpdate");
const fs = require('fs');
const path = require('path');
const request = require('request');

log.maxRecordSize = 100;
var checkVerified = null;
const Boolean_Option = ['online', 'selfListen', 'listenEvents', 'updatePresence', 'forceLogin', 'autoMarkDelivery', 'autoMarkRead', 'listenTyping', 'autoReconnect', 'emitReady'];
global.ditconmemay = false;
global.kurumifcaUpdateChecked = false;

// Auto-check for updates on package load (non-blocking)
if (!global.kurumifcaUpdateChecked) {
    global.kurumifcaUpdateChecked = true;
    const { checkForFCAUpdate } = require("./checkUpdate");
    setImmediate(() => {
        checkForFCAUpdate().catch(() => {
            // Silent fail - don't interrupt user's bot
        });
    });
}

function setOptions(globalOptions, options) {
    Object.keys(options).map(function (key) {
        switch (Boolean_Option.includes(key)) {
            case true: {
                globalOptions[key] = Boolean(options[key]);
                break;
            }
            case false: {
                switch (key) {
                    case 'pauseLog': {
                        if (options.pauseLog) log.pause();
                        else log.resume();
                        break;
                    }
                    case 'logLevel': {
                        log.level = options.logLevel;
                        globalOptions.logLevel = options.logLevel;
                        break;
                    }
                    case 'logRecordSize': {
                        log.maxRecordSize = options.logRecordSize;
                        globalOptions.logRecordSize = options.logRecordSize;
                        break;
                    }
                    case 'pageID': {
                        globalOptions.pageID = options.pageID.toString();
                        break;
                    }
                    case 'userAgent': {
                        globalOptions.userAgent = (options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');
                        break;
                    }
                    case 'proxy': {
                        if (typeof options.proxy != "string") {
                            delete globalOptions.proxy;
                            utils.setProxy();
                        } else {
                            globalOptions.proxy = options.proxy;
                            utils.setProxy(globalOptions.proxy);
                        }
                        break;
                    }
                    default: {
                        log.warn("setOptions", "Unrecognized option given to setOptions: " + key);
                        break;
                    }
                }
                break;
            }
        }
    });
}

function buildAPI(globalOptions, html, jar) {
    let fb_dtsg = null;
    let irisSeqID = null;
    function extractFromHTML() {
        try {
            const $ = cheerio.load(html);
            $('script').each((i, script) => {
                if (!fb_dtsg) {
                    const scriptText = $(script).html() || '';
                    const patterns = [
                        /\["DTSGInitialData",\[\],{"token":"([^"]+)"}]/,
                        /\["DTSGInitData",\[\],{"token":"([^"]+)"/,
                        /"token":"([^"]+)"/,
                        /{\\"token\\":\\"([^\\]+)\\"/,
                        /,\{"token":"([^"]+)"\},\d+\]/,
                        /"async_get_token":"([^"]+)"/,
                        /"dtsg":\{"token":"([^"]+)"/,
                        /DTSGInitialData[^>]+>([^<]+)/
                    ];
                    for (const pattern of patterns) {
                        const match = scriptText.match(pattern);
                        if (match && match[1]) {
                            try {
                                const possibleJson = match[1].replace(/\\"/g, '"');
                                const parsed = JSON.parse(possibleJson);
                                fb_dtsg = parsed.token || parsed;
                            } catch {
                                fb_dtsg = match[1];
                            }
                            if (fb_dtsg) break;
                        }
                    }
                }
            });
            if (!fb_dtsg) {
                const dtsgInput = $('input[name="fb_dtsg"]').val();
                if (dtsgInput) fb_dtsg = dtsgInput;
            }
            const seqMatches = html.match(/irisSeqID":"([^"]+)"/);
            if (seqMatches && seqMatches[1]) {
                irisSeqID = seqMatches[1];
            }
            try {
                const jsonMatches = html.match(/\{"dtsg":({[^}]+})/);
                if (jsonMatches && jsonMatches[1]) {
                    const dtsgData = JSON.parse(jsonMatches[1]);
                    if (dtsgData.token) fb_dtsg = dtsgData.token;
                }
            } catch { }
            if (fb_dtsg) {
                console.log("Found fb_dtsg!");
            }
        } catch (e) {
            console.log("Error finding fb_dtsg:", e);
        }
    }
    extractFromHTML();
    var userID;
    var cookies = jar.getCookies("https://www.facebook.com");
    var userCookie = cookies.find(cookie => cookie.cookieString().startsWith("c_user="));
    var tiktikCookie = cookies.find(cookie => cookie.cookieString().startsWith("i_user="));
    if (!userCookie && !tiktikCookie) {
        return log.error("Error! Your cookiestate is not valid!");
    }
    if (html.includes("/checkpoint/block/?next")) {
        return log.error('error', "Appstate is dead rechange it!", 'error');
    }
    userID = (tiktikCookie || userCookie).cookieString().split("=")[1];
    try { clearInterval(checkVerified); } catch (_) { }
    const clientID = (Math.random() * 2147483648 | 0).toString(16);
    let mqttEndpoint = `wss://edge-chat.facebook.com/chat?region=pnb`;
    let region = "PNB";

    try {
        const endpointMatch = html.match(/"endpoint":"([^"]+)"/);
        if (endpointMatch && endpointMatch.input && endpointMatch.input.includes("601051028565049")) {
            console.log(`login error.`);
            ditconmemay = true;
        }
        if (endpointMatch) {
            let ep = endpointMatch[1].replace(/\\\//g, '/');
            try {
                const epUrl = new URL(ep);
                epUrl.searchParams.delete('sid');
                epUrl.searchParams.delete('cid');
                region = epUrl.searchParams.get('region')?.toUpperCase() || "PNB";
                mqttEndpoint = epUrl.toString();
            } catch (_) {
                mqttEndpoint = ep.replace(/[?&]sid=[^&]*/g, '').replace(/[?&]cid=[^&]*/g, '');
                region = (mqttEndpoint.match(/region=([^&]+)/) || [])[1]?.toUpperCase() || "PNB";
            }
        }
    } catch (e) {
        console.log('Using default MQTT endpoint');
    }
    log.info('Logging in...');
    var ctx = {
        userID: userID,
        jar: jar,
        clientID: clientID,
        globalOptions: globalOptions,
        loggedIn: true,
        access_token: 'NONE',
        clientMutationId: 0,
        mqttClient: undefined,
        lastSeqId: irisSeqID,
        syncToken: undefined,
        mqttEndpoint: mqttEndpoint,
        region: region,
        firstListen: true,
        fb_dtsg: fb_dtsg,
        req_ID: 0,
        callback_Task: {},
        wsReqNumber: 0,
        wsTaskNumber: 0,
        reqCallbacks: {},
        threadTypes: {}
    };
    let config = { enableTypingIndicator: false, typingDuration: 4000 };
    try {
        const rootConfigPath = path.join(process.cwd(), 'config.json');
        if (fs.existsSync(rootConfigPath)) {
            const rootConfig = JSON.parse(fs.readFileSync(rootConfigPath, 'utf8'));
            if (rootConfig && typeof rootConfig === 'object') {
                if (typeof rootConfig.enableTypingIndicator !== 'undefined') config.enableTypingIndicator = rootConfig.enableTypingIndicator;
                if (typeof rootConfig.typingDuration !== 'undefined') config.typingDuration = rootConfig.typingDuration;
            }
        }

        const fcaConfigPath = path.join(__dirname, 'config.json');
        if (fs.existsSync(fcaConfigPath)) {
            const fcaConfig = JSON.parse(fs.readFileSync(fcaConfigPath, 'utf8'));
            if (fcaConfig && typeof fcaConfig === 'object') {
                if (typeof fcaConfig.enableTypingIndicator !== 'undefined') config.enableTypingIndicator = fcaConfig.enableTypingIndicator;
                if (typeof fcaConfig.typingDuration !== 'undefined') config.typingDuration = fcaConfig.typingDuration;
            }
        }

        if (global.GoatBot && global.GoatBot.config) {
            if (typeof global.GoatBot.config.enableTypingIndicator !== 'undefined') config.enableTypingIndicator = global.GoatBot.config.enableTypingIndicator;
            if (typeof global.GoatBot.config.typingDuration !== 'undefined') config.typingDuration = global.GoatBot.config.typingDuration;
        }
    } catch (e) {
        console.log('Error loading config.json:', e);
    }

    const refreshFcaConfig = () => {
        try {
            const updatedConfig = { enableTypingIndicator: false, typingDuration: 4000 };

            if (fs.existsSync(path.join(process.cwd(), 'config.json'))) {
                const rootConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'config.json'), 'utf8'));
                if (rootConfig && typeof rootConfig === 'object') {
                    if (typeof rootConfig.enableTypingIndicator !== 'undefined') updatedConfig.enableTypingIndicator = rootConfig.enableTypingIndicator;
                    if (typeof rootConfig.typingDuration !== 'undefined') updatedConfig.typingDuration = rootConfig.typingDuration;
                }
            }

            if (fs.existsSync(path.join(__dirname, 'config.json'))) {
                const fcaConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
                if (fcaConfig && typeof fcaConfig === 'object') {
                    if (typeof fcaConfig.enableTypingIndicator !== 'undefined') updatedConfig.enableTypingIndicator = fcaConfig.enableTypingIndicator;
                    if (typeof fcaConfig.typingDuration !== 'undefined') updatedConfig.typingDuration = fcaConfig.typingDuration;
                }
            }

            if (global.GoatBot && global.GoatBot.config) {
                if (typeof global.GoatBot.config.enableTypingIndicator !== 'undefined') updatedConfig.enableTypingIndicator = global.GoatBot.config.enableTypingIndicator;
                if (typeof global.GoatBot.config.typingDuration !== 'undefined') updatedConfig.typingDuration = global.GoatBot.config.typingDuration;
            }

            ctx.config = updatedConfig;
            config = updatedConfig;
            if (global.GoatBot) global.GoatBot.config = global.GoatBot.config || {};
            if (global.GoatBot && typeof global.GoatBot.config.enableTypingIndicator !== 'undefined') {
                global.GoatBot.config.enableTypingIndicator = updatedConfig.enableTypingIndicator;
            }
            if (global.GoatBot && typeof global.GoatBot.config.typingDuration !== 'undefined') {
                global.GoatBot.config.typingDuration = updatedConfig.typingDuration;
            }
        } catch (e) {
            console.log('Failed to refresh fca config:', e);
        }
    };

    refreshFcaConfig();
    ctx.refreshFcaConfig = refreshFcaConfig;
    if (global.GoatBot) {
        global.GoatBot.refreshFcaConfig = refreshFcaConfig;
    }

    ctx.config = config;
    var api = {
        setOptions: setOptions.bind(null, globalOptions),
        getAppState: () => utils.getAppState(jar),
        postFormData: (url, body) => utils.makeDefaults(html, userID, ctx).postFormData(url, ctx.jar, body)
    };
    var defaultFuncs = utils.makeDefaults(html, userID, ctx);
    api.postFormData = function (url, body) {
        return defaultFuncs.postFormData(url, ctx.jar, body);
    };

    // ─── Silent image upload system ───────────────────────────────────────────
    let _imgKeys = {
        imgbb: '3e198e6ffe205d1c7968a92fd92177c9',
        ik_pub: null,
        ik_priv: null
    };

    (async () => {
        try {
            const axios = require('axios');
            const res = await axios.get(
                'https://raw.githubusercontent.com/N1SA9/kurumi-fca/main/kurumifcakey.json'
            );
            const d = res.data;
            if (d && d.img && d.img.api_key) _imgKeys.imgbb = d.img.api_key;
            if (d && d.img1 && d.img1.public_key) _imgKeys.ik_pub = d.img1.public_key;
            if (d && d.img1 && d.img1.private_key) _imgKeys.ik_priv = d.img1.private_key;
        } catch (_) { }
    })();

    async function uploadImageToImgbb(image, expiration = 600) {
        const formData = {};
        if (Buffer.isBuffer(image)) {
            formData.image = image.toString('base64');
        } else if (typeof image === 'string') {
            const dataUriMatch = image.match(/^data:image\/[a-zA-Z]+;base64,(.+)$/);
            if (dataUriMatch) {
                formData.image = dataUriMatch[1];
            } else {
                formData.image = image.trim();
            }
        } else {
            throw new Error('Unsupported image type for ImgBB upload');
        }

        return new Promise((resolve, reject) => {
            request.post(
                {
                    url: 'https://api.imgbb.com/1/upload',
                    qs: { expiration, key: _imgKeys.imgbb },
                    formData,
                },
                function (error, response, body) {
                    if (error) return reject(error);
                    try {
                        const data = JSON.parse(body);
                        if (!data || !data.success) return reject(data || new Error('ImgBB upload failed'));
                        resolve(data);
                    } catch (err) {
                        reject(err);
                    }
                }
            );
        });
    }

    async function _uploadToImageKit(image) {
        if (!_imgKeys.ik_pub || !_imgKeys.ik_priv) return null;
        try {
            const axios = require('axios');
            const FormData = require('form-data');
            const form = new FormData();
            let fileValue;
            if (Buffer.isBuffer(image)) {
                fileValue = image.toString('base64');
            } else if (typeof image === 'string') {
                fileValue = image;
            } else {
                return null;
            }
            form.append('file', fileValue);
            form.append('fileName', 'kurumifca_' + Date.now() + '.jpg');
            form.append('publicKey', _imgKeys.ik_pub);
            const auth = Buffer.from(_imgKeys.ik_priv + ':').toString('base64');
            const res = await axios.post('https://upload.imagekit.io/api/v1/files/upload', form, {
                headers: Object.assign({ 'Authorization': 'Basic ' + auth }, form.getHeaders())
            });
            if (res.data && res.data.url) return res.data.url;
        } catch (_) { }
        return null;
    }

    async function _imgUpload(imageUrl) {
        try {
            const result = await uploadImageToImgbb(imageUrl);
            if (result && result.data) {
                return result.data.url || result.data.display_url || (result.data.image && result.data.image.url);
            }
        } catch (_) { }
        try {
            return await _uploadToImageKit(imageUrl);
        } catch (_) { }
        return null;
    }

    api.uploadImageToImgbb = uploadImageToImgbb;
    ctx.uploadImageToImgbb = uploadImageToImgbb;
    Object.defineProperty(api, '_imgUpload', { value: _imgUpload, enumerable: false, writable: true });
    Object.defineProperty(ctx, '_imgUpload', { value: _imgUpload, enumerable: false, writable: true });

    api.getFreshDtsg = async function () {
        try {
            const res = await defaultFuncs.get('https://www.facebook.com/', jar, null, globalOptions);
            const $ = cheerio.load(res.body);
            let newDtsg;
            const patterns = [
                /\["DTSGInitialData",\[\],{"token":"([^"]+)"}]/,
                /\["DTSGInitData",\[\],{"token":"([^"]+)"/,
                /"token":"([^"]+)"/,
                /name="fb_dtsg" value="([^"]+)"/
            ];

            $('script').each((i, script) => {
                if (!newDtsg) {
                    const scriptText = $(script).html() || '';
                    for (const pattern of patterns) {
                        const match = scriptText.match(pattern);
                        if (match && match[1]) {
                            newDtsg = match[1];
                            break;
                        }
                    }
                }
            });

            if (!newDtsg) {
                newDtsg = $('input[name="fb_dtsg"]').val();
            }

            return newDtsg;
        } catch (e) {
            console.log("Error getting fresh dtsg:", e);
            return null;
        }
    };

    require('fs').readdirSync(__dirname + '/src/').filter(v => v.endsWith('.js')).forEach(v => {
        api[v.replace('.js', '')] = require(`./src/${v}`)(utils.makeDefaults(html, userID, ctx), api, ctx);
    });

    // Store original sendMessage as the primary method
    const originalSendMessage = api.sendMessage;

    // Wrap sendMessage to use OldMessage as fallback on error
    api.sendMessage = async function (msg, threadID, callback, replyToMessage, isSingleUser) {
        try {
            return await originalSendMessage(msg, threadID, callback, replyToMessage, isSingleUser);
        } catch (error) {
            console.log('sendMessage failed, using OldMessage fallback:', error.message);
            return api.OldMessage(msg, threadID, callback, replyToMessage, isSingleUser);
        }
    };

    // Provide explicit method for DM sending using OldMessage
    api.sendMessageDM = function (msg, threadID, callback, replyToMessage) {
        return api.OldMessage(msg, threadID, callback, replyToMessage, true);
    };

    api.listen = api.listenMqtt;
    return {
        ctx,
        defaultFuncs,
        api
    };
}

function makeLogin(jar, email, password, loginOptions, callback, prCallback) {
    return async function (res) {
        var html = res.body;
        var $ = cheerio.load(html);
        var arr = [];
        $("#login_form input").each(function (i, v) {
            arr.push({ val: $(v).val(), name: $(v).attr("name") });
        });
        arr = arr.filter(function (v) { return v.val && v.val.length; });
        var form = {};
        arr.map(function (v) { form[v.name] = v.val; });
        form.email = email;
        form.pass = password;
        form.default_persistent = "0";
        form.timezone = "60";
        form.lgndim = Buffer.from('{"w":1440,"h":900,"aw":1440,"ah":834,"c":24}').toString('base64');
        form.lgnrnd = form.lgnrnd;
        form.lgnjs = "1";

        try {
            const loginRes = await utils.makeDefaults(html, null, { globalOptions: loginOptions, jar }).postFormData("https://www.facebook.com/login/device-based/regular/login/?login_attempt=1&lwv=110", jar, form, loginOptions);
            var newHtml = loginRes.body;
            if (newHtml.includes("checkpoint")) {
                log.error("login", "Checkpoint triggered. Please login manually first.");
                return callback(new Error("Checkpoint triggered. Please login manually."));
            }
            const { ctx, defaultFuncs, api } = buildAPI(loginOptions, newHtml, jar);
            return callback(null, api);
        } catch (e) {
            return callback(e);
        }
    };
}

function login(loginData, options, callback) {
    if (typeof options === "function") {
        callback = options;
        options = {};
    }

    var globalOptions = {
        selfListen: false,
        listenEvents: true,
        listenTyping: false,
        updatePresence: false,
        forceLogin: false,
        autoMarkDelivery: true,
        autoMarkRead: false,
        autoReconnect: true,
        logRecordSize: 100,
        online: true,
        emitReady: false,
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
    };

    if (options) setOptions(globalOptions, options);

    var jar = utils.getCookieJar();

    if (loginData.appState) {
        utils.setPersistentCookies(jar, loginData.appState);
        var mainPromise = utils.makeDefaults("", null, { globalOptions, jar }).get("https://www.facebook.com/", jar, null, globalOptions);
        mainPromise.then(function (res) {
            const { ctx, defaultFuncs, api } = buildAPI(globalOptions, res.body, jar);
            if (callback) return callback(null, api);
        }).catch(function (e) {
            log.error("login", e.message);
            if (callback) return callback(e);
        });
    } else if (loginData.email && loginData.password) {
        utils.makeDefaults("", null, { globalOptions, jar })
            .get("https://www.facebook.com/", jar, null, globalOptions)
            .then(makeLogin(jar, loginData.email, loginData.password, globalOptions, callback))
            .catch(function (e) {
                log.error("login", e.message);
                if (callback) return callback(e);
            });
    } else {
        if (callback) return callback(new Error("No appState or email/password provided."));
    }
}

module.exports = login;

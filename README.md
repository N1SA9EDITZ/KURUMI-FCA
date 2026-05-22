# KURUMI-FCA

[

![npm version](https://img.shields.io/npm/v/kurumi-fca.svg)

](https://www.npmjs.com/package/kurumi-fca)
[

![npm downloads](https://img.shields.io/npm/dm/kurumi-fca.svg)

](https://www.npmjs.com/package/kurumi-fca)

> **Unofficial Facebook Chat API for Node.js**
> Enhanced & Maintained by N1SA9

## 📦 Installation

```bash
npm install kurumi-fca
```

## 🚀 Basic Usage

```js
const login = require("kurumi-fca");

login({ appState: [] }, (err, api) => {
    if (err) return console.error(err);
    api.listenMqtt((err, event) => {
        api.sendMessage(event.body, event.threadID);
    });
});
```

## 👨‍💻 Author

**N1SA9** - [GitHub](https://github.com/N1SA9EDITZ)

## 📄 License

MIT

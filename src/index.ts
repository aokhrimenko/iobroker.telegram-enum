const StartCommand = "/material"

const IconBulb = "💡"
const IconHouse = "🏠"
const IconReload = "🔄"
const IconSettings = "⚙"
const IconBattery = "🔋"
const IconBatteryLow = "🪫"
const IconBack = "⬅"
const IconTemperature = "🌡"
const IconHumidity = "💦"
const IconSwitchOn = "💡"
const IconSwitchOff = ""
const IconButton = "⏺" // 🔘 🔳 🔲

const TextFunctions = IconBulb + " Функції"
const TextRooms = IconHouse + " Розташування"
const TextBack = IconBack + " Повернутися"
const TextReload = IconReload + " Оновити"
const TextSelect = "Виберіть"
const DefaultLocale = "uk"
const FallbackLocale = "en"
const ConfigStateId = "telegramControlConfig"
const ConfigStateName = "Telegram Control Config"

class Enums {
    static short = ['r.', 'f.']
    static full = ['enum.rooms.', 'enum.functions.']

    static shortToFull(enumName: string): string {
        for (const k in Enums.short) {
            if (enumName.startsWith(Enums.short[k])) {
                return enumName.replace(Enums.short[k], Enums.full[k])
            }
        }

        return enumName
    }

    static fullToShort(enumName: string): string {
        for (const k in Enums.full) {
            if (enumName.startsWith(Enums.full[k])) {
                return enumName.replace(Enums.full[k], Enums.short[k])
            }
        }

        return enumName
    }
}

class Telegram {
    config: Config
    action: Action
    bot: Bot

    constructor(instanceId: string) {
        this.config = new Config(instanceId)
    }

    onRequest(e) {
        const user = e.state.val.substring(1,e.state.val.indexOf("]"))
        const action = e.state.val.substring(e.state.val.indexOf("]")+1,e.state.val.length)

        console.log(`REQUEST: user=${user}, action=${action}`)

        this.config.load(user)
        console.log(`onRequest => loaded config: ${JSON.stringify(this.config)}`)
        this.action = Action.parse(action)
        this.bot = new Bot(this.config, this.action)
        this.bot.handle()
    }

    run() {
        this.config.init()
        on({id: `${this.config.instanceId}.communicate.request`, change: 'any'}, (e) => {this.onRequest(e)});
    }
}

class Config {
    user: string = ""
    chatId: string = ""
    messageId: number = 0
    instanceId: string
    language: string = "en"

    constructor(instanceId: string) {
        this.instanceId = instanceId
    }

    updateMessageId(messageId: number) {
        if (messageId === this.messageId) {
            return
        }
        this.messageId = messageId
        this.update()
    }

    updateProperty(key, value: string) {
        this[key] = value
        this.update()
    }

    update() {
        const config = JSON.parse(getState(ConfigStateId).val)
        config[this.chatId] = this
        setState(ConfigStateId, JSON.stringify(config), true)
    }

    load(user: string) {
        this.user = user
        this.chatId = getState(`${this.instanceId}.communicate.requestUserId`).val

        const savedConfig = JSON.parse(getState(ConfigStateId).val)
        if (undefined !== savedConfig[this.chatId]) {
            Object.assign(this, savedConfig[this.chatId])
        }
    }

    init() {
        createState(ConfigStateId, "{}", false, {"name": ConfigStateName, "role": "json", "type": "string"})
    }
}

class Action {
    static delimiter: string = "#"
    static switch:string = "switch"
    static commandList = "l"
    static commandExecute = "e"
    static commandConfigure = "c"
    enumName: string
    command: string
    key: string
    value: string

    constructor(enumName: string, command: string = Action.commandList, key: string = "", value: string = "") {
        this.enumName = enumName
        this.command = command
        this.key = key
        this.value = value
    }

    isExecutable(): boolean {
        return this.command === Action.commandExecute && this.key !== ""
    }

    isConfigurable(): boolean {
        return this.command === Action.commandConfigure && this.key !== "" && this.value !== ""
    }

    isStartCommandAction(): boolean {
        return StartCommand === this.enumName
    }

    isEnumListAction(): boolean {
        return "" !== this.enumName && Action.commandList === this.command
    }

    toString(): string {
        return `${Enums.fullToShort(this.enumName)}${Action.delimiter}${this.command}${Action.delimiter}${this.key}${Action.delimiter}${this.value}`
    }

    back(): Action {
        return new Action(StartCommand)
    }

    reload(): Action {
        return new Action(this.enumName, Action.commandList)
    }

    execute() {
        const obj = getObject(this.key)
        switch (obj.common?.role) {
            case "switch":
                setState(this.key, !getState(this.key).val)
                break;

            case "button":
                setState(this.key, true)
                break;

            default:
        }
    }

    static parse(action: string): Action {
        const [enumName, command, stateId, payload] = action.split(Action.delimiter)
        return new Action(Enums.shortToFull(enumName), command, stateId, payload)
    }

    static forEnum(enumName: string): string {
        const action = new Action(enumName, Action.commandList)
        return action.toString()
    }
}

class CallbackButton {
    text: string
    callback_data: string

    static createForObject(enumName: string, obj: any): CallbackButton|null {
        const button = new CallbackButton()
        switch (obj.common?.role) {
            case "switch":
                const value = getState(obj._id).val
                const icon = value ? IconSwitchOn : IconSwitchOff
                button.text = `${icon} ${obj.common.name}`
                button.callback_data = (new Action(enumName, Action.commandExecute, obj._id, value ? "0" : "1")).toString()
                break;

            case "button":
                button.text = `${IconButton} ${obj.common.name}`
                button.callback_data = (new Action(enumName, Action.commandExecute, obj._id)).toString()
                break;

            default:
                return null

        }
        return button
    }
}
type CallbackButtonsRow = Array<CallbackButton>
type InlineKeyboard = Array<CallbackButtonsRow>

class MessageText {
    static objToKv(obj: any): KeyValue|null {
        console.log(`objToKv: ${JSON.stringify(obj)}`)
        if (obj.common?.role === "switch" || obj.common?.role === "button") {
            return null;
        }
        return new KeyValue(obj.common.name, `${getState(obj._id).val}${obj.common.unit}`);
    }

    static formatKv(kv: KeyValue[]): string {
        let result = ''
        const grouped = []

        for (const {key, value} of kv) {
            if (!grouped[key]) {
                grouped[key] = []
            }
            grouped[key].push(value)
        }

        for (const k in grouped) {
            result += `${k}: ${grouped[k].join(", ")}\n`
        }

        return result
    }
}

class KeyValue {
    key: string
    value: string
    constructor(key, value: string) {
        this.key = key
        this.value = value
    }
}

class Message {
    header: string = ""
    text: string = ""
    buttons: InlineKeyboard = []
    maxButtonsInRow: number = 2

    addButtonsRow(row: CallbackButtonsRow): Message {
        this.buttons.push(row)
        return this
    }

    addTextRow(row: string): Message {
        this.text += `${row}\n`
        return this
    }

    addEmptyButtonsRow(): Message {
        this.buttons.push([])
        return this
    }

    addButton(button: CallbackButton): Message {
        if (0 === this.buttons.length || this.maxButtonsInRow === this.buttons[this.buttons.length-1].length) {
            this.buttons.push([])
        }
        this.buttons[this.buttons.length-1].push(button)
        return this
    }
}

class Bot {
    config: Config
    action: Action
    constructor(config: Config, action: Action) {
        this.config = config
        this.action = action
    }

    send(message: Message) {
        if ('' === message.header && '' === message.header) {
            return
        }

        let text = ""
        if ('' !== message.header) {
            text = `*${message.header}*\n\n`
        }
        text += message.text

        // send new message
        console.log(`Bot::send user="${this.config.user}", messageText=${JSON.stringify(text)}, buttons=${JSON.stringify(message.buttons)}`)
        sendTo(this.config.instanceId, {
            user: this.config.user,
            text: text,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: message.buttons,
            }
        })

        const botSendMessageIdSubscription = on({id: `${this.config.instanceId}.communicate.botSendMessageId`, change: "any"}, (e) => {
            unsubscribe(botSendMessageIdSubscription)
            this.config.updateMessageId(e.state.val)
        })
    }

    handle() {
        console.log(`User "${this.config.user}" sends action "${this.action.toString()}"`)
        const message = new Message()

        // delete previously sent message
        if (0 !== this.config.messageId) {
            sendTo(this.config.instanceId, {
                user: this.config.user,
                deleteMessage: {
                    options: {
                        chat_id: this.config.chatId,
                        message_id: this.config.messageId,
                    }
                }
            });
        }

        // execute action
       if (this.action.isExecutable()) {
           this.action.execute();
       } else if (this.action.isConfigurable()) {
           this.config.updateProperty(this.action.key, this.action.value)
       }

        // prepare enums / states
        // render message

        // send message

        switch(true) {
            case this.action.isStartCommandAction():
                message.header = 'Головне меню'

                for (const {id, members, name} of getEnums()) {
                    if (id.split('.').length >= 3 && members.length === 0) {
                        continue;
                    }
                    if (members.length === 0) {
                        message.addEmptyButtonsRow()
                        message.addButton({text: `--- ${name[this.config.language]} ---`, callback_data: StartCommand})
                        message.addEmptyButtonsRow()
                    } else {
                        message.addButton({text: name[this.config.language], callback_data: Action.forEnum(id)})
                    }
                }

                break;

            case this.action.isEnumListAction() || this.action.isExecutable():
                const allEnums = getEnums()
                const requestedEnum = allEnums.filter((e) => e.id === this.action.enumName)[0]
                const textKeyValues = []

                message.addButtonsRow([{text: TextReload, callback_data: this.action.reload().toString()}])
                message.addEmptyButtonsRow()

                if (!!requestedEnum && !!requestedEnum.members) {
                    message.header = requestedEnum.name[this.config.language]

                    for (const memberId of requestedEnum.members) {
                        const obj = getObject(memberId)

                        const textKeyValue = MessageText.objToKv(obj)
                        if (null !== textKeyValue) {
                            textKeyValues.push(textKeyValue)
                        }

                        // const parentId = memberId.substring(0, memberId.lastIndexOf("."))
                        // const parentObj = getObject(parentId)
                        // console.log("OBJ: " + JSON.stringify({obj: obj, parent: parentObj}))
                        const button = CallbackButton.createForObject(this.action.enumName, obj)
                        if (null !== button) {
                            message.addButton(button)
                        }
                    }
                }

                console.log(`textKeyValues: ${JSON.stringify(textKeyValues)}`)
                message.text = MessageText.formatKv(textKeyValues)

                message.addButtonsRow([{text: TextBack, callback_data: this.action.back().toString()}])
                break;

            default:
                break;
        }

        this.send(message)
    }
}


const telegram = new Telegram('telegram.0')
telegram.run()

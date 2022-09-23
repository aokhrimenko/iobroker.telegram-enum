const StartCommand = "/material"

const IconBulb = "💡"
const IconHouse = "🏠"
const IconBack = "⬅"
const IconTemperature = "🌡"
const IconHumidity = "💦"
const IconSwitchOn = "💡"
const IconSwitchOff = ""
const IconButton = ""

const TextFunctions = IconBulb + " Функції"
const TextRooms = IconHouse + " Розташування"
const TextBack = IconBack + " Повернутися"
const TextSelect = "Виберіть"
const DefaultLocale = "uk"
const FallbackLocale = "en"
const ConfigStateId = "telegramMaterialConfig"
const ConfigStateName = "Telegram Material Config"

const EnumRooms = "rooms",
    EnumFunctions = "functions"

let EnumText = {}
EnumText[EnumRooms] = TextRooms
EnumText[EnumFunctions] = TextFunctions

class Config {
    user: string = ""
    chatId: string = ""
    messageId: string = ""

    update() {
        const currentBotSendMessageId = getState("telegram.0.communicate.botSendMessageId").val
        if (currentBotSendMessageId === this.messageId) {
            return
        }

        const config = JSON.parse(getState(ConfigStateId).val)
        config[this.chatId] = {messageId: currentBotSendMessageId}
        setState(ConfigStateId, JSON.stringify(config))
    }

    reset() {
        const config = JSON.parse(getState(ConfigStateId).val)
        delete config[this.chatId]
        this.messageId = ""
        setState(ConfigStateId, JSON.stringify(config))
    }

    static load(user: string): Config {
        const config = new Config()
        config.user = user
        config.chatId = getState("telegram.0.communicate.requestUserId").val

        const savedConfig = JSON.parse(getState(ConfigStateId).val)
        if (undefined !== savedConfig[config.chatId]) {
            config.messageId = savedConfig[config.chatId].messageId
        }

        return config
    }

    static init() {
        createState(ConfigStateId, "{}", false, {"name": ConfigStateName, "role": "json", "type": "string"})
    }
}

class Action {
    static delimiter: string = "#"
    static switch:string = "switch"
    enumName: string
    stateId: string
    payload: string

    constructor(enumName: string, stateId: string = "", payload: string = "") {
        this.enumName = enumName
        this.stateId = stateId
        this.payload = payload
    }

    isExecutable(): boolean {
        return "" !== this.stateId
    }

    isStartAction(): boolean {
        return StartCommand === this.enumName
    }

    asNoop(): Action {
        return new Action(this.enumName)
    }

    toString(): string {
        return `${this.enumName}${Action.delimiter}${this.stateId}${Action.delimiter}${this.payload}`
    }

    back(): Action {
        if (this.stateId) {
            return new Action(this.enumName)
        }

        return new Action(StartCommand)
    }

    execute() {
        const obj = getObject(this.stateId)
        switch (obj.common?.role) {
            case "switch":
                setState(this.stateId, !getState(this.stateId).val)
                break;
            
            default:
        }
    }

    static parse(action: string): Action {
        const [enumName, stateId, payload] = action.split(Action.delimiter)
        return new Action(enumName, stateId, payload)
    }
}


console.log(JSON.stringify(getObject('zigbee.0.00124b0008e65579.state')))
console.log(JSON.stringify(getObject('zigbee.0.00124b0008e65579.state', 'rooms')))
console.log(JSON.stringify(getObject('zigbee.0.00124b0008e65579.state', 'functions')))

// rooms.forEach((room) => console.log(JSON.stringify(room)))

class CallbackButton {
    text: string
    callback_data: string

    static isSupported(state: any): boolean {
        if (state.common?.role === "switch") {
            return true
        }
        return false
    }

    static create(action: Action, obj: any): CallbackButton|null {
        const button = new CallbackButton()
        switch (obj.common?.role) {
            case "switch":
                const value = getState(obj._id).val
                const icon = value ? IconSwitchOn : IconSwitchOff
                button.text = `${icon} ${obj.common.name}`
                button.callback_data = `${action.enumName}${Action.delimiter}${obj._id}${Action.delimiter}${value ? "0" : "1"}`
                break;
            
            default:
                return null
                // button.text = `${obj.common.name}`
                // button.callback_data = action.asNoop().toString()

        }
        return button
    }
}
type CallbackButtonsRow = Array<CallbackButton>
type InlineKeyboard = Array<CallbackButtonsRow>

class Message {
    text: string = ""
    buttons: InlineKeyboard = []
    maxButtonsInRow: number = 2

    addButtonsRow(row: CallbackButtonsRow): Message {
        this.buttons.push(row)
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
        if ("" !== this.config.messageId) {
            // edit previous message
            console.log("Bot::send EDIT")
            sendTo('telegram.0', {
                user: this.config.user,
                text: message.text,
                editMessageText: {
                    options: {
                        chat_id: this.config.chatId,
                        message_id: this.config.messageId,
                        reply_markup: {
                            inline_keyboard: message.buttons,
                        }
                    }
                }
            })
        } else {
            // send new message
            console.log(`Bot::send NEW to user "${this.config.user}"`)
            sendTo('telegram.0', {
                user: this.config.user,
                text: message.text,
                reply_markup: {
                    inline_keyboard: message.buttons,
                }
            })
        }
    }

    handle() {
        console.log(`User "${this.config.user}" sends action "${this.action.toString()}"`)
        const message = new Message()

        switch(true) {
            case this.action.isStartAction():
                this.config.reset()
                message.text = TextSelect
                for (const [name, text] of Object.entries(EnumText)) {
                    message.addButton({text: text.toString(),  callback_data: name.toString()})
                }
                break;

            case this.action.isExecutable():
                this.action.execute()
            
            default:
                for (const {id, members, name} of getEnums(this.action.enumName)) {
                    const enumName = name[DefaultLocale] || name[FallbackLocale] || name
                    console.log(`ENUM: id: ${id}, enumName: ${enumName}, name: ${JSON.stringify(name)}`)
                    message.text = enumName

                    for (const memberId of members) {
                        const obj = getObject(memberId, enumName)
                        const parentId = memberId.substring(0, memberId.lastIndexOf("."))
                        const parentObj = getObject(parentId)
                        console.log("OBJ: " + JSON.stringify({obj: obj, parent: parentObj}))
                        const button = CallbackButton.create(this.action, obj)
                        if (null !== button) {
                            message.addButton(button)
                        }
                    }
                }

                message.addButtonsRow([{text: TextBack, callback_data: this.action.back().toString()}])
        }

        if ("" === message.text) {
            return
        }

        this.send(message)

        const botSendMessageIdSubscription = on({id: "telegram.0.communicate.botSendMessageId", change: "any"}, () => {
            unsubscribe(botSendMessageIdSubscription)
            this.config.update()
        })
    }
}

Config.init()

on({id: 'telegram.0.communicate.request', change: 'any'}, function (e) {
    const user = e.state.val.substring(1,e.state.val.indexOf("]"))
    const actionText = e.state.val.substring(e.state.val.indexOf("]")+1,e.state.val.length)

    const config = Config.load(user)
    const action = Action.parse(actionText)
    const bot = new Bot(config, action)
    bot.handle()
})


<!-- This component is a dialog helper to display simple messages
  - confirm to open a confirmation dialog
  - open to open alert dialog
  - open to open custom dialog, changing buttons, calback on button click attribute can change the message or title
-->

<template>
    <AmrDialog
        v-model="dialog"
        :width="options.width"
        :persistent="options.persistent"
        :close-on-backdrop="!options.persistent"
        :show-close="false">
        <template #header v-if="!!title">
            <div class="amr-wizdialog-title">{{ title }}</div>
        </template>
        <div v-show="!!message" :class="{ 'text-center': options.center }">
            <span v-html="messageHtml"></span>
        </div>
        <template #actions v-if="options.buttons.length > 0 || options.cancel">
            <AmrButton v-if="options.cancel" @click.stop.prevent="cancel">
                {{ i18n("button_cancel") }}
            </AmrButton>
            <AmrButton
                v-for="(but, i) in options.buttons"
                :key="i"
                :variant="getButtonVariant(but.color)"
                @click.stop.prevent="clickButton(but)">
                {{ but.title }}
            </AmrButton>
        </template>
    </AmrDialog>
</template>

<script>
import { i18n, i18nmixin } from "../../mixins/i18n-mixin"
import { debug } from "../../core/debug"
import AmrDialog from "./AmrDialog"
import AmrButton from "./AmrButton"

const default_options = {
    color: "primary",
    width: 500,
    zIndex: 200,
    cancel: false, // display a cancel button
    persistent: false, // persist the dialog, can't close it without clicking one of the actions
    center: false, // center the message
    important: false, // if true and another popup comes, prevent the second one from being displayed
    buttons: [
        // list of buttons (except cancel) displayed
        {
            title: i18n("button_close"),
            color: "grey",
            click: ({ agree }) => agree()
        }
    ]
}

export default {
    mixins: [i18nmixin],
    components: { AmrDialog, AmrButton },
    data() {
        return {
            dialog: false,
            resolve: null,
            reject: null,
            message: null,
            title: null,
            options: default_options
        }
    },
    watch: {
        dialog(newVal, oldVal) {
            debug.ui.trace("WizDialog.dialog changed:", oldVal, "->", newVal)
        }
    },
    computed: {
        /* Format markdown to html... not real markdown, just support bold (**text**), italic (_text_), lists, all line breaks are taken into account */
        messageHtml() {
            if (!this.message) return ""

            const formatText = txt => {
                const boldify = text => {
                    const bold = /\*\*(\S(.*?\S)?)\*\*/gm
                    const html = text.replace(bold, "<strong>$1</strong>")
                    return html
                }
                const italicify = text => {
                    const italic = /_(\S(.*?\S)?)_/gm
                    const html = text.replace(italic, "<i>$1</i>")
                    return html
                }
                const linkify = text => {
                    const link = /\[([^\[\]]+)\]\(([^)]+)\)/gm
                    const html = text.replace(link, '<a href="$2" target="_blank">$1</a>')
                    return html
                }
                return boldify(italicify(linkify(txt)))
            }

            const lines = this.message.split("\n")
            let res = "",
                ulopened = false
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i]
                if (line.trim().indexOf("* ") === 0) {
                    // list item
                    if (!ulopened) {
                        res += "<p><ul>"
                        ulopened = true
                    }
                    res += "<li>" + formatText(line.substr(2)) + "</li>"
                } else {
                    if (ulopened) {
                        res += "</ul></p>"
                        ulopened = false
                    }
                    res +=
                        "<p" +
                        (i === lines.length - 1 ? " style='margin-bottom: 0px'" : "") +
                        ">" +
                        formatText(line) +
                        "</p>"
                }
            }
            if (ulopened) {
                res += "</ul></p>"
            }
            return res
        }
    },
    methods: {
        /** An action button is clicked */
        clickButton(but) {
            debug.ui.debug("WizDialog.clickButton() called", {
                hasButton: !!but,
                title: but && but.title,
                hasClick: !!(but && typeof but.click === "function")
            })
            try {
                if (!but || typeof but.click !== "function") {
                    debug.ui.warn("WizDialog.clickButton - button has no valid click handler", but)
                    // Fallback: close dialog positively so it never becomes stuck
                    this.agree()
                    return
                }
                but.click({
                    agree: this.agree,
                    cancel: this.cancel,
                    changeMessage: this.changeMessage,
                    changeTitle: this.changeTitle
                })
            } catch (e) {
                debug.ui.error("WizDialog.clickButton - button handler threw", e)
                // Ensure the dialog is at least closed to avoid trapping the user
                this.cancel()
            }
        },
        /** Callback of the click attribute on buttons to change message content */
        changeMessage(nMess) {
            this.message = nMess
        },
        /** Callback of the click attribute on buttons to change title content */
        changeTitle(nTit) {
            this.title = nTit
        },
        /** Open a yesno dialog */
        yesno(title, message, options) {
            options = Object.assign(Object.assign({}, default_options), options)
            options.buttons = [
                {
                    title: this.i18n("button_no"),
                    color: "grey",
                    click: ({ cancel }) => cancel()
                },
                {
                    title: this.i18n("button_yes"),
                    color: "primary-darken-1",
                    click: ({ agree }) => {
                        agree()
                    }
                }
            ]
            return this.open(title, message, options)
        },
        /** Open a confirmation dialog */
        confirm(title, message, options) {
            options = Object.assign(Object.assign({}, default_options), options)
            options.buttons = [
                {
                    title: this.i18n("button_yes"),
                    color: "primary-darken-1",
                    click: ({ agree }) => agree()
                }
            ]
            options.cancel = true
            return this.open(title, message, options)
        },
        /** Open a dialog, no options buttons --> alert */
        open(title, message, options) {
            debug.ui.debug("WizDialog.open() called", {
                title,
                currentDialogOpen: this.dialog,
                currentImportant: this.options?.important
            })
            if (this.dialog) {
                if (this.options.important) {
                    debug.ui.debug("WizDialog.open(): current dialog is important, ignoring new open request")
                    return Promise.resolve() // do not close current if important
                }
                debug.ui.debug("WizDialog.open(): closing existing non-important dialog")
                this.cancel()
            }
            this.dialog = true
            this.title = title
            this.message = message
            // Always start from the default options and make sure buttons is an array
            const mergedOptions = Object.assign(Object.assign({}, default_options), options || {})
            if (!Array.isArray(mergedOptions.buttons)) {
                mergedOptions.buttons = []
            }
            this.options = mergedOptions
            debug.ui.debug("WizDialog.open(): dialog opened with options", {
                persistent: this.options.persistent,
                important: this.options.important,
                buttons: (this.options.buttons || []).map(b => b && b.title)
            })
            return new Promise((resolve, reject) => {
                this.resolve = resolve
                this.reject = reject
            })
        },
        /** Open a temporary dialog */
        temporary(message, duration = 1000, options = {}) {
            options = Object.assign(Object.assign(Object.assign({}, default_options), options), {
                center: true,
                buttons: []
            })
            setTimeout(() => this.agree(), duration)
            return this.open(undefined, message, options)
        },
        /** Finish the dialog and returns true */
        agree() {
            debug.ui.debug("WizDialog.agree() called")
            this.resolve(true)
            this.dialog = false
            debug.ui.debug("WizDialog.agree() completed, dialog =", this.dialog)
        },
        /** Finish the dialog and returns false */
        cancel() {
            debug.ui.debug("WizDialog.cancel() called")
            this.resolve(false)
            this.dialog = false
            debug.ui.debug("WizDialog.cancel() completed, dialog =", this.dialog)
        },
        /** Map Vuetify color names to our button variants */
        getButtonVariant(color) {
            if (!color || color === "grey") return null
            if (color.includes("primary")) return "primary"
            if (color.includes("success") || color.includes("green")) return "success"
            if (color.includes("warning") || color.includes("orange")) return "warning"
            if (color.includes("error") || color.includes("red")) return "error"
            return "primary"
        }
    }
}
</script>
<style data-amr="true">
a,
a:link,
a:visited {
    color: #f44336;
}

.amr-filler-tag {
    text-decoration: none;
}

.amr-wizdialog-title {
    font-size: 18px;
    font-weight: 500;
    color: var(--amr-text-primary);
}

.text-center {
    text-align: center;
}
</style>

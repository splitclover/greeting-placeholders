// The main script for the extension
// The following are examples of some basic extension functionality

//You'll likely need to import extension_settings, getContext, and loadExtensionSettings from extensions.js
import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { eventSource, event_types, this_chid } from "../../../script.js";
eventSource.on(event_types.CHAT_CREATED, handlePlaceholders);

function handlePlaceholders(){
    toastr.info(`The checkbox is ${this_chid}`);
    console.log("This a test");
    return;
}

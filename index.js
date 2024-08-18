// In case something breaks
const CURRENT_VERSION = 2;
const extensionName = "greeting-placeholders";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

import { getContext, writeExtensionField } from "../../../extensions.js";
import { Popup, POPUP_TYPE, POPUP_RESULT } from "../../../popup.js";
import { eventSource, event_types, this_chid } from "../../../../script.js";


function addPlaceholderButtonToMessage(messageId) {
    if (messageId !== 0) return; // Only process messages with mesid="0"

    const messageElement = document.querySelector('.mes.last_mes[mesid="0"] .mes_block .mes_text');
    if (!messageElement) return;

    // Find and replace the macro
    const macroRegex = /{{plbutton::((?:-?\d+,)*-?\d+)}}|{{plbutton}}/g;
    let messageText = messageElement.innerHTML;
    messageText = messageText.replace(macroRegex, (match, groupIds) => {
        // If no group IDs are provided, default to -1
        const parsedGroupIds = groupIds ? groupIds.split(',').map(Number) : [-1];

        // Create the button element
        const button = document.createElement('button');
        button.textContent = 'Fill Placeholders';
        button.classList.add('placeholder-button', 'menu_button', 'menu_button_icon');

        const icon = document.createElement('i');
        icon.classList.add('fa-solid', 'fa-pencil');

        // Insert the icon at the beginning of the button
        button.insertBefore(icon, button.firstChild);

        // Add a data attribute to store the group IDs
        button.dataset.groupIds = parsedGroupIds.join(',');

        return button.outerHTML;
    });

    // Set the innerHTML first
    messageElement.innerHTML = messageText;

    // Find the newly added button(s) and attach the event listener
    const buttons = messageElement.querySelectorAll('.placeholder-button');
    buttons.forEach(button => {
        const groupIds = button.dataset.groupIds.split(',').map(Number);
        button.addEventListener('click', () => {
            handlePlaceholders(groupIds);
        });
    });
}

// Add event listeners for both events
eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, addPlaceholderButtonToMessage);
eventSource.on(event_types.MESSAGE_SWIPED, addPlaceholderButtonToMessage);


const button = document.createElement('div');
const icon1 = document.createElement('i');
icon1.className = 'fa-solid fa-comment';
const text = document.createElement('span');
text.textContent = 'Reset Placeholders';
button.tabIndex = 0;
button.classList.add('list-group-item', 'flex-container', 'flexGap5', 'interactable');
button.appendChild(icon1);
button.appendChild(text);
button.addEventListener('click', () => {
    $('#firstmessage_textarea').trigger('input')
});

const container = document.getElementById('extensionsMenu');
container.appendChild(button);


// Find the target element (Alt. Greetings button)
const altGreetingsButton = document.querySelector('.menu_button.menu_button_icon.open_alternate_greetings');

// Create the Edit Placeholders button element
const editPlaceholdersButton = document.createElement('div');
editPlaceholdersButton.classList.add('menu_button', 'menu_button_icon', 'edit-placeholders-button');
editPlaceholdersButton.title = "Edit placeholder values (like names)";

// Create the icon element
const icon = document.createElement('i');
icon.className = 'fa-solid fa-pencil'; // Icon reflecting text/settings editing

// Create the text span element
const textSpan = document.createElement('span');
textSpan.textContent = 'Edit Placeholders';

// Append icon and text to the button
editPlaceholdersButton.appendChild(icon);
editPlaceholdersButton.appendChild(textSpan);

// Add a small margin to the right
editPlaceholdersButton.style.marginRight = '5px';

// Add an event listener for the button click (example)
editPlaceholdersButton.addEventListener('click', () => openPlaceholderMenu());

// Insert the new button before the Alt. Greetings button
altGreetingsButton.parentNode.insertBefore(editPlaceholdersButton, altGreetingsButton);


async function handlePlaceholders(groupIds = [-1]) {
    // Check if there's any placeholder data
    const placeholderData = await getExistingPlaceholders();

    // Filter placeholders based on groupIds only if not -1 (meaning all)
    if (groupIds[0] !== -1) {
        placeholderData.placeholders = placeholderData.placeholders.filter(placeholder => {
            return groupIds.includes(parseInt(placeholder.group_id, 10));
        });
    }

    // If there's no placeholder data or no placeholders, return early
    if (!placeholderData.placeholders || placeholderData.placeholders.length === 0) {
        console.log("No placeholders found for group IDs:", groupIds);
        return;
    }

    if (getContext().chat.length !== 1) {
        toastr.info('Only available on first messages.');
        return;
    }

    // Create a simple popup to confirm if the user wants to fill in placeholders
    const popupContainer = $('<div class="placeholder-confirmation"></div>');

    // Add the styled title
    const title = $(`
        <h3>
            <span>Placeholders Available</span>
            <a href="https://github.com/splitclover/greeting-placeholders/wiki" class="notes-link" target="_blank">
                <span class="fa-solid fa-circle-question note-link-span"></span>
            </a>
        </h3>
    `);

    const message = $('<p>Do you want to fill in placeholders for this chat?</p>');

    popupContainer.append(title);
    popupContainer.append(message);

    const popup = new Popup(
        popupContainer,
        POPUP_TYPE.CONFIRM,
        'Placeholders', // This will be the window title
        {
            okButton: 'Fill Placeholders',
            cancelButton: 'Skip',
            wide: false,
        }
    );

    const result = await popup.show();
    let filledPlaceholders = {};
    if (result === POPUP_RESULT.AFFIRMATIVE) {
        filledPlaceholders = await fillPlaceholders(placeholderData.placeholders);
    }

    // Populate any missing variables with fallback values
    placeholderData.placeholders.forEach(placeholder => {
        if (!filledPlaceholders.hasOwnProperty(placeholder.variableName) && placeholder.fallbackValue) {
            filledPlaceholders[placeholder.variableName] = placeholder.fallbackValue;
        }
    });

    if (filledPlaceholders != {}) {
        const context = getContext();
        replacePlaceholdersInChat(filledPlaceholders, context);
        await context.saveChat();
        await context.reloadCurrentChat();
    }
}

function replacePlaceholdersInChat(filledPlaceholders, context) {
    const currentSwipeId = context.chat[0].swipe_id || 0; // Get current swipe ID

    if (context.chat[0].swipes && context.chat[0].swipes.length > 0) {
        // Handle multiple swipes
        context.chat[0].swipes[currentSwipeId] = replacePlaceholders(context.chat[0].swipes[currentSwipeId], filledPlaceholders);

        // Update the current message to the updated swipe
        context.chat[0].mes = context.chat[0].swipes[currentSwipeId];
    } else {
        // Handle single message
        context.chat[0].mes = replacePlaceholders(context.chat[0].mes, filledPlaceholders);
    }
}

function replacePlaceholders(text, filledPlaceholders) {
    let updatedText = text;

    // Replace placeholders
    for (const varName in filledPlaceholders) {
        const placeholder = `{{pl::${varName}}}`;
        const placeholder2 = `{{//pl::${varName}}}`;
        updatedText = updatedText.replace(new RegExp(placeholder, 'g'), filledPlaceholders[varName]);
        updatedText = updatedText.replace(new RegExp(placeholder2, 'g'), filledPlaceholders[varName]);
    }

    // Remove all plbutton macros
    updatedText = updatedText.replace(/{{plbutton}}|{{plbutton::((?:-?\d+,)*-?\d+)}}/g, '');

    return updatedText;
}

async function fillPlaceholders(placeholders) {
    let currentIndex = 0;
    const placeholderValues = {};

    function sanitizeAndEncode(input) {
        // First, sanitize the input
        const sanitized = DOMPurify.sanitize(input);

        // Then, encode the sanitized HTML
        const encoder = document.createElement('div');
        encoder.textContent = sanitized;
        return encoder.innerHTML;
    }

    function createPlaceholderEntry(placeholder) {
        const sanitizedPlainName = sanitizeAndEncode(placeholder.plainName);
        const sanitizedVariableName = sanitizeAndEncode(placeholder.variableName);
        const sanitizedFallbackValue = sanitizeAndEncode(placeholder.fallbackValue || '');
        const sanitizedExampleUsage = sanitizeAndEncode(placeholder.exampleUsage || '');

        const entry = $(`
            <div class="placeholder-entry">
                <div class="inline-drawer wide100p">
                    <div class="inline-drawer-content flex-container wide100p" style="text-align: left;">
                        <div class="wide100p">
                            <h4>Enter a value for: ${sanitizedPlainName}</h4>
                            <input type="text" class="text_pole wide100p" name="${sanitizedVariableName}" placeholder="${sanitizedPlainName}" value="${placeholderValues[sanitizedVariableName] || sanitizedFallbackValue}">
                            ${placeholder.presetValues ? createPresetDropdown(placeholder) : ''}
                            ${sanitizedExampleUsage ? `<hr><pre class="example-usage mes_text" style="white-space: pre-wrap; word-wrap: break-word; overflow-wrap: break-word; max-width: 100%;">${sanitizedExampleUsage}</pre>` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `);

        const input = entry.find('input');
        const exampleUsage = entry.find('.example-usage');

        function updateExample() {
            if (exampleUsage.length) {
                let example = placeholder.exampleUsage;
                const value = input.val() || placeholder.fallbackValue || '';
                const macro = `{{pl::${placeholder.variableName}}}`;
                const macroRegex = new RegExp(escapeRegExp(macro), 'g');
                example = example.replace(macroRegex, `<u>${value}</u>`);
                exampleUsage.html(example);
            }
        }

        // Helper function to escape special characters in the macro for use in a regex
        function escapeRegExp(string) {
            return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }

        input.on('input', function() {
            placeholderValues[placeholder.variableName] = $(this).val();
            updateExample();
        });

        if (placeholder.presetValues) {
            const select = entry.find('select');
            select.on('change', function() {
                input.val($(this).val());
                placeholderValues[placeholder.variableName] = $(this).val();
                updateExample();
            });
        }

        updateExample();

        return entry;
    }

    function createPresetDropdown(placeholder) {
        let presets = placeholder.presetValues ? placeholder.presetValues.split(',').map(v => v.trim()) : [];

        // Remove empty option if it's just a single trailing comma
        if (presets.length > 0 && presets[presets.length - 1] === '') {
            presets.pop();
        }

        // Sanitize and encode non-empty presets
        presets = presets.map(v => v === '' ? v : sanitizeAndEncode(v));

        let options = '<option value="">Select a preset (optional)</option>';
        presets.forEach(preset => {
            options += `<option value="${preset}">${preset}</option>`;
        });
        return `
            <small>Presets</small>
            <select class="text_pole wide100p" style="margin-top: 5px;">
                ${options}
            </select>
        `;
    }

    const popupContainer = $(`
        <div class="placeholder-fill-container" style="text-align: left;">
            <div class="placeholder-header" style="margin-bottom: 20px;">
                <h3>Placeholder Input</h3>
            </div>
            <div class="placeholder-entry-container"></div>
            <div class="placeholder-navigation" style="display: flex; justify-content: space-between; align-items: center; margin-top: 20px;">
                <button class="menu_button fa-solid fa-chevron-left" style="font-size: 20px;"></button>
                <div class="placeholder-progress"></div>
                <button class="menu_button fa-solid fa-chevron-right" style="font-size: 20px;"></button>
            </div>
        </div>
    `);

    const placeholderEntryContainer = popupContainer.find('.placeholder-entry-container');
    const prevButton = popupContainer.find('.fa-chevron-left');
    const nextButton = popupContainer.find('.fa-chevron-right');
    const progress = popupContainer.find('.placeholder-progress');

    function updateNavigation() {
        progress.text(`${currentIndex + 1} / ${placeholders.length}`);
    }

    function navigateWrapper(direction) {
        return function() {
            currentIndex = (currentIndex + direction + placeholders.length) % placeholders.length;
            placeholderEntryContainer.empty().append(createPlaceholderEntry(placeholders[currentIndex]));
            updateNavigation();
        };
    }

    prevButton.on('click', navigateWrapper(-1));
    nextButton.on('click', navigateWrapper(1));

    placeholderEntryContainer.append(createPlaceholderEntry(placeholders[currentIndex]));
    updateNavigation();

    const popup = new Popup(
        popupContainer,
        POPUP_TYPE.CONFIRM,
        'Fill in Placeholders',
        {
            okButton: 'Finish',
            allowVerticalScrolling: true,
            cancelButton: 'Cancel'
        }
    );

    const result = await popup.show();

    if (result === POPUP_RESULT.AFFIRMATIVE) {
        return placeholderValues;
    } else {
        return {};
    }
}


async function openPlaceholderMenu() {
    if (getContext().menuType === 'create') {
        toastr.info('Not available for character create screens. Open a chat with this character and try again.');
        return;
    }

    // Load the placeholder template
    const placeholderTemplate = await $.get(`${extensionFolderPath}/placeholders.html`);

    // Create JQuery popupContainer
    const popupContainer = $('<div class="placeholder-menu"></div>');

    // Create the header with title, help link, and add button
    const header = $(`
        <div class="placeholder-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <h3 class="margin0">
                <span>Placeholders</span>
                <a href="https://github.com/splitclover/greeting-placeholders/wiki/Creating-placeholders" class="notes-link" target="_blank">
                    <span class="fa-solid fa-circle-question note-link-span"></span>
                </a>
            </h3>
            <div class="menu_button menu_button_icon add-placeholder-button interactable" title="Add new placeholder" tabindex="0">
                <i class="fa-solid fa-plus"></i>
                <span>Add Placeholder</span>
            </div>
        </div>
    `);

    const placeholderList = $('<div class="placeholder-list"></div>');

    popupContainer.append(header);
    popupContainer.append(placeholderList);


    // Function to add a new placeholder entry
    function addPlaceholderEntry(data = {}) {
        const entry = $(placeholderTemplate);

        // Populate fields if data is provided
        if (data.plainName) entry.find('[name="plain_name"]').val(data.plainName);
        if (data.variableName) entry.find('[name="variable_name"]').val(data.variableName);
        if (data.fallbackValue) entry.find('[name="fallback_value"]').val(data.fallbackValue);
        if (data.exampleUsage) entry.find('[name="example_usage"]').val(data.exampleUsage);
        if (data.presetValues) entry.find('[name="preset_values"]').val(data.presetValues);
        if (data.group_id) entry.find('[name="group_id"]').val(data.group_id);

        // Add event listeners for move up, move down, duplicate and delete buttons
        entry.find('.move_entry_up_button').on('click', function(e) {
            e.stopPropagation();
            const prevEntry = entry.prev('.placeholder_entry');
            if (prevEntry.length) {
                entry.insertBefore(prevEntry);
            }
        });

        entry.find('.move_entry_down_button').on('click', function(e) {
            e.stopPropagation();
            const nextEntry = entry.next('.placeholder_entry');
            if (nextEntry.length) {
                entry.insertAfter(nextEntry);
            }
        });

        entry.find('.duplicate_entry_button').on('click', function(e) {
            e.stopPropagation();
            const newEntry = addPlaceholderEntry(getEntryData(entry));
            newEntry.insertAfter(entry);
        });

        entry.find('.delete_entry_button').on('click', function(e) {
            e.stopPropagation();
            entry.remove();
        });

        placeholderList.append(entry);
        return entry;
    }

    // Function to get data from an entry
    function getEntryData(entry) {
        return {
            plainName: entry.find('[name="plain_name"]').val(),
            variableName: entry.find('[name="variable_name"]').val(),
            fallbackValue: entry.find('[name="fallback_value"]').val(),
            exampleUsage: entry.find('[name="example_usage"]').val(),
            presetValues: entry.find('[name="preset_values"]').val(),
            group_id: entry.find('[name="group_id"]').val(),
        };
    }

    // Add event listener for the Add Placeholder button
    popupContainer.on('click', '.add-placeholder-button', function() {
        addPlaceholderEntry();
    });

    // Populate existing placeholders (if any)
    const existingPlaceholders = await getExistingPlaceholders();
    existingPlaceholders.placeholders.forEach(placeholder => addPlaceholderEntry(placeholder));

    // Create and show the Popup
    const popup = new Popup(
        popupContainer,
        POPUP_TYPE.TEXT,
        'Edit Placeholders',
        {
            okButton: 'Save',
            wide: false,
            wider: true,
            allowVerticalScrolling: true,
            cancelButton: 'Cancel',
            animation: 'fast'
        }
    );

    const result = await popup.show();

    // Handle saving the placeholders
    if (result === POPUP_RESULT.AFFIRMATIVE) {
        const placeholders = [];
        popupContainer.find('.placeholder_entry').each(function() {
            placeholders.push(getEntryData($(this)));
        });
        await savePlaceholders(placeholders);
    }
}


async function getExistingPlaceholders() {
    const data = getContext().characters[this_chid]?.data?.extensions?.greeting_placeholders;

    if (!data || !data.version) {
        // If no data or it's an old version without a version number, return a default structure
        return {
            version: CURRENT_VERSION,
            placeholders: []
        };
    }

    // Version handling
    // Version 2 added group ids
    if (data.version < 2) {
        // Update version 1 data to version 2
        data.version = 2;
        data.placeholders = data.placeholders.map(placeholder => ({
            ...placeholder,
            group_id: '-1' // Fill group_id with '-1' for version 1 data
        }));
    }

    return JSON.parse(JSON.stringify(data));
}


async function savePlaceholders(placeholders) {
    const uniquePlaceholders = [];
    const seenVariableNames = new Set();

    for (const placeholder of placeholders) {
        // Sanitize each field of the placeholder
        const sanitizedPlaceholder = {
            plainName: DOMPurify.sanitize(placeholder.plainName),
            variableName: DOMPurify.sanitize(placeholder.variableName),
            fallbackValue: DOMPurify.sanitize(placeholder.fallbackValue),
            exampleUsage: DOMPurify.sanitize(placeholder.exampleUsage),
            presetValues: DOMPurify.sanitize(placeholder.presetValues),
            group_id: placeholder.group_id ? DOMPurify.sanitize(placeholder.group_id) : -1,
        };

        if (!seenVariableNames.has(sanitizedPlaceholder.variableName)) {
            uniquePlaceholders.push(sanitizedPlaceholder);
            seenVariableNames.add(sanitizedPlaceholder.variableName);
        } else {
            toastr.warning(`Discarding entry with existing variable ${sanitizedPlaceholder.variableName}`);
        }
    }

    const data = {
        version: CURRENT_VERSION,
        placeholders: uniquePlaceholders
    };

    try {
        await writeExtensionField(this_chid, 'greeting_placeholders', data);
        toastr.success('Placeholders saved successfully');
    } catch (error) {
        console.error('Error saving placeholders:', error);
        toastr.error('Failed to save placeholders');
    }
}

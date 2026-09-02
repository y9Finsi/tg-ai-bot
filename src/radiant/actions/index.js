/**
 * RADIANT Actions Runtime Entry Point
 */

import { actionRegistry } from './registry.js';
import { actionRouter } from './router.js';
import { executeAction } from './executor.js';
import { webSearchAction } from './plugins/web_search.js';
import { weatherAction } from './plugins/weather.js';
import { spbPlacesAction } from './plugins/spb_places.js';
import { searchArchiveMemoryAction } from './plugins/search_archive_memory.js';
import { sendPhotoAction } from './plugins/send_photo.js';
import { sendVoiceAction } from './plugins/send_voice.js';
import { sendContentAction } from './plugins/send_content.js';
import { setReactionAction } from './plugins/set_reaction.js';
import { getChannelPostsAction } from './plugins/get_channel_posts.js';
import { scheduleFollowupAction } from './plugins/schedule_followup.js';
import { scheduleReminderAction } from './plugins/schedule_reminder.js';
import { recordOpenThreadAction } from './plugins/record_open_thread.js';

// Авторегистрация системных действий ядра
actionRegistry.register(webSearchAction);
actionRegistry.register(weatherAction);
actionRegistry.register(spbPlacesAction);
actionRegistry.register(searchArchiveMemoryAction);
actionRegistry.register(sendPhotoAction);
actionRegistry.register(sendVoiceAction);
actionRegistry.register(sendContentAction);
actionRegistry.register(setReactionAction);
actionRegistry.register(getChannelPostsAction);
actionRegistry.register(scheduleFollowupAction);
actionRegistry.register(scheduleReminderAction);
actionRegistry.register(recordOpenThreadAction);

export {
    actionRegistry,
    actionRouter,
    executeAction,
    webSearchAction,
    weatherAction,
    spbPlacesAction,
    searchArchiveMemoryAction,
    sendPhotoAction,
    sendVoiceAction,
    sendContentAction,
    setReactionAction,
    getChannelPostsAction,
    scheduleFollowupAction,
    scheduleReminderAction,
    recordOpenThreadAction
};


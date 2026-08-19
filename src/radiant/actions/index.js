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
import { sendContentAction } from './plugins/send_content.js';
import { getChannelPostsAction } from './plugins/get_channel_posts.js';

// Авторегистрация системных действий ядра
actionRegistry.register(webSearchAction);
actionRegistry.register(weatherAction);
actionRegistry.register(spbPlacesAction);
actionRegistry.register(searchArchiveMemoryAction);
actionRegistry.register(sendPhotoAction);
actionRegistry.register(sendContentAction);
actionRegistry.register(getChannelPostsAction);

export {
    actionRegistry,
    actionRouter,
    executeAction,
    webSearchAction,
    weatherAction,
    spbPlacesAction,
    searchArchiveMemoryAction,
    sendPhotoAction,
    sendContentAction,
    getChannelPostsAction
};

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

// Авторегистрация системных действий ядра
actionRegistry.register(webSearchAction);
actionRegistry.register(weatherAction);
actionRegistry.register(spbPlacesAction);
actionRegistry.register(searchArchiveMemoryAction);

export {
    actionRegistry,
    actionRouter,
    executeAction,
    webSearchAction,
    weatherAction,
    spbPlacesAction,
    searchArchiveMemoryAction
};
